// @vitest-environment jsdom
// tests/popup_onchanged_race.test.ts — t135: popup stop 完成态不被 storage.onChanged 竞态覆盖
// 行为级验证：真实触发 onChanged，断言 popup 自身 stop 后稳定 saved；外部变更仍同步。
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock chrome API ──────────────────────────────────────────
const send_message_mock = vi.fn();
const storage_set_mock = vi.fn();
const storage_remove_mock = vi.fn();
let storage_backing: Record<string, unknown> = {};
const on_changed_listeners: Array<(changes: Record<string, { newValue?: unknown }>, area: string) => void> = [];

const storage_get_mock = vi.fn(async (keys: string | string[] | Record<string, unknown>) => {
    const want = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys));
    const out: Record<string, unknown> = {};
    for (const k of want) if (k in storage_backing) out[k] = storage_backing[k];
    return out;
});

storage_set_mock.mockImplementation(async (obj: Record<string, unknown>) => {
    const changes: Record<string, { newValue?: unknown }> = {};
    for (const [k, v] of Object.entries(obj)) {
        const prev = storage_backing[k];
        if (prev !== v) changes[k] = { newValue: v };
        storage_backing[k] = v;
    }
    // 模拟 Chrome：onChanged 在 set 返回后异步派发（跨 tick）
    setTimeout(() => {
        on_changed_listeners.forEach((fn) => fn(changes, 'local'));
    }, 0);
    return undefined;
});
storage_remove_mock.mockImplementation(async (keys: string | string[]) => {
    const arr = Array.isArray(keys) ? keys : [keys];
    const changes: Record<string, { newValue?: unknown }> = {};
    for (const k of arr) {
        if (k in storage_backing) { changes[k] = { newValue: undefined }; delete storage_backing[k]; }
    }
    setTimeout(() => {
        on_changed_listeners.forEach((fn) => fn(changes, 'local'));
    }, 0);
    return undefined;
});

Object.defineProperty(globalThis, 'chrome', {
    value: {
        runtime: { id: 'test-extension-id', sendMessage: send_message_mock },
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

// ── Module stubs（importOriginal 保留 popup 依赖链真实导出） ──
vi.mock('../../src/extension/shared/i18n', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/extension/shared/i18n')>();
    return { ...actual, init_locale: vi.fn() };
});
vi.mock('../../src/extension/shared/theme', () => ({ init_theme: vi.fn() }));
vi.mock('../../src/shared/logger', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/shared/logger')>();
    return { ...actual, Logger: actual.Logger };
});
vi.mock('../../src/shared/user_config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/shared/user_config')>();
    return { ...actual, load_user_config: vi.fn().mockResolvedValue({}) };
});
vi.mock('../../src/shared/constants', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/shared/constants')>();
    return { ...actual, DEFAULT_USER_CONFIG: {} };
});
vi.mock('../../src/extension/shared/export_utils', () => ({
    download_blob: vi.fn(),
    build_capture_filename: vi.fn(),
}));
vi.mock('../../src/extension/shared/archive_builder', () => ({ build_archive: vi.fn() }));
vi.mock('../../src/shared/system_time', () => ({ format_system_time: vi.fn() }));

function await_ticks(n = 3): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, n * 2));
}

describe('popup onChanged 竞态 (t135)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        on_changed_listeners.length = 0;
        storage_backing = {};
        // 默认：list_captures 返回数组（load_history），其余返回 success
        send_message_mock.mockImplementation(async ({ action }: { action: string }) => {
            if (action === 'list_captures') return { success: true, data: [] };
            return { success: true };
        });
    });

    afterEach(() => {
        // f006: 清理外部变更触发的 start_timer setInterval，防定时器泄漏/flakiness
        vi.clearAllTimers();
    });

    it('AC-001: popup 自身 stop 后完成态稳定 saved，不被 onChanged 竞态覆盖', async () => {
        const mod = await import('../../src/extension/popup/popup.ts');
        // 初始采集进行中：storage 有 is_capturing + current_capture（含完整 stats）
        storage_backing.is_capturing = true;
        storage_backing.current_capture = {
            capture_id: 'c1', started_at: '2026-01-01T00:00:00Z',
            stats: { event_count: 0, user_action_count: 0, nav_count: 0, request_count: 0, log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0, total_body_bytes: 0 },
        };
        // list_captures 返回数组（load_history），stop 返回 success（见 beforeEach 默认）
        await await_ticks();
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await await_ticks();

        // 点击真实 stopBtn → 走真实 stop_capture → storage.set(is_capturing:false, SELF_WRITE_KEY)
        const stop_btn = document.getElementById('stopBtn');
        expect(stop_btn).not.toBeNull();
        stop_btn!.dispatchEvent(new MouseEvent('click'));
        await await_ticks(6);

        // stop_capture 已执行：sendMessage stop + storage 自写 is_capturing:false 带 SELF_WRITE_KEY
        expect(send_message_mock).toHaveBeenCalledWith({ action: 'stop', payload: {} });
        expect(storage_set_mock).toHaveBeenCalledWith(expect.objectContaining({ is_capturing: false, _popup_self_write: expect.any(Number) }));
        // onChanged 异步派发后监听消费自写标记 → remove 被调（非 load_state 覆盖本地态）
        expect(storage_remove_mock).toHaveBeenCalledWith('_popup_self_write');
        // 最终态稳定为 saved（render 出保存视图，而非被 onChanged 重渲染回 ready）
        await await_ticks();
        const popup = document.getElementById('popup');
        expect(popup?.classList.contains('is-rec')).toBe(false);
        expect(document.getElementById('stopBtn')).toBeNull();
        void mod;
    });

    it('AC-002: 外部（MCP/SW）触发的 storage 变更仍同步刷新', async () => {
        const mod = await import('../../src/extension/popup/popup.ts');
        await await_ticks();
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await await_ticks();

        const before = storage_get_mock.mock.calls.length;
        // 外部 start：storage 被 SW 写 is_capturing:true（无 SELF_WRITE_KEY）
        storage_set_mock.mockClear();
        storage_backing.is_capturing = true;
        storage_backing.current_capture = {
            capture_id: 'ext', started_at: '2026-01-01T00:00:00Z',
            stats: { event_count: 0, user_action_count: 0, nav_count: 0, request_count: 0, log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0, total_body_bytes: 0 },
        };
        // 直接模拟外部写入触发的 onChanged（无自写标记键）
        on_changed_listeners.forEach((fn) => fn(
            { is_capturing: { newValue: true }, current_capture: { newValue: storage_backing.current_capture } },
            'local',
        ));
        await await_ticks();

        // 外部变更触发 load_state → storage.get 被调用
        expect(storage_get_mock.mock.calls.length).toBeGreaterThan(before);
        void mod;
    });

    it('AC-003: 仅 is_capturing/current_capture 变更触发刷新（无关键不触发）', async () => {
        const mod = await import('../../src/extension/popup/popup.ts');
        await await_ticks();
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await await_ticks();

        const before = storage_get_mock.mock.calls.length;
        on_changed_listeners.forEach((fn) => fn({ theme: { newValue: 'dark' } }, 'local'));
        await await_ticks();
        expect(storage_get_mock.mock.calls.length).toBe(before);
        void mod;
    });
});
