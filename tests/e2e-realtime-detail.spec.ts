// tests/e2e-realtime-detail.spec.ts — 采集中实时详情 + 停止后详情Tab验证
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe('采集中实时详情 P4.8', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('采集中点实时详情 → 页面可加载 → 停止后各Tab有内容', async () => {
        const popup = await open_popup(fix);
        await popup.waitForTimeout(300);

        // 开始采集
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        // 在百度搜索触发大量事件
        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(3000);
        const search_input = site.locator('#kw');
        if (await search_input.isVisible({ timeout: 3000 }).catch(() => false)) {
            await search_input.click();
            await search_input.fill('capture all e2e test');
            await site.locator('#su').click();
            await site.waitForTimeout(4000);
        }
        await site.close();

        // 回到 popup 点击「实时详情」
        await popup.bringToFront();
        await popup.waitForTimeout(300);
        const live_detail_btn = popup.locator('#liveDetailBtn');
        await expect(live_detail_btn).toBeVisible({ timeout: 5000 });

        const [live_page] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 15000 }),
            live_detail_btn.click(),
        ]);
        await live_page.waitForLoadState('domcontentloaded');
        await live_page.waitForTimeout(2000);

        // 验证实时详情页面可加载（不为空白）
        const live_text = await live_page.evaluate(() => document.body.textContent || '');
        expect(live_text).toContain('Capture All');
        expect(live_text.length).toBeGreaterThan(100);
        await live_page.close();

        // 停止采集
        await popup.bringToFront();
        await popup.waitForTimeout(300);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(2000);
        await expect(popup.locator('.act-done')).toBeVisible();

        // 重新打开详情页（停止后事件已 flush 到 IndexedDB）
        const [detail_page] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await detail_page.waitForLoadState('domcontentloaded');
        await detail_page.waitForTimeout(2500);

        // 验证 dashboard 已加载
        const body_text = await detail_page.evaluate(() => document.body.textContent || '');
        expect(body_text).toContain('Capture All');
        expect(body_text.length).toBeGreaterThan(100);

        // 验证时间线 Tab 有事件
        const ev_rows = detail_page.locator('tr[data-ev]');
        const ev_count = await ev_rows.count();
        expect(ev_count, '时间线应有事件').toBeGreaterThan(0);

        // 切换到网络 Tab
        const network_tab = detail_page.locator('[data-tab="network"]');
        await network_tab.click();
        await detail_page.waitForTimeout(1000);
        const net_rows = detail_page.locator('.net-row:not(.net-head)');
        const net_count = await net_rows.count();
        expect(net_count, '网络Tab应有请求').toBeGreaterThan(0);

        // 切换到控制台 Tab
        const console_tab = detail_page.locator('[data-tab="console"]');
        await console_tab.click();
        await detail_page.waitForTimeout(1000);
        // 控制台日志取决于页面行为，至少验证 Tab 区域渲染正常
        const console_html = await detail_page.locator('.dt-list, .con, .con-table').first().innerHTML().catch(() => '');
        expect(console_html.length, '控制台Tab应正常渲染').toBeGreaterThan(20);

        await detail_page.close();
        await popup.close();
    });
});
