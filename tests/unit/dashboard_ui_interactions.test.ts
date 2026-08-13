// tests/unit/dashboard_ui_interactions.test.ts
// @vitest-environment jsdom
// t197 AC-001~004: Dashboard UI 交互缺陷——timeline 空白区拖拽标记、批量删除失败残留、
// resize 拖拽清理测试。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { set_dt_tab, set_detail_events, set_detail_network, set_dt_view, set_captures, get_selected, wire_dashboard_router } from '../../src/extension/dashboard/dashboard_shared';
import { render_detail, wire_detail, get_tl_dragging } from '../../src/extension/dashboard/dashboard_detail';
import { render_captures, wire_captures } from '../../src/extension/dashboard/dashboard_captures';
import type { CaptureRecord } from '../../src/shared/types';

// ── chrome mock（is_extension 需 runtime.id 在模块 import 前就位——vi.hoisted 先于静态 import 执行） ──
const { send_message_mock } = vi.hoisted(() => {
    const send_message_mock = vi.fn();
    Object.defineProperty(globalThis, 'chrome', {
        value: {
            runtime: { id: 'test-extension-id', sendMessage: send_message_mock },
            storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(), remove: vi.fn() } },
            tabs: { create: vi.fn() },
        },
        writable: true,
    });
    return { send_message_mock };
});

// ── localStorage stub（render/wire 读取拖拽宽度） ──
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: vi.fn((k: string) => { delete store[k]; }),
    clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
});

function make_event(i: number) {
    return {
        event_id: `e${i}`, capture_id: 'c', category: 'user_action', type: 'mouse_event',
        relative_time_ms: i * 1000, absolute_time: '', tab_id: 1, frame_id: 0, url: '',
        source: 'content_script', severity: 'info', created_at: '',
    };
}

function make_capture(id: string): CaptureRecord {
    return {
        capture_id: id,
        name: 'Capture ' + id,
        status: 'completed',
        started_at: '2026-01-01T10:00:00Z',
        ended_at: '2026-01-01T11:00:00Z',
        duration_ms: 0,
        start_url: 'https://example.com',
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

function setup_detail(events: number[] = [1, 2, 3]): HTMLElement {
    set_dt_view('trace');
    set_detail_events(events.map(make_event));
    wire_dashboard_router({ go: () => {}, render_content: () => {}, render_shell: () => {}, open_detail: () => {}, is_tl_dragging: () => false });
    const container = document.createElement('div');
    container.id = 'content';
    container.innerHTML = render_detail();
    document.body.appendChild(container);
    // mock rect（seek 几何）
    const lanes = container.querySelector('#tlLanes') as HTMLElement;
    const overlay = container.querySelector('#tlTrackOverlay') as HTMLElement;
    lanes?.getBoundingClientRect && Object.assign(lanes, { getBoundingClientRect: () => ({ x: 100, y: 0, left: 100, top: 0, right: 700, bottom: 200, width: 600, height: 200, toJSON: () => ({}) }) });
    overlay?.getBoundingClientRect && Object.assign(overlay, { getBoundingClientRect: () => ({ x: 288, y: 0, left: 288, top: 0, right: 700, bottom: 200, width: 412, height: 200, toJSON: () => ({}) }) });
    wire_detail();
    return container;
}

beforeEach(() => {
    document.body.innerHTML = '';
    set_dt_view('trace');
    vi.clearAllMocks();
});

describe('t197 AC-001: timeline 空白区拖拽保护', () => {
    it('空白区 pointerdown 置 _tl_dragging；拖拽期间无中间 render；pointercancel 清理并刷新', () => {
        set_dt_view('trace');
        set_detail_events([1, 2, 3].map(make_event));
        const render_content = vi.fn();
        wire_dashboard_router({ go: () => {}, render_content, render_shell: () => {}, open_detail: () => {}, is_tl_dragging: () => false });
        const container = document.createElement('div');
        container.id = 'content';
        container.innerHTML = render_detail();
        document.body.appendChild(container);
        const lanes = container.querySelector('#tlLanes') as HTMLElement;
        const overlay = container.querySelector('#tlTrackOverlay') as HTMLElement;
        lanes?.getBoundingClientRect && Object.assign(lanes, { getBoundingClientRect: () => ({ x: 100, y: 0, left: 100, top: 0, right: 700, bottom: 200, width: 600, height: 200, toJSON: () => ({}) }) });
        overlay?.getBoundingClientRect && Object.assign(overlay, { getBoundingClientRect: () => ({ x: 288, y: 0, left: 288, top: 0, right: 700, bottom: 200, width: 412, height: 200, toJSON: () => ({}) }) });
        wire_detail();

        // 空白区（非 marker）拖拽
        lanes.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 391, clientY: 20 }));
        expect(get_tl_dragging()).toBe(true);
        // t197 核心：拖拽期间不直接 render_content（seek 读 detached overlay 失效）——pointerdown 无中间渲染
        expect(render_content).not.toHaveBeenCalled();
        // 拖拽结束（pointercancel）→ 清理标记 + 统一刷新一次
        window.dispatchEvent(new PointerEvent('pointercancel'));
        expect(get_tl_dragging()).toBe(false);
        expect(render_content).toHaveBeenCalledTimes(1);
    });

    it('空白区拖拽结束（pointerup）清理标记', () => {
        const container = setup_detail();
        const lanes = container.querySelector('#tlLanes') as HTMLElement;
        lanes.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 391, clientY: 20 }));
        expect(get_tl_dragging()).toBe(true);
        window.dispatchEvent(new PointerEvent('pointerup'));
        expect(get_tl_dragging()).toBe(false);
    });
});

