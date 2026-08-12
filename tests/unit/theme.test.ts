// @vitest-environment jsdom
// tests/unit/theme.test.ts — B1-L6: theme 单一存储来源（user_config.theme）
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init_theme, set_theme } from '../../src/extension/shared/theme';

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
    document.documentElement.removeAttribute('data-theme');
});

describe('theme 单一存储来源（user_config.theme）', () => {
    it('init_theme 从 user_config.theme 读取，独立 theme key 不再生效（B1-L6）', async () => {
        // 旧路径遗留独立 theme key=dark；user_config.theme=light → 以 user_config 为权威
        store.theme = 'dark';
        store.user_config = { theme: 'light' };
        await init_theme();
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('init_theme 缺省 user_config 时回退 follow-system', async () => {
        store.user_config = {};
        await init_theme();
        // follow-system + jsdom 无 matchMedia → light
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('set_theme 写 user_config.theme 且不写独立 theme key（B1-L6）', async () => {
        await set_theme('dark');
        expect((store.user_config as { theme?: string } | undefined)?.theme).toBe('dark');
        expect(store.theme).toBeUndefined();
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
});
