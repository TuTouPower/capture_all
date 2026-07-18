// tests/network_cdp.test.ts
// CDP body capture unit tests using chrome.debugger mock.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock_chrome_debugger } from '../support/__mocks__/chrome_debugger';

// Install chrome.dbg alias before importing modules that use it
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
} from '../../src/extension/background/network_capture';

// Helper to create a standard capture config
function make_cfg(overrides: Partial<{
    redact_sensitive_headers: boolean;
    redact_url_query: boolean;
    redact_data: boolean;
    capture_request_body: boolean;
    capture_response_body: boolean;
    max_body_capture_bytes: number;
    inline_text_max_bytes: number;
}> = {}) {
    return {
        redact_sensitive_headers: false,
        redact_url_query: false,
        redact_data: false,
        capture_request_body: false,
        capture_response_body: true,
        max_body_capture_bytes: 104857600,
        inline_text_max_bytes: 32768,
        ...overrides,
    };
}

describe('enable_response_body_capture', () => {
    beforeEach(() => {
        // Stop any previous capture first (uses mock counters), then reset mock
        try { stop_network_capture(); } catch { /* not started yet */ }
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
    });

    it('succeeds when debugger attaches and Network.enable works', async () => {
        start_network_capture(
            'test_capture',
            1700000000000,
            {
                redact_sensitive_headers: false,
                redact_url_query: false,
                redact_data: false,
                capture_request_body: false,
                capture_response_body: true,
            },
            1,
            () => {}
        );

        const result = await enable_response_body_capture(1, false);
        expect(result.success).toBe(true);
        expect(mock_chrome_debugger.attach_count).toBe(1);
        expect(mock_chrome_debugger.last_attached_tab_id).toBe(1);
        expect(mock_chrome_debugger.listener_count).toBe(1);
    });

    it('returns success when already attached to same tab', async () => {
        start_network_capture(
            'test_capture',
            1700000000000,
            {
                redact_sensitive_headers: false,
                redact_url_query: false,
                redact_data: false,
                capture_request_body: false,
                capture_response_body: true,
            },
            1,
            () => {}
        );

        // First call succeeds
        await enable_response_body_capture(1, false);
        expect(mock_chrome_debugger.attach_count).toBe(1);

        // Second call for same tab should return success without re-attaching
        const result = await enable_response_body_capture(1, false);
        expect(result.success).toBe(true);
        expect(mock_chrome_debugger.attach_count).toBe(1);
        expect(mock_chrome_debugger.detach_count).toBe(0);
    });

    it('detaches old tab and re-attaches when called with different tab', async () => {
        start_network_capture(
            'test_capture',
            1700000000000,
            {
                redact_sensitive_headers: false,
                redact_url_query: false,
                redact_data: false,
                capture_request_body: false,
                capture_response_body: true,
            },
            1,
            () => {}
        );

        // First call on tab 1 succeeds
        await enable_response_body_capture(1, false);
        expect(mock_chrome_debugger.attach_count).toBe(1);

        // Second call on tab 2 should detach tab 1 then attach tab 2
        const result = await enable_response_body_capture(2, false);
        expect(result.success).toBe(true);
        expect(mock_chrome_debugger.detach_count).toBe(1);
        expect(mock_chrome_debugger.last_detached_tab_id).toBe(1);
        expect(mock_chrome_debugger.attach_count).toBe(2);
        expect(mock_chrome_debugger.last_attached_tab_id).toBe(2);
    });

    it('fails when debugger attach is rejected', async () => {
        start_network_capture(
            'test_capture',
            1700000000000,
            {
                redact_sensitive_headers: false,
                redact_url_query: false,
                redact_data: false,
                capture_request_body: false,
                capture_response_body: true,
            },
            1,
            () => {}
        );

        mock_chrome_debugger.attach_should_fail = true;
        const result = await enable_response_body_capture(2, false);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('skips attach when already_attached=true', async () => {
        start_network_capture(
            'test_capture',
            1700000000000,
            {
                redact_sensitive_headers: false,
                redact_url_query: false,
                redact_data: false,
                capture_request_body: false,
                capture_response_body: true,
            },
            1,
            () => {}
        );

        const result = await enable_response_body_capture(1, true);
        expect(result.success).toBe(true);
        expect(mock_chrome_debugger.attach_count).toBe(0);
        expect(mock_chrome_debugger.listener_count).toBe(1);
    });

    it('emits CDP events to registered listeners', async () => {
        start_network_capture(
            'test_capture',
            1700000000000,
            {
                redact_sensitive_headers: false,
                redact_url_query: false,
                redact_data: false,
                capture_request_body: false,
                capture_response_body: true,
            },
            1,
            () => {}
        );

        await enable_response_body_capture(1, false);

        // Simulate CDP requestWillBeSent event
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            {
                requestId: 'req_test_1',
                request: { url: 'https://example.com/api', method: 'GET', headers: {} },
                type: 'XHR',
            }
        );

        // Verify meta was stored
        const { _cdp_request_meta_for_test } = await import('../../src/extension/background/network_capture');
        expect(_cdp_request_meta_for_test.has('req_test_1')).toBe(true);
        const meta = _cdp_request_meta_for_test.get('req_test_1')!;
        expect(meta.url).toBe('https://example.com/api');
        expect(meta.method).toBe('GET');
    });

    it('receives CDP Network.getResponseBody result and stores in cdp_body_results', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', {
            body: '{"status":"ok"}',
            base64Encoded: false,
        });

        start_network_capture(
            'test_capture',
            1700000000000,
            {
                redact_sensitive_headers: false,
                redact_url_query: false,
                redact_data: false,
                capture_request_body: false,
                capture_response_body: true,
            },
            1,
            () => {}
        );

        await enable_response_body_capture(1, false);

        // Register request meta first
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            {
                requestId: 'req_body_test',
                request: { url: 'https://example.com/api', method: 'GET', headers: {} },
                type: 'XHR',
            }
        );

        // Simulate loadingFinished → triggers Network.getResponseBody
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.loadingFinished',
            { requestId: 'req_body_test' }
        );

        // The sendCommand is async, wait a tick
        await new Promise(r => setTimeout(r, 10));

        const calls = mock_chrome_debugger.send_command_calls;
        const get_body_call = calls.find(c => c.command === 'Network.getResponseBody');
        expect(get_body_call).toBeDefined();
        expect(get_body_call!.params.requestId).toBe('req_body_test');
    });
});

