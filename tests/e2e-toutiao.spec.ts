// tests/e2e-toutiao.spec.ts — 完整采集流程 on toutiao.com
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe('Toutiao 采集流程', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('toutiao.com 滚动触发事件', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.toutiao);
        await site.waitForTimeout(3000);

        // 滚动触发 scroll 事件
        await site.evaluate(() => window.scrollBy(0, 500));
        await site.waitForTimeout(1000);
        await site.evaluate(() => window.scrollBy(0, 1000));
        await site.waitForTimeout(1000);

        await site.close();
        await popup.bringToFront();
        await popup.waitForTimeout(500);

        // 停止
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();

        await popup.close();
    });
});
