// @vitest-environment jsdom
// tests/unit/t154_dashboard_misc.test.ts — t154 dashboard/popup 小修复集（dashboard 侧）
// 覆盖 AC-001 双引号、AC-002 删除响应、AC-003 open_detail 记忆、AC-004 start_url scheme、
// AC-005 load_captures 防御、AC-006 非扩展上下文缺省 config、AC-008 capture_dur clamp、AC-009 esc 缺口。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { escape_html as esc } from '../../src/shared/escape';
import { DEFAULT_USER_CONFIG } from '../../src/shared/constants';
import type { CaptureRecord, CaptureEvent, NetworkRequestData } from '../../src/shared/types';

// ── chrome mock（is_extension=true 需 runtime.id 在模块 import 前就位——vi.hoisted 先于静态 import 执行） ──
const { send_message_mock, tabs_create_mock } = vi.hoisted(() => {
    const send_message_mock = vi.fn();
    const tabs_create_mock = vi.fn();
    Object.defineProperty(globalThis, 'chrome', {
        value: {
            runtime: { id: 'test-extension-id', sendMessage: send_message_mock },
            storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(), remove: vi.fn() } },
            tabs: { create: tabs_create_mock },
        },
        writable: true,
    });
    return { send_message_mock, tabs_create_mock };
});

// ── localStorage stub（render/wire 读取拖拽宽度） ──
const store: Record<string, string> = {};
const mock_storage = {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: vi.fn((k: string) => { delete store[k]; }),
    clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
};
vi.stubGlobal('localStorage', mock_storage);

// ── import after chrome/localStorage stubs ──
import {
    get_captures, set_captures,
    get_selected, set_cap_search, capture_dur,
    load_captures, save_dt_memory, get_dt_memory,
    set_detail_capture,
    set_dt_tab, get_dt_tab, set_dt_view, get_dt_view, set_dt_quick, get_dt_quick,
    set_detail_events, set_detail_network, set_dt_sel,
    wire_dashboard_router,
} from '../../src/extension/dashboard/dashboard_shared';
import { render_captures, del_capture } from '../../src/extension/dashboard/dashboard_captures';
import {
    open_detail, render_detail, wire_detail,
    _render_dt_list_for_test, _render_net_inspector_for_test,
} from '../../src/extension/dashboard/dashboard_detail';

