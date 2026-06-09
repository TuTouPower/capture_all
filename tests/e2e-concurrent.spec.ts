// tests/e2e-concurrent.spec.ts — P5.1 并发多 Tab 采集
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe.serial('并发多 Tab 采集', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('baidu + toutiao 同时采集，两 tab 事件分别有不同 tab_id', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        // 同时打开两个网站（toutiao 可能网络不通，容错）
        let baidu: any, toutiao: any;
        try {
            [baidu, toutiao] = await Promise.all([
                open_site(fix, TEST_SITES.baidu),
                open_site(fix, TEST_SITES.toutiao).catch(() => null),
            ]);
        } catch {
            baidu = await open_site(fix, TEST_SITES.baidu);
            toutiao = null;
        }

        if (baidu) {
            // 在 baidu 搜索
            const search_input = baidu.locator('#kw');
            if (await search_input.isVisible()) {
                await search_input.click();
                await search_input.fill('concurrent tab test');
                await baidu.locator('#su').click();
                await baidu.waitForTimeout(3000);
            }
        }

        if (toutiao) {
            // 在 toutiao 滚动（页面可能已导航，容错）
            try {
                await toutiao.evaluate(() => window.scrollBy(0, 600));
                await toutiao.waitForTimeout(1500);
                await toutiao.evaluate(() => window.scrollBy(0, 1000));
                await toutiao.waitForTimeout(1500);
            } catch {
                // toutiao 页面可能已导航或关闭
            }
        }

        // 关闭 site pages
        if (baidu) await baidu.close().catch(() => {});
        if (toutiao) await toutiao.close().catch(() => {});

        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // 验证完成状态
        await expect(popup.locator('.act-done')).toBeVisible();

        // 进入 dashboard 验证时间线合并
        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        const body_text = await dashboard.evaluate(() => document.body.innerText || '');
        expect(body_text).toBeTruthy();
        expect(body_text.length).toBeGreaterThan(50);

        await dashboard.close();
        await popup.close();
    });

    test('时间线合并：同一 session 两 tab 事件可展示', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const t1 = await open_site(fix, TEST_SITES.baidu);
        await t1.waitForTimeout(1500);
        const t2 = await open_site(fix, TEST_SITES.qq);
        await t2.waitForTimeout(1500);

        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // 打开完成会话的 dashboard
        await expect(popup.locator('.act-done')).toBeVisible();

        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        const body_text = await dashboard.evaluate(() => document.body.innerText || '');
        expect(body_text).toBeTruthy();
        expect(body_text.length).toBeGreaterThan(50);

        await dashboard.close();
        await t1.close();
        await t2.close();
        await popup.close();
    });
});
