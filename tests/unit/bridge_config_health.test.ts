import { afterEach, describe, expect, it, vi } from 'vitest';
import { is_bridge_healthy } from '../../src/bridge/config';

describe('is_bridge_healthy', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('returns true when bridge responds ok', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
        await expect(is_bridge_healthy('http://127.0.0.1:17831')).resolves.toBe(true);
    });

    it('returns false when bridge responds non-ok', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
        await expect(is_bridge_healthy('http://127.0.0.1:17831')).resolves.toBe(false);
    });

    it('returns false on network error', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('bridge down'); }));
        await expect(is_bridge_healthy('http://127.0.0.1:17831')).resolves.toBe(false);
    });

    // B1-L7: 健康检查带 AbortSignal.timeout，bridge 挂起时不无限阻塞
    it('passes an abort timeout signal to the health fetch (B1-L7)', async () => {
        const fetch_mock = vi.fn(async (_url: string, init?: RequestInit) => {
            expect(init?.signal).toBeInstanceOf(AbortSignal);
            return { ok: true };
        });
        vi.stubGlobal('fetch', fetch_mock);
        await is_bridge_healthy('http://127.0.0.1:17831');
        expect(fetch_mock).toHaveBeenCalledWith(
            'http://127.0.0.1:17831/health',
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
    });
});
