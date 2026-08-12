// @vitest-environment jsdom
// tests/unit/detail_search_preserve_input.test.ts
// 验证详情时间线搜索 debounce 重绘后输入框保留用户输入（P1-11）
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { set_detail_events } from '../../src/extension/dashboard/dashboard_shared';
import { set_locale } from '../../src/extension/shared/i18n';

// set_locale 会写 chrome.storage.local，提供最小 mock
vi.stubGlobal('chrome', {
    storage: { local: { set: vi.fn(), get: vi.fn(async () => ({})) } },
});

let render_dt_rail: () => string;
let render_dt_list: () => string;

async function load_module() {
    const mod = await import('../../src/extension/dashboard/dashboard_detail');
    render_dt_rail = mod.render_dt_rail as unknown as () => string;
    render_dt_list = mod._render_dt_list_for_test as unknown as () => string;
}

beforeEach(async () => {
    document.body.innerHTML = '';
    set_locale('zh');
    await load_module();
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('详情时间线搜索保留输入 (T108)', () => {
    it('AC-001: render_dt_rail 重绘后 input value 保留用户已输入字符串', () => {
        // 模拟重绘前搜索框已有值
        document.body.innerHTML = '<input id="dtSearch" value="foo">';
        const html = render_dt_rail();
        // 重绘后 value 保留
        expect(html).toContain('id="dtSearch"');
        expect(html).toContain('value="foo"');
    });

    it('AC-001b: 空输入时 value 为空（无污染）', () => {
        document.body.innerHTML = '<input id="dtSearch" value="">';
        const html = render_dt_rail();
        expect(html).toContain('value=""');
    });

    it('AC-001c: 含引号/特殊字符的输入被转义保留', () => {
        document.body.innerHTML = '<input id="dtSearch" value="a&quot;b">';
        const html = render_dt_rail();
        expect(html).toContain('value="a&quot;b"');
    });

    it('AC-003: value 转义与统一 esc 一致（含 > 与 单引号 向量）', () => {
        // p023：内联 replace 链少转 `>` 与 `'`，统一到 esc 后输出与 esc 一致
        document.body.innerHTML = '<input id="dtSearch" value="a&gt;b&#39;c">';
        const html = render_dt_rail();
        expect(html).toContain('value="a&gt;b&#39;c"');
        expect(html).not.toContain('value="a>b');
        expect(html).not.toContain('value="a>b\'c"');
    });

    it('AC-002: 输入搜索词后可见列表仅含匹配事件（p022）', () => {
        document.body.innerHTML = '<input id="dtSearch">';
        set_detail_events([
            { type: 'page_navigation', relative_time_ms: 100, source: 'background', data: { to: 'https://example.com/orders' } },
            { type: 'page_navigation', relative_time_ms: 200, source: 'background', data: { to: 'https://example.com/settings' } },
        ]);

        (document.getElementById('dtSearch') as HTMLInputElement).value = 'orders';
        const html = render_dt_list();

        expect(html).toContain('orders');
        expect(html).not.toContain('settings');
        expect(html).toContain('(1 个事件)');
    });

    it('AC-002b: 空搜索词时列表含全部事件', () => {
        document.body.innerHTML = '<input id="dtSearch">';
        set_detail_events([
            { type: 'page_navigation', relative_time_ms: 100, source: 'background', data: { to: 'https://example.com/orders' } },
            { type: 'page_navigation', relative_time_ms: 200, source: 'background', data: { to: 'https://example.com/settings' } },
        ]);

        (document.getElementById('dtSearch') as HTMLInputElement).value = '';
        const html = render_dt_list();

        expect(html).toContain('orders');
        expect(html).toContain('settings');
        expect(html).toContain('(2 个事件)');
    });
});
