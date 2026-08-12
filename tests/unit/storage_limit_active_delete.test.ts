// tests/unit/storage_limit_active_delete.test.ts
// 验证存储限额接线 + 禁删活跃采集 + cleanup 终态化（P1-13/P1-14）
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const load_user_config = vi.hoisted(() => vi.fn());
const log_write = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/user_config', () => ({ load_user_config }));
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
vi.mock('../../src/extension/background/storage', async (import_original) => ({
    ...await import_original<typeof import('../../src/extension/background/storage')>(),
    update_capture: vi.fn(),
}));

function add_listener(): { addListener: ReturnType<typeof vi.fn> } {
    return { addListener: vi.fn() };
}

let on_message_cb: ((msg: any, _s: any, send: (r: any) => void) => void) | undefined;

function install_chrome_mock(): void {
    vi.stubGlobal('self', { addEventListener: vi.fn() });
    vi.stubGlobal('chrome', {
        dbg: { attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), sendCommand: vi.fn(async () => ({})), onEvent: { addListener: vi.fn(), removeListener: vi.fn() } },
        debugger: { attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), sendCommand: vi.fn(async () => ({})), onEvent: { addListener: vi.fn(), removeListener: vi.fn() } },
        runtime: {
            getManifest: vi.fn(() => ({ version: '0.1.0' })),
            onInstalled: add_listener(),
            onMessage: { addListener: (cb: any) => { on_message_cb = cb; } },
        },
        storage: {
            local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) },
            onChanged: { addListener: vi.fn() },
        },
        tabs: {
            query: vi.fn(async () => [{ id: 42, url: 'https://example.com', title: 'T', windowId: 1 }]),
            get: vi.fn(async () => ({ id: 42, url: 'https://example.com' })),
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

function send_message(action: string, extra: Record<string, unknown> = {}): Promise<any> {
    return new Promise((resolve) => on_message_cb!({ action, payload: extra }, {}, resolve));
}

const BASE_CONFIG = { capture_network: false, capture_console: false };

beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    install_chrome_mock();
    load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
    const { init_db } = await import('../../src/extension/background/storage');
    await init_db();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('存储限额 + 禁删活跃 (T110)', () => {
    it('AC-001: 超限时不再接受新事件写入或 capture 进入停止态', async () => {
        const { set_capture_size_for_test, check_storage_limit } = await import('../../src/extension/background/storage');
        set_capture_size_for_test('cap', 500 * 1024 * 1024); // = MAX_SESSION_SIZE
        expect(await check_storage_limit('cap')).toBe(true);
    });

    it('AC-002: active capture 不可删除（返回失败且数据仍在）', async () => {
        await import('../../src/extension/background/service_worker');
        const start_res = await send_message('start', { capture_id: 'cap_active', config: BASE_CONFIG });
        expect(start_res.success, `start error: ${JSON.stringify(start_res)}`).toBe(true);

        const del = await send_message('delete_capture', { capture_id: 'cap_active' });
        expect(del.success).toBe(false);

        // p024 分句：delete 被拒后 capture 记录仍在存储
        const { get_capture } = await import('../../src/extension/background/storage');
        const rec = await get_capture('cap_active');
        expect(rec).not.toBeNull();
        expect(rec!.capture_id).toBe('cap_active');
    });

    it('AC-002b: 非活跃 capture 可删除', async () => {
        await import('../../src/extension/background/service_worker');
        const del = await send_message('delete_capture', { capture_id: 'cap_old' });
        expect(del.success).toBe(true);
    });

    it('AC-003: cleanup_stale 终态化陈旧 active capture（status 非 active 且 ended_at 非空）', async () => {
        await import('../../src/extension/background/service_worker');
        const { cleanup_stale_capture_state } = await import('../../src/extension/background/service_worker');
        const { update_capture } = await import('../../src/extension/background/storage');

        // 预置陈旧 active 键
        const storage = (globalThis as any).chrome.storage.local;
        storage.get.mockResolvedValue({
            is_capturing: true,
            current_capture: { capture_id: 'cap_stale', status: 'capturing', started_at: new Date(0).toISOString() },
            active_capture_id: 'cap_stale',
        });
        await cleanup_stale_capture_state();

        // update_capture 被调终态化；p024 分句：ended_at 非空
        expect(update_capture).toHaveBeenCalledWith(expect.objectContaining({
            capture_id: 'cap_stale',
            status: 'completed',
            ended_at: expect.any(String),
        }));
    });
});


describe('handle_event 限额停止 (T110 AC-001b)', () => {
    it('AC-001b: 超限后新事件写入被拒且 capture 停止', async () => {
        await import('../../src/extension/background/service_worker');
        const { set_capture_size_for_test } = await import('../../src/extension/background/storage');

        const start_res = await send_message('start', { capture_id: 'cap_limit', config: BASE_CONFIG });
        expect(start_res.success).toBe(true);

        // 超限
        set_capture_size_for_test('cap_limit', 500 * 1024 * 1024);
        // content→SW 的 event 为扁平内部消息（非 { action, payload }）
        const evt_res = await new Promise((resolve) => on_message_cb!({ action: 'event', event: { type: 'mouse_click', data: {} } }, {}, resolve));
        expect(evt_res.success).toBe(false);

        // capture 已停止：get_status 显示未采集
        const status = await send_message('get_status');
        expect(status.data.is_capturing).toBe(false);

        // p024 分句：限额停止写入 capture_stopped 事件且 reason === 'storage_limit'
        const { get_events_by_category } = await import('../../src/extension/background/storage');
        const lifecycle = await get_events_by_category('cap_limit', 'capture_lifecycle');
        const stopped = lifecycle.find((e) => e.type === 'capture_stopped');
        expect(stopped).toBeDefined();
        expect((stopped!.data as { reason?: string }).reason).toBe('storage_limit');
    });
});

describe('导航写路径限额停止 (T110 AC-001c)', () => {
    function on_activated_cb(): (info: { tabId: number; windowId: number }) => Promise<void> {
        return (globalThis as any).chrome.tabs.onActivated.addListener.mock.calls[0][0];
    }

    it('AC-001c: 超限前导航事件正常写入', async () => {
        await import('../../src/extension/background/service_worker');
        const { get_events_by_category } = await import('../../src/extension/background/storage');

        const start_res = await send_message('start', { capture_id: 'cap_nav_ok', config: BASE_CONFIG });
        expect(start_res.success).toBe(true);

        await on_activated_cb()({ tabId: 42, windowId: 1 });

        const nav_events = await get_events_by_category('cap_nav_ok', 'navigation');
        expect(nav_events.length).toBe(1);
        expect(nav_events[0].type).toBe('tab_switch');
    });

    it('AC-001d: 超限后导航事件写入被拒且 capture 停止', async () => {
        await import('../../src/extension/background/service_worker');
        const { set_capture_size_for_test, get_events_by_category } = await import('../../src/extension/background/storage');

        const start_res = await send_message('start', { capture_id: 'cap_nav_limit', config: BASE_CONFIG });
        expect(start_res.success).toBe(true);

        // 超限后触发 tab 切换：write_events 前 check_limit_and_stop 拦截
        set_capture_size_for_test('cap_nav_limit', 500 * 1024 * 1024);
        await on_activated_cb()({ tabId: 42, windowId: 1 });

        const nav_events = await get_events_by_category('cap_nav_limit', 'navigation');
        expect(nav_events.length).toBe(0);

        const status = await send_message('get_status');
        expect(status.data.is_capturing).toBe(false);
    });
});