describe('CDP-first: primary record emission', () => {
    let emitted: any[] = [];

    beforeEach(() => {
        try { stop_network_capture(); } catch { /* not started yet */ }
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        emitted = [];
    });

    async function setup_capture(cfg_overrides: Record<string, any> = {}) {
        start_network_capture(
            'test_capture',
            1700000000000,
            make_cfg(cfg_overrides),
            1,
            (payload: any) => { emitted.push(payload); }
        );
        await enable_response_body_capture(1, false);
    }

    it('emits cdp_primary record on loadingFinished with matching meta', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', {
            body: '{"ok":true}',
            base64Encoded: false,
        });
        await setup_capture();

        // CDP requestWillBeSent → stores meta
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            {
                requestId: 'cdp_1',
                request: { url: 'https://example.com/api', method: 'GET', headers: {} },
                type: 'Fetch',
            }
        );

        // CDP loadingFinished → should build and emit complete record
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.loadingFinished',
            { requestId: 'cdp_1' }
        );

        await new Promise(r => setTimeout(r, 20));

        expect(emitted).toHaveLength(1);
        expect(emitted[0].data.capture_method).toBe('cdp_primary');
        expect(emitted[0].data.response_body).toBe('{"ok":true}');
        expect(emitted[0].data.response_body_status).toBe('captured');
        expect(emitted[0].data.url).toBe('https://example.com/api');
        expect(emitted[0].data.method).toBe('GET');
        expect(emitted[0].data.resource_type).toBe('fetch');
    });

    it('captures request body from CDP postData', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', {
            body: 'ok',
            base64Encoded: false,
        });
        await setup_capture({ capture_request_body: true });

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            {
                requestId: 'cdp_post',
                request: {
                    url: 'https://example.com/submit',
                    method: 'POST',
                    headers: {},
                    postData: '{"name":"test"}',
                },
                type: 'Fetch',
            }
        );

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.loadingFinished',
            { requestId: 'cdp_post' }
        );

        await new Promise(r => setTimeout(r, 20));

        expect(emitted).toHaveLength(1);
        expect(emitted[0].data.request_body).toBe('{"name":"test"}');
        expect(emitted[0].data.request_body_status).toBe('captured');
    });

    it('captures binary response (was unsupported_binary)', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', {
            body: 'base64data',
            base64Encoded: true,
        });
        await setup_capture();

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            {
                requestId: 'cdp_bin',
                request: { url: 'https://example.com/img.png', method: 'GET', headers: {} },
                type: 'Image',
            }
        );

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.loadingFinished',
            { requestId: 'cdp_bin' }
        );

        await new Promise(r => setTimeout(r, 20));

        expect(emitted).toHaveLength(1);
        expect(emitted[0].data.response_body_status).toBe('captured');
        expect(emitted[0].data.response_body_encoding).toBe('base64');
        expect(emitted[0].data.response_body).toBe('base64data');
    });

    it('captures binary response as base64 with captured status', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', {
            body: 'aGVsbG8=',
            base64Encoded: true,
        });
        await setup_capture();

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            {
                requestId: 'cdp_png',
                request: { url: 'https://example.com/i.png', method: 'GET', headers: {} },
                type: 'Image',
            }
        );
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.loadingFinished',
            { requestId: 'cdp_png' }
        );
        await new Promise(r => setTimeout(r, 20));

        expect(emitted).toHaveLength(1);
        expect(emitted[0].data.response_body_status).toBe('captured');
        expect(emitted[0].data.response_body_encoding).toBe('base64');
        expect(emitted[0].data.response_body).toBe('aGVsbG8=');
        expect(emitted[0].data.response_body_bytes).toBe(5);
    });

    it('marks binary exceeding ceiling as too_large, preserves encoding', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', {
            body: 'A'.repeat(2000000),
            base64Encoded: true,
        });
        await setup_capture({ max_body_capture_bytes: 1024 });

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            {
                requestId: 'cdp_big',
                request: { url: 'https://example.com/big.jpg', method: 'GET', headers: {} },
                type: 'Image',
            }
        );
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.loadingFinished',
            { requestId: 'cdp_big' }
        );
        await new Promise(r => setTimeout(r, 20));

        expect(emitted).toHaveLength(1);
        expect(emitted[0].data.response_body_status).toBe('too_large');
        expect(emitted[0].data.response_body_encoding).toBe('base64');
        expect(emitted[0].data.response_body).toBeNull();
        expect(emitted[0].data.response_body_bytes).toBeGreaterThan(0);
    });

    it('handles getResponseBody "No resource" as not_enabled (resource released)', async () => {
        mock_chrome_debugger.set_command_error('Network.getResponseBody', new Error('No resource'));
        await setup_capture();

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            {
                requestId: 'cdp_fail',
                request: { url: 'https://example.com/missing', method: 'GET', headers: {} },
                type: 'Document',
            }
        );

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.loadingFinished',
            { requestId: 'cdp_fail' }
        );

        await new Promise(r => setTimeout(r, 20));

        expect(emitted).toHaveLength(1);
        expect(emitted[0].data.response_body_status).toBe('not_enabled');
    });

    it('normalizes CDP PascalCase resource_type to lowercase', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', {
            body: 'ok',
            base64Encoded: false,
        });
        await setup_capture();

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            {
                requestId: 'cdp_type',
                request: { url: 'https://example.com/style.css', method: 'GET', headers: {} },
                type: 'Stylesheet',
            }
        );

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.loadingFinished',
            { requestId: 'cdp_type' }
        );

        await new Promise(r => setTimeout(r, 20));

        expect(emitted).toHaveLength(1);
        expect(emitted[0].data.resource_type).toBe('stylesheet');
    });

    it('updates status_code from Network.responseReceived', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', {
            body: 'not found',
            base64Encoded: false,
        });
        await setup_capture();

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            {
                requestId: 'cdp_status',
                request: { url: 'https://example.com/404', method: 'GET', headers: {} },
                type: 'Document',
            }
        );

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.responseReceived',
            {
                requestId: 'cdp_status',
                response: { status: 404, headers: { 'content-type': 'text/html' } },
            }
        );

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.loadingFinished',
            { requestId: 'cdp_status' }
        );

        await new Promise(r => setTimeout(r, 20));

        expect(emitted).toHaveLength(1);
        expect(emitted[0].data.status_code).toBe(404);
    });
});

