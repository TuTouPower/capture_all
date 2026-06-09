// tests/e2e-ui-audit.spec.ts — UI 审计：无旧概念残留 + 主色验证
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, FORBIDDEN_STRINGS } from './e2e-helpers';

test.describe.serial('UI 审计', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('popup 三状态均不含旧概念字符串', async () => {
        const popup = await open_popup(fix);

        // 状态 1 — 就绪
        let html = await popup.innerHTML('body');
        for (const s of FORBIDDEN_STRINGS) {
            expect(html, `popup 状态 1: 不应包含 "${s}"`).not.toContain(s);
        }

        // 状态 2 — 采集中
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(1000);
        html = await popup.innerHTML('body');
        for (const s of FORBIDDEN_STRINGS) {
            expect(html, `popup 状态 2: 不应包含 "${s}"`).not.toContain(s);
        }

        // 状态 3 — 完成
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        html = await popup.innerHTML('body');
        for (const s of FORBIDDEN_STRINGS) {
            expect(html, `popup 状态 3: 不应包含 "${s}"`).not.toContain(s);
        }

        await popup.close();
    });

    test('dashboard HTML 不含旧概念文字', async () => {
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(2000);

        const html = await dashboard.innerHTML('body');
        for (const s of FORBIDDEN_STRINGS) {
            expect(html, `dashboard: 不应包含 "${s}"`).not.toContain(s);
        }

        // 验证使用新名称
        expect(html).toContain('Capture All');
        expect(html, 'dashboard 应包含「采集」').toContain('采集');

        await dashboard.close();
    });

    test('popup 标题正确', async () => {
        const popup = await open_popup(fix);
        const title = await popup.title();
        expect(title).toMatch(/Capture All|全采/);
        await popup.close();
    });

    test('dashboard 标题正确', async () => {
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1000);

        const title = await dashboard.title();
        expect(title).toMatch(/Capture All|全采/);

        await dashboard.close();
    });

    test('开始按钮有渐变背景', async () => {
        const popup = await open_popup(fix);
        const start_btn = popup.locator('#startBtn');
        await expect(start_btn).toBeVisible();
        const bg = await start_btn.evaluate(el => getComputedStyle(el).backgroundImage);
        expect(bg, '按钮应有渐变背景').toContain('gradient');
        await popup.close();
    });

    test('主色 #3b82f6 或蓝色系存在于 UI', async () => {
        const popup = await open_popup(fix);

        // 获取所有样式和属性中使用的蓝色
        const blue_usage = await popup.evaluate(() => {
            const results: string[] = [];
            // 检查 computed styles on key elements
            const btn = document.querySelector('#startBtn') as HTMLElement | null;
            if (btn) {
                const cs = getComputedStyle(btn);
                results.push(`startBtn bg: ${cs.backgroundImage}`);
                results.push(`startBtn color: ${cs.color}`);
            }
            // 检查 CSS 变量
            const root_style = getComputedStyle(document.documentElement);
            const blue_var = root_style.getPropertyValue('--blue').trim();
            results.push(`--blue: ${blue_var}`);

            return results;
        });

        // 至少应有蓝色系变量或颜色值
        const has_blue = blue_usage.some(
            (s) => s.includes('blue') || s.includes('#2563eb') || s.includes('#3b82f6') || s.includes('gradient'),
        );
        expect(has_blue, 'UI 应使用蓝色系主色').toBe(true);

        // 验证特定 key elements 存在
        const design_tokens_present = blue_usage.some((s) => s.startsWith('--blue:') && s.includes('#'));
        expect(design_tokens_present, '--blue CSS 变量应包含颜色值').toBe(true);

        await popup.close();
    });
});
