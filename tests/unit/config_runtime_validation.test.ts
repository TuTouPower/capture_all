// tests/unit/config_runtime_validation.test.ts
// t178: 配置运行时校验——save_user_config 落库前 sanitize、set_log_level enum guard、
// Bridge timeout parse 校验、Agent capture config body/inline 硬上限。
// service_worker.ts 顶层注册 chrome 事件无法直接 import，AC-002 guard 用源码扫描断言（同 t155 模式）。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_CONFIG, DEFAULT_USER_CONFIG, MAX_BODY_CAPTURE_BYTES, INLINE_TEXT_MAX_BYTES } from '../../src/shared/constants';
import { load_user_config, save_user_config, is_valid_log_level } from '../../src/shared/user_config';
import { parse_bridge_config } from '../../src/bridge/config';
import { dispatch_agent_command, type AgentRuntimeHandlers } from '../../src/extension/background/agent_command_dispatcher';
import type { AgentCommand } from '../../src/shared/protocol';

// ── storage mock（save/load_user_config 共用） ─────────────
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

// ── AC-001：非法 save_user_config patch 不落库 ─────────────
describe('t178 AC-001: save_user_config 非法 patch 不进入 storage', () => {
    it('非法 enum（theme 非白名单）被滤，storage 内 theme 保持默认且 load 回退', async () => {
        await save_user_config({ theme: 'blue' as never });
        const stored = store.user_config as Record<string, unknown>;
        expect(stored.theme).not.toBe('blue');
        const cfg = await load_user_config();
        expect(cfg.theme).toBe(DEFAULT_USER_CONFIG.theme);
    });

    it('非法 type（browser_label 数字）被滤，不落库', async () => {
        await save_user_config({ browser_label: 42 as never });
        const stored = store.user_config as Record<string, unknown>;
        expect(stored.browser_label).not.toBe(42);
        const cfg = await load_user_config();
        expect(cfg.browser_label).toBe(DEFAULT_USER_CONFIG.browser_label);
    });

    it('非法 log_level 被滤，不写入非法 logger level', async () => {
        await save_user_config({ log_level: 'verbose' as never });
        const stored = store.user_config as Record<string, unknown>;
        expect(stored.log_level).not.toBe('verbose');
        const cfg = await load_user_config();
        expect(cfg.log_level).toBe(DEFAULT_USER_CONFIG.log_level);
    });

    it('负数数值（max_body_capture_bytes）被滤回默认且不落库', async () => {
        await save_user_config({ max_body_capture_bytes: -1 } as never);
        const stored = store.user_config as Record<string, unknown>;
        expect(stored.max_body_capture_bytes).not.toBe(-1);
        const cfg = await load_user_config();
        expect(cfg.max_body_capture_bytes).toBe(DEFAULT_USER_CONFIG.max_body_capture_bytes);
    });

    it('合法 patch 正常落库（回归，防误伤正常配置）', async () => {
        await save_user_config({ theme: 'dark' });
        const cfg = await load_user_config();
        expect(cfg.theme).toBe('dark');
        const stored = store.user_config as Record<string, unknown>;
        expect(stored.theme).toBe('dark');
    });
});

