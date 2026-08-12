// tests/unit/cleanup_start_mutex.test.ts
// 验证 cleanup_stale_capture_state 与 start_capture 经 run_exclusive 互斥，
// start 写入的 active 键不被并发 cleanup 清除
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const update_capture = vi.hoisted(() => vi.fn());
const log_write = vi.hoisted(() => vi.fn());
const storage_get = vi.hoisted(() => vi.fn());
const storage_set = vi.hoisted(() => vi.fn());
const tabs_query = vi.hoisted(() => vi.fn());

vi.mock('../../src/extension/background/storage', async (import_original) => ({
    ...await import_original<typeof import('../../src/extension/background/storage')>(),
    update_capture,
}));

vi.mock('../../src/extension/background/app_log_storage', () => ({
    get_app_log_transport: () => ({
        write: log_write,
        flush: vi.fn(),
        get_entries: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        clear: vi.fn(),
    }),
}));

vi.mock('../../src/extension/background/keepalive', () => ({
    setup_keepalive_listener: vi.fn(),
    start_keepalive: vi.fn(),
    stop_keepalive: vi.fn(),
}));

function add_listener(): { addListener: ReturnType<typeof vi.fn> } {
    return { addListener: vi.fn() };
}

function install_chrome_mock(): void {
    vi.stubGlobal('self', { addEventListener: vi.fn() });
    vi.stubGlobal('chrome', {
        debugger: {},
        runtime: {
            getManifest: vi.fn(() => ({ version: '0.1.0' })),
            onInstalled: add_listener(),
            onMessage: add_listener(),
        },
        storage: {
            local: {
                get: storage_get,
                set: storage_set,
            },
            onChanged: { addListener: vi.fn() },
        },
        tabs: {
            query: tabs_query,
            get: vi.fn(async () => ({ id: 1, url: 'https://example.com' })),
            sendMessage: vi.fn(async () => undefined),
            onActivated: add_listener(),
            onRemoved: add_listener(),
            onCreated: add_listener(),
            onUpdated: add_listener(),
        },
        webRequest: {
            onBeforeRequest: add_listener(),
            onBeforeSendHeaders: add_listener(),
            onHeadersReceived: add_listener(),
            onCompleted: add_listener(),
            onErrorOccurred: add_listener(),
        },
        cookies: { onChanged: add_listener(), getAll: vi.fn(async () => []) },
    });
}

let on_message_cb: ((msg: any, _s: any, send: (r: any) => void) => void) | undefined;

async function load_service_worker(): Promise<void> {
    await import('../../src/extension/background/service_worker');
    const on_msg = (globalThis as any).chrome.runtime.onMessage;
    if (on_msg.addListener.mock.calls.length > 0) {
        on_message_cb = on_msg.addListener.mock.calls[0][0];
    }
}

function send_start(capture_id = 'new_cap'): Promise<any> {
    if (!on_message_cb) return Promise.resolve({ success: false, error: 'no listener' });
    return new Promise((resolve) => on_message_cb!({ action: 'start', payload: { capture_id, config: {} } }, {}, resolve));
}

async function wait(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
}

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    install_chrome_mock();
    storage_get.mockResolvedValue({});
    storage_set.mockResolvedValue(undefined);
    tabs_query.mockResolvedValue([{ id: 1, url: 'https://example.com', title: 'T', windowId: 1 }]);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('cleanup_stale 与 start 互斥 (T099)', () => {
    test('AC-001: start 成功后（phase=capturing）cleanup 执行不置空 active 键', async () => {
        await load_service_worker();
        const { cleanup_stale_capture_state } = await import('../../src/extension/background/service_worker');

        // start 写入 active_capture_id = new_cap，phase → capturing
        const start_res = await send_start();
        expect(start_res.success).toBe(true);
        const active_set = storage_set.mock.calls.find((c) => c[0] && c[0].active_capture_id === 'new_cap');
        expect(active_set).toBeDefined();

        // 清空 storage_set 记录，聚焦后续 cleanup
        storage_set.mockClear();
        storage_get.mockResolvedValue({
            is_capturing: true,
            current_capture: { capture_id: 'new_cap' },
            active_capture_id: 'new_cap',
        });

        // phase=capturing（live），cleanup 应跳过不清理
        await cleanup_stale_capture_state();

        // cleanup 未置空 active 键（若误清会有 active_capture_id===null 的 set）
        const null_set = storage_set.mock.calls.find((c) => c[0] && c[0].active_capture_id === null);
        expect(null_set).toBeUndefined();
    });

    test('AC-002: 冷启动无 live capturing 仅陈旧键时 cleanup 终态化并清键（回归）', async () => {
        storage_get.mockResolvedValue({
            is_capturing: true,
            current_capture: { capture_id: 'old_cap', started_at: new Date(0).toISOString() },
            active_capture_id: 'old_cap',
        });
        await load_service_worker();
        await wait(20);

        expect(update_capture).toHaveBeenCalledWith(expect.objectContaining({
            capture_id: 'old_cap',
            status: 'completed',
        }));
        const clear_set = storage_set.mock.calls.find((c) => c[0] && c[0].active_capture_id === null);
        expect(clear_set).toBeDefined();
    });

    test('AC-003: cleanup 的 storage.get 挂起时 start 排队，resolve 后 start 写入的 active 键保留', async () => {
        let resolve_get: (v: any) => void = () => {};
        // 第一次 get（cleanup 的）挂起；后续 get（start 内部）直接返回空
        storage_get.mockImplementationOnce(() => new Promise((r) => { resolve_get = r; }))
            .mockResolvedValue({});

        await load_service_worker();
        const { cleanup_stale_capture_state } = await import('../../src/extension/background/service_worker');

        // cleanup 先拿 run_exclusive 锁，并卡在 storage.get
        const cleanup_promise = cleanup_stale_capture_state();
        // start 此时调用 → 在锁上排队（capture_id 用独立 id，避免与同文件 AC-001 写入的
        // 'new_cap' 在共享 fake-indexeddb 中主键冲突）
        const start_promise = send_start('new_cap_mutex');
        await wait(0);

        // 释放 cleanup 的 get：空存储无 stale → cleanup 结束释放锁
        resolve_get({});
        await cleanup_promise;

        // start 随后执行完成
        const start_res = await start_promise;
        expect(start_res.success, `start error: ${JSON.stringify(start_res)}`).toBe(true);

        // start 写入的 active 键存在；cleanup 不得在 start 之后清键
        const active_set = storage_set.mock.calls.find((c) => c[0] && c[0].active_capture_id === 'new_cap_mutex');
        expect(active_set).toBeDefined();
        const null_set = storage_set.mock.calls.find((c) => c[0] && c[0].active_capture_id === null);
        expect(null_set).toBeUndefined();
    });
});
