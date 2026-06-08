// tests/e2e-states.spec.ts — Popup 三种状态切换 + UI 验收
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES, FORBIDDEN_STRINGS } from './e2e-helpers';

test.describe.serial('Popup 三状态', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('状态 1 — 开始采集：蓝色按钮、标签无数字', async () => {
        const popup = await open_popup(fix);

        const start_btn = popup.locator('#startBtn');
        await expect(start_btn).toBeVisible();

        // 按钮有蓝色渐变背景 (gradient, not solid color)
        const bg_image = await start_btn.evaluate(el => getComputedStyle(el).backgroundImage);
        expect(bg_image).toContain('linear-gradient');

        // 标签卡片存在但无数字（状态 1）
        const cards = popup.locator('.mcard');
        const card_count = await cards.count();
        expect(card_count).toBeGreaterThanOrEqual(7);
        const nums = popup.locator('.mcard-n');
        await expect(nums).toHaveCount(0);

        // 无滚动条
        const body_height = await popup.locator('body').evaluate(el => el.scrollHeight);
        const viewport = popup.viewportSize();
        expect(body_height).toBeLessThanOrEqual((viewport?.height ?? 600) + 10);

        // 无旧概念
        const html = await popup.content();
        for (const s of FORBIDDEN_STRINGS) {
            expect(html, `不应包含 "${s}"`).not.toContain(s);
        }

        await popup.close();
    });

    test('状态 2 — 采集中：红色计时按钮、标签有计数', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(1000);

        // 打开网站触发事件
        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(3000);
        await site.close();
        await popup.bringToFront();
        await popup.waitForTimeout(500);

        // 红色停止按钮
        await expect(popup.locator('#stopBtn')).toBeVisible();
        // 实时详情按钮
        await expect(popup.locator('#liveDetailBtn')).toBeVisible();

        // 计时器
        const timer = popup.locator('#timer');
        await expect(timer).toBeVisible();
        const timer_text = await timer.textContent();
        expect(timer_text).toMatch(/\d{2}:\d{2}:\d{2}/);

        // 操作区高度 108px
        const action = popup.locator('.action');
        const action_height = await action.evaluate(el => el.getBoundingClientRect().height);
        expect(action_height).toBe(108);

        // 停止采集以便下一个测试
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await popup.close();
    });

    test('状态 3 — 采集完成：绿色时长、查看详情/开始新采集', async () => {
        const popup = await open_popup(fix);

        // 先从状态 1 开始
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);
        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);
        await site.close();
        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // 完成状态
        await expect(popup.locator('.act-done')).toBeVisible();
        await expect(popup.locator('#openDetailBtn')).toBeVisible();
        await expect(popup.locator('#newBtn')).toBeVisible();

        // 操作区高度 108px
        const action = popup.locator('.action');
        const action_height = await action.evaluate(el => el.getBoundingClientRect().height);
        expect(action_height).toBe(108);

        await popup.close();
    });
});
