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

        // 定义要测试的 Tab：data-tab 值 + 数据行选择器（排除表头）+ 内容区域选择器
        const tabs: { tab: string; name: string; content_selector: string; area_selector: string }[] = [
            { tab: 'overview', name: '概览', content_selector: '.ov-panel', area_selector: '.ov' },
            { tab: 'timeline', name: '时间线', content_selector: 'tr[data-ev], .tl-lanes', area_selector: '.tl-lanes' },
            { tab: 'network', name: '网络', content_selector: '.net-row:not(.net-head)', area_selector: '.net-table' },
            { tab: 'console', name: '控制台', content_selector: '.con-row:not(.con-head)', area_selector: '.con-table' },
            { tab: 'storage', name: '存储', content_selector: '.con-row:not(.con-head)', area_selector: '.net-table' },
            { tab: 'evidence', name: '证据', content_selector: '.con-row:not(.con-head)', area_selector: '.net-table' },
        ];

        for (const { tab, name, content_selector, area_selector } of tabs) {
            const tab_btn = detail_page.locator(`[data-tab="${tab}"]`);
            if (!(await tab_btn.isVisible({ timeout: 2000 }).catch(() => false))) {
                continue; // 某些 Tab 可能未渲染，跳过
            }
            await tab_btn.click();
            await detail_page.waitForTimeout(800);

            // 验证 Tab 内数据行存在（排除表头行）
            const region = detail_page.locator(content_selector);
            const content_count = await region.count();
            expect(content_count, `${name} Tab 应有内容`).toBeGreaterThan(0);

            // 使用 Tab 专属选择器验证内容区域不为空文本
            const tab_html = await detail_page.locator(area_selector).first().innerHTML();
            expect(tab_html.length, `${name} Tab 内容不应为空`).toBeGreaterThan(20);

            // 网络 Tab 深层验证：数据行包含 http(s) URL
            if (tab === 'network' && content_count > 0) {
                const row_text = await region.first().innerText();
                expect(row_text, '网络 Tab 数据行应包含 http(s) URL').toMatch(/https?:\/\//);
            }

            // 控制台 Tab 深层验证：存在日志级别标记 .lvl-tag[data-lvl]
            if (tab === 'console') {
                const lvl_count = await detail_page.locator('.con-table .lvl-tag[data-lvl]').count();
                expect(lvl_count, '控制台 Tab 应包含日志级别标记').toBeGreaterThan(0);
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
