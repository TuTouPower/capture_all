// tests/unit/cdp_response_body_config.test.ts
// 验证 capture_response_body=false 时不发起 Network.getResponseBody / streamResourceContent
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

import { handle_cdp_event, type CdpHandlerState } from '../../src/extension/background/cdp_handler';
import { create_stream_buffer } from '../../src/extension/background/stream_buffer';

function make_state(capture_response_body: boolean, emitted: any[]): CdpHandlerState {
    return {
        is_capturing: true,
        capture_id: 'cap_test',
        start_time: Date.now(),
        current_tab_id: 1,
        config: {
            redact_sensitive_headers: false,
            redact_url_query: false,
            redact_data: false,
            capture_request_body: false,
            capture_response_body,
            max_body_capture_bytes: 104857600,
            inline_text_max_bytes: 32768,
        },
        dbg_tab_id: 1,
        dbg_attached_externally: false,
        pending_requests: new Map(),
        cdp_request_meta: new Map(),
        cdp_body_results: new Map(),
        cdp_primary_emitted: new Set(),
        ws_connections: new Map(),
        streaming_requests: new Set(),
        finished_before_stream: new Set(),
        stream_buffer_instance: create_stream_buffer(() => {}, 1024 * 1024),
        deferred_web_requests: new Map(),
        _deferred_cdp_index: new Map(),
        on_cdp_body_event: null,
        send_to_background: (payload: any) => emitted.push(payload),
    };
}

describe('capture_response_body config honored', () => {
    let emitted: any[];
    let sendCommand_spy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        emitted = [];
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        sendCommand_spy = vi.spyOn(mock_chrome_debugger, 'sendCommand');
    });

    it('capture_response_body=false: loadingFinished 不调 Network.getResponseBody', async () => {
        const state = make_state(false, emitted);

        handle_cdp_event({ tabId: 1 }, 'Network.requestWillBeSent', {
            requestId: 'r1',
            request: { url: 'https://example.com/api', method: 'GET' },
        }, state);

        handle_cdp_event({ tabId: 1 }, 'Network.responseReceived', {
            requestId: 'r1',
            response: { url: 'https://example.com/api', status: 200, headers: { 'Content-Type': 'application/json' } },
        }, state);

        handle_cdp_event({ tabId: 1 }, 'Network.loadingFinished', {
            requestId: 'r1',
        }, state);

        // Wait for any async paths
        await new Promise((r) => setTimeout(r, 50));

        const get_body_calls = sendCommand_spy.mock.calls.filter(c => (c[1] as string) === 'Network.getResponseBody');
        expect(get_body_calls.length).toBe(0);

        const stream_calls = sendCommand_spy.mock.calls.filter(c => (c[1] as string) === 'Network.streamResourceContent');
        expect(stream_calls.length).toBe(0);

        // Should still emit a primary network event
        expect(emitted.length).toBeGreaterThanOrEqual(1);
        const last = emitted[emitted.length - 1];
        expect(last.data.response_body_status).toBe('not_enabled');
        expect(last.data.response_body).toBeNull();
    });

    it('capture_response_body=false: 流式响应不调 streamResourceContent', async () => {
        const state = make_state(false, emitted);

        handle_cdp_event({ tabId: 1 }, 'Network.requestWillBeSent', {
            requestId: 'r2',
            request: { url: 'https://example.com/sse', method: 'GET' },
        }, state);

        handle_cdp_event({ tabId: 1 }, 'Network.responseReceived', {
            requestId: 'r2',
            response: {
                url: 'https://example.com/sse',
                status: 200,
                headers: { 'Content-Type': 'text/event-stream' },
            },
        }, state);

        await new Promise((r) => setTimeout(r, 20));

        expect(state.streaming_requests.has('r2')).toBe(false);
        const stream_calls = sendCommand_spy.mock.calls.filter(c => (c[1] as string) === 'Network.streamResourceContent');
        expect(stream_calls.length).toBe(0);
    });

    it('capture_response_body=true: 行为不变（仍调 getResponseBody）', async () => {
        const state = make_state(true, emitted);

        handle_cdp_event({ tabId: 1 }, 'Network.requestWillBeSent', {
            requestId: 'r3',
            request: { url: 'https://example.com/api', method: 'GET' },
        }, state);

        handle_cdp_event({ tabId: 1 }, 'Network.responseReceived', {
            requestId: 'r3',
            response: { url: 'https://example.com/api', status: 200, headers: { 'Content-Type': 'application/json' } },
        }, state);

        handle_cdp_event({ tabId: 1 }, 'Network.loadingFinished', {
            requestId: 'r3',
        }, state);

        await new Promise((r) => setTimeout(r, 50));

        const get_body_calls = sendCommand_spy.mock.calls.filter(c => (c[1] as string) === 'Network.getResponseBody');
        expect(get_body_calls.length).toBe(1);
    });
});
