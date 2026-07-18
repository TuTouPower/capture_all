// tests/e2e-baidu.spec.ts — 完整采集流程 on baidu.com
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES, verify_capture_data } from './e2e-helpers';

test.describe('Baidu 完整采集流程', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('开始采集 → 搜索 → 停止 → 查看详情', async () => {
        // 打开 popup 并开始采集
        const popup = await open_popup(fix);
        await popup.waitForTimeout(300);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        // 在百度搜索
        const baidu = await open_site(fix, TEST_SITES.baidu);
        await baidu.waitForTimeout(2000);
        const search_input = baidu.locator('#kw');
        if (await search_input.isVisible()) {
            await search_input.click();
            await search_input.fill('capture all browser extension');
            await baidu.locator('#su').click();
            await baidu.waitForTimeout(4000);
        }

        // 点击搜索结果中的链接触发导航
        const results = baidu.locator('.result h3 a');
        const result_count = await results.count();
        if (result_count > 0) {
            await results.first().click();
            await baidu.waitForTimeout(3000);
        }
        await baidu.close();

        // 回到 popup 停止采集
        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // 验证完成状态
        await expect(popup.locator('.act-done')).toBeVisible();

        // 验证实际采集数据
        const cap_data = await verify_capture_data(popup);
        expect(cap_data.success, 'get_capture_data 应成功').toBe(true);
        expect(cap_data.events, '应有 events 字段').toBeDefined();
        expect(cap_data.network_requests, '应有 network_requests 字段').toBeDefined();
        expect(cap_data.events!.length, '事件数应 > 0').toBeGreaterThan(0);
        expect(cap_data.network_requests!.length, '网络请求数应 > 0').toBeGreaterThan(0);

        // 验证事件结构
        for (const ev of cap_data.events!.slice(0, 10)) {
            expect(ev, '每个事件应有 category').toHaveProperty('category');
            expect(typeof ev.category, 'category 应为 string').toBe('string');
            expect(ev, '每个事件应有 type').toHaveProperty('type');
            expect(typeof ev.type, 'type 应为 string').toBe('string');
            expect(ev, '每个事件应有 relative_time_ms').toHaveProperty('relative_time_ms');
        }
        // 验证网络请求结构
        for (const nr of cap_data.network_requests!.slice(0, 5)) {
            expect(nr, '每个网络请求应有 url').toHaveProperty('url');
            expect(nr, '每个网络请求应有 method').toHaveProperty('method');
            expect(nr, '每个网络请求应有 status_code').toHaveProperty('status_code');
        }

        // 点击「查看详情」进入 dashboard
        const [detail_page] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await detail_page.waitForLoadState('domcontentloaded');
        await detail_page.waitForTimeout(2000);

        // 验证 dashboard 不是空白
        const page_text = await detail_page.evaluate(() => document.body.textContent || '');
        expect(page_text).toBeTruthy();
        expect(page_text.length).toBeGreaterThan(100);

        await detail_page.close();
        await popup.close();
    });

    test('采集后 dashboard 列表有记录', async () => {
        const popup = await open_popup(fix);
        await popup.waitForTimeout(300);

        // 完成一次采集
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);
        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);
        await site.close();
        await popup.bringToFront();
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // 打开 dashboard
        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.evaluate(() => {
                (document.querySelector('#openDetailBtn') as HTMLElement)?.click();
            }),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // 验证 dashboard 可加载
        const html = await dashboard.content();
        expect(html).toContain('Capture All');

        await dashboard.close();
        await popup.close();
    });
});
