// @vitest-environment jsdom
// tests/integration_page.test.ts
// T0003: 验证 integrations 页/侧边栏入口/死代码已彻底移除
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── 模块级行为测试 ──────────────────────────────────────────────────────
import * as integrations_mod from '../src/dashboard/dashboard_integrations';
import { set_page, get_page, set_user_config, router } from '../src/dashboard/dashboard_shared';
import { DEFAULT_USER_CONFIG } from '../src/shared/constants';

// ── 源码文件（供 AC-1/AC-2/AC-4 验证） ──────────────────────────────────
const main_src = readFileSync(resolve(__dirname, '../src/dashboard/dashboard.ts'), 'utf8');
const integ_src = readFileSync(resolve(__dirname, '../src/dashboard/dashboard_integrations.ts'), 'utf8');
const settings_src = readFileSync(resolve(__dirname, '../src/dashboard/dashboard_settings.ts'), 'utf8');

// ── AC-3 函数调用行为测试的前置 DOM + config 设置 ─────────────────────
beforeAll(async () => {
    // dashboard.ts module-level 需要 #root 元素
    document.body.innerHTML = '<div id="root"></div>';
    // 设置默认 user config，避免 render_settings() 等渲染函数读取 undefined
    set_user_config({ ...DEFAULT_USER_CONFIG });
    // 动态导入 dashboard.ts，触发 router.go = go 赋值（模块级）
    await import('../src/dashboard/dashboard');
});

// ────────────────────────────────────────────────────────────────────────
// dashboard_integrations 模块导出 (AC-4 行为层面)
// ────────────────────────────────────────────────────────────────────────
describe('T0003: dashboard_integrations 模块导出', () => {
    it('不再导出 render_integrations', () => {
        expect(integrations_mod).not.toHaveProperty('render_integrations');
    });

    it('不再导出 wire_integrations', () => {
        expect(integrations_mod).not.toHaveProperty('wire_integrations');
    });

    it('仍然导出 render_current', () => {
        expect(integrations_mod).toHaveProperty('render_current');
        expect(typeof integrations_mod.render_current).toBe('function');
    });

    it('仍然导出 wire_simple_open', () => {
        expect(integrations_mod).toHaveProperty('wire_simple_open');
        expect(typeof integrations_mod.wire_simple_open).toBe('function');
    });

    it('仍然导出 render_exports', () => {
        expect(integrations_mod).toHaveProperty('render_exports');
        expect(typeof integrations_mod.render_exports).toBe('function');
    });
});

// ────────────────────────────────────────────────────────────────────────
// AC-1: dashboard.ts NAV 数组 (源码级验证，补充 E2E)
// ────────────────────────────────────────────────────────────────────────
describe('T0003: dashboard.ts NAV 数组 (AC-1)', () => {
    it('NAV 数组只有 4 项', () => {
        const nav_match = main_src.match(/const NAV = \[([\s\S]*?)\];/);
        expect(nav_match).toBeTruthy();
        const nav_body = nav_match![1];
        const items = nav_body.match(/\{ key: '[^']+'/g) || [];
        expect(items).toHaveLength(4);
    });

    it('NAV 数组不含 integrations key', () => {
        const nav_match = main_src.match(/const NAV = \[([\s\S]*?)\];/);
        expect(nav_match).toBeTruthy();
        expect(nav_match![1]).not.toContain("'integrations'");
    });
});

// ────────────────────────────────────────────────────────────────────────
// AC-3: go("integrations") 降级行为 —— 实际函数调用验证
// spec 可测性契约: 调用 go('integrations') 后验证无异常、内容区降级到 captures 页面
// ────────────────────────────────────────────────────────────────────────
describe('T0003: AC-3 go("integrations") 降级行为', () => {
    it('调用 go("integrations") 不抛异常', () => {
        expect(() => router.go('integrations')).not.toThrow();
    });

    it('go("integrations") 后 get_page() 返回 captures (spec AC-3)', () => {
        router.go('integrations');
        expect(get_page()).toBe('captures');
    });

    it('go("captures") 行为不变', () => {
        router.go('captures');
        expect(get_page()).toBe('captures');
    });

    it('go("settings") 行为不变', () => {
        router.go('settings');
        expect(get_page()).toBe('settings');
    });

    it('go("current") 行为不变', () => {
        router.go('current');
        expect(get_page()).toBe('current');
    });

    it('go("exports") 行为不变', () => {
        router.go('exports');
        expect(get_page()).toBe('exports');
    });

    it('go 未知 page（如 "nonexistent"）不抛异常，渲染降级由 render_content else 处理', () => {
        // go() 只转换 integrations→captures；其他 page 透传 set_page
        // 未知 page 的渲染降级在 render_content() else 分支实现（非 go() 职责）
        expect(() => router.go('nonexistent')).not.toThrow();
        expect(get_page()).toBe('nonexistent');
    });

    it('router.go 是真实函数（非 no-op 占位）', () => {
        set_page('settings');
        expect(get_page()).toBe('settings');
        router.go('captures');
        expect(get_page()).toBe('captures');
    });
});

// ────────────────────────────────────────────────────────────────────────
// AC-4: 死代码清理 (源码级验证，补充 CLI grep)
// ────────────────────────────────────────────────────────────────────────
describe('T0003: 死代码清理 (AC-4)', () => {
    it('dashboard.ts import 不含 render_integrations', () => {
        expect(main_src).not.toContain('render_integrations');
    });

    it('dashboard.ts import 不含 wire_integrations', () => {
        expect(main_src).not.toContain('wire_integrations');
    });

    it('dashboard_integrations.ts 不含 render_integrations 函数定义', () => {
        expect(integ_src).not.toContain('function render_integrations');
    });

    it('dashboard_integrations.ts 不含 wire_integrations 函数定义', () => {
        expect(integ_src).not.toContain('function wire_integrations');
    });

    it('dashboard_integrations.ts export 不含 render_integrations', () => {
        const export_line = integ_src.match(/export \{[\s\S]*?\};/);
        expect(export_line).toBeTruthy();
        expect(export_line![0]).not.toContain('render_integrations');
        expect(export_line![0]).not.toContain('wire_integrations');
    });
});

// ────────────────────────────────────────────────────────────────────────
// AC-2: 设置页集成区保留
// ────────────────────────────────────────────────────────────────────────
describe('T0003: 设置页集成区保留 (AC-2)', () => {
    it('dashboard_settings.ts 保留 #set-integrations 元素', () => {
        expect(settings_src).toContain('id="set-integrations"');
    });

    it('dashboard_settings.ts 保留 MCP Bridge 配置开关', () => {
        expect(settings_src).toContain('启用 MCP bridge');
        expect(settings_src).toContain('agent_bridge_enabled');
    });

    it('dashboard_settings.ts 保留 Bridge URL 配置', () => {
        expect(settings_src).toContain('agent_bridge_url');
    });

    it('dashboard_settings.ts 保留 Bridge Token 配置', () => {
        expect(settings_src).toContain('agent_bridge_token');
    });

    it('dashboard_settings.ts 保留轮询间隔配置', () => {
        expect(settings_src).toContain('agent_bridge_poll_interval_ms');
    });
});
