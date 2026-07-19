// tests/unit/cdp_request_key_session_isolation.test.ts
// 验证 cdp_handler 的状态按 sessionId+requestId 复合键隔离，跨子 target 不碰撞
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
import { register_session } from '../../src/extension/background/cdp_event_router';

function make_state(emitted: any[]): CdpHandlerState {
    return {
        is_capturing: true,
        capture_id: 'cap_iso',
        start_time: Date.now(),
        current_tab_id: 1,
        config: {
            redact_sensitive_headers: false,
            redact_url_query: false,
            redact_data: false,
            capture_request_body: false,
            capture_response_body: true,
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

describe('CDP request key 跨 session 隔离', () => {
    let emitted: any[];
    let state: CdpHandlerState;

    beforeEach(() => {
        emitted = [];
        state = make_state(emitted);
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        // 子 target session 已登记
        register_session('child-session-1');
    });

    it('主 target 与子 target 用相同 requestId 时 meta 独立保留', async () => {
        // 主 target 请求
        handle_cdp_event({ tabId: 1 }, 'Network.requestWillBeSent', {
            requestId: 'DUP_1',
            type: 'Fetch',
            request: { url: 'https://root.example.com/api', method: 'GET', headers: {} },
        }, state);

        // 子 target 请求（相同 requestId）
        handle_cdp_event({ tabId: 1, sessionId: 'child-session-1' }, 'Network.requestWillBeSent', {
            requestId: 'DUP_1',
            type: 'Fetch',
            request: { url: 'https://child.example.com/api', method: 'POST', headers: {} },
        }, state);

        expect(state.cdp_request_meta.size).toBe(2);
        expect(state.cdp_request_meta.has('root:DUP_1')).toBe(true);
        expect(state.cdp_request_meta.has('child-session-1:DUP_1')).toBe(true);

        // 各自完成，验证 url/method 独立
        handle_cdp_event({ tabId: 1 }, 'Network.responseReceived', {
            requestId: 'DUP_1',
            response: { url: 'https://root.example.com/api', status: 200, headers: {} },
        }, state);
        handle_cdp_event({ tabId: 1, sessionId: 'child-session-1' }, 'Network.responseReceived', {
            requestId: 'DUP_1',
            response: { url: 'https://child.example.com/api', status: 201, headers: {} },
        }, state);

        handle_cdp_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'DUP_1' }, state);
        handle_cdp_event({ tabId: 1, sessionId: 'child-session-1' }, 'Network.loadingFinished', { requestId: 'DUP_1' }, state);

        await new Promise((r) => setTimeout(r, 50));

        expect(emitted.length).toBe(2);
        const root_evt = emitted.find((e) => e.data.url.includes('root.example.com'));
        const child_evt = emitted.find((e) => e.data.url.includes('child.example.com'));
        expect(root_evt).toBeDefined();
        expect(child_evt).toBeDefined();
        expect(root_evt.data.method).toBe('GET');
        expect(child_evt.data.method).toBe('POST');
        expect(root_evt.data.status_code).toBe(200);
        expect(child_evt.data.status_code).toBe(201);
    });
});
