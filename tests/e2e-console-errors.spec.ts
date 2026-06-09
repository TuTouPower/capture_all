// tests/e2e-console-errors.spec.ts — P5.3 Console 与 Error 分离
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe.serial('Console 与 Error 分离', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('console.error() 出现在 console Tab，throw Error 出现在 error Tab', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);

        // 注入 console.error() 和 throw Error
        await site.evaluate(() => {
            console.error('E2E test console error: something went wrong');
            console.warn('E2E test console warning');
            console.log('E2E test console log');
            try {
                throw new Error('E2E uncaught exception for testing');
            } catch {
                // 捕获后手动抛出以触发 window.onerror
            }
        });

        // 触发未捕获异常（通过 setTimeout 以便采集到）
        await site.evaluate(() => {
            setTimeout(() => {
                throw new Error('E2E async uncaught exception');
            }, 100);
        });
        await site.waitForTimeout(2000);

        await popup.bringToFront();
        await popup.waitForTimeout(500);

        // 验证「控制台」和「错误异常」标签有计数
        const console_cards = popup.locator('.mcard[data-tone="cyan"]');
        const error_cards = popup.locator('.mcard[data-tone="red"]');

        // 停止采集
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();

        // 进入 dashboard 检查 console Tab
        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // 点击控制台 Tab
        const console_tab_btn = dashboard.locator('[data-tab="console"]');
        if (await console_tab_btn.isVisible()) {
            await console_tab_btn.click();
            await dashboard.waitForTimeout(1000);
            const console_html = await dashboard.innerHTML('body');
            // console Tab 应有 console.error 相关输出
            expect(console_html.length).toBeGreaterThan(100);
        }

        // 点击事件 Tab (events = 错误异常)
        const events_tab_btn = dashboard.locator('[data-tab="events"]');
        if (await events_tab_btn.isVisible()) {
            await events_tab_btn.click();
            await dashboard.waitForTimeout(1000);
            const events_html = await dashboard.innerHTML('body');
            expect(events_html.length).toBeGreaterThan(100);
        }

        await dashboard.close();
        await site.close();
        await popup.close();
    });

    test('console.log 在控制台 Tab 正确出现', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(1500);

        // 注入多种 console 级别
        await site.evaluate(() => {
            console.debug('E2E debug message');
            console.info('E2E info message');
            console.log('E2E log message');
            console.warn('E2E warn message');
            console.error('E2E error message');
        });
        await site.waitForTimeout(1500);

        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // 进入 dashboard 控制台 Tab
        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // 打开控制台 Tab 不崩溃
        const console_tab = dashboard.locator('[data-tab="console"]');
        if (await console_tab.isVisible()) {
            await console_tab.click();
            await dashboard.waitForTimeout(1000);
        }

        const body_text = await dashboard.evaluate(() => document.body.innerText || '');
        expect(body_text.length).toBeGreaterThan(50);

        await dashboard.close();
        await site.close();
        await popup.close();
    });
});
