// tests/unit/cdp_client_terminal_error.test.ts
// t158 AC-003: 扩展 client 对 404/410 不再降空数组，抛出可分类 terminal 错误
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    poll_external_cdp_events,
    CdpSessionTerminalError,
    type ExternalCdpBridgeConfig,
} from '../../src/extension/background/external_cdp_bridge_client';

const MOCK_CONFIG: ExternalCdpBridgeConfig = {
    bridge_url: 'http://127.0.0.1:17831',
    bridge_token: '<TEST_BRIDGE_TOKEN>',
    cdp_ports: [9222],
};

describe('poll_external_cdp_events terminal 分类', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('AC-003a: 410 抛出 CdpSessionTerminalError（携带终态事件与 reason），不返回空数组', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 410,
            json: async () => ({
                ok: false,
                events: [{ request_id: 'r1', response_body_status: 'cdp_failed' }],
                error: { code: 'cdp_session_terminal', reason: 'ws_closed' },
            }),
        });

        await expect(poll_external_cdp_events(MOCK_CONFIG, 'sess-1')).rejects.toThrow(CdpSessionTerminalError);
        try {
            await poll_external_cdp_events(MOCK_CONFIG, 'sess-1');
        } catch (err) {
            const e = err as CdpSessionTerminalError;
            expect(e.code).toBe('cdp_session_terminal');
            expect(e.reason).toBe('ws_closed');
            expect(e.events).toEqual([{ request_id: 'r1', response_body_status: 'cdp_failed' }]);
        }
    });

    it('AC-003b: 404 抛出分类错误，不返回空数组', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            json: async () => ({ ok: false, events: [] }),
        });

        await expect(poll_external_cdp_events(MOCK_CONFIG, 'sess-x')).rejects.toThrow('cdp_poll_failed');
    });

    it('AC-003c: 401 鉴权失败同样抛分类错误（不静默降空数组）', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ ok: false }),
        });

        await expect(poll_external_cdp_events(MOCK_CONFIG, 'sess-x')).rejects.toThrow('cdp_poll_failed:401');
    });

    it('AC-003d: 网络错误上抛（不静默降空数组），供 coordinator 重试/分类', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET'));

        await expect(poll_external_cdp_events(MOCK_CONFIG, 'sess-err')).rejects.toThrow('ECONNRESET');
    });

    it('200 正常路径仍返回 events 数组（不回归）', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, events: [{ request_id: 'r1' }] }),
        });

        const events = await poll_external_cdp_events(MOCK_CONFIG, 'sess-1');
        expect(events).toEqual([{ request_id: 'r1' }]);
    });
});
