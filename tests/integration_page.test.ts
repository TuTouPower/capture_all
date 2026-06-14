import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const src = readFileSync(resolve(__dirname, '../src/dashboard/dashboard.ts'), 'utf8');

// 提取 render_integrations 函数体
const fn_match = src.match(/function render_integrations\(\): string \{([\s\S]*?)\n\}/);
const fn_body = fn_match ? fn_match[1] : '';

describe('BUG-010: MCP 集成页按钮绑定', () => {
    it('MCP Bridge 卡片按钮有 data-action 属性', () => {
        expect(fn_body).toMatch(/data-action/);
    });

    it('data-action 值为 go-settings', () => {
        expect(fn_body).toContain('data-action="go-settings"');
    });

    it('wire_integrations 函数存在', () => {
        expect(src).toMatch(/function wire_integrations\b/);
    });

    it('wire_integrations 绑定 data-action click handler', () => {
        const wire_match = src.match(/function wire_integrations\b[\s\S]*?^\}/m);
        const wire_body = wire_match ? wire_match[0] : '';
        expect(wire_body).toContain('[data-action');
        expect(wire_body).toContain('addEventListener');
    });

    it('render_content 调用 wire_integrations', () => {
        expect(src).toMatch(/render_integrations\(\);\s*wire_integrations\(\)/);
    });
});

describe('BUG-011: 禁用未实现卡片', () => {
    it('Webhook 卡片按钮有 disabled 属性', () => {
        // disabled 按钮文本应为"即将推出"
        expect(fn_body).toMatch(/disabled[\s\S]*?即将推出|即将推出[\s\S]*?disabled/);
    });

    it('Issue 平台卡片按钮有 disabled 属性', () => {
        // 至少两个 disabled 按钮（Webhook + Issue）
        const disabled_count = (fn_body.match(/disabled/g) || []).length;
        expect(disabled_count).toBeGreaterThanOrEqual(2);
    });

    it('未实现卡片状态标签为"未实现"', () => {
        expect(fn_body).toContain('未实现');
    });

    it('禁用卡片有降低 opacity 样式', () => {
        expect(fn_body).toMatch(/opacity.*0\.\d|integ-card--disabled|data-disabled/);
    });
});
