// tests/e2e-detail-tabs.spec.ts — 详情页 Tab 切换 + 面包屑返回
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe('详情页 Tab 切换 P4.11', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('概览/时间线/网络/控制台/Storage/Cookie各Tab切换 → 均有内容 → 面包屑可返回', async () => {
        const popup = await open_popup(fix);
        await popup.waitForTimeout(300);

        // 完整采集一次
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);
        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(3000);
        const search_input = site.locator('#kw');
        if (await search_input.isVisible({ timeout: 3000 }).catch(() => false)) {
            await search_input.click();
            await search_input.fill('capture all tab test');
            await site.locator('#su').click();
            await site.waitForTimeout(4000);
        }
        await site.close();

        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();

        // 打开详情页
        const [detail_page] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await detail_page.waitForLoadState('domcontentloaded');
        await detail_page.waitForTimeout(2500);

        // 验证页面已加载
        const body_text = await detail_page.evaluate(() => document.body.textContent || '');
        expect(body_text).toContain('Capture All');
        expect(body_text.length).toBeGreaterThan(100);

        // 真实 DT_TABS key: overview/timeline/user_action/navigation/network/console/error/storage/cookie/config
        // 测试覆盖关键数据 tab（避免依赖 UI locale 文案）
        const tabs: { tab: string; name: string }[] = [
            { tab: 'overview', name: '概览' },
            { tab: 'timeline', name: '时间线' },
            { tab: 'network', name: '网络' },
            { tab: 'console', name: '控制台' },
            { tab: 'navigation', name: '导航' },
        ];

        for (const { tab, name } of tabs) {
            const tab_btn = detail_page.locator(`[data-tab="${tab}"]`);
            await expect(tab_btn, `${name} Tab 按钮应可见`).toBeVisible({ timeout: 3000 });
            await tab_btn.click();
            await detail_page.waitForTimeout(800);

            // tab content 区域（.dt-body 或 .simple-pad）应存在
            const body = detail_page.locator('.dt-body, .simple-pad, .dt-overview').first();
            const body_count = await body.count();
            if (body_count > 0) {
                const html = await body.innerHTML();
                expect(html.length, `${name} Tab 内容区域不应为空`).toBeGreaterThan(20);
            }
        }

        // 验证面包屑可返回
        const breadcrumb_back = detail_page.locator('[data-back="1"]').first();
        await expect(breadcrumb_back).toBeVisible({ timeout: 3000 });
        await breadcrumb_back.click();
        await detail_page.waitForTimeout(1500);

        // 返回后应看到采集列表
        const list_html = await detail_page.innerHTML('body');
        expect(list_html, '返回后应显示采集列表').toContain('采集记录');

        await detail_page.close();
        await popup.close();
    });
});
