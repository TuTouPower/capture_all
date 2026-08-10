// tests/unit/network_capture_session_key.test.ts
// 验证 network_capture 生产路径按 sessionId+requestId 复合键隔离，子目标 body 命令带 sessionId
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock_chrome_debugger } from '../support/__mocks__/chrome_debugger';

(globalThis as any).chrome = {
    ...(globalThis as any).chrome || {},
    dbg: mock_chrome_debugger,
    debugger: mock_chrome_debugger,
    webRequest: {
        onBeforeRequest: { addListener: vi.fn(), removeListener: vi.fn() },
        onBeforeSendHeaders: { addListener: vi.fn(), removeListener: vi.fn() },
        onHeadersReceived: { addListener: vi.fn(), removeListener: vi.fn() },
        onCompleted: { addListener: vi.fn(), removeListener: vi.fn() },
        onErrorOccurred: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    storage: {
        local: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue(undefined),
        },
    },
    runtime: {
        getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }),
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
    },
    tabs: {
        query: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
        sendMessage: vi.fn().mockResolvedValue(undefined),
        onActivated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
        onCreated: { addListener: vi.fn() },
    },
};

import {
    start_network_capture,
    stop_network_capture,
    enable_response_body_capture,
    _pending_requests_for_test,
    _cdp_request_meta_for_test,
    _cdp_body_results_for_test,
    _streaming_requests_for_test,
    _finished_before_stream_for_test,
    _ws_connections_for_test,
    _deferred_web_requests_for_test,
} from '../../src/extension/background/network_capture';
import { register_session, clear_sessions } from '../../src/extension/background/cdp_event_router';

function make_cfg(overrides: Record<string, unknown> = {}) {
    return {
        redact_sensitive_headers: false,
        redact_url_query: false,
        redact_data: false,
        capture_request_body: false,
        capture_response_body: true,
        max_body_capture_bytes: 1024 * 1024,
        inline_text_max_bytes: 1024 * 1024,
        ...overrides,
    };
}

const TAB_ID = 1;
const SESSION_A = 'session-a';
const SESSION_B = 'session-b';

function capture_emitted(): any[] {
    const events: any[] = [];
    start_network_capture('cap_key', Date.now(), make_cfg() as any, TAB_ID, (payload) => {
        events.push(payload);
    });
    return events;
}

async function start_with_body_capture(): Promise<any[]> {
    const events = capture_emitted();
    await enable_response_body_capture(TAB_ID, false);
    return events;
}