describe('CDP-first: webRequest skips attached tab', () => {
    let emitted: any[] = [];

    beforeEach(() => {
        try { stop_network_capture(); } catch { /* not started yet */ }
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        emitted = [];
    });

    it('webRequest handle_completed skips request from attached tab', async () => {
        start_network_capture(
            'test_capture',
            1700000000000,
            make_cfg(),
            1,
            (payload: any) => { emitted.push(payload); }
        );
        await enable_response_body_capture(1, false);

        const beforeReqCalls = (chrome.webRequest.onBeforeRequest.addListener as any).mock.calls;
        const completedCalls = (chrome.webRequest.onCompleted.addListener as any).mock.calls;
        const handle_before_request = beforeReqCalls[beforeReqCalls.length - 1][0];
        const handle_completed = completedCalls[completedCalls.length - 1][0];

        // beforeRequest from attached tab — creates pending (no skip in beforeRequest for this test)
        handle_before_request({
            requestId: 'wr_skip',
            tabId: 1,
            url: 'https://example.com',
            method: 'GET',
            type: 'main_frame',
            timeStamp: 1700000000500,
        });

        // Complete from attached tab (tabId=1) — should be skipped by CDP-first guard
        handle_completed({
            requestId: 'wr_skip',
            tabId: 1,
            statusCode: 200,
            timeStamp: 1700000001000,
        });

        // No pending was created for attached tab (skipped in beforeRequest), so nothing to emit
        expect(emitted).toHaveLength(0);
    });

    it('webRequest handle_completed emits for non-attached tab', async () => {
        start_network_capture(
            'test_capture',
            1700000000000,
            make_cfg(),
            1,
            (payload: any) => { emitted.push(payload); }
        );
        await enable_response_body_capture(1, false);

        const beforeReqCalls = (chrome.webRequest.onBeforeRequest.addListener as any).mock.calls;
        const completedCalls = (chrome.webRequest.onCompleted.addListener as any).mock.calls;
        const handle_before_request = beforeReqCalls[beforeReqCalls.length - 1][0];
        const handle_completed = completedCalls[completedCalls.length - 1][0];

        // Create pending entry from non-attached tab (tabId=99)
        handle_before_request({
            requestId: 'wr_other',
            tabId: 99,
            url: 'https://other.com',
            method: 'GET',
            type: 'main_frame',
            timeStamp: 1700000000500,
        });

        // Complete from non-attached tab
        handle_completed({
            requestId: 'wr_other',
            tabId: 99,
            statusCode: 200,
            timeStamp: 1700000001000,
        });

        // Deferred path: wait for 1500ms timeout
        await new Promise(r => setTimeout(r, 1600));

        expect(emitted).toHaveLength(1);
        expect(emitted[0].data.capture_method).toBe('web_request');
        expect(emitted[0].data.response_body_status).toBe('not_enabled');
    });
});

