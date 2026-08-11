// tests/unit/ws_absolute_time_wiring.test.ts
// 锁定 service_worker handle_network_request 的 absolute_time 接线守卫（T111，p025）：
// - ws 记录 start_time_ms > 0（绝对 epoch）时，absolute_time 不被 started_at+relative 覆盖；
// - 普通记录无正 start_time_ms 时，absolute_time 由 started_at + relative_time_ms 接线落库。
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { mock_chrome_debugger } from '../support/__mocks__/chrome_debugger';

const load_user_config = vi.hoisted(() => vi.fn());
const log_write = vi.hoisted(() => vi.fn());
const start_bridge_client = vi.hoisted(() => vi.fn());
const stop_bridge_client = vi.hoisted(() => vi.fn());

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
    start_keepalive: vi.fn(),
    stop_keepalive: vi.fn(),
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
        webRequest: {
            onBeforeRequest: { addListener: vi.fn(), removeListener: vi.fn() },
            onBeforeSendHeaders: { addListener: vi.fn(), removeListener: vi.fn() },
            onHeadersReceived: { addListener: vi.fn(), removeListener: vi.fn() },
            onCompleted: { addListener: vi.fn(), removeListener: vi.fn() },
            onErrorOccurred: { addListener: vi.fn(), removeListener: vi.fn() },
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
    await new Promise((resolve) => setTimeout(resolve, 30));
}

beforeEach(() => {
    mock_chrome_debugger.reset();
    vi.clearAllMocks();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('handle_network_request absolute_time 接线守卫 (T111)', () => {
    it('AC-001: ws 记录 start_time_ms>0 时 absolute_time 不被 started_at+relative 覆盖', async () => {
        install_chrome_mock();
        load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        await import('../../src/extension/background/service_worker');

        const start_res = await send_message('start', {
            capture_id: 'cap_ws_abs',
            config: { capture_network: true, capture_console: false, capture_response_body: false },
        });
        expect(start_res.success).toBe(true);

        const { _handle_network_request_for_test: handle_network_request } = await import('../../src/extension/background/service_worker');
        const start_epoch_ms = Date.now();
        // ws 连接事件：start_time_ms 为绝对 epoch（>0）
        await handle_network_request({
            event: { type: 'network_request', category: 'network', relative_time_ms: 100, source: 'background', severity: 'info', data: {} } as any,
            data: {
                request_id: 'ws_abs_1',
                url: 'wss://echo.example.com/ws',
                method: '',
                resource_type: 'websocket',
                start_time_ms: start_epoch_ms,
                end_time_ms: null,
                request_body_status: 'not_enabled',
                response_body_status: 'not_enabled',
                capture_method: 'cdp_websocket',
                body_capture_mode: 'none',
                ws_connection_id: 'ws_abs_1',
                ws_status: 'connecting',
            } as any,
        });
        await wait_flush();

        const { get_network_requests } = await import('../../src/extension/background/storage');
        const reqs = await get_network_requests('cap_ws_abs', 0, 100);
        const ws = reqs.find((r) => r.resource_type === 'websocket');
        expect(ws).toBeDefined();
        // 守卫：start_time_ms>0 → 保留绝对 epoch，不接线 absolute_time
        expect(ws!.start_time_ms).toBe(start_epoch_ms);
        expect(ws!.absolute_time).toBeUndefined();

        await send_message('stop');
    });

    it('AC-002: 普通记录无正 start_time_ms 时 absolute_time 由 started_at+relative 接线', async () => {
        install_chrome_mock();
        load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        await import('../../src/extension/background/service_worker');

        const start_res = await send_message('start', {
            capture_id: 'cap_abs_wire',
            config: { capture_network: true, capture_console: false, capture_response_body: false },
        });
        expect(start_res.success).toBe(true);

        const { get_capture } = await import('../../src/extension/background/storage');
        const { _handle_network_request_for_test: handle_network_request } = await import('../../src/extension/background/service_worker');
        const capture = await get_capture('cap_abs_wire');
        const started_at_ms = new Date(capture!.started_at).getTime();

        await handle_network_request({
            event: { type: 'network_request', category: 'network', relative_time_ms: 5000, source: 'background', severity: 'info', data: {} } as any,
            data: {
                request_id: 'req_abs_1',
                url: 'https://example.com/api',
                method: 'GET',
                resource_type: 'xhr',
                start_time_ms: null,
                end_time_ms: null,
                request_body_status: 'not_enabled',
                response_body_status: 'not_enabled',
                capture_method: 'cdp_primary',
                body_capture_mode: 'none',
            } as any,
        });
        await wait_flush();

        const { get_network_requests } = await import('../../src/extension/background/storage');
        const reqs = await get_network_requests('cap_abs_wire', 0, 100);
        const rec = reqs.find((r) => r.request_id === 'req_abs_1');
        expect(rec).toBeDefined();
        // 守卫另一分支：absolute_time = started_at + relative_time_ms
        expect(rec!.absolute_time).toBe(started_at_ms + 5000);

        await send_message('stop');
    });
});
