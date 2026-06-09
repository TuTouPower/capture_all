// tests/e2e-toutiao.spec.ts — 完整采集流程 on toutiao.com
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES, REQUIRED_LABELS } from './e2e-helpers';

test.describe('Toutiao 采集流程', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('toutiao.com 滚动触发事件并验证计数 > 0', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.toutiao);
        await site.waitForTimeout(3000);

        // 多次滚动触发 scroll + 曝光事件
        await site.evaluate(() => window.scrollBy(0, 500));
        await site.waitForTimeout(1000);
        await site.evaluate(() => window.scrollBy(0, 1000));
        await site.waitForTimeout(1000);
        await site.evaluate(() => window.scrollBy(0, 2000));
        await site.waitForTimeout(2000);

        // 点击可见的新闻标题触发导航事件
        const visible_link = site.locator('a[href]:visible').first();
        if (await visible_link.isVisible({ timeout: 3000 }).catch(() => false)) {
            await visible_link.click().catch(() => {});
            await site.waitForTimeout(3000);
        }

        await site.close();
        await popup.bringToFront();
        await popup.waitForTimeout(1000);

        // 验证标签计数 > 0
        const all_cards = popup.locator('.mcard');
        const card_count = await all_cards.count();
        expect(card_count).toBeGreaterThanOrEqual(7);

        // 至少一个标签有非零计数
        const cards_with_count = popup.locator('.mcard[data-count="1"]');
        const has_count = await cards_with_count.count();
        expect(has_count, 'toutiao.com 滚动+点击后至少一个标签计数 > 0').toBeGreaterThan(0);

        // 停止采集
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();

        await popup.close();
    });

    test('toutiao.com 多页面导航采集', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.toutiao);
        await site.waitForTimeout(3000);

        // 点击多个链接打开新页面
        const links = site.locator('a[href^="http"]:visible');
        const link_count = await links.count();
        if (link_count >= 2) {
            const [new_page] = await Promise.all([
                fix.context.waitForEvent('page', { timeout: 15000 }),
                links.nth(0).click(),
            ]);
            await new_page.waitForLoadState('domcontentloaded');
            await new_page.waitForTimeout(3000);
            await new_page.close();
        }

        await site.close();
        await popup.bringToFront();
        await popup.waitForTimeout(1000);

        // 停止 → 验证完成
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();

        // 验证标签卡片全部存在
        for (const label of REQUIRED_LABELS) {
            await expect(
                popup.locator('.mcard', { hasText: label }),
            ).toBeVisible();
        }

        await popup.close();
    });
});
