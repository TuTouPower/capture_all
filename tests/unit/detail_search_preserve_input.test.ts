// @vitest-environment jsdom
// tests/unit/detail_search_preserve_input.test.ts
// 验证详情时间线搜索 debounce 重绘后输入框保留用户输入（P1-11）
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

let render_dt_rail: () => string;

async function load_module() {
    const mod = await import('../../src/extension/dashboard/dashboard_detail');
    render_dt_rail = mod.render_dt_rail as unknown as () => string;
}

beforeEach(async () => {
    document.body.innerHTML = '';
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
});
