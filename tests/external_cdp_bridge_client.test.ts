// tests/external_cdp_bridge_client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    detect_external_cdp,
    start_external_cdp,
    poll_external_cdp_events,
    stop_external_cdp,
    type ExternalCdpBridgeConfig
} from '../src/extension/background/external_cdp_bridge_client';

const MOCK_CONFIG: ExternalCdpBridgeConfig = {
    bridge_url: 'http://127.0.0.1:17831',
    bridge_token: '<TEST_BRIDGE_TOKEN>',
    cdp_ports: [9222]
};

describe('detect_external_cdp', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns success when bridge responds with port info', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                ok: true,
                port: 9222,
                target_count: 2,
                targets: [
                    { id: 'tab-1', url: 'http://example.com', title: 'Example' }
                ]
            })
        });

        const result = await detect_external_cdp(MOCK_CONFIG);
        expect(result.success).toBe(true);
        expect(result.cdp_port).toBe(9222);
        expect(result.target_count).toBe(2);
    });

    it('returns failure when bridge returns error', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({ ok: false, error: { code: 'cdp_port_not_found' } })
        });

        const result = await detect_external_cdp(MOCK_CONFIG);
        expect(result.success).toBe(false);
        expect(result.error).toBe('cdp_port_not_found');
    });

    it('returns failure on network error', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

        const result = await detect_external_cdp(MOCK_CONFIG);
        expect(result.success).toBe(false);
        expect(result.error).toBe('cdp_port_not_found');
    });

    it('uses default ports when config ports are empty', async () => {
        // 5 attempts for 5 default ports, all fail
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

        const config_no_ports: ExternalCdpBridgeConfig = {
            bridge_url: 'http://127.0.0.1:17831',
            bridge_token: '<TEST_BRIDGE_TOKEN>',
            cdp_ports: []
        };

        const result = await detect_external_cdp(config_no_ports);
        expect(result.success).toBe(false);
    });

    it('tries subsequent ports when first fails', async () => {
        let call_count = 0;
        globalThis.fetch = vi.fn().mockImplementation(() => {
            call_count++;
            // First port fails, second succeeds
            if (call_count <= 1) {
                return Promise.reject(new Error('Connection refused'));
            }
            return Promise.resolve({
                ok: true,
                json: async () => ({
                    ok: true,
                    port: 9223,
                    target_count: 1,
                    targets: [{ id: 'tab-1', url: 'http://test.com', title: 'Test' }]
                })
            });
        });

        const config_multi_port: ExternalCdpBridgeConfig = {
            bridge_url: 'http://127.0.0.1:17831',
            bridge_token: '<TEST_BRIDGE_TOKEN>',
            cdp_ports: [9222, 9223]
        };

        const result = await detect_external_cdp(config_multi_port);
        expect(result.success).toBe(true);
        expect(result.cdp_port).toBe(9223);
    });
});

describe('start_external_cdp', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('sends correct URL, token, and body to bridge', async () => {
        const fetch_mock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, session_key: 'sk-abc123' })
        });
        globalThis.fetch = fetch_mock;

        const result = await start_external_cdp(MOCK_CONFIG, 9222, 'session-1', 'https://example.com', false, 1048576);

        expect(result.success).toBe(true);
        expect(result.session_key).toBe('sk-abc123');

        const [url, init] = fetch_mock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:17831/cdp/start');
        expect(init.method).toBe('POST');
        expect(init.headers).toEqual({
            'Authorization': 'Bearer <TEST_BRIDGE_TOKEN>',
            'Content-Type': 'application/json'
        });
        const body = JSON.parse(init.body as string);
        expect(body).toEqual({
            port: 9222,
            session_id: 'session-1',
            tab_url: 'https://example.com',
            redact_data: false,
            redact_sensitive_headers: true,
            redact_url_query: true,
            max_body_capture_bytes: 1048576
        });
    });

    it('returns failure when bridge responds with error', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: false, error: { code: 'SESSION_ALREADY_EXISTS' } })
        });

        const result = await start_external_cdp(MOCK_CONFIG, 9222, 'session-1', 'https://example.com', true, 1048576);
        expect(result.success).toBe(false);
        expect(result.error).toBe('SESSION_ALREADY_EXISTS');
    });

    it('returns bridge_unavailable on network error', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

        const result = await start_external_cdp(MOCK_CONFIG, 9222, 'session-1', 'https://example.com', false, 1048576);
        expect(result.success).toBe(false);
        expect(result.error).toBe('bridge_unavailable');
    });

    it('returns cdp_start_failed when response has no error code', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({ ok: false })
        });

        const result = await start_external_cdp(MOCK_CONFIG, 9222, 'session-1', 'https://example.com', false, 1048576);
        expect(result.success).toBe(false);
        expect(result.error).toBe('cdp_start_failed');
    });

    it('passes redact_data=true correctly in body', async () => {
        const fetch_mock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, session_key: 'sk-redacted' })
        });
        globalThis.fetch = fetch_mock;

        await start_external_cdp(MOCK_CONFIG, 9222, 'session-2', 'https://example.com/page', true, 1048576);

        const body = JSON.parse((fetch_mock.mock.calls[0] as [string, RequestInit])[1].body as string);
        expect(body.redact_data).toBe(true);
        expect(body.tab_url).toBe('https://example.com/page');
    });
});

