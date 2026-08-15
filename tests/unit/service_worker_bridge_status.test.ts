// tests/unit/service_worker_bridge_status.test.ts
// t202 AC-003: get_bridge_status SW handler 行为级测试——import 完整 SW,经 onMessage 断言返回 enrolled/running。
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UI_ACTIONS } from '../../src/shared/message_contract';

const log_write = vi.hoisted(() => vi.fn());

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
vi.mock('../../src/shared/user_config', () => ({
    load_user_config: vi.fn(async () => ({ agent_bridge_enabled: false, log_level: 'error' })),
}));

function add_listener(): { addListener: ReturnType<typeof vi.fn> } {
    return { addListener: vi.fn() };
}

let on_message_cb: ((msg: unknown, _s: unknown, send: (r: unknown) => void) => void) | undefined;

function install_chrome_mock(): void {
    vi.stubGlobal('self', { addEventListener: vi.fn() });
    vi.stubGlobal('chrome', {
        debugger: { attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), sendCommand: vi.fn(async () => ({})), onEvent: { addListener: vi.fn(), removeListener: vi.fn() } },
        runtime: {
            getManifest: vi.fn(() => ({ version: '0.1.0' })),
            onInstalled: add_listener(),
            onMessage: { addListener: (cb: unknown) => { on_message_cb = cb as typeof on_message_cb; } },
        },
        storage: {
            local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) },
            onChanged: { addListener: vi.fn() },
        },
        tabs: {
            query: vi.fn(async () => []),
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

function send_message(msg: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    if (!on_message_cb) throw new Error('no listener');
    return new Promise((resolve) => on_message_cb!(msg, {}, resolve));
}

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    install_chrome_mock();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('t202 AC-003: get_bridge_status SW handler', () => {
    it('返回 bridge client 连接态(running/enrolled)', async () => {
        await import('../../src/extension/background/service_worker');
        // 默认 bridge client 未启动、未 enroll
        const resp = await send_message({ action: 'get_bridge_status', payload: {} });
        expect(resp.success).toBe(true);
        expect(resp.data).toEqual({ running: false, enrolled: false });
    });

    it('UI_ACTIONS 含 get_bridge_status(契约门禁)', () => {
        expect(UI_ACTIONS).toContain('get_bridge_status');
    });
});
