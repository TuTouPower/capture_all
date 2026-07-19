// tests/unit/loading_failed_events.test.ts
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
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } },
    runtime: { getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }), onInstalled: { addListener: vi.fn() }, onMessage: { addListener: vi.fn() } },
    tabs: { query: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }), sendMessage: vi.fn().mockResolvedValue(undefined), onActivated: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() }, onRemoved: { addListener: vi.fn() }, onCreated: { addListener: vi.fn() } },
};

import { handle_cdp_event, type CdpHandlerState } from '../../src/extension/background/cdp_handler';
import { handle_error, type WebRequestHandlerState } from '../../src/extension/background/webrequest_handler';
import type { PendingRequest } from '../../src/extension/background/cdp_handler';
import { NetworkCaptureContext } from '../../src/extension/background/network_context';

function make_cdp_state(emitted: any[]): CdpHandlerState {
    return {
        is_capturing: true,
        capture_id: 'cap_fail',
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
        ws_connections: new Map(),
        streaming_requests: new Set(),
        finished_before_stream: new Set(),
        orphan_timers: new Map(),
        stream_buffer_instance: null,
        deferred_web_requests: new Map(),
        _deferred_cdp_index: new Map(),
        on_cdp_body_event: null,
        send_to_background: (payload: any) => emitted.push(payload),
    };
}

describe('loading_failed 立即发主条目', () => {
    let emitted: any[];
    let state: CdpHandlerState;

    beforeEach(() => {
        emitted = [];
        state = make_cdp_state(emitted);
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
    });

    it('handle_loading_failed 已有 meta 时立即发失败主条目并清理', () => {
        handle_cdp_event({ tabId: 1 }, 'Network.requestWillBeSent', {
            requestId: 'FAIL_1',
            type: 'Fetch',
            request: { url: 'https://example.com/fail', method: 'GET', headers: {} },
        }, state);

        expect(state.cdp_request_meta.size).toBe(1);

        handle_cdp_event({ tabId: 1 }, 'Network.loadingFailed', {
            requestId: 'FAIL_1',
            errorText: 'net::ERR_CONNECTION_RESET',
            type: 'Fetch',
        }, state);

        expect(emitted.length).toBe(1);
        expect(emitted[0].data.error_text).toContain('ERR_CONNECTION_RESET');
        expect(state.cdp_request_meta.has('root:FAIL_1')).toBe(false);
    });

    it('handle_loading_failed 无 meta 时走 orphan_check 兜底', () => {
        // 无 requestWillBeSent 前置，直接 loadingFailed
        handle_cdp_event({ tabId: 1 }, 'Network.loadingFailed', {
            requestId: 'ORPHAN_FAIL',
            errorText: 'net::ERR_NAME_NOT_RESOLVED',
        }, state);

        // 无 meta 不发主条目，但仍记录 body_results 等
        expect(emitted.length).toBe(0);
    });
});

describe('webRequest handle_error 发失败事件', () => {
    function make_wr_state(emitted: any[]): WebRequestHandlerState {
        return {
            is_capturing: true,
            capture_id: 'cap_wr',
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
            dbg_tab_id: null,
            pending_requests: new Map(),
            cdp_request_meta: new Map(),
            cdp_body_results: new Map(),
            deferred_web_requests: new Map(),
            _deferred_cdp_index: new Map(),
            send_to_background: (payload: any) => emitted.push(payload),
        };
    }

    it('handle_error 发失败网络事件含 error_text', () => {
        const emitted: any[] = [];
        const state = make_wr_state(emitted);
        const pending: PendingRequest = {
            cdp_request_id: 'WR_1',
            tab_id: 1,
            method: 'GET',
            url: 'https://example.com/api',
            timestamp: Date.now(),
            request_headers: {},
            response_headers: {},
            request_body: null,
            request_body_status: 'not_enabled',
            resource_type: 'xhr',
            mime_type: null,
        };
        state.pending_requests.set('WR_1', pending);

        handle_error({
            requestId: 'WR_1',
            tabId: 1,
            error: 'net::ERR_FAILED',
            url: 'https://example.com/api',
        }, state);

        expect(emitted.length).toBe(1);
        expect(emitted[0].data.error_text).toBe('net::ERR_FAILED');
        expect(emitted[0].data.status_code).toBeNull();
        expect(state.pending_requests.has('WR_1')).toBe(false);
    });
});

describe('NetworkCaptureContext.reset 取消 deferred timer', () => {
    it('reset 时 clearTimeout 被调用', () => {
        const ctx = new NetworkCaptureContext();
        const timer1 = setTimeout(() => {}, 10000);
        const timer2 = setTimeout(() => {}, 10000);
        ctx.deferred_web_requests.set('d1', {
            pending: {} as PendingRequest,
            details: {},
            timer: timer1,
            pending_cdp_ids: new Set(),
        });
        ctx.deferred_web_requests.set('d2', {
            pending: {} as PendingRequest,
            details: {},
            timer: timer2,
            pending_cdp_ids: new Set(),
        });

        const spy = vi.spyOn(globalThis, 'clearTimeout');
        ctx.reset();

        expect(spy).toHaveBeenCalledTimes(2);
        expect(ctx.deferred_web_requests.size).toBe(0);
        spy.mockRestore();
    });
});