describe('poll_external_cdp_events', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('fetches events with correct URL containing session_key', async () => {
        const mock_events = [
            {
                request_id: 'req-1',
                tab_id: 1,
                url: 'https://example.com/api',
                method: 'POST',
                status_code: 200,
                timestamp: 1700000000000,
                resource_type: 'fetch',
                response_body: '{"ok":true}',
                response_body_status: 'captured',
                request_body: '{"q":"test"}',
                request_body_status: 'captured',
                request_headers: { 'content-type': 'application/json' },
                response_headers: { 'content-type': 'application/json' }
            }
        ];

        const fetch_mock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ events: mock_events })
        });
        globalThis.fetch = fetch_mock;

        const result = await poll_external_cdp_events(MOCK_CONFIG, 'sk-abc123');

        expect(result).toEqual(mock_events);
        const [url, init] = fetch_mock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:17831/cdp/events?session_key=sk-abc123');
        expect(init.method).toBe('GET');
        expect(init.headers).toEqual({ 'Authorization': 'Bearer <TEST_BRIDGE_TOKEN>' });
    });

    it('returns empty array when response is not ok', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

        const result = await poll_external_cdp_events(MOCK_CONFIG, 'sk-dead');
        expect(result).toEqual([]);
    });

    it('returns empty array on network error', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET'));

        const result = await poll_external_cdp_events(MOCK_CONFIG, 'sk-err');
        expect(result).toEqual([]);
    });

    it('returns empty array when events field is missing', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({})
        });

        const result = await poll_external_cdp_events(MOCK_CONFIG, 'sk-empty');
        expect(result).toEqual([]);
    });

    it('URL-encodes session_key special characters', async () => {
        const fetch_mock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ events: [] })
        });
        globalThis.fetch = fetch_mock;

        await poll_external_cdp_events(MOCK_CONFIG, 'sk/with spaces&special');

        const [url] = fetch_mock.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('session_key=');
        expect(url).not.toContain('sk/with spaces&special');
    });
});

describe('stop_external_cdp', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('sends stop request with correct URL and body', async () => {
        const fetch_mock = vi.fn().mockResolvedValue({ ok: true });
        globalThis.fetch = fetch_mock;

        await stop_external_cdp(MOCK_CONFIG, 'sk-abc123');

        const [url, init] = fetch_mock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:17831/cdp/stop');
        expect(init.method).toBe('POST');
        expect(init.headers).toEqual({
            'Authorization': 'Bearer <TEST_BRIDGE_TOKEN>',
            'Content-Type': 'application/json'
        });
        const body = JSON.parse(init.body as string);
        expect(body).toEqual({ session_key: 'sk-abc123' });
    });

    it('does not throw on network error (best-effort)', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(stop_external_cdp(MOCK_CONFIG, 'sk-dead')).resolves.toBeUndefined();
    });

    it('does not throw on non-ok response', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

        await expect(stop_external_cdp(MOCK_CONFIG, 'sk-gone')).resolves.toBeUndefined();
    });
});