describe('t197 AC-002: 批量删除失败选中残留', () => {
    it('batchDel 部分失败：已删成功项不残留 selected，失败项保留（行为级）', async () => {
        set_captures([make_capture('a'), make_capture('b')]);
        get_selected().add('a');
        get_selected().add('b');
        // 首项 a 删除成功，次项 b 失败（SW 拒绝）
        send_message_mock.mockImplementation(async ({ action, payload }: { action: string; payload: { capture_id: string } }) => {
            if (action === 'delete_capture') {
                return payload.capture_id === 'a' ? { success: true, data: {} } : { success: false, error: 'Cannot delete an active capture' };
            }
            if (action === 'list_captures') return { success: true, data: [] };
            return { success: true, data: {} };
        });
        const alert_spy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        vi.spyOn(window, 'confirm').mockImplementation(() => true);
        wire_dashboard_router({ go: () => {}, render_content: () => {}, render_shell: () => {}, open_detail: () => {}, is_tl_dragging: () => false });
        const container = document.createElement('div');
        container.id = 'content';
        container.innerHTML = render_captures();
        document.body.appendChild(container);
        wire_captures();
        container.querySelector('#batchDel')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 0));
        expect(send_message_mock).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete_capture' }));
        expect(get_selected().has('a')).toBe(false); // 已删成功项即时移除
        expect(get_selected().has('b')).toBe(true);  // 失败项保留（SW 未删）
        expect(alert_spy).toHaveBeenCalled();
    });

    it('batchDel 全成功：selected 清空', async () => {
        set_captures([make_capture('a'), make_capture('b')]);
        get_selected().add('a');
        get_selected().add('b');
        send_message_mock.mockImplementation(async ({ action }: { action: string }) => {
            if (action === 'delete_capture') return { success: true, data: {} };
            if (action === 'list_captures') return { success: true, data: [] };
            return { success: true, data: {} };
        });
        vi.spyOn(window, 'confirm').mockImplementation(() => true);
        wire_dashboard_router({ go: () => {}, render_content: () => {}, render_shell: () => {}, open_detail: () => {}, is_tl_dragging: () => false });
        const container = document.createElement('div');
        container.id = 'content';
        container.innerHTML = render_captures();
        document.body.appendChild(container);
        wire_captures();
        container.querySelector('#batchDel')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 0));
        expect(get_selected().size).toBe(0);
    });
});

describe('t197 AC-003: resize 拖拽清理测试', () => {
    it('rail resize：mousedown 后 pointercancel 清理（active 移除 + mousemove listener 解绑）', () => {
        const container = setup_detail();
        const handle = container.querySelector('.dt-rail-handle') as HTMLElement;
        expect(handle).toBeTruthy();
        const body = handle.closest('.dt-body') as HTMLElement;
        body.style.gridTemplateColumns = '200px 1fr';
        handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
        expect(handle.classList.contains('active')).toBe(true);
        // 拖拽中 mousemove 生效（宽度更新）
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 }));
        expect(body.style.gridTemplateColumns).not.toBe('200px 1fr');
        // pointercancel 清理：active 移除 + mousemove listener 解绑（再 move 不再变宽）
        window.dispatchEvent(new PointerEvent('pointercancel'));
        expect(handle.classList.contains('active')).toBe(false);
        const after_cancel = body.style.gridTemplateColumns;
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));
        expect(body.style.gridTemplateColumns).toBe(after_cancel);
    });

    it('network inspect resize：mousedown 后 mouseleave 清理', () => {
        set_dt_tab('network');
        set_detail_events([]);
        set_detail_network([{ request_id: 'r1', event_id: 'r1', capture_id: 'c', method: 'GET', url: 'https://a.com', url_status: 'captured', status_code: 200, status_text: 'OK', protocol: 'h2', resource_type: 'fetch', initiator: null, duration_ms: 1, start_time_ms: 1, end_time_ms: 2, request_headers: {}, response_headers: {}, headers_status: 'captured', relative_time_ms: 1 } as never]);
        const container = document.createElement('div');
        container.id = 'content';
        container.innerHTML = render_detail();
        document.body.appendChild(container);
        const handle = container.querySelector('.dt-insp-handle') as HTMLElement;
        expect(handle).toBeTruthy();
        wire_detail();
        handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
        expect(handle.classList.contains('active')).toBe(true);
        document.dispatchEvent(new MouseEvent('mouseleave'));
        expect(handle.classList.contains('active')).toBe(false);
    });
});
