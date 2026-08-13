// @vitest-environment jsdom
// tests/unit/detail_render_consistency.test.ts
// t151 AC-002: 改造为真实渲染断言——调用 render_detail / render_dt_list，
// 断言七类标签出现且计数与 stats 一致（替代原自证自的 tab_expectations 数组对齐）。
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { set_detail_capture, set_detail_events, set_user_config } from '../../src/extension/dashboard/dashboard_shared';
import { render_detail, _render_dt_list_for_test } from '../../src/extension/dashboard/dashboard_detail';
import { set_locale } from '../../src/extension/shared/i18n';
import { DEFAULT_USER_CONFIG } from '../../src/shared/constants';
import type { CaptureRecord, CaptureEvent } from '../../src/shared/types';

// set_locale 会写 chrome.storage.local，提供最小 mock
vi.stubGlobal('chrome', {
    storage: { local: { set: vi.fn(), get: vi.fn(async () => ({})) } },
});

// zh locale 下七个可见类别标签，与可见 stats 键一一对应
const SEVEN_TAB_LABELS = ['用户行为', '页面导航', '网络请求', '控制台', '错误异常', 'Storage', 'Cookie'];

function make_capture(stats: Record<string, number>): CaptureRecord {
    return {
        capture_id: 'c1',
        name: 'Capture',
        status: 'completed',
        started_at: '2026-01-01T00:00:00Z',
        ended_at: '2026-01-01T00:01:00Z',
        duration_ms: 60000,
        start_url: 'https://example.com',
        end_url: null,
        tab_id: 1,
        window_id: null,
        config_snapshot: {},
        stats: {
            event_count: 0,
            user_action_count: 0,
            nav_count: 0,
            request_count: 0,
            log_count: 0,
            error_count: 0,
            storage_change_count: 0,
            cookie_change_count: 0,
            total_body_bytes: 0,
            ...stats,
        },
        export_status: 'not_exported',
        tags: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:01:00Z',
    } as CaptureRecord;
}

function ev(type: CaptureEvent['type'], relative_time_ms: number): CaptureEvent {
    return { type, relative_time_ms, source: 's', data: {} } as CaptureEvent;
}

describe('detail render consistency (t151 AC-002)', () => {
    beforeEach(() => {
        set_locale('zh');
        set_user_config(DEFAULT_USER_CONFIG);
    });

    it('render_detail 渲染七个类别指标（与可见 stats 键对齐）', () => {
        set_detail_capture(make_capture({
            user_action_count: 1, nav_count: 1, request_count: 1, log_count: 1,
            error_count: 1, storage_change_count: 1, cookie_change_count: 1,
        }));
        const container = document.createElement('div');
        container.innerHTML = render_detail();
        const metrics = [...container.querySelectorAll<HTMLElement>('.dt-metric')];
        expect(metrics.length).toBe(7);
        for (const label of SEVEN_TAB_LABELS) {
            const metric = metrics.find((m) => m.textContent?.includes(label));
            expect(metric, `metric for ${label} should exist`).toBeTruthy();
            expect(metric!.textContent).toContain('1');
        }
    });

    it('非零 stat 计数与对应指标一致渲染', () => {
        set_detail_capture(make_capture({ user_action_count: 7, nav_count: 3, log_count: 12 }));
        const container = document.createElement('div');
        container.innerHTML = render_detail();
        const metrics = [...container.querySelectorAll<HTMLElement>('.dt-metric')];
        const by_label = (lbl: string) => metrics.find((m) => m.textContent?.includes(lbl))!;
        expect(by_label('用户行为').textContent).toContain('7');
        expect(by_label('页面导航').textContent).toContain('3');
        expect(by_label('控制台').textContent).toContain('12');
        // 未设置计数的类别显示 0
        expect(by_label('错误异常').textContent).toContain('0');
    });

    it('render_dt_list 按事件类别渲染对应行（七类标签覆盖）', () => {
        set_detail_events([
            ev('input_event', 10),
            ev('route_change', 20),
            ev('network_request', 30),
            ev('console_event', 40),
            ev('runtime_exception', 50),
            ev('storage_change', 60),
            ev('cookie_change', 70),
        ]);
        const container = document.createElement('div');
        container.innerHTML = _render_dt_list_for_test();
        const row_kinds = [...container.querySelectorAll<HTMLElement>('.ev-type')]
            .map((el) => el.textContent ?? '');
        for (const label of SEVEN_TAB_LABELS) {
            expect(row_kinds.some((k) => k.includes(label)), `row kind ${label} should be rendered`).toBe(true);
        }
    });
});