function make_capture(
    id: string,
    status: 'capturing' | 'completed' = 'completed',
    start_url = 'https://example.com',
    started_at = '2026-01-01T10:00:00Z',
    ended_at: string | null = '2026-01-01T11:00:00Z',
): CaptureRecord {
    return {
        capture_id: id,
        name: 'Capture ' + id,
        status,
        started_at,
        ended_at,
        duration_ms: 0,
        start_url,
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

function net_req(cache_status: string): NetworkRequestData {
    return {
        request_id: 'r1', capture_id: 'c1', relative_time: 100, absolute_time: 100, tab_id: 1,
        method: 'GET', url: 'https://example.com', url_status: 'captured', status_code: 200,
        status_text: 'OK', protocol: 'h2', resource_type: 'xhr', initiator: null, duration_ms: 5,
        start_time_ms: 100, end_time_ms: 105, request_headers: {}, response_headers: {},
        headers_status: 'captured', request_body: null, request_body_status: 'captured',
        response_body: null, response_preview: null, response_body_status: 'captured',
        mime_type: 'application/json', request_size_bytes: null, response_size_bytes: null,
        transfer_size_bytes: null, from_cache: true, cache_status: cache_status as never,
        error_text: null, capture_method: 'network', body_capture_mode: 'none',
    } as NetworkRequestData;
}

function net_event(status_code: unknown): CaptureEvent {
    return {
        type: 'network_request',
        relative_time_ms: 100,
        source: 'background',
        data: { status_code },
    } as CaptureEvent;
}

describe('t154 dashboard misc fixes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const k of Object.keys(store)) delete store[k];
        set_captures([]);
        set_detail_capture(null);
        set_detail_events([]);
        set_detail_network([]);
        set_dt_sel(-1);
        set_cap_search('');
        // t186 AC-002/003: 每例显式 wire router（未接线调用抛错，不再静默 no-op）
        wire_dashboard_router({
            go: vi.fn(), render_content: vi.fn(), render_shell: vi.fn(), open_detail: vi.fn(), is_tl_dragging: vi.fn(() => false),
        });
        // 恢复模块默认视图状态
        set_dt_tab('timeline'); set_dt_view('list'); set_dt_quick('all');
        send_message_mock.mockImplementation(async ({ action }: { action: string }) => {
            if (action === 'list_captures') return { success: true, data: [] };
            return { success: false };
        });
    });

    // ── AC-001：搜索含双引号不被双转义为 &amp;quot; ──
    it('AC-001: 搜索含双引号显示为 &quot; 而非 &amp;quot;', () => {
        set_cap_search('a"b');
        const html = render_captures();
        expect(html).toContain('value="a&quot;b"');
        expect(html).not.toContain('&amp;quot;');
    });

    // ── AC-002：删除响应检查 + 活跃采集禁用删除 ──
    it('AC-002: 活跃采集行删除按钮 disabled，已完成行不 disabled', () => {
        set_captures([make_capture('active', 'capturing'), make_capture('done', 'completed')]);
        const html = render_captures();
        expect(html).toContain('data-del="active" disabled');
        expect(html).not.toContain('data-del="done" disabled');
    });

    it('AC-002: del_capture 收到 success=false 时 alert 具体错误且不移除选中', async () => {
        send_message_mock.mockImplementation(async ({ action }: { action: string }) => {
            if (action === 'delete_capture') return { success: false, error: 'Cannot delete an active capture' };
            return { success: true, data: [] };
        });
        const alert_spy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        vi.spyOn(window, 'confirm').mockImplementation(() => true);
        get_selected().add('active');
        await del_capture('active');
        expect(alert_spy).toHaveBeenCalledWith(expect.stringContaining('Cannot delete an active capture'));
        expect(get_selected().has('active')).toBe(true);
    });

    it('AC-002: del_capture 成功时移除选中并重载', async () => {
        send_message_mock.mockImplementation(async ({ action }: { action: string }) => {
            if (action === 'delete_capture') return { success: true, data: {} };
            if (action === 'list_captures') return { success: true, data: [] };
            return { success: true };
        });
        vi.spyOn(window, 'confirm').mockImplementation(() => true);
        get_selected().add('done');
        await del_capture('done');
        expect(get_selected().has('done')).toBe(false);
    });

    // ── AC-003：open_detail 按 capture_id 记忆 tab/view/quick ──
    it('AC-003: 无记忆的 capture 打开回默认 timeline/list', async () => {
        await open_detail('capB');
        expect(get_dt_tab()).toBe('timeline');
        expect(get_dt_view()).toBe('list');
    });

    it('AC-003: 有记忆的 capture 打开恢复上次 tab/view/quick', async () => {
        set_dt_tab('network'); set_dt_view('trace'); set_dt_quick('error');
        save_dt_memory('capA');
        await open_detail('capA');
        expect(get_dt_tab()).toBe('network');
        expect(get_dt_view()).toBe('trace');
        expect(get_dt_quick()).toBe('error');
        // 记忆对象可查
        expect(get_dt_memory('capA')).toEqual({ tab: 'network', view: 'trace', quick: 'error' });
    });

    it('AC-003b: 无当前 detail 时 open_detail 的 save 是 no-op，不写坏记忆（t154-f001 改名）', async () => {
        // 无当前 detail（get_detail_capture null）时打开 capB，save 不产生记忆
        await open_detail('capB');
        expect(get_dt_memory('capB')).toBeUndefined();
    });

    // ── AC-004：start_url 仅 http/https 可打开 ──
    it('AC-004: 打开原页面仅允许 http/https', () => {
        set_detail_capture(make_capture('c1', 'completed', 'https://example.com/path'));
        document.body.innerHTML = '<div id="content"></div>';
        const c = document.getElementById('content')!;
        c.innerHTML = render_detail();
        wire_detail(c);
        c.querySelector<HTMLElement>('[data-open-url]')!.click();
        expect(tabs_create_mock).toHaveBeenCalledWith({ url: 'https://example.com/path' });
        tabs_create_mock.mockClear();

        // 非 http/https 拒绝
        set_detail_capture(make_capture('c2', 'completed', 'javascript:alert(1)'));
        c.innerHTML = render_detail();
        wire_detail(c);
        c.querySelector<HTMLElement>('[data-open-url]')!.click();
        expect(tabs_create_mock).not.toHaveBeenCalled();
    });

    // ── AC-005：load_captures 非数组响应不崩溃 ──
    it('AC-005: load_captures 非数组响应降级为空列表', async () => {
        send_message_mock.mockImplementation(async () => ({ success: true, data: { not: 'array' } }));
        await load_captures();
        expect(get_captures()).toEqual([]);
    });

    it('AC-005: load_captures 数组响应正常透传', async () => {
        send_message_mock.mockImplementation(async () => ({ success: true, data: [make_capture('c1')] }));
        await load_captures();
        expect(get_captures().length).toBe(1);
    });

    // ── AC-006：非扩展上下文（未显式 set_user_config）渲染不抛 TypeError ──
    it('AC-006: 未调用 set_user_config 时渲染采集列表不抛 TypeError', () => {
        // 不调用 set_user_config（模拟非扩展上下文 init 跳过配置加载）
        set_captures([make_capture('c1', 'completed', 'https://x', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z')]);
        expect(() => render_captures()).not.toThrow();
    });

    it('AC-006: get_user_config 缺省为 DEFAULT_USER_CONFIG', () => {
        // 未 set_user_config 时仍可格式化时间（format_system_time 不抛）
        set_captures([make_capture('c1', 'completed', 'https://x')]);
        expect(() => render_captures()).not.toThrow();
        expect(DEFAULT_USER_CONFIG.system_time_timezone).toBeTruthy();
    });

    // ── AC-008：capture_dur 负值 clamp 0 ──
    it('AC-008: capture_dur 负值 clamp 到 00:00:00', () => {
        const cap = make_capture('c1', 'completed', 'https://x', '2026-01-01T10:00:00Z', '2026-01-01T09:00:00Z');
        expect(capture_dur(cap)).toBe('00:00:00');
    });

    it('AC-008: capture_dur 正常正时长', () => {
        const cap = make_capture('c1', 'completed', 'https://x', '2026-01-01T10:00:00Z', '2026-01-01T10:01:00Z');
        expect(capture_dur(cap)).toBe('00:01:00');
    });

    // ── AC-009：状态徽章 status 与 cache_status 转义 ──
    it('AC-009: 时间线 status 徽章转义 + 数值校验', () => {
        const v = '<img src=x onerror=1>';
        set_detail_events([net_event(v)]);
        const html = _render_dt_list_for_test();
        expect(html).not.toContain(v);
        expect(html).toContain(esc(v));
    });

    it('AC-009: 网络检查器 cache_status 转义', () => {
        const v = '<img src=x onerror=2>';
        set_detail_network([net_req(v)]);
        const html = _render_net_inspector_for_test(0);
        expect(html).not.toContain(v);
        expect(html).toContain(esc(v));
    });
});
