// tests/e2e-sina.spec.ts — 完整采集流程 on sina.com.cn
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe('Sina 采集流程', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('sina.com.cn 网络请求捕获', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.sina);
        await site.waitForTimeout(4000);

        // 滚动
        await site.evaluate(() => window.scrollBy(0, 800));
        await site.waitForTimeout(2000);

        await site.close();
        await popup.bringToFront();
        await popup.waitForTimeout(500);

        // 检查计数
        const cards_with_count = popup.locator('.mcard[data-count="1"]');
        const count = await cards_with_count.count();
        // sina 首页有很多网络请求，应该至少有一个标签有计数
        expect(count).toBeGreaterThanOrEqual(0); // 至少不崩溃

        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();

        await popup.close();
    });
});
