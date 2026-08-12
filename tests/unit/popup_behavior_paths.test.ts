// @vitest-environment jsdom
// tests/popup_behavior_paths.test.ts — t151 AC-004
// popup 关键路径行为级测试：真实 import popup.ts + mock chrome/DOM 触发。
// 覆盖 start → 采集中、stop → saved、onChanged 外部同步、导出失败。
// 参考 popup_onchanged_race.test.ts 的行为测试模式。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CaptureRecord } from '../../src/shared/types';

// ── Mock chrome API ──────────────────────────────────────────
const send_message_mock = vi.fn();
const storage_set_mock = vi.fn();
const storage_remove_mock = vi.fn();
const download_blob_mock = vi.hoisted(() => vi.fn());
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
    download_blob: download_blob_mock,
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

describe('popup 关键路径行为 (t151 AC-004)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        on_changed_listeners.length = 0;
        storage_backing = {};
        // 默认：list_captures 返回数组（load_history），get_status 无活跃采集，其余 success
        send_message_mock.mockImplementation(async ({ action }: { action: string }) => {
            if (action === 'list_captures') return { success: true, data: [] };
            if (action === 'get_status') return { success: true, data: { current_capture: null } };
            return { success: true };
        });
    });

    afterEach(() => {
        vi.clearAllTimers();
    });

    it('start：点击 startBtn → sendMessage start + storage 写 is_capturing + 渲染采集中', async () => {
        await import('../../src/extension/popup/popup.ts');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await await_ticks();

        const start_btn = document.getElementById('startBtn');
        expect(start_btn).not.toBeNull();
        start_btn!.dispatchEvent(new MouseEvent('click'));
        await await_ticks(6);

        // start 命令已投递
        expect(send_message_mock).toHaveBeenCalledWith(expect.objectContaining({ action: 'start' }));
        // popup 自写 is_capturing:true + capture_toggles + SELF_WRITE_KEY（onChanged 竞态识别标记）
        expect(storage_set_mock).toHaveBeenCalledWith(expect.objectContaining({
            is_capturing: true,
            capture_toggles: expect.any(Object),
            _popup_self_write: expect.any(Number),
        }));
        // 渲染采集中视图
        const popup = document.getElementById('popup');
        expect(popup?.classList.contains('is-rec')).toBe(true);
        expect(document.getElementById('stopBtn')).not.toBeNull();
        expect(document.getElementById('startBtn')).toBeNull();
    });

    it('stop→saved：点击 stopBtn → sendMessage stop + storage 写 is_capturing:false + 渲染保存视图', async () => {
        storage_backing.is_capturing = true;
        storage_backing.current_capture = make_capture('c1');
        await import('../../src/extension/popup/popup.ts');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await await_ticks();

        const stop_btn = document.getElementById('stopBtn');
        expect(stop_btn).not.toBeNull();
        stop_btn!.dispatchEvent(new MouseEvent('click'));
        await await_ticks(6);

        expect(send_message_mock).toHaveBeenCalledWith({ action: 'stop', payload: {} });
        expect(storage_set_mock).toHaveBeenCalledWith(expect.objectContaining({ is_capturing: false, _popup_self_write: expect.any(Number) }));
        const popup = document.getElementById('popup');
        expect(popup?.classList.contains('is-rec')).toBe(false);
        expect(document.getElementById('stopBtn')).toBeNull();
        expect(document.getElementById('exportBtn')).not.toBeNull();
    });

    it('onChanged 同步：外部（SW/MCP）写 is_capturing → 渲染跟随切换', async () => {
        await import('../../src/extension/popup/popup.ts');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await await_ticks();

        // 初始 ready
        expect(document.getElementById('startBtn')).not.toBeNull();

        // 外部 start：无 SELF_WRITE_KEY → 同步刷新
        storage_backing.is_capturing = true;
        storage_backing.current_capture = make_capture('ext');
        on_changed_listeners.forEach((fn) => fn(
            { is_capturing: { newValue: true }, current_capture: { newValue: storage_backing.current_capture } },
            'local',
        ));
        await await_ticks();
        expect(document.getElementById('popup')!.classList.contains('is-rec')).toBe(true);
        expect(document.getElementById('stopBtn')).not.toBeNull();

        // 外部 stop → 回 ready
        storage_backing.is_capturing = false;
        storage_backing.current_capture = null;
        on_changed_listeners.forEach((fn) => fn(
            { is_capturing: { newValue: false }, current_capture: { newValue: null } },
            'local',
        ));
        await await_ticks();
        expect(document.getElementById('popup')!.classList.contains('is-rec')).toBe(false);
        expect(document.getElementById('stopBtn')).toBeNull();
        expect(document.getElementById('startBtn')).not.toBeNull();
    });

    it('导出失败：get_capture_data 失败 → alert，不触发下载', async () => {
        storage_backing.is_capturing = true;
        storage_backing.current_capture = make_capture('c1');
        await import('../../src/extension/popup/popup.ts');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await await_ticks();

        // 进入 saved 态
        document.getElementById('stopBtn')!.dispatchEvent(new MouseEvent('click'));
        await await_ticks(6);
        expect(document.getElementById('exportBtn')).not.toBeNull();

        // 导出数据读取失败
        send_message_mock.mockImplementation(async ({ action }: { action: string }) => {
            if (action === 'get_capture_data') return { success: false, error: 'boom' };
            if (action === 'list_captures') return { success: true, data: [] };
            return { success: true };
        });
        const alert_spy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        document.getElementById('exportBtn')!.dispatchEvent(new MouseEvent('click'));
        await await_ticks(6);

        expect(alert_spy).toHaveBeenCalled();
        expect(download_blob_mock).not.toHaveBeenCalled();
    });

    it('start 失败（success=false）时不写 is_capturing，状态保持 ready', async () => {
        await import('../../src/extension/popup/popup.ts');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await await_ticks();
        send_message_mock.mockImplementation(async ({ action }: { action: string }) => {
            if (action === 'start') return { success: false, error: 'tab not found' };
            if (action === 'list_captures') return { success: true, data: [] };
            return { success: true };
        });
        const alert_spy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        const start_btn = document.getElementById('startBtn');
        expect(start_btn).not.toBeNull();
        start_btn!.dispatchEvent(new MouseEvent('click'));
        await await_ticks(6);

        expect(storage_set_mock).not.toHaveBeenCalledWith(expect.objectContaining({ is_capturing: true }));
        expect(document.getElementById('popup')!.classList.contains('is-rec')).toBe(false);
        expect(document.getElementById('startBtn')).not.toBeNull();
        expect(alert_spy).toHaveBeenCalled();
    });

    it('采集中 popup 打开即轮询 get_status 并刷新计数（不等 1 秒）', async () => {
        storage_backing.is_capturing = true;
        storage_backing.current_capture = make_capture('c1');
        send_message_mock.mockImplementation(async ({ action }: { action: string }) => {
            if (action === 'get_status') {
                return {
                    success: true,
                    data: {
                        current_capture: {
                            stats: {
                                event_count: 0, user_action_count: 9, nav_count: 0, request_count: 0,
                                log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0,
                                total_body_bytes: 0,
                            },
                        },
                    },
                };
            }
            if (action === 'list_captures') return { success: true, data: [] };
            return { success: true };
        });
        await import('../../src/extension/popup/popup.ts');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await await_ticks(6);

        // start_timer 内 refresh_counts 立即执行（非等 1s interval）
        expect(send_message_mock).toHaveBeenCalledWith({ action: 'get_status', payload: {} });
        // 统计刷新到卡片
        const first_card_count = document.querySelector('.mcard .mcard-n');
        expect(first_card_count?.textContent).toBe('9');
    });

    it('轮询单飞：get_status 未完成时不重叠发送，完成后恢复轮询（t153 AC-006）', async () => {
        storage_backing.is_capturing = true;
        storage_backing.current_capture = make_capture('c1');
        storage_backing.current_capture = make_capture('c1');
        vi.useFakeTimers();
        let resolve_status: ((v: unknown) => void) | undefined;
        let status_calls = 0;
        send_message_mock.mockImplementation(({ action }: { action: string }) => {
            if (action === 'list_captures') return Promise.resolve({ success: true, data: [] });
            if (action === 'get_status') {
                status_calls++;
                return new Promise((r) => { resolve_status = r; });
            }
            return Promise.resolve({ success: true });
        });
        try {
            await import('../../src/extension/popup/popup.ts');
            document.dispatchEvent(new Event('DOMContentLoaded'));
            // flush DOMContentLoaded 的异步链（load_state/load_history）→ start_timer → 首轮 get_status
            await vi.advanceTimersByTimeAsync(0);
            expect(status_calls).toBe(1);

            // 第一个 interval 到达：上一轮 get_status 仍在 in-flight，单飞跳过
            await vi.advanceTimersByTimeAsync(1000);
            expect(status_calls).toBe(1);

            // 释放首轮 get_status → 解锁单飞
            resolve_status!({ success: true, data: { current_capture: null } });
            await vi.advanceTimersByTimeAsync(0);

            // 再一个 interval：新一轮 get_status 正常发送
            await vi.advanceTimersByTimeAsync(1000);
            expect(status_calls).toBe(2);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it('load_history 发送 list_captures 带 limit（t153 AC-007 不拉全量）', async () => {
        await import('../../src/extension/popup/popup.ts');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await await_ticks();
        expect(send_message_mock).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'list_captures' }),
        );
        const call = send_message_mock.mock.calls.find(
            (c: Array<{ action: string }>) => c[0]?.action === 'list_captures',
        );
        // 修前：list_captures 传空 payload（拉全量）；修后：带 limit
        expect((call?.[0] as { payload: { limit?: number } }).payload?.limit).toBeTypeOf('number');
    });
});