// ── AC-002：非法 set_log_level 返回失败，不写入非法 level ──
describe('t178 AC-002: set_log_level enum guard', () => {
    const sw_src = readFileSync(
        resolve(__dirname, '..', '..', 'src', 'extension', 'background', 'service_worker.ts'),
        'utf8',
    );

    it('guard 本体（is_valid_log_level）行为：非法 level 拒绝', () => {
        expect(is_valid_log_level('verbose')).toBe(false);
        expect(is_valid_log_level('WARN')).toBe(false);
        expect(is_valid_log_level(42)).toBe(false);
        expect(is_valid_log_level(undefined)).toBe(false);
    });

    it('guard 本体行为：合法 level 放行（与 LogLevel 枚举对齐）', () => {
        for (const level of ['debug', 'info', 'warn', 'error', 'silent']) {
            expect(is_valid_log_level(level)).toBe(true);
        }
    });

    it('源码 set_log_level 分支用共享 guard 拒绝非法 level（返回失败）', () => {
        const section = sw_src.split(/case 'set_log_level'/)[1]?.split(/case 'flush_app_logs'/)[0] ?? '';
        expect(section).toMatch(/is_valid_log_level\(level\)/);
        expect(section).toMatch(/INVALID_QUERY/);
    });

    it('源码统一走 save_user_config({ log_level })（不直接写 storage）', () => {
        const section = sw_src.split(/case 'set_log_level'/)[1]?.split(/case 'flush_app_logs'/)[0] ?? '';
        expect(section).toMatch(/save_user_config\(\{ log_level:/);
    });

    it('save 边界过滤非法 level 兜底（AC-001 已覆盖，此处显式链路断言）', async () => {
        await save_user_config({ log_level: 'verbose' as never });
        const cfg = await load_user_config();
        expect(['debug', 'info', 'warn', 'error', 'silent']).toContain(cfg.log_level);
    });
});

// ── AC-003：Bridge timeout 配置非法值被拒绝 ────────────────
describe('t178 AC-003: Bridge timeout 运行时 parse 校验', () => {
    const base = { port: 17831, token: '<TEST_BRIDGE_TOKEN>' };

    it('默认值与合法显式值通过', () => {
        const cfg = parse_bridge_config({ ...base });
        expect(cfg.command_timeout_ms).toBe(120000);
        expect(cfg.full_data_timeout_ms).toBe(300000);
        const ok = parse_bridge_config({ ...base, command_timeout_ms: 60000, full_data_timeout_ms: 90000 });
        expect(ok.command_timeout_ms).toBe(60000);
        expect(ok.full_data_timeout_ms).toBe(90000);
    });

    it('command_timeout_ms 非正整数拒绝', () => {
        expect(() => parse_bridge_config({ ...base, command_timeout_ms: -1 })).toThrow('Invalid command_timeout_ms');
        expect(() => parse_bridge_config({ ...base, command_timeout_ms: 1.5 })).toThrow('Invalid command_timeout_ms');
    });

    it('full_data_timeout_ms 非正整数拒绝', () => {
        expect(() => parse_bridge_config({ ...base, full_data_timeout_ms: 0 })).toThrow('Invalid full_data_timeout_ms');
    });

    it('超过 MAX_COMMAND_TIMEOUT_MS 拒绝', () => {
        expect(() => parse_bridge_config({ ...base, command_timeout_ms: 300001 })).toThrow('Invalid command_timeout_ms');
        expect(() => parse_bridge_config({ ...base, full_data_timeout_ms: 999999 })).toThrow('Invalid full_data_timeout_ms');
    });

    it('等于 MAX_COMMAND_TIMEOUT_MS 的合法边界值放行', () => {
        const ok = parse_bridge_config({ ...base, command_timeout_ms: 300000, full_data_timeout_ms: 300000 });
        expect(ok.command_timeout_ms).toBe(300000);
        expect(ok.full_data_timeout_ms).toBe(300000);
    });

    it('字符串型非法 type 拒绝', () => {
        expect(() => parse_bridge_config({ ...base, command_timeout_ms: '60000' as never })).toThrow('Invalid command_timeout_ms');
        expect(() => parse_bridge_config({ ...base, full_data_timeout_ms: '300000' as never })).toThrow('Invalid full_data_timeout_ms');
    });
});

// ── AC-004：Agent capture config body/inline 硬上限拒绝 ────
vi.mock('../../src/extension/background/exporter', () => ({
    export_json: vi.fn(async () => '{}'),
    export_jsonl: vi.fn(async () => ''),
    export_html: vi.fn(async () => '<html></html>'),
    export_har: vi.fn(async () => '{}'),
}));

vi.mock('../../src/extension/background/agent_data_queries', () => ({
    get_entry_pushdown: vi.fn(async () => ({ record_id: 'r1', source: 'user_action_events', data: {} })),
    list_entries_pushdown: vi.fn(async () => ({ total: 0, records: [], next_token: null })),
    list_sources_pushdown: vi.fn(async () => []),
    get_timeline_pushdown: vi.fn(async () => ({ total: 0, records: [] })),
    get_timeline_item_from_capture_data: vi.fn(async () => ({ record_id: 'r1', source: 'user_action_events', data: {} })),
    load_agent_capture_data: vi.fn(async () => ({
        capture: { capture_id: 'c1', started_at: '2024-01-01T00:00:00.000Z', ended_at: null, config_snapshot: {}, stats: { event_count: 0, request_count: 0, log_count: 0, error_count: 0 } },
        sources: { user_action_events: [], navigation_events: [], network_requests: [], console_events: [], error_events: [], storage_changes: [], cookie_changes: [] },
    })),
}));

const handlers: AgentRuntimeHandlers = {
    start_capture: vi.fn(async () => ({ success: true })),
    stop_capture: vi.fn(async () => ({ success: true })),
    get_status: vi.fn(() => ({ active_capture_id: null })),
};

function command(type: AgentCommand['type'], payload: Record<string, unknown> = {}): AgentCommand {
    return {
        command_id: `cmd_${type}`,
        type,
        payload,
        created_at: 1,
    };
}

describe('t178 AC-004: Agent capture config body/inline 硬上限', () => {
    it('max_body_capture_bytes 超 100MB 拒绝（start 不触发）', async () => {
        const start_capture = vi.fn(async () => ({ success: true }));
        const result = await dispatch_agent_command(command('capture.start', {
            config: { max_body_capture_bytes: MAX_BODY_CAPTURE_BYTES + 1 },
        }), { ...handlers, start_capture });
        expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_QUERY' } });
        expect(start_capture).not.toHaveBeenCalled();
    });

    it('inline_text_max_bytes 超 32KB 拒绝（start 不触发）', async () => {
        const start_capture = vi.fn(async () => ({ success: true }));
        const result = await dispatch_agent_command(command('capture.start', {
            config: { inline_text_max_bytes: INLINE_TEXT_MAX_BYTES + 1 },
        }), { ...handlers, start_capture });
        expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_QUERY' } });
        expect(start_capture).not.toHaveBeenCalled();
    });

    it('等于硬上限的合法值放行', async () => {
        const start_capture = vi.fn(async () => ({ success: true }));
        const result = await dispatch_agent_command(command('capture.start', {
            config: {
                max_body_capture_bytes: MAX_BODY_CAPTURE_BYTES,
                inline_text_max_bytes: INLINE_TEXT_MAX_BYTES,
            },
        }), { ...handlers, start_capture });
        expect(result.ok).toBe(true);
        expect(start_capture).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                ...DEFAULT_CONFIG,
                max_body_capture_bytes: MAX_BODY_CAPTURE_BYTES,
                inline_text_max_bytes: INLINE_TEXT_MAX_BYTES,
            }),
        );
    });
});
