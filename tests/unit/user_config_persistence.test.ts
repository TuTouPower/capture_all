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

    it('AC-003: NaN poll 回退默认值', async () => {
        seed_user_config({ agent_bridge_poll_interval_ms: NaN });

        const cfg = await load_user_config();

        expect(cfg.agent_bridge_poll_interval_ms).toBe(DEFAULT_USER_CONFIG.agent_bridge_poll_interval_ms);
    });

    it('AC-003: Infinity poll 回退默认值', async () => {
        seed_user_config({ agent_bridge_poll_interval_ms: Infinity });

        const cfg = await load_user_config();

        expect(cfg.agent_bridge_poll_interval_ms).toBe(DEFAULT_USER_CONFIG.agent_bridge_poll_interval_ms);
    });

    it('AC-003: 精确下边界 250 保留', async () => {
        seed_user_config({ agent_bridge_poll_interval_ms: 250 });

        const cfg = await load_user_config();

        expect(cfg.agent_bridge_poll_interval_ms).toBe(250);
    });

    it('AC-004: 表驱动规则全字段集成——合法值保留、非法值回退默认', async () => {
        // t118_test_f001 处置：锁定 enum/num/str 规则表全字段路径，防表内白名单笔误
        const legal: Record<string, unknown> = {
            mouse_precision: 'full_trajectory',
            keyboard_capture_mode: 'all',
            capture_input_values: false,
            capture_request_body: false,
            capture_response_body: false,
            max_body_capture_bytes: 1024,
            inline_text_max_bytes: 2048,
            redact_data: false,
            theme: 'dark',
            locale: 'zh_CN',
            system_time_timezone: 'UTC+8',
            detail_time_display_mode: 'absolute',
            export_capture_directory: 'captures',
            export_log_directory: 'logs',
            export_filename_template: '{capture_id}.{ext}',
            export_save_as: false,
            agent_bridge_enabled: false,
            agent_bridge_url: 'http://127.0.0.1:9999',
            agent_bridge_token: 'tok',
            agent_bridge_poll_interval_ms: 5000,
            browser_label: 'B',
            log_level: 'warn',
            log_max_size_mb: 5,
        };
        seed_user_config(legal);
        const cfg = await load_user_config();
        for (const [k, v] of Object.entries(legal)) {
            expect((cfg as unknown as Record<string, unknown>)[k]).toBe(v);
        }

        const illegal: Record<string, unknown> = {
            mouse_precision: 'drag',
            keyboard_capture_mode: 'ctrl',
            capture_input_values: 'x',
            max_body_capture_bytes: -1,
            inline_text_max_bytes: 1.5,
            redact_data: 1,
            theme: 'blue',
            locale: 'fr',
            system_time_timezone: '',
            detail_time_display_mode: 'x',
            export_capture_directory: 42,
            export_log_directory: null,
            export_filename_template: 42,
            export_save_as: 'y',
            agent_bridge_enabled: 1,
            agent_bridge_url: 42,
            agent_bridge_token: 42,
            agent_bridge_poll_interval_ms: NaN,
            browser_label: 42,
            log_level: 'verbose',
            log_max_size_mb: 0,
        };
        seed_user_config(illegal);
        const cfg2 = await load_user_config();
        for (const k of Object.keys(illegal)) {
            expect((cfg2 as unknown as Record<string, unknown>)[k])
                .toBe((DEFAULT_USER_CONFIG as unknown as Record<string, unknown>)[k]);
        }
    });
});
