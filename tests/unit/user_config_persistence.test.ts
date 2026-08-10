import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_USER_CONFIG } from '../../src/shared/constants';
import { load_user_config, save_user_config } from '../../src/shared/user_config';

let store: Record<string, unknown>;

beforeEach(() => {
    store = {};
    const get = vi.fn(async (keys?: unknown) => {
        if (typeof keys === 'string') return { [keys]: store[keys] };
        if (Array.isArray(keys)) {
            const out: Record<string, unknown> = {};
            for (const k of keys) out[k] = store[k];
            return out;
        }
        if (keys && typeof keys === 'object') {
            const out: Record<string, unknown> = {};
            for (const [k, def] of Object.entries(keys)) out[k] = store[k] !== undefined ? store[k] : def;
            return out;
        }
        return { ...store };
    });
    const set = vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(store, items);
    });
    vi.stubGlobal('chrome', {
        storage: { local: { get, set } },
    });
});

function seed_user_config(raw: Record<string, unknown>): void {
    store.user_config = raw;
}

describe('load_user_config 保留 browser_label 与 agent_bridge_poll_interval_ms', () => {
    it('AC-001: 预置非默认 label 与 poll 后 load 返回值一致', async () => {
        seed_user_config({
            browser_label: '测试浏览器',
            agent_bridge_poll_interval_ms: 5000,
        });

        const cfg = await load_user_config();

        expect(cfg.browser_label).toBe('测试浏览器');
        expect(cfg.agent_bridge_poll_interval_ms).toBe(5000);
    });

    it('AC-002: 仅保存不含 label/poll 的 partial 后，再 load 仍保留原值', async () => {
        seed_user_config({
            browser_label: '保留标签',
            agent_bridge_poll_interval_ms: 4000,
        });

        await save_user_config({ theme: 'dark' });
        const cfg = await load_user_config();

        expect(cfg.theme).toBe('dark');
        expect(cfg.browser_label).toBe('保留标签');
        expect(cfg.agent_bridge_poll_interval_ms).toBe(4000);
    });

    it('AC-003: 非法 poll 区间回退默认值', async () => {
        seed_user_config({ agent_bridge_poll_interval_ms: 100 });

        const cfg = await load_user_config();

        expect(cfg.agent_bridge_poll_interval_ms).toBe(DEFAULT_USER_CONFIG.agent_bridge_poll_interval_ms);
    });

    it('AC-003: 越界 poll 上限回退默认值', async () => {
        seed_user_config({ agent_bridge_poll_interval_ms: 999999 });

        const cfg = await load_user_config();

        expect(cfg.agent_bridge_poll_interval_ms).toBe(DEFAULT_USER_CONFIG.agent_bridge_poll_interval_ms);
    });

    it('AC-003: 非整数 poll 回退默认值', async () => {
        seed_user_config({ agent_bridge_poll_interval_ms: 12.5 });

        const cfg = await load_user_config();

        expect(cfg.agent_bridge_poll_interval_ms).toBe(DEFAULT_USER_CONFIG.agent_bridge_poll_interval_ms);
    });

    it('AC-003: 非 string browser_label 回退默认空串', async () => {
        seed_user_config({ browser_label: 42 });

        const cfg = await load_user_config();

        expect(cfg.browser_label).toBe(DEFAULT_USER_CONFIG.browser_label);
    });

    it('AC-003: 合法边界值保留', async () => {
        seed_user_config({
            browser_label: 'b',
            agent_bridge_poll_interval_ms: 300000,
        });

        const cfg = await load_user_config();

        expect(cfg.browser_label).toBe('b');
        expect(cfg.agent_bridge_poll_interval_ms).toBe(300000);
    });
});
