// @vitest-environment jsdom
// tests/unit/detail_layout_source.test.ts
// t151 AC-003: 源码字符串断言改行为断言；CSS 类名锚点保留为「结构契约」。
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    set_detail_capture,
    set_detail_network,
    set_dt_net_insp_closed,
    set_dt_net_sel,
    set_dt_tab,
    set_user_config,
} from '../../src/extension/dashboard/dashboard_shared';
import { render_detail, render_dt_rail } from '../../src/extension/dashboard/dashboard_detail';
import { set_locale } from '../../src/extension/shared/i18n';
import { DEFAULT_USER_CONFIG } from '../../src/shared/constants';
import type { CaptureRecord, NetworkRequestData } from '../../src/shared/types';

// set_locale 会写 chrome.storage.local，提供最小 mock
vi.stubGlobal('chrome', {
    storage: { local: { set: vi.fn(), get: vi.fn(async () => ({})) } },
});

const dashboard_css = readFileSync('src/extension/dashboard/dashboard-pages.css', 'utf8');

function make_capture(): CaptureRecord {
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
        stats: { event_count: 0, request_count: 0, log_count: 0, error_count: 0, user_action_count: 0, storage_change_count: 0, cookie_change_count: 0, total_body_bytes: 0 },
        export_status: 'not_exported',
        tags: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:01:00Z',
    } as CaptureRecord;
}

function net_req(method: string, url: string): NetworkRequestData {
    return {
        request_id: url,
        capture_id: 'c1',
        relative_time: 100,
        absolute_time: 100,
        tab_id: 1,
        method,
        url,
        url_status: 'captured',
        status_code: 200,
        status_text: 'OK',
        protocol: 'https',
        resource_type: 'fetch',
        initiator: null,
        duration_ms: 5,
        start_time_ms: 100,
        end_time_ms: 105,
        request_headers: {},
        response_headers: {},
        headers_status: 'captured',
        request_body: null,
        request_body_status: 'not_enabled',
        response_body: null,
        response_preview: null,
        response_body_status: 'not_enabled',
        mime_type: 'application/json',
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: false,
        cache_status: 'none',
        error_text: null,
        capture_method: 'web_request',
        body_capture_mode: 'none',
    } as NetworkRequestData;
}

describe('detail layout 行为 (t151 AC-003)', () => {
    beforeEach(() => {
        set_locale('zh');
        set_user_config(DEFAULT_USER_CONFIG);
        set_detail_capture(make_capture());
        set_detail_network([]);
        set_dt_net_sel(-1);
        set_dt_net_insp_closed(false);
        set_dt_tab('network');
        document.body.innerHTML = '';
    });

    it('timeline rail 的 resize 手柄渲染在 rail 内部', () => {
        const container = document.createElement('div');
        container.innerHTML = render_dt_rail();
        const rail = container.querySelector('.dt-rail');
        expect(rail).not.toBeNull();
        expect(rail!.querySelector('.dt-rail-handle')).not.toBeNull();
    });

    it('network tab 使用 dt-network-body 布局（非 timeline rail grid）', () => {
        set_detail_network([net_req('GET', 'https://example.com/data')]);
        const html = render_detail();
        expect(html).toContain('dt-network-body');
    });

    it('解析后的选中网络请求同时高亮行并驱动检查器', () => {
        set_detail_network([net_req('GET', 'https://a.com/1'), net_req('POST', 'https://b.com/2')]);
        set_dt_net_sel(1);
        const container = document.createElement('div');
        container.innerHTML = render_detail();
        const rows = [...container.querySelectorAll<HTMLElement>('.net-row')]
            .filter((r) => r.hasAttribute('data-netidx'));
        expect(rows).toHaveLength(2);
        expect(rows[0].dataset.sel).toBe('0');
        expect(rows[1].dataset.sel).toBe('1');
        // 检查器展示选中请求
        const inspector = container.querySelector('.dt-insp');
        expect(inspector).not.toBeNull();
        expect(inspector!.textContent).toContain('b.com/2');
    });

    it('默认打开的网络检查器可被关闭', () => {
        set_detail_network([net_req('GET', 'https://example.com/data')]);
        const open_html = render_detail();
        expect(open_html).toContain('dt-insp-handle');
        set_dt_net_insp_closed(true);
        const closed_html = render_detail();
        expect(closed_html).not.toContain('dt-insp-handle');
        expect(closed_html).toContain('dt-network-body');
    });
});

describe('detail layout 结构契约（CSS 类名锚点）', () => {
    it('CSS 定义 .dt-network-body 规则（渲染 HTML 类名依赖样式表）', () => {
        expect(dashboard_css).toContain('.dt-network-body');
    });
});
