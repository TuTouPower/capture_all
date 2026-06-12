// tests/network_cdp.test.ts
// CDP body capture unit tests using chrome.debugger mock.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock_chrome_debugger } from './__mocks__/chrome_debugger';

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
} from '../src/background/network_capture';

describe('enable_response_body_capture', () => {
    beforeEach(() => {
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        // Stop any previous capture to reset module state
        try { stop_network_capture(); } catch { /* not started yet */ }
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

    it('returns success when already attached', async () => {
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

        // Second call should return success without re-attaching
        const result = await enable_response_body_capture(2, false);
        expect(result.success).toBe(true);
        // Still only 1 attach (second was skipped because dbg_tab_id already set)
        expect(mock_chrome_debugger.attach_count).toBe(1);
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
        const { _cdp_request_meta_for_test } = await import('../src/background/network_capture');
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
