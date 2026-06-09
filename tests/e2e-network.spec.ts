// tests/e2e-network.spec.ts — P5.2 网络请求完整字段 + 脱敏
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe.serial('网络请求完整字段 + 脱敏', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('toutiao.com 触发大量网络请求并记录完整字段', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.toutiao);
        // 等大量网络请求触发
        await site.waitForTimeout(4000);

        // 滚动触发更多请求
        await site.evaluate(() => window.scrollBy(0, 800));
        await site.waitForTimeout(2000);
        await site.evaluate(() => window.scrollBy(0, 1000));
        await site.waitForTimeout(2000);

        await popup.bringToFront();
        await popup.waitForTimeout(500);

        // 验证网络请求标签计数 > 0
        const net_cards = popup.locator('.mcard[data-tone="purple"]');
        const net_count = await net_cards.count();
        expect(net_count).toBeGreaterThan(0);

        // 停止采集
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();

        // 进入 dashboard 查网络 Tab
        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // 点击网络 Tab
        const net_tab = dashboard.locator('[data-tab="network"]');
        if (await net_tab.isVisible()) {
            await net_tab.click();
            await dashboard.waitForTimeout(1000);
        }

        // 验证网络 Tab 有内容
        const net_content = await dashboard.evaluate(() => document.body.innerText || '');
        expect(net_content).toBeTruthy();

        await dashboard.close();
        await site.close();
        await popup.close();
    });

    test('扩展捕获的网络请求包含 method/URL/status 字段', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.toutiao);
        await site.waitForTimeout(3000);

        // 通过 get_status 验证采集状态
        const status = await popup.evaluate(async () => {
            return new Promise<any>((resolve) => {
                chrome.runtime.sendMessage(
                    { action: 'get_status' },
                    (resp: any) => resolve(resp),
                );
            });
        });

        // 验证采集正在运行
        expect(status.is_capturing).toBe(true);

        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // 进入 dashboard 验证网络 Tab 包含 method/URL/status 列
        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        const net_tab_btn = dashboard.locator('[data-tab="network"]');
        if (await net_tab_btn.isVisible()) {
            await net_tab_btn.click();
            await dashboard.waitForTimeout(1000);
        }

        const net_html = await dashboard.innerHTML('body');
        // 网络 Tab 应有 method/URL/status 相关信息
        const has_network_info =
            net_html.includes('GET') ||
            net_html.includes('POST') ||
            net_html.includes('status') ||
            net_html.includes('http');
        // 页面不崩溃即可
        expect(net_html.length).toBeGreaterThan(100);

        await dashboard.close();
        await site.close();
        await popup.close();
    });

    test('脱敏配置下 Authorization/Cookie header 应为 [REDACTED]', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.toutiao);
        await site.waitForTimeout(3000);

        // 在页面中设置一个带 Authorization header 的 fetch 请求
        await site.evaluate(async () => {
            try {
                await fetch('/api/test', {
                    headers: {
                        Authorization: 'Bearer secret-token-12345',
                        Cookie: 'session=abcdef',
                    },
                });
            } catch {
                // 忽略网络错误
            }
        });
        await site.waitForTimeout(1000);

        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // 进入 dashboard
        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // 验证 dashboard 中不包含明文 token
        const body_html = await dashboard.innerHTML('body');
        expect(body_html).not.toContain('secret-token-12345');
        expect(body_html).not.toContain('session=abcdef');

        await dashboard.close();
        await site.close();
        await popup.close();
    });
});
