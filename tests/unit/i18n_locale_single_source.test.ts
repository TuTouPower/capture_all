// tests/unit/i18n_locale_single_source.test.ts
// t152 AC-002: locale 单一事实来源 = user_config.locale（i18n 枚举 'en'|'zh'）。
// set_locale 不再写独立 'locale' storage key；init_locale 从 user_config 恢复语言，缺省时按 navigator 自动检测。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get_locale, init_locale, set_locale } from '../../src/extension/shared/i18n';
import { save_user_config } from '../../src/shared/user_config';

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
    // 默认 en；测试内需要检测中文浏览器时覆盖
    vi.stubGlobal('navigator', { language: 'en-US' });
    set_locale('en');
});

describe('t152 AC-002 locale 单一事实来源', () => {
    it('set_locale 不再写独立 \'locale\' storage key', async () => {
        set_locale('zh');
        expect(store['locale']).toBeUndefined();
    });

    it('init_locale 从 user_config.locale 恢复语言', async () => {
        store.user_config = { locale: 'zh' };
        await init_locale();
        expect(get_locale()).toBe('zh');
    });

    it('init_locale 在 user_config 无 locale 时按 navigator.language 自动检测', async () => {
        vi.stubGlobal('navigator', { language: 'zh-CN' });
        store.user_config = { theme: 'dark' };
        await init_locale();
        expect(get_locale()).toBe('zh');
    });

    it('设置页持久化后重载语言生效（set_locale + save_user_config 往返）', async () => {
        set_locale('zh');
        await save_user_config({ locale: 'zh' });
        const stored = store.user_config as Record<string, unknown>;
        expect(stored.locale).toBe('zh');
        // 重新初始化（模拟重开页面）恢复 zh
        set_locale('en');
        await init_locale();
        expect(get_locale()).toBe('zh');
    });
});
