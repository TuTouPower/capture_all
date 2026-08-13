// tests/e2e-realtime-detail.spec.ts — 采集中实时详情 + 停止后详情Tab验证
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe('采集中实时详情 P4.8 — 验证内容实时增长', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('采集中点实时详情 → 验证内容实时增长 → 停止后各Tab有内容', async () => {
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

        // dashboard.ts:1262 已实现 setInterval(2s) 在采集中调 load_detail 刷新。
        // t163 AC-003: 触发确定性新事件后断言严格增长——切到 timeline tab，t1 读取事件数
        const timeline_btn = live_page.locator('[data-tab="timeline"]');
        await timeline_btn.click();
        await live_page.waitForTimeout(1500);
        const ev_count_t1 = await live_page.evaluate(() => {
            return document.querySelectorAll('tr[data-ev]').length;
        });

        // 触发确定性新事件：点击按钮产唯一 console marker（E2E_BTN_CLICKED）
        const test_site = await fix.context.newPage();
        await test_site.goto('http://localhost:17832/test-page.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await test_site.locator('#btn-click').click();
        await test_site.close();

        // 等待 dashboard interval 刷新 + SW flush
        await live_page.waitForTimeout(6000);

        // 重新点 timeline 强制 render_content（保留 tab）
        await timeline_btn.click();
        await live_page.waitForTimeout(800);
        const ev_count_t2 = await live_page.evaluate(() => {
            return document.querySelectorAll('tr[data-ev]').length;
        });
        const marker_visible = await live_page.evaluate(() => {
            return (document.body.textContent || '').includes('E2E_BTN_CLICKED');
        });

        // t163 AC-003: 确定性新事件被采集 → marker 出现 + 事件数严格大于 t1
        expect(marker_visible, '确定性 marker E2E_BTN_CLICKED 应出现在实时详情').toBe(true);
        expect(ev_count_t2, 't2 时间线事件数应严格大于 t1（确定性新事件触发）').toBeGreaterThan(ev_count_t1);

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

        // 停止后再开 detail，SW 已 flush 所有 events 到 IndexedDB
        // 时间线 + 网络必有数据；控制台可能为空（百度不输出 console）
        const detail_timeline_btn = detail_page.locator('[data-tab="timeline"]');
        await detail_timeline_btn.click();
        await detail_page.waitForTimeout(1000);
        const ev_rows = detail_page.locator('tr[data-ev]');
        const ev_count = await ev_rows.count();
        expect(ev_count, '时间线应有事件').toBeGreaterThan(0);

        const network_tab = detail_page.locator('[data-tab="network"]');
        await network_tab.click();
        await detail_page.waitForTimeout(1000);
        const net_rows = detail_page.locator('.net-row:not(.net-head)');
        const net_count = await net_rows.count();
        expect(net_count, '网络Tab应有请求').toBeGreaterThan(0);

        // 控制台 Tab：点击不崩溃即可（百度可能无 console 输出）
        const console_tab = detail_page.locator('[data-tab="console"]');
        await console_tab.click();
        await detail_page.waitForTimeout(1000);
        const con_table = detail_page.locator('.con-table, .dt-list').first();
        if (await con_table.count() > 0) {
            const html = await con_table.innerHTML().catch(() => '');
            expect(html.length, '控制台Tab应正常渲染（含空态）').toBeGreaterThan(0);
        }

        await detail_page.close();
        await popup.close();
    });
});