describe('CDP edge cases — headers and body boundaries', () => {
    let emitted: any[];

    beforeEach(() => {
        try { stop_network_capture(); } catch { /* not started */ }
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        emitted = [];
    });

    async function setup_and_emit(method: string, params: any) {
        start_network_capture(
            'test_edge',
            1700000000000,
            make_cfg(),
            1,
            (payload: any) => emitted.push(payload),
        );
        await enable_response_body_capture(1, false);
        mock_chrome_debugger.emit_event({ tabId: 1 }, method, params);
    }

    it('empty response headers → mime_type is null', async () => {
        await setup_and_emit('Network.responseReceived', {
            requestId: 'req_empty_hdr',
            response: { status: 200, headers: {} },
            type: 'Document',
        });

        mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: 'ok', base64Encoded: false });
        mock_chrome_debugger.emit_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'req_empty_hdr' });
        await new Promise(r => setTimeout(r, 100));

        expect(emitted.length).toBeGreaterThanOrEqual(1);
        const req = emitted.find(e => e.data.request_id === 'req_empty_hdr');
        expect(req).toBeDefined();
        expect(req!.data.mime_type).toBeNull();
    });

    it('mixed-case Content-Type header → correct mime extraction', async () => {
        await setup_and_emit('Network.responseReceived', {
            requestId: 'req_mixed_case',
            response: { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
            type: 'XHR',
        });

        mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: '{}', base64Encoded: false });
        mock_chrome_debugger.emit_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'req_mixed_case' });
        await new Promise(r => setTimeout(r, 100));

        expect(emitted.length).toBeGreaterThanOrEqual(1);
        const req = emitted.find(e => e.data.request_id === 'req_mixed_case');
        expect(req).toBeDefined();
        expect(req!.data.mime_type).toBe('application/json');
    });

    it('text body exceeding max_body_capture_bytes → too_large with truncation', async () => {
        // Use a small max_body_capture_bytes for this test
        try { stop_network_capture(); } catch { /* */ }
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        emitted = [];

        start_network_capture(
            'test_large',
            1700000000000,
            make_cfg({ max_body_capture_bytes: 50 }),
            1,
            (payload: any) => emitted.push(payload),
        );
        await enable_response_body_capture(1, false);

        mock_chrome_debugger.emit_event({ tabId: 1 }, 'Network.requestWillBeSent', {
            requestId: 'req_large_text',
            request: { url: 'https://example.com/big', method: 'GET', headers: {} },
            type: 'Document',
        });

        mock_chrome_debugger.emit_event({ tabId: 1 }, 'Network.responseReceived', {
            requestId: 'req_large_text',
            response: { status: 200, headers: { 'content-type': 'text/plain' } },
            type: 'Document',
        });

        const big_body = 'x'.repeat(200);
        mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: big_body, base64Encoded: false });
        mock_chrome_debugger.emit_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'req_large_text' });
        await new Promise(r => setTimeout(r, 100));

        expect(emitted.length).toBeGreaterThanOrEqual(1);
        const req = emitted.find(e => e.data.request_id === 'req_large_text');
        expect(req).toBeDefined();
        expect(req!.data.response_body_status).toBe('too_large');
        expect(req!.data.response_body!.length).toBeLessThan(200);
    });
});
