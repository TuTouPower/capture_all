// @vitest-environment jsdom
// tests/unit/t154_popup_state_fixes.test.ts — t154 popup 侧修复
// 覆盖 AC-010 refresh_counts 以 status.is_capturing 校正本地状态、
// AC-011 capture_toggles 重开恢复、AC-012 get_capture_config 缺省引 DEFAULT_CONFIG/user_config、
// AC-013 stop 失败提示且不静默转完成态。行为级：真实 import popup.ts + mock chrome/DOM 驱动。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CaptureRecord } from '../../src/shared/types';
import { DEFAULT_CONFIG } from '../../src/shared/constants';

// ── Mock chrome API ──────────────────────────────────────────
const send_message_mock = vi.fn();
const storage_set_mock = vi.fn();
const storage_remove_mock = vi.fn();
const load_user_config_mock = vi.fn();
let storage_backing: Record<string, unknown> = {};
const on_changed_listeners: Array<(changes: Record<string, { newValue?: unknown }>, area: string) => void> = [];

const storage_get_mock = vi.fn(async (keys: string | string[] | Record<string, unknown>) => {
    const want = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys));
    const out: Record<string, unknown> = {};
    for (const k of want) if (k in storage_backing) out[k] = storage_backing[k];
    return out;
});

storage_set_mock.mockImplementation(async (obj: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(obj)) storage_backing[k] = v;
    return undefined;
});
storage_remove_mock.mockImplementation(async (keys: string | string[]) => {
    const arr = Array.isArray(keys) ? keys : [keys];
    for (const k of arr) delete storage_backing[k];
    return undefined;
});

Object.defineProperty(globalThis, 'chrome', {
    value: {
        runtime: { id: 'test-extension-id', sendMessage: send_message_mock, getURL: (p: string) => p },
        storage: {
            local: { get: storage_get_mock, set: storage_set_mock, remove: storage_remove_mock },
            onChanged: { addListener: (fn: (c: Record<string, { newValue?: unknown }>, a: string) => void) => on_changed_listeners.push(fn) },
        },
        tabs: { create: vi.fn() },
    },
    writable: true,
});

// ── DOM stubs ────────────────────────────────────────────────
document.body.innerHTML = `
<div id="popup">
  <div id="timer"></div>
  <div id="view"></div>
  <div id="panelBtn"></div>
</div>
`;

// ── Module stubs ─────────────────────────────────────────────
vi.mock('../../src/extension/shared/i18n', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/extension/shared/i18n')>();
    return { ...actual, init_locale: vi.fn() };
});
vi.mock('../../src/extension/shared/theme', () => ({ init_theme: vi.fn() }));
vi.mock('../../src/shared/user_config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/shared/user_config')>();
    return { ...actual, load_user_config: load_user_config_mock };
});
vi.mock('../../src/shared/constants', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/shared/constants')>();
    return { ...actual, DEFAULT_USER_CONFIG: {} };
});
vi.mock('../../src/extension/shared/export_utils', () => ({
    download_blob: vi.fn(),
    build_capture_filename: vi.fn(() => 'capture.zip'),
}));
vi.mock('../../src/extension/shared/archive_builder', () => ({ build_archive: vi.fn() }));
vi.mock('../../src/shared/system_time', () => ({ format_system_time: vi.fn(() => '') }));

function make_capture(id: string): CaptureRecord {
    return {
        capture_id: id,
        name: 'Capture ' + id,
        status: 'capturing',
        started_at: '2026-01-01T00:00:00Z',
        ended_at: null,
        duration_ms: 0,
        start_url: '',
        end_url: null,
        tab_id: 0,
        window_id: null,
        config_snapshot: {},
        stats: { event_count: 0, user_action_count: 0, nav_count: 0, request_count: 0, log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0, total_body_bytes: 0 },
        tags: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
    } as CaptureRecord;
}

function await_ticks(n = 3): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, n * 2));
}

function last_start_config(): Record<string, unknown> {
    const call = send_message_mock.mock.calls.find((c) => (c[0] as { action: string }).action === 'start');
    return (call![0] as { payload: { config: Record<string, unknown> } }).payload.config;
}

async function open_popup(): Promise<void> {
    await import('../../src/extension/popup/popup.ts');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await await_ticks();
}

