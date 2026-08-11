import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { mock_chrome_debugger } from '../support/__mocks__/chrome_debugger';

const load_user_config = vi.hoisted(() => vi.fn());
const log_write = vi.hoisted(() => vi.fn());
const start_bridge_client = vi.hoisted(() => vi.fn());
const stop_bridge_client = vi.hoisted(() => vi.fn());
const keepalive_start = vi.hoisted(() => vi.fn());
const keepalive_stop = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/user_config', () => ({
    load_user_config,
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
vi.mock('../../src/extension/background/agent_bridge_client', () => ({
    start_bridge_client,
    stop_bridge_client,
}));
vi.mock('../../src/extension/background/keepalive', () => ({
    setup_keepalive_listener: vi.fn(),
    start_keepalive: keepalive_start,
    stop_keepalive: keepalive_stop,
}));

let on_message_cb: ((msg: any, sender: any, send: (r: any) => void) => void) | undefined;

function install_chrome_mock(): void {
    vi.stubGlobal('self', { addEventListener: vi.fn() });
    vi.stubGlobal('chrome', {
        dbg: mock_chrome_debugger,
        debugger: mock_chrome_debugger,
        runtime: {
            getManifest: vi.fn(() => ({ version: '0.1.0' })),
            onInstalled: { addListener: vi.fn() },
            onMessage: { addListener: (cb: any) => { on_message_cb = cb; } },
        },
        storage: {
            local: {
                get: vi.fn(async () => ({})),
                set: vi.fn(async () => undefined),
            },
            onChanged: { addListener: vi.fn() },
        },
        cookies: {
            onChanged: { addListener: vi.fn() },
            getAll: vi.fn(async () => []),
        },
        tabs: {
            query: vi.fn(async () => [{ id: 42, url: 'https://example.com/app', title: 'T', windowId: 1 }]),
            get: vi.fn(async () => ({ id: 42, url: 'https://example.com/app' })),
            sendMessage: vi.fn(async () => undefined),
            onActivated: { addListener: vi.fn() },
            onCreated: { addListener: vi.fn() },
            onUpdated: { addListener: vi.fn() },
            onRemoved: { addListener: vi.fn() },
        },
    });
}

function send_message(action: string, payload: Record<string, unknown> = {}): Promise<any> {
    if (!on_message_cb) throw new Error('onMessage listener not registered');
    return new Promise((resolve) => {
        on_message_cb!({ action, ...payload }, {}, resolve);
    });
}

async function wait_flush(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('service_worker runtime exception → error event sink', () => {
    it('AC-001: Runtime.exceptionThrown 后 ERROR_EVENTS 出现 runtime_exception 记录', async () => {
        install_chrome_mock();
        load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        await import('../../src/extension/background/service_worker');

        const start_res = await send_message('start', { capture_id: 'cap_ex_sink', config: { capture_console: true, capture_network: false } });
        expect(start_res.success).toBe(true);

        mock_chrome_debugger.emit_event(
            { tabId: 42 },
            'Runtime.exceptionThrown',
            {
                exceptionDetails: {
                    text: 'Uncaught',
                    exception: { description: 'TypeError: x is not a function', className: 'TypeError' },
                    url: 'https://example.com/app.js',
                    lineNumber: 3,
                    columnNumber: 1,
                },
            }
        );
        await wait_flush();

        const { get_error_events } = await import('../../src/extension/background/storage');
        const errors = await get_error_events('cap_ex_sink', 0, 100);
        expect(errors.length).toBe(1);
        expect(errors[0].type).toBe('runtime_exception');
        expect(errors[0].message).toContain('TypeError');
        expect(errors[0].capture_id).toBe('cap_ex_sink');

        await send_message('stop');
    });

    it('AC-002: 异常不写入 CONSOLE_EVENTS', async () => {
        install_chrome_mock();
        load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        await import('../../src/extension/background/service_worker');

        await send_message('start', { capture_id: 'cap_ex_console', config: { capture_console: true, capture_network: false } });

        mock_chrome_debugger.emit_event(
            { tabId: 42 },
            'Runtime.exceptionThrown',
            {
                exceptionDetails: {
                    text: 'Uncaught',
                    exception: { description: 'Error: boom', className: 'Error' },
                    url: 'https://example.com/app.js',
                    lineNumber: 1,
                    columnNumber: 1,
                },
            }
        );
        await wait_flush();

        const { get_console_events } = await import('../../src/extension/background/storage');
        const logs = await get_console_events('cap_ex_console', 0, 100);
        expect(logs.some((l) => l.type === 'runtime_exception')).toBe(false);

        await send_message('stop');
    });

    it('AC-003: 停止后迟到的 exception 不写入任何 capture', async () => {
        install_chrome_mock();
        load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        await import('../../src/extension/background/service_worker');

        await send_message('start', { capture_id: 'cap_ex_stop', config: { capture_console: true, capture_network: false } });
        await send_message('stop');

        mock_chrome_debugger.emit_event(
            { tabId: 42 },
            'Runtime.exceptionThrown',
            {
                exceptionDetails: {
                    text: 'late',
                    exception: { description: 'Error: late', className: 'Error' },
                    url: 'https://example.com/app.js',
                    lineNumber: 1,
                    columnNumber: 1,
                },
            }
        );
        await wait_flush();

        const { get_error_events } = await import('../../src/extension/background/storage');
        const errors = await get_error_events('cap_ex_stop', 0, 100);
        expect(errors.length).toBe(0);

        await send_message('start', { capture_id: 'cap_ex_stop2', config: { capture_console: true, capture_network: false } });
        const { get_error_events: get_errors2 } = await import('../../src/extension/background/storage');
        const errors2 = await get_errors2('cap_ex_stop2', 0, 100);
        expect(errors2.length).toBe(0);
        await send_message('stop');
    });
});
