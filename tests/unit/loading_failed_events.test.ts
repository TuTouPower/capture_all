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

import { handle_error, type WebRequestHandlerState } from '../../src/extension/background/webrequest_handler';
import { start_network_capture, stop_network_capture, enable_response_body_capture, _cdp_request_meta_for_test } from '../../src/extension/background/network_capture';
import type { PendingRequest } from '../../src/extension/background/cdp_handler';
import { NetworkCaptureContext } from '../../src/extension/background/network_context';

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

describe('loadingFailed 带 meta（生产 network_capture 路径）', () => {
    let emitted: Array<{ event: any; data: any }>;

    beforeEach(async () => {
        vi.useFakeTimers();
        try { stop_network_capture(); } catch { /* not started */ }
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        emitted = [];
        start_network_capture('cap_lf_meta', Date.now(), {
            redact_sensitive_headers: false, redact_url_query: false, redact_data: false,
            capture_request_body: false, capture_response_body: true,
            max_body_capture_bytes: 104857600, inline_text_max_bytes: 32768,
        }, 1, (payload: any) => emitted.push(payload));
        await enable_response_body_capture(1, false);
    });

    afterEach(() => {
        vi.useRealTimers();
        try { stop_network_capture(); } catch { /* not started */ }
    });

    it('已有 meta 时 loadingFailed 不发立即主事件（t119 f001）', async () => {
        mock_chrome_debugger.emit_event({ tabId: 1 }, 'Network.requestWillBeSent', {
            requestId: 'LF1',
            type: 'Fetch',
            request: { url: 'https://example.com/lf', method: 'GET' },
        });
        expect(_cdp_request_meta_for_test.has('root:LF1')).toBe(true);

        mock_chrome_debugger.emit_event({ tabId: 1 }, 'Network.loadingFailed', {
            requestId: 'LF1',
            errorText: 'net::ERR_CONNECTION_RESET',
            type: 'Fetch',
        });
        // 生产语义：不发立即失败主事件（失败事件由 webRequest handle_error 通道发出）
        expect(emitted.length).toBe(0);
        // meta 保留（生产语义：等待消费路径，非 orphan 职责）
        expect(_cdp_request_meta_for_test.has('root:LF1')).toBe(true);

        // orphan 3s 兜底触发不抛错（handler 未设时早退）
        await vi.advanceTimersByTimeAsync(3000);
        // marker 清理由 t112 loadingFinished→loadingFailed 序列用例锁定（此处未建立 marker）
    });
});
