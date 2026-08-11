// tests/unit/nav_retry_decouple.test.ts
// 验证 nav_count_enabled=false 时 onActivated/onUpdated 早退只跳过导航事件写入，
// start-send 与 CDP 重试仍触发（p019）。
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock_chrome_debugger } from '../support/__mocks__/chrome_debugger';

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
vi.mock('../../src/extension/background/agent_bridge_client', () => ({
    start_bridge_client: vi.fn(),
    stop_bridge_client: vi.fn(),
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
        dbg: mock_chrome_debugger,
        debugger: mock_chrome_debugger,
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
            query: vi.fn(async () => [{ id: 42, url: 'https://example.com/app', title: 'T', windowId: 1 }]),
            get: vi.fn(async () => ({ id: 42, url: 'https://example.com/app' })),
            sendMessage: vi.fn(async () => undefined),
            onActivated: add_listener(),
            onCreated: add_listener(),
            onUpdated: add_listener(),
            onRemoved: add_listener(),
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

function send_message(action: string, payload: Record<string, unknown> = {}): Promise<any> {
    return new Promise((resolve) => on_message_cb!({ action, ...payload }, {}, resolve));
}

function on_activated_cb(): (info: { tabId: number; windowId: number }) => Promise<void> {
    return (globalThis as any).chrome.tabs.onActivated.addListener.mock.calls[0][0];
}

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mock_chrome_debugger.reset();
    install_chrome_mock();
    load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('nav 关闭时早退与重试解耦 (p019)', () => {
    it('onActivated nav off：start-send 重试仍发送、导航事件不写入', async () => {
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        await import('../../src/extension/background/service_worker');

        const start_res = await send_message('start', {
            capture_id: 'cap_nav_off',
            config: { capture_network: false, capture_console: true, nav_count_enabled: false },
        });
        expect(start_res.success).toBe(true);
        const send_message_spy = (globalThis as any).chrome.tabs.sendMessage;
        send_message_spy.mockClear();

        await on_activated_cb()({ tabId: 42, windowId: 1 });

        // start-send 重试仍发生（早退不再跳过）
        expect(send_message_spy).toHaveBeenCalledWith(
            42,
            expect.objectContaining({ action: 'start' })
        );

        // 导航事件不写入（类别关闭）
        const { get_events_by_category } = await import('../../src/extension/background/storage');
        const nav_events = await get_events_by_category('cap_nav_off', 'navigation');
        expect(nav_events.length).toBe(0);
    });

    it('onActivated nav off：console 未激活时 CDP 重试仍触发', async () => {
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        // 让 console 启动失败（Runtime.enable 报错）→ is_console_active false，重试路径可触发
        mock_chrome_debugger.set_command_error('Runtime.enable', new Error('boom'));
        await import('../../src/extension/background/service_worker');

        const start_res = await send_message('start', {
            capture_id: 'cap_nav_act',
            config: { capture_network: false, capture_console: true, nav_count_enabled: false, error_count_enabled: false },
        });
        expect(start_res.success).toBe(true);

        const runtime_enable_before = mock_chrome_debugger.send_command_calls
            .filter((c) => c.command === 'Runtime.enable').length;
        await on_activated_cb()({ tabId: 42, windowId: 1 });

        // 重试发生：Runtime.enable 再次被调（nav off 不阻断 CDP 重试）
        const runtime_enable_after = mock_chrome_debugger.send_command_calls
            .filter((c) => c.command === 'Runtime.enable').length;
        expect(runtime_enable_after).toBeGreaterThan(runtime_enable_before);
    });

    it('nav on：tab_switch 事件正常写入（回归）', async () => {
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        await import('../../src/extension/background/service_worker');

        const start_res = await send_message('start', {
            capture_id: 'cap_nav_on',
            config: { capture_network: false, capture_console: false, nav_count_enabled: true },
        });
        expect(start_res.success).toBe(true);
        const send_message_spy = (globalThis as any).chrome.tabs.sendMessage;
        send_message_spy.mockClear();

        await on_activated_cb()({ tabId: 42, windowId: 1 });

        const { get_events_by_category } = await import('../../src/extension/background/storage');
        const nav_events = await get_events_by_category('cap_nav_on', 'navigation');
        expect(nav_events.length).toBe(1);
        expect(nav_events[0].type).toBe('tab_switch');
    });

    it('onUpdated nav off：restricted→normal 导航仍触发 CDP 重试', async () => {
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        // 让 console 启动失败（Runtime.enable 报错）→ is_console_active false，重试路径可触发
        mock_chrome_debugger.set_command_error('Runtime.enable', new Error('boom'));
        await import('../../src/extension/background/service_worker');

        const start_res = await send_message('start', {
            capture_id: 'cap_nav_upd',
            config: { capture_network: false, capture_console: true, nav_count_enabled: false, error_count_enabled: false },
        });
        expect(start_res.success).toBe(true);

        const on_updated_cb = (globalThis as any).chrome.tabs.onUpdated.addListener.mock.calls[0][0];
        const runtime_enable_before = mock_chrome_debugger.send_command_calls
            .filter((c) => c.command === 'Runtime.enable').length;

        // 先记录 restricted 页 URL，再导航到普通页 → 触发 CDP 重试路径
        await on_updated_cb(42, { status: 'loading', url: 'chrome://extensions/' }, { id: 42, url: 'chrome://extensions/' });
        await on_updated_cb(42, { status: 'loading', url: 'https://example.com/page' }, { id: 42, url: 'https://example.com/page' });

        // 重试发生：Runtime.enable 再次被调（nav off 不阻断 CDP 重试）
        const runtime_enable_after = mock_chrome_debugger.send_command_calls
            .filter((c) => c.command === 'Runtime.enable').length;
        expect(runtime_enable_after).toBeGreaterThan(runtime_enable_before);

        // 导航事件不写入（类别关闭）
        const { get_events_by_category } = await import('../../src/extension/background/storage');
        const nav_events = await get_events_by_category('cap_nav_upd', 'navigation');
        expect(nav_events.length).toBe(0);
    });
});
