// tests/e2e-qq.spec.ts — 完整采集流程 on qq.com
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES, FORBIDDEN_STRINGS, REQUIRED_LABELS, verify_capture_data } from './e2e-helpers';

test.describe('QQ 采集流程', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('qq.com 页面导航 + 链接触发事件', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.qq);
        await site.waitForTimeout(3000);

        // 尝试点击可见链接触发导航
        const visible_link = site.locator('a[href]:visible').first();
        if (await visible_link.isVisible({ timeout: 3000 }).catch(() => false)) {
            await visible_link.click().catch(() => {});
            await site.waitForTimeout(3000);
        }

        // 滚动触发更多事件
        await site.evaluate(() => window.scrollBy(0, 600));
        await site.waitForTimeout(1000);
        await site.evaluate(() => window.scrollBy(0, 1200));
        await site.waitForTimeout(2000);

        await site.close();
        await popup.bringToFront();
        await popup.waitForTimeout(1000);

        // 验证至少一个标签有计数
        const cards_with_count = popup.locator('.mcard[data-count="1"]');
        const count = await cards_with_count.count();
        expect(count, 'qq.com 导航+滚动后至少一个标签计数 > 0').toBeGreaterThan(0);

        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();

        // 验证实际采集数据
        const cap_data = await verify_capture_data(popup);
        expect(cap_data.success, 'get_capture_data 应成功').toBe(true);
        expect(cap_data.events!.length, '事件数应 > 0').toBeGreaterThan(0);
        expect(cap_data.network_requests!.length, '网络请求数应 > 0').toBeGreaterThan(0);
        for (const ev of cap_data.events!.slice(0, 10)) {
            expect(ev).toHaveProperty('category');
            expect(ev).toHaveProperty('type');
            expect(ev).toHaveProperty('relative_time_ms');
        }
        for (const nr of cap_data.network_requests!.slice(0, 5)) {
            expect(nr).toHaveProperty('url');
            expect(nr).toHaveProperty('method');
            expect(nr).toHaveProperty('status_code');
        }

        // 验证无旧概念
        const html = await popup.innerHTML('body');
        for (const s of FORBIDDEN_STRINGS) {
            expect(html).not.toContain(s);
        }

        await popup.close();
    });

    test('qq.com 多次链接导航 + 标签完整性', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.qq);
        await site.waitForTimeout(3000);

        // 点击多个链接
        const links = site.locator('a[href]:visible');
        const link_cnt = await links.count();
        for (let i = 0; i < Math.min(link_cnt, 3); i++) {
            try {
                const [new_page] = await Promise.all([
                    fix.context.waitForEvent('page', { timeout: 10000 }),
                    links.nth(i).click(),
                ]);
                await new_page.waitForLoadState('domcontentloaded');
                await new_page.waitForTimeout(2000);
                await new_page.close();
            } catch {
                // 部分链接可能不会打开新页面，跳过
            }
        }

        await site.close();
        await popup.bringToFront();
        await popup.waitForTimeout(1000);

        // 停止采集
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // 验证 7 个标签全部存在
        for (const label of REQUIRED_LABELS) {
            await expect(
                popup.locator('.mcard', { hasText: label }),
            ).toBeVisible();
        }

        // 验证完成状态元素
        await expect(popup.locator('.act-done')).toBeVisible();
        await expect(popup.locator('#openDetailBtn')).toBeVisible();
        await expect(popup.locator('#newBtn')).toBeVisible();

        await popup.close();
    });
});
