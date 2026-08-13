import { afterEach, describe, expect, it, vi } from 'vitest';
import { is_bridge_healthy, probe_bridge_health, BRIDGE_SERVICE_ID } from '../../src/bridge/config';

/** t183: 完整本服务 /health 响应（含标识 + content-type + json）。 */
function self_response() {
    return {
        ok: true,
        headers: { get: (name: string) => (name === 'content-type' ? 'application/json' : null) },
        json: async () => ({ ok: true, service: BRIDGE_SERVICE_ID, bridge_version: '0.1.0' }),
    };
}

/** t183: 任意 2xx 服务响应（无本产品标识）。 */
function foreign_response() {
    return {
        ok: true,
        headers: { get: (name: string) => (name === 'content-type' ? 'application/json' : null) },
        json: async () => ({ ok: true }),
    };
}

describe('is_bridge_healthy', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('returns true when bridge responds with capture-all identity', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => self_response()));
        await expect(is_bridge_healthy('http://127.0.0.1:17831')).resolves.toBe(true);
    });

    it('t183 AC-002: returns false for any 2xx service without capture-all identity', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => foreign_response()));
        await expect(is_bridge_healthy('http://127.0.0.1:17831')).resolves.toBe(false);
    });

    it('t183 AC-002: returns false when 2xx body is not JSON (parse failure = occupied)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            headers: { get: () => 'text/plain' },
            json: async () => { throw new Error('not json'); },
        })));
        await expect(is_bridge_healthy('http://127.0.0.1:17831')).resolves.toBe(false);
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
            return self_response();
        });
        vi.stubGlobal('fetch', fetch_mock);
        await is_bridge_healthy('http://127.0.0.1:17831');
        expect(fetch_mock).toHaveBeenCalledWith(
            'http://127.0.0.1:17831/health',
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
    });
});

describe('t183 probe_bridge_health 三态', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('本服务 → healthy', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => self_response()));
        await expect(probe_bridge_health('http://127.0.0.1:17831')).resolves.toBe('healthy');
    });

    it('任意 2xx 非本服务 → occupied（端口冲突，不视为已运行）', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => foreign_response()));
        await expect(probe_bridge_health('http://127.0.0.1:17831')).resolves.toBe('occupied');
    });

    it('2xx 但非 JSON → occupied', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            headers: { get: () => 'text/html' },
            json: async () => { throw new Error('not json'); },
        })));
        await expect(probe_bridge_health('http://127.0.0.1:17831')).resolves.toBe('occupied');
    });

    it('非 2xx → unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
        await expect(probe_bridge_health('http://127.0.0.1:17831')).resolves.toBe('unreachable');
    });

    it('连接失败 → unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
        await expect(probe_bridge_health('http://127.0.0.1:17831')).resolves.toBe('unreachable');
    });
});