describe('t154 popup state fixes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        on_changed_listeners.length = 0;
        storage_backing = {};
        // 默认 capture_toggles 全开——popup 模块级 toggles 跨用例持久，load_state 每次读回复位
        storage_backing.capture_toggles = {
            event_count: true, nav_count: true, request_count: true, log_count: true,
            error_count: true, storage_change_count: true, cookie_change_count: true, mask: true,
        };
        load_user_config_mock.mockResolvedValue({ redact_data: true });
        send_message_mock.mockImplementation(async ({ action }: { action: string }) => {
            if (action === 'list_captures') return { success: true, data: [] };
            if (action === 'get_status') return { success: true, data: { is_capturing: true, current_capture: null } };
            return { success: true };
        });
    });

    afterEach(() => {
        vi.clearAllTimers();
    });

    // ── AC-011：capture_toggles 重开 popup 后恢复 ──
    it('AC-011: 重开 popup 从 storage 读回 capture_toggles', async () => {
        storage_backing.capture_toggles = { event_count: false, mask: false };
        await open_popup();
        const mask_card = document.querySelector('.mcard[data-key="mask"]');
        const ev_card = document.querySelector('.mcard[data-key="event_count"]');
        expect(mask_card?.classList.contains('mcard-off')).toBe(true);
        expect(ev_card?.classList.contains('mcard-off')).toBe(true);
        // 恢复的开关进入 start 配置
        document.getElementById('startBtn')!.dispatchEvent(new MouseEvent('click'));
        await await_ticks(6);
        const config = last_start_config();
        expect(config.event_count_enabled).toBe(false);
        expect(config.redact_data).toBe(false);
    });

    // ── AC-012：get_capture_config 缺省引 DEFAULT_CONFIG/user_config ──
    it('AC-012: redact_data 以 user_config 为底（设置页关脱敏时 popup 不能重开）', async () => {
        load_user_config_mock.mockResolvedValue({ redact_data: false });
        await open_popup();
        document.getElementById('startBtn')!.dispatchEvent(new MouseEvent('click'));
        await await_ticks(6);
        expect(last_start_config().redact_data).toBe(false);
    });

    it('AC-012: mask toggle 关时 redact_data 关闭（即使 user_config 开启）', async () => {
        await open_popup();
        (document.querySelector('.mcard[data-key="mask"]') as HTMLElement).click();
        document.getElementById('startBtn')!.dispatchEvent(new MouseEvent('click'));
        await await_ticks(6);
        expect(last_start_config().redact_data).toBe(false);
    });

    it('AC-012: 硬编码缺省改为引 DEFAULT_CONFIG', async () => {
        await open_popup();
        document.getElementById('startBtn')!.dispatchEvent(new MouseEvent('click'));
        await await_ticks(6);
        const config = last_start_config();
        expect(config.redact_sensitive_headers).toBe(DEFAULT_CONFIG.redact_sensitive_headers);
        expect(config.redact_url_query).toBe(DEFAULT_CONFIG.redact_url_query);
        expect(config.sample_rate_ms).toBe(DEFAULT_CONFIG.sample_rate_ms);
    });

    // ── AC-013：stop 失败提示具体原因，不静默转完成态 ──
    it('AC-013: stop 失败 → alert 具体错误，保持采集中不转 saved', async () => {
        storage_backing.is_capturing = true;
        storage_backing.current_capture = make_capture('c1');
        await open_popup();
        expect(document.getElementById('stopBtn')).not.toBeNull();

        send_message_mock.mockImplementation(async ({ action }: { action: string }) => {
            if (action === 'stop') return { success: false, error: 'Cannot stop: not active' };
            if (action === 'list_captures') return { success: true, data: [] };
            return { success: true };
        });
        const alert_spy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        document.getElementById('stopBtn')!.dispatchEvent(new MouseEvent('click'));
        await await_ticks(6);

        expect(alert_spy).toHaveBeenCalledWith(expect.stringContaining('Cannot stop: not active'));
        // 仍在采集中，未静默转完成态
        expect(document.getElementById('popup')!.classList.contains('is-rec')).toBe(true);
        expect(document.getElementById('stopBtn')).not.toBeNull();
        expect(document.getElementById('exportBtn')).toBeNull();
        expect(storage_set_mock).not.toHaveBeenCalledWith(expect.objectContaining({ is_capturing: false }));
    });

    it('AC-013: stop 成功仍走完成态', async () => {
        storage_backing.is_capturing = true;
        storage_backing.current_capture = make_capture('c1');
        await open_popup();
        const alert_spy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        document.getElementById('stopBtn')!.dispatchEvent(new MouseEvent('click'));
        await await_ticks(6);
        expect(alert_spy).not.toHaveBeenCalled();
        expect(document.getElementById('exportBtn')).not.toBeNull();
        expect(storage_set_mock).toHaveBeenCalledWith(expect.objectContaining({ is_capturing: false }));
    });

    // ── AC-010：refresh_counts 以 status.is_capturing 校正本地状态 ──
    it('AC-010: SW 已自动结束（is_capturing:false）→ popup 降级为完成态', async () => {
        storage_backing.is_capturing = true;
        storage_backing.current_capture = make_capture('c1');
        send_message_mock.mockImplementation(async ({ action }: { action: string }) => {
            if (action === 'get_status') return { success: true, data: { is_capturing: false, current_capture: null } };
            if (action === 'list_captures') return { success: true, data: [] };
            return { success: true };
        });
        await open_popup();
        await await_ticks(6);

        expect(document.getElementById('popup')!.classList.contains('is-rec')).toBe(false);
        expect(document.getElementById('stopBtn')).toBeNull();
        expect(document.getElementById('exportBtn')).not.toBeNull();
    });

    it('AC-010: SW 仍在采集时 popup 保持采集中', async () => {
        storage_backing.is_capturing = true;
        storage_backing.current_capture = make_capture('c1');
        await open_popup();
        await await_ticks(6);
        expect(document.getElementById('popup')!.classList.contains('is-rec')).toBe(true);
        expect(document.getElementById('stopBtn')).not.toBeNull();
    });
});
