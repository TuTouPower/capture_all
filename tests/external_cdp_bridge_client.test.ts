// tests/external_cdp_bridge_client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detect_external_cdp, type ExternalCdpBridgeConfig } from '../src/background/external_cdp_bridge_client';

const MOCK_CONFIG: ExternalCdpBridgeConfig = {
    bridge_url: 'http://127.0.0.1:17831',
    bridge_token: 'test-token',
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
            bridge_token: 'test-token',
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
            bridge_token: 'test-token',
            cdp_ports: [9222, 9223]
        };

        const result = await detect_external_cdp(config_multi_port);
        expect(result.success).toBe(true);
        expect(result.cdp_port).toBe(9223);
    });
});
