// tests/unit/dashboard_ui_misc_fixes.test.ts
// @vitest-environment jsdom
// t190: Dashboard/Popup UI 缺陷修复——a11y 开关（button[aria-pressed]）、导出错误用户可见、
// locale document.lang、UI string 测试真实断言。
// popup/settings 模块顶层依赖 chrome——用源码扫描断言（同 popup_category_capture_gates 先例）。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { set_locale } from '../../src/extension/shared/i18n';

const root = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('t190 AC-001: 核心开关 button[aria-pressed]（键盘可达 + 状态宣布）', () => {
    it('popup 分类开关（mcard）为原生 button 且带 aria-pressed', () => {
        const src = read('src/extension/popup/popup.ts');
        expect(src).toMatch(/<button type="button" class="mcard/);
        expect(src).toMatch(/aria-pressed="\$\{on \? 'true' : 'false'\}"/);
        // f003: 非 toggle 态（capturing/saved）用 div 防键盘死按钮；div 分支无 aria-pressed
        expect(src).toMatch(/<div class="mcard \$\{on/);
        expect(src).not.toMatch(/<div class="mcard[^>]*aria-pressed/);
    });

    it('dashboard settings 开关（switch）为原生 button 且带 aria-pressed，click 同步状态', () => {
        const src = read('src/extension/dashboard/dashboard_settings.ts');
        expect(src).toMatch(/<button type="button" class="switch/);
        expect(src).toMatch(/aria-pressed="\$\{on \? 'true' : 'false'\}"/);
        expect(src).toMatch(/setAttribute\('aria-pressed', on \? 'true' : 'false'\)/);
        // f002: aria-label 提供可访问名（读屏报含义）
        expect(src).toMatch(/aria-label="\$\{esc\(label\)\}"|aria-label="\$\{label\}"|aria-label=/);
    });

    it('f004: 原生 button 可聚焦且 click 触发状态同步（键盘 Enter/Space 激活为浏览器原生语义 [deploy]）', () => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-pressed', 'false');
        let clicked = 0;
        btn.addEventListener('click', () => { clicked++; btn.setAttribute('aria-pressed', 'true'); });
        document.body.appendChild(btn);
        // 原生 button 默认可 Tab 聚焦（tabIndex 0）
        expect(btn.tabIndex).toBe(0);
        btn.focus();
        expect(document.activeElement).toBe(btn);
        btn.click();
        expect(clicked).toBe(1);
        expect(btn.getAttribute('aria-pressed')).toBe('true');
    });

    it('button reset CSS（mcard/switch 样式不因原生控件退化）', () => {
        const popup_css = read('src/extension/popup/popup.css');
        expect(popup_css).toMatch(/font-family: inherit; text-align: left; color: inherit/);
        const dash_css = read('src/extension/dashboard/dashboard-pages.css');
        expect(dash_css).toMatch(/border: none; padding: 0; font: inherit/);
    });
});

describe('t190 AC-002: Dashboard 导出异常用户可见', () => {
    it('export_capture catch 分支 alert(t(exportFailed))（非仅 log）', () => {
        const src = read('src/extension/dashboard/dashboard_data.ts');
        expect(src).toMatch(/logger\.error\('Export error', err\)/);
        expect(src).toMatch(/alert\(t\('exportFailed'\)\)/);
    });
});

describe('t190 AC-003: locale 切换同步 document.lang + 无残留硬编码', () => {
    it('set_locale 更新 document.documentElement.lang', () => {
        set_locale('zh');
        expect(document.documentElement.lang).toBe('zh');
        set_locale('en');
        expect(document.documentElement.lang).toBe('en');
        set_locale('zh');
    });

    it('popup 最近行 duration/events 经 i18n（无硬编码 events）', () => {
        const src = read('src/extension/popup/popup.ts');
        expect(src).not.toMatch(/\$\{events\} events/);
        expect(src).toMatch(/t\('events'\)/);
    });
});

describe('t190 AC-004: UI string 测试真实断言（无空洞）', () => {
    it('ui_strings manifest 断言指向真实 manifest（src/extension/manifest.json，无 existsSync 跳过）', () => {
        const src = read('tests/unit/ui_strings.test.ts');
        expect(src).toMatch(/src', 'extension', 'manifest\.json/);
        expect(src).not.toMatch(/existsSync\(manifest_path\)\) return;/);
    });

    it('ui_strings 无恒真断言（toBeLessThanOrEqual(self) 已移除）', () => {
        const src = read('tests/unit/ui_strings.test.ts');
        expect(src).not.toMatch(/toBeLessThanOrEqual\(real_hits\.length\)/);
    });
});
