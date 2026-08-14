// tests/unit/cdp_network_redaction_integration.test.ts
// @vitest-environment jsdom
// t199 AC-002/003: SW 网络路径集成测试——
//   AC-002: handle_cdp_body_event fire-and-forget .catch 位点（错误路径不抛未捕获异常）；
//   AC-003: handle_network_request 落库前 body 脱敏（redact_data 时敏感 body 落库为脱敏值）。
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
            local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) },
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
        on_message_cb!({ action, payload }, {}, resolve);
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

describe('t199 AC-002: handle_cdp_body_event .catch 位点', () => {
    it('错误路径不抛未捕获异常（fire-and-forget rejection 被 .catch 吞掉并记日志）', async () => {
        install_chrome_mock();
        load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        await import('../../src/extension/background/service_worker');

        const start_res = await send_message('start', {
            capture_id: 'cap_catch',
            config: { capture_network: true, capture_console: false, capture_response_body: false },
        });
        expect(start_res.success).toBe(true);

        const { _handle_cdp_body_event_for_test } = await import('../../src/extension/background/service_worker');
        // 制造 handle_network_request reject：check_limit_and_stop 内 check_storage_limit 抛错，
        // fire-and-forget 的 .catch 必须吞掉（若未兜住，vitest 报 unhandled rejection）
        const storage = await import('../../src/extension/background/storage');
        const limit_spy = vi.spyOn(storage, 'check_storage_limit').mockRejectedValue(new Error('storage boom'));
        // CDP body 事件流：response_body 存在 → handle_network_request 落库路径
        const cdp_event = {
            request_id: 'cdp_catch_1',
            tab_id: 42,
            url: 'https://example.com/api',
            method: 'GET',
            status_code: 200,
            timestamp: Date.now(),
            resource_type: 'fetch',
            request_body: null,
            request_body_status: 'not_enabled',
            response_body: '{"a":1}',
            response_body_status: 'captured',
            response_preview: null,
            response_headers: { 'content-type': 'application/json' },
        };
        // 无异常即证明 .catch 兜住（若未兜住，vitest 会报 unhandled rejection）
        _handle_cdp_body_event_for_test(cdp_event as never);
        await wait_flush();
        expect(limit_spy).toHaveBeenCalled();
        // 错误日志经 transport 写出（.catch 内 logger.error）
        const err_log = log_write.mock.calls.find((c: unknown[]) => JSON.stringify(c[0])?.includes('handle_cdp_body_event failed'));
        expect(err_log).toBeTruthy();
        limit_spy.mockRestore();
        await send_message('stop');
    });

    it('正常路径：CDP body 事件落库为网络请求（无 .catch 误报）', async () => {
        install_chrome_mock();
        load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        await import('../../src/extension/background/service_worker');

        const start_res = await send_message('start', {
            capture_id: 'cap_cdp_ok',
            config: { capture_network: true, capture_console: false, capture_response_body: false },
        });
        expect(start_res.success).toBe(true);

        const { _handle_cdp_body_event_for_test } = await import('../../src/extension/background/service_worker');
        _handle_cdp_body_event_for_test({
            request_id: 'cdp_ok_1',
            tab_id: 42,
            url: 'https://example.com/data',
            method: 'GET',
            status_code: 200,
            timestamp: Date.now(),
            resource_type: 'xhr',
            request_body: null,
            request_body_status: 'not_enabled',
            response_body: 'payload',
            response_body_status: 'captured',
            response_preview: null,
            response_headers: { 'content-type': 'application/json' },
        } as never);
        await wait_flush();

        const { get_network_requests } = await import('../../src/extension/background/storage');
        const reqs = await get_network_requests('cap_cdp_ok', 0, 100);
        const req = reqs.find((r) => r.request_id === 'cdp_ok_1');
        expect(req).toBeDefined();
        expect(req!.response_body).toBe('payload');
        expect(req!.capture_method).toBe('extension_cdp');

        await send_message('stop');
    });
});

describe('t199 AC-003: handle_network_request 落库前 body 脱敏', () => {
    it('redact_data=true 时带敏感 body 的请求落库为脱敏值', async () => {
        install_chrome_mock();
        load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        await import('../../src/extension/background/service_worker');

        const start_res = await send_message('start', {
            capture_id: 'cap_redact',
            config: {
                capture_network: true,
                capture_console: false,
                redact_data: true,
                inline_text_max_bytes: 32768,
            },
        });
        expect(start_res.success).toBe(true);

        const { _handle_network_request_for_test } = await import('../../src/extension/background/service_worker');
        const request = {
            request_id: 'redact_1',
            url: 'https://example.com/api',
            method: 'POST',
            url_status: 'captured',
            status_code: 200,
            status_text: 'OK',
            protocol: 'h2',
            resource_type: 'fetch',
            duration_ms: 10,
            request_headers: {},
            response_headers: { 'content-type': 'application/json' },
            headers_status: 'captured',
            request_body: '{"password":"s3cret","user":"alice"}',
            request_body_status: 'captured',
            request_body_mime: 'application/json',
            response_body: '{"token":"abc123"}',
            response_body_status: 'captured',
            mime_type: 'application/json',
            capture_method: 'web_request',
            body_capture_mode: 'full',
        };
        await _handle_network_request_for_test(request as never);
        await wait_flush();

        const { get_network_requests } = await import('../../src/extension/background/storage');
        const reqs = await get_network_requests('cap_redact', 0, 100);
        const req = reqs.find((r) => r.request_id === 'redact_1');
        expect(req).toBeDefined();
        // 敏感值脱敏：password/token 值替换，非敏感字段保留
        expect(req!.request_body).toContain('[REDACTED]');
        expect(req!.request_body).not.toContain('s3cret');
        expect(req!.response_body).toContain('[REDACTED]');
        expect(req!.response_body).not.toContain('abc123');
        // user 非敏感键保留
        expect(req!.request_body).toContain('alice');

        await send_message('stop');
    });

    it('redact_data=false 时 body 原样落库（脱敏接入点不误伤正常路径）', async () => {
        install_chrome_mock();
        load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        await import('../../src/extension/background/service_worker');

        const start_res = await send_message('start', {
            capture_id: 'cap_plain',
            config: { capture_network: true, capture_console: false, redact_data: false },
        });
        expect(start_res.success).toBe(true);

        const { _handle_network_request_for_test } = await import('../../src/extension/background/service_worker');
        await _handle_network_request_for_test({
            request_id: 'plain_1',
            url: 'https://example.com/api',
            method: 'POST',
            url_status: 'captured',
            status_code: 200,
            status_text: 'OK',
            protocol: 'h2',
            resource_type: 'fetch',
            duration_ms: 10,
            request_headers: {},
            response_headers: { 'content-type': 'application/json' },
            headers_status: 'captured',
            request_body: '{"password":"keepme"}',
            request_body_status: 'captured',
            request_body_mime: 'application/json',
            response_body: null,
            response_body_status: 'not_enabled',
            mime_type: 'application/json',
            capture_method: 'web_request',
            body_capture_mode: 'full',
        } as never);
        await wait_flush();

        const { get_network_requests } = await import('../../src/extension/background/storage');
        const reqs = await get_network_requests('cap_plain', 0, 100);
        const req = reqs.find((r) => r.request_id === 'plain_1');
        expect(req).toBeDefined();
        expect(req!.request_body).toContain('keepme');

        await send_message('stop');
    });
});
