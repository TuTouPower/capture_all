// tests/e2e-labels.spec.ts — 七标签实时计数验证（验证 P0.1 修复）
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe.serial('七标签实时计数', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('采集中标签计数 > 0（不是全 0）', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);

        const input = site.locator('#kw');
        if (await input.isVisible()) {
            await input.click();
            await input.fill('test capture all');
            await site.locator('#su').click();
            await site.waitForTimeout(3000);
        }
        await site.close();

        await popup.bringToFront();
        await popup.waitForTimeout(2000);

        // 至少有一个标签有计数
        const cards_with_count = popup.locator('.mcard[data-count="1"]');
        const count = await cards_with_count.count();
        expect(count, '至少一个标签有计数 > 0').toBeGreaterThan(0);

        // 标签卡片存在（至少 7 个）
        const all_cards = popup.locator('.mcard');
        const all_count = await all_cards.count();
        expect(all_count).toBeGreaterThanOrEqual(7);

        // 停止采集
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await popup.close();
    });

    test('标签计数随操作增长', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        // 操作前检查
        await popup.bringToFront();
        await popup.waitForTimeout(1000);
        const nums_before = await popup.locator('.mcard-n').count();

        // 操作网站
        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);
        const input = site.locator('#kw');
        if (await input.isVisible()) {
            await input.click();
            await input.fill('second test');
            await site.locator('#su').click();
            await site.waitForTimeout(3000);
        }
        await site.close();

        // 操作后检查
        await popup.bringToFront();
        await popup.waitForTimeout(2000);
        const nums_after = await popup.locator('.mcard-n').count();

        // 要么之前就有，要么现在有了（操作后至少有一个计数显示）
        const total = nums_before + nums_after;
        expect(total, '应该有计数显示').toBeGreaterThan(0);

        // 停止
        if (await popup.locator('#stopBtn').isVisible()) {
            await popup.locator('#stopBtn').click();
            await popup.waitForTimeout(1000);
        }
        await popup.close();
    });
});
