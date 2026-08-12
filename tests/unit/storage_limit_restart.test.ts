// tests/unit/storage_limit_restart.test.ts
// t148：存储限额持久化 —— 模拟 SW 重启（重载模块）后基数从 IndexedDB 重建（AC-005），
// 重启后继续写入仍触发 MAX_SESSION_SIZE_BYTES 停止 + storage_limit lifecycle 事件（AC-006）。
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MAX_SESSION_SIZE_BYTES } from '../../src/shared/constants';

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

function send_event(type: string, data: unknown = {}): Promise<any> {
    return new Promise((resolve) => on_message_cb!({ action: 'event', event: { type, data } }, {}, resolve));
}

const BASE_CONFIG = { capture_network: false, capture_console: false };

function make_record(capture_id: string, overrides: Record<string, unknown> = {}): any {
    return {
        capture_id,
        name: 'Capture ' + capture_id,
        status: 'capturing',
        started_at: new Date().toISOString(),
        ended_at: null,
        duration_ms: 0,
        start_url: 'https://example.com',
        end_url: null,
        tab_id: 42,
        window_id: 1,
        config_snapshot: BASE_CONFIG,
        stats: { event_count: 0, user_action_count: 0, nav_count: 0, request_count: 0, log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0, total_body_bytes: 0 },
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
    };
}

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    install_chrome_mock();
    load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('AC-005: 单采集字节数持久化，SW 重启后限额检查可重建', () => {
    it('重载模块（模拟重启）后 get_capture_size 从 CaptureRecord 重建基数，内存增量从 0 开始', async () => {
        // 重启前：CaptureRecord 已持久化基数（长采集期间 persist_stats 周期落盘）
        const storage0 = await import('../../src/extension/background/storage');
        await storage0.create_capture(make_record('cap_rebuild', { storage_bytes_written: 123456 }));

        // 模拟 SW 重启：重载 storage 模块（内存 Map 清空，IndexedDB 保留）
        vi.resetModules();
        const storage = await import('../../src/extension/background/storage');

        // 重启后未触发检查前：内存基数为 0
        expect(storage.get_capture_size('cap_rebuild')).toBe(0);

        // 限额检查触发 ensure → 从 IndexedDB 读 CaptureRecord 重建基数
        expect(await storage.check_storage_limit('cap_rebuild')).toBe(false);
        expect(storage.get_capture_size('cap_rebuild')).toBe(123456);
    });

    it('未知采集 get_capture_size 为 0（不崩溃）', async () => {
        const storage = await import('../../src/extension/background/storage');
        expect(storage.get_capture_size('no_such_capture')).toBe(0);
        expect(await storage.check_storage_limit('no_such_capture')).toBe(false);
    });

    it('写入侧：事件写入后限额跟踪累计（t148_test_f005）', async () => {
        await import('../../src/extension/background/service_worker');
        const storage = await import('../../src/extension/background/storage');

        const start_res = await send_message('start', { capture_id: 'cap_write', config: BASE_CONFIG });
        expect(start_res.success).toBe(true);

        // 确保 is_capturing 已建立（start 的 run_exclusive/CDP 异步完成后 content 事件才被 handle_event 处理）
        const status = await send_message('get_status');
        expect(status.data.is_capturing).toBe(true);

        // 写入一个事件（触发 write_events → update_bytes_written 累计内存增量）
        const evt_res = await send_event('mouse_event', { x: 1, y: 2 });
        expect(evt_res.success).toBe(true);

        // 限额跟踪累计（基数 0 + 内存增量 > 0）；persist_stats 落盘直接断言受
        // fake-indexeddb 并发事务限制（见 spec 可测试性声明），此处验证内存累计可靠
        expect(storage.get_capture_size('cap_write')).toBeGreaterThan(0);
    });
});

describe('AC-006: 重启后继续写入触发 MAX_SESSION_SIZE_BYTES 停止 + storage_limit 事件', () => {
    it('持久化基数 + 重启后内存增量跨过限额 → check_limit_and_stop 停止并写 capture_stopped', async () => {
        await import('../../src/extension/background/service_worker');
        const storage = await import('../../src/extension/background/storage');

        const start_res = await send_message('start', { capture_id: 'cap_r', config: BASE_CONFIG });
        expect(start_res.success, `start error: ${JSON.stringify(start_res)}`).toBe(true);

        // 模拟重启前 persist_stats 已落盘基数接近限额（500MB - 1KB）
        const rec = await storage.get_capture('cap_r');
        expect(rec).not.toBeNull();
        await storage.update_capture({ ...rec!, storage_bytes_written: MAX_SESSION_SIZE_BYTES - 1024 });

        // 模拟 SW 重启后继续写入：内存增量累计 1024 字节（test hook 模拟 flush 累计）
        storage.set_capture_size_for_test('cap_r', 1024);

        // 重启后新事件写入 → check_storage_limit 重建基数（MAX-1024）+ 增量（1024）= MAX → 停止
        const evt_res = await send_event('mouse_click', { x: 1, y: 2 });
        expect(evt_res.success).toBe(false);

        // capture 已停止
        const status = await send_message('get_status');
        expect(status.data.is_capturing).toBe(false);

        // storage_limit lifecycle 事件已写入
        const lifecycle = await storage.get_events_by_category('cap_r', 'capture_lifecycle');
        const stopped = lifecycle.find((e) => e.type === 'capture_stopped');
        expect(stopped).toBeDefined();
        expect((stopped!.data as { reason?: string }).reason).toBe('storage_limit');
    });
});