describe('network_capture session 复合键', () => {
    beforeEach(async () => {
        mock_chrome_debugger.reset();
        clear_sessions();
        _pending_requests_for_test.clear();
        _cdp_request_meta_for_test.clear();
        _cdp_body_results_for_test.clear();
        _streaming_requests_for_test.clear();
        _finished_before_stream_for_test.clear();
        _ws_connections_for_test.clear();
        _deferred_web_requests_for_test.clear();
    });

    afterEach(() => {
        stop_network_capture();
    });

    it('AC-001: 同一 requestId 不同 session 元数据互不覆盖，各自完成写入', async () => {
        const events = await start_with_body_capture();
        const t = Date.now();

        // session A 与 session B 使用相同 requestId
        register_session(SESSION_A);
        register_session(SESSION_B);

        const same_req_id = 'req_dup';

        mock_chrome_debugger.emit_event({ tabId: TAB_ID, sessionId: SESSION_A }, 'Network.requestWillBeSent', {
            requestId: same_req_id,
            type: 'XHR',
            request: { url: 'https://a.example.com/data', method: 'GET', headers: {} },
        });
        mock_chrome_debugger.emit_event({ tabId: TAB_ID, sessionId: SESSION_B }, 'Network.requestWillBeSent', {
            requestId: same_req_id,
            type: 'XHR',
            request: { url: 'https://b.example.com/data', method: 'POST', headers: {} },
        });
        mock_chrome_debugger.emit_event({ tabId: TAB_ID, sessionId: SESSION_A }, 'Network.responseReceived', {
            requestId: same_req_id,
            type: 'XHR',
            response: { url: 'https://a.example.com/data', status: 200, headers: { 'content-type': 'application/json' } },
        });
        mock_chrome_debugger.emit_event({ tabId: TAB_ID, sessionId: SESSION_B }, 'Network.responseReceived', {
            requestId: same_req_id,
            type: 'XHR',
            response: { url: 'https://b.example.com/data', status: 201, headers: { 'content-type': 'application/json' } },
        });

        // 两个 session 的 meta 都保留（未互相覆盖）
        const metas = [..._cdp_request_meta_for_test.values()];
        const urls = metas.map((m) => m.url).sort();
        expect(urls).toEqual(['https://a.example.com/data', 'https://b.example.com/data']);
        expect(metas[0].method).not.toBe(metas[1].method);

        // 各自 loadingFinished 后写入事件
        mock_chrome_debugger.emit_event({ tabId: TAB_ID, sessionId: SESSION_A }, 'Network.loadingFinished', { requestId: same_req_id });
        mock_chrome_debugger.emit_event({ tabId: TAB_ID, sessionId: SESSION_B }, 'Network.loadingFinished', { requestId: same_req_id });
        await new Promise((r) => setTimeout(r, 20));

        const emitted_urls = events.map((e) => e.data.url).sort();
        expect(emitted_urls).toEqual(['https://a.example.com/data', 'https://b.example.com/data']);
    });

    it('AC-002: 子 session 请求的 getResponseBody/streamResourceContent target 含 sessionId', async () => {
        const events = await start_with_body_capture();
        register_session(SESSION_A);

        // 流式（SSE）触发 streamResourceContent
        mock_chrome_debugger.emit_event({ tabId: TAB_ID, sessionId: SESSION_A }, 'Network.requestWillBeSent', {
            requestId: 'req_stream',
            type: 'Fetch',
            request: { url: 'https://a.example.com/stream', method: 'GET', headers: {} },
        });
        mock_chrome_debugger.emit_event({ tabId: TAB_ID, sessionId: SESSION_A }, 'Network.responseReceived', {
            requestId: 'req_stream',
            type: 'Fetch',
            response: { url: 'https://a.example.com/stream', status: 200, headers: { 'content-type': 'text/event-stream' } },
        });

        // 非流式 getResponseBody
        mock_chrome_debugger.emit_event({ tabId: TAB_ID, sessionId: SESSION_A }, 'Network.requestWillBeSent', {
            requestId: 'req_plain',
            type: 'XHR',
            request: { url: 'https://a.example.com/data', method: 'GET', headers: {} },
        });
        mock_chrome_debugger.emit_event({ tabId: TAB_ID, sessionId: SESSION_A }, 'Network.responseReceived', {
            requestId: 'req_plain',
            type: 'XHR',
            response: { url: 'https://a.example.com/data', status: 200, headers: { 'content-type': 'application/json' } },
        });
        mock_chrome_debugger.emit_event({ tabId: TAB_ID, sessionId: SESSION_A }, 'Network.loadingFinished', { requestId: 'req_plain' });
        await new Promise((r) => setTimeout(r, 20));

        const stream_calls = mock_chrome_debugger.send_command_calls.filter((c) => c.command === 'Network.streamResourceContent');
        const body_calls = mock_chrome_debugger.send_command_calls.filter((c) => c.command === 'Network.getResponseBody');

        // 存在性断言：流式路径无事件守卫，命令未发出时静默 PASS 属假绿
        expect(stream_calls.length).toBeGreaterThanOrEqual(1);
        expect(body_calls.length).toBeGreaterThanOrEqual(1);

        for (const call of stream_calls) {
            expect(call.sessionId).toBe(SESSION_A);
        }
        for (const call of body_calls) {
            expect(call.sessionId).toBe(SESSION_A);
        }
        expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it('AC-003: 根 session（无 sessionId）行为与现网一致', async () => {
        const events = await start_with_body_capture();
        mock_chrome_debugger.set_command_response('Network.getResponseBody', {
            body: '<html>root-body</html>',
            base64Encoded: false,
        });
        mock_chrome_debugger.emit_event({ tabId: TAB_ID }, 'Network.requestWillBeSent', {
            requestId: 'req_root',
            type: 'Document',
            request: { url: 'https://example.com/page', method: 'GET', headers: {} },
        });
        mock_chrome_debugger.emit_event({ tabId: TAB_ID }, 'Network.responseReceived', {
            requestId: 'req_root',
            type: 'Document',
            response: { url: 'https://example.com/page', status: 200, headers: { 'content-type': 'text/html' } },
        });
        mock_chrome_debugger.emit_event({ tabId: TAB_ID }, 'Network.loadingFinished', { requestId: 'req_root' });
        await new Promise((r) => setTimeout(r, 20));

        const root_events = events.filter((e) => e.data.url === 'https://example.com/page');
        expect(root_events.length).toBe(1);
        expect(root_events[0].data.request_id).toBe('req_root');
        expect(root_events[0].data.response_body).toContain('root-body');
        expect(root_events[0].data.response_body_status).toBe('captured');
    });
});
