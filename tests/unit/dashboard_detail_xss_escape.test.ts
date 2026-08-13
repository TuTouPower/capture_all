// @vitest-environment jsdom
// tests/unit/dashboard_detail_xss_escape.test.ts
// t151 AC-001: dashboard 事件渲染函数参数化 XSS 转义测试。
// 覆盖 render_dt_list / render_net_inspector / render_con_table /
// render_simple_events / render_dt_inspector（src/extension/dashboard/dashboard_detail.ts）。
// 断言：真实渲染输出中原始向量（<img onerror>、</script>、引号）被 esc() 转义。
import { describe, it, expect, beforeEach, vi } from 'vitest';
// t151-f002: esc 参照用生产 escape_html（同源避免语义漂移）
import { escape_html as esc } from '../../src/shared/escape';
import {
    set_detail_capture,
    set_detail_console,
    set_detail_events,
    set_detail_network,
    set_dt_sel,
    set_user_config,
} from '../../src/extension/dashboard/dashboard_shared';
import {
    _render_con_table_for_test,
    _render_dt_inspector_for_test,
    _render_dt_list_for_test,
    _render_net_inspector_for_test,
    _render_simple_events_for_test,
} from '../../src/extension/dashboard/dashboard_detail';
import { set_locale } from '../../src/extension/shared/i18n';
import { DEFAULT_USER_CONFIG } from '../../src/shared/constants';
import type {
    CaptureEvent,
    ConsoleEventData,
    NetworkRequestData,
} from '../../src/shared/types';

// set_locale 会写 chrome.storage.local，提供最小 mock
vi.stubGlobal('chrome', {
    storage: { local: { set: vi.fn(), get: vi.fn(async () => ({})) } },
});

const XSS_VECTORS = [
    '<img src=x onerror=alert(1)>',
    '</script><script>alert(1)</script>',
    '"><script>alert(1)</script>',
];

function nav_event(v: string): CaptureEvent {
    return {
        type: 'route_change',
        relative_time_ms: 100,
        absolute_time: '2026-01-01T00:00:00Z',
        source: v,
        data: { from: v, to: v },
    } as CaptureEvent;
}

function input_event(v: string): CaptureEvent {
    return {
        type: 'input_event',
        relative_time_ms: 100,
        source: v,
        data: { target_tag: v, target_selector: v },
    } as CaptureEvent;
}

function net_req(v: string): NetworkRequestData {
    return {
        request_id: 'r1',
        capture_id: 'c1',
        relative_time: 100,
        absolute_time: 100,
        tab_id: 1,
        method: v,
        url: v,
        url_status: 'captured',
        status_code: 200,
        status_text: v,
        protocol: v,
        resource_type: v,
        initiator: null,
        duration_ms: 5,
        start_time_ms: 100,
        end_time_ms: 105,
        request_headers: { 'X-Test': v },
        response_headers: { 'X-Resp': v },
        headers_status: 'captured',
        request_body: v,
        request_body_status: 'captured',
        response_body: v,
        response_preview: null,
        response_body_status: 'captured',
        mime_type: v,
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: false,
        cache_status: 'none',
        error_text: v,
        capture_method: v,
        body_capture_mode: 'none',
    } as NetworkRequestData;
}

function con_log(v: string): ConsoleEventData {
    return {
        level: v,
        args_preview: [v],
        args_status: 'captured',
        stack_trace: null,
        source_url: v,
        line: 1,
        column: 2,
        repeat_count: null,
        related_network_request_id: null,
        relative_time: 100,
        absolute_time: 100,
        timestamp: v,
    } as unknown as ConsoleEventData;
}

describe('dashboard 事件渲染 XSS 转义 (t151 AC-001)', () => {
    beforeEach(() => {
        set_locale('zh');
        set_user_config(DEFAULT_USER_CONFIG);
        set_detail_capture(null);
        set_detail_events([]);
        set_detail_network([]);
        set_detail_console([]);
        set_dt_sel(-1);
        document.body.innerHTML = '';
    });

    it('render_dt_list：事件标题/详情/来源全部转义', () => {
        for (const v of XSS_VECTORS) {
            set_detail_events([nav_event(v)]);
            const html = _render_dt_list_for_test();
            expect(html, `raw vector must be escaped: ${v}`).not.toContain(v);
            expect(html, `escaped form must appear: ${v}`).toContain(esc(v));
        }
    });

    it('render_net_inspector：method/url/headers/body/status_text 全部转义', () => {
        for (const v of XSS_VECTORS) {
            set_detail_network([net_req(v)]);
            const html = _render_net_inspector_for_test(0);
            expect(html, `raw vector must be escaped: ${v}`).not.toContain(v);
            expect(html, `escaped form must appear: ${v}`).toContain(esc(v));
        }
    });

    it('render_con_table：level/message/source/line 全部转义', () => {
        for (const v of XSS_VECTORS) {
            set_detail_console([con_log(v)]);
            const html = _render_con_table_for_test();
            expect(html, `raw vector must be escaped: ${v}`).not.toContain(v);
            expect(html, `escaped form must appear: ${v}`).toContain(esc(v));
        }
    });

    it('render_simple_events：事件标题/详情/来源全部转义', () => {
        for (const v of XSS_VECTORS) {
            set_detail_events([input_event(v)]);
            const html = _render_simple_events_for_test(['input_event'], ['time', 'type', 'detail', 'source']);
            expect(html, `raw vector must be escaped: ${v}`).not.toContain(v);
            expect(html, `escaped form must appear: ${v}`).toContain(esc(v));
        }
    });

    it('render_dt_inspector：字段值与标题全部转义', () => {
        for (const v of XSS_VECTORS) {
            set_detail_events([nav_event(v)]);
            set_dt_sel(0);
            const html = _render_dt_inspector_for_test();
            expect(html, `raw vector must be escaped: ${v}`).not.toContain(v);
            expect(html, `escaped form must appear: ${v}`).toContain(esc(v));
        }
    });
});
