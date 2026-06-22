// @vitest-environment jsdom
// tests/integration_page.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = readFileSync(resolve(__dirname, '../src/dashboard/dashboard_integrations.ts'), 'utf8');
const main_src = readFileSync(resolve(__dirname, '../src/dashboard/dashboard.ts'), 'utf8');

function get_integrations_body(): string {
    const fn_start = src.indexOf('function render_integrations(): string {');
    if (fn_start === -1) return '';
    let depth = 0;
    let fn_end = fn_start;
    for (let i = fn_start; i < src.length; i++) {
        if (src[i] === '{') depth++;
        if (src[i] === '}') { depth--; if (depth === 0) { fn_end = i; break; } }
    }
    return src.slice(fn_start, fn_end + 1);
}

describe('BUG-010: MCP 集成页按钮行为', () => {
    it('MCP Bridge 和本地 Agent 按钮有 data-action="go-settings"', () => {
        const body = get_integrations_body();
        const go_settings_count = (body.match(/data-action="go-settings"/g) || []).length;
        // 非 disabled 的卡片按钮 + 页面顶部"前往设置"按钮
        expect(go_settings_count).toBeGreaterThanOrEqual(2);
    });

    it('wire_integrations 绑定 click → go("settings") + scrollIntoView', () => {
        const wire_match = src.match(/function wire_integrations\b[\s\S]*?^\}/m);
        expect(wire_match).toBeTruthy();
        const wire_body = wire_match![0];
        expect(wire_body).toContain("'settings'");
        expect(wire_body).toContain('set-integrations');
        expect(wire_body).toContain('addEventListener');
    });

    it('render_content 中 integrations 分支调用 wire_integrations', () => {
        expect(main_src).toMatch(/render_integrations\(\);\s*wire_integrations\(\)/);
    });
});

describe('BUG-011: Webhook / Issue 平台禁用态', () => {
    it('Webhook 和 Issue 平台卡片 disabled=true', () => {
        const body = get_integrations_body();
        // cards 数组中第 3、4 项的 disabled 标志为 true
        expect(body).toContain("'即将推出', true");
    });

    it('disabled 按钮不应有 data-action', () => {
        const body = get_integrations_body();
        // 模板中 disabled ? '' : 'data-action="go-settings"' 逻辑
        expect(body).toContain("!disabled ? 'data-action=\"go-settings\"'");
    });

    it('disabled 卡片有 integ-card--disabled class', () => {
        const body = get_integrations_body();
        expect(body).toContain('integ-card--disabled');
    });

    it('disabled 卡片状态标签为"未实现"', () => {
        const body = get_integrations_body();
        expect(body).toContain("disabled ? '未实现'");
    });

    it('disabled 按钮文本为"即将推出"', () => {
        const body = get_integrations_body();
        // cards 数组中 btn 参数为'即将推出'
        const matches = body.match(/'即将推出'/g) || [];
        expect(matches.length).toBe(2);
    });
});
