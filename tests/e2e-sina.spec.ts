// tests/e2e-sina.spec.ts — 完整采集流程 on sina.com.cn
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES, REQUIRED_LABELS } from './e2e-helpers';

test.describe('Sina 采集流程', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('sina.com.cn 页面加载 + 滚动触发各类事件', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.sina);
        await site.waitForTimeout(4000);

        // 滚动触发 scroll 和网络请求事件
        await site.evaluate(() => window.scrollBy(0, 800));
        await site.waitForTimeout(2000);

        // 点击新闻链接
        const link = site.locator('a[href]:visible').first();
        if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
            try {
                const [new_page] = await Promise.all([
                    fix.context.waitForEvent('page', { timeout: 10000 }),
                    link.click(),
                ]);
                await new_page.waitForLoadState('domcontentloaded');
                await new_page.waitForTimeout(3000);
                await new_page.close();
            } catch {
                // 可能不会打开新页面
            }
        }

        await site.close();
        await popup.bringToFront();
        await popup.waitForTimeout(1000);

        // sina 首页有很多网络请求和滚动事件，至少应有一个标签有计数
        const cards_with_count = popup.locator('.mcard[data-count="1"]');
        const has_count = await cards_with_count.count();
        expect(has_count, 'sina.com.cn 加载+滚动+点击后至少一个标签计数 > 0').toBeGreaterThan(0);

        // 7 个标签全部存在
        for (const label of REQUIRED_LABELS) {
            await expect(
                popup.locator('.mcard', { hasText: label }),
            ).toBeVisible();
        }

        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();

        await popup.close();
    });

    test('sina.com.cn 多次页面浏览采集', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.sina);
        await site.waitForTimeout(3000);

        // 多方向滚动
        await site.evaluate(() => window.scrollBy(0, 500));
        await site.waitForTimeout(1000);
        await site.evaluate(() => window.scrollBy(0, 1500));
        await site.waitForTimeout(1500);
        await site.evaluate(() => window.scrollBy(0, -800));
        await site.waitForTimeout(1000);

        await site.close();
        await popup.bringToFront();
        await popup.waitForTimeout(1000);

        // 验证标签卡片数量
        const all_cards = popup.locator('.mcard');
        const card_count = await all_cards.count();
        expect(card_count).toBeGreaterThanOrEqual(7);

        // 停止 → 完成
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // 验证完成状态
        await expect(popup.locator('#newBtn')).toBeVisible();
        await expect(popup.locator('#openDetailBtn')).toBeVisible();

        // 开始新采集
        await popup.locator('#newBtn').click();
        await popup.waitForTimeout(500);
        await expect(popup.locator('#startBtn')).toBeVisible();

        await popup.close();
    });
});
