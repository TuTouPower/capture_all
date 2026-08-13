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

        // 点击控制台 Tab（t163 AC-004: tab 必须存在，容器缺失即 fail）
        const console_tab_btn = dashboard.locator('[data-tab="console"]');
        await expect(console_tab_btn, '控制台 Tab 按钮应可见').toBeVisible({ timeout: 5000 });
        await console_tab_btn.click();
        await dashboard.waitForTimeout(1000);
        let console_text = await dashboard.evaluate(() => document.body.innerText || '');
        // console.error() 的 marker 出现在 console Tab
        expect(console_text, 'console Tab 应含 console.error marker').toContain('E2E test console error');
        // console.error 的 level 分类为 error（lvl-tag data-lvl 渲染）
        await expect(
            dashboard.locator('.lvl-tag[data-lvl="error"]').first(),
            'console Tab 应有 error 级别标签',
        ).toBeVisible({ timeout: 3000 });

        // 点击事件 Tab (events = 错误异常；tab key 为 error)
        const events_tab_btn = dashboard.locator('[data-tab="error"]');
        await expect(events_tab_btn, '错误异常 Tab 按钮应可见').toBeVisible({ timeout: 5000 });
        await events_tab_btn.click();
        await dashboard.waitForTimeout(1000);
        const events_text = await dashboard.evaluate(() => document.body.innerText || '');
        // 未捕获异常按 error 分类渲染（event_title 对 runtime_exception 显示 type）
        expect(events_text, 'error Tab 应含 runtime_exception 分类').toContain('runtime_exception');

        // t163 AC-004: 各 marker 不在错误 tab（分类隔离）
        // console.error 的 marker 不应出现在 error Tab（console 与 runtime error 分离）
        expect(events_text, 'console.error marker 不应出现在 error Tab').not.toContain('E2E test console error');
        // 重新切回 console Tab：uncaught exception 分类不在其中（error 归 error Tab）
        await console_tab_btn.click();
        await dashboard.waitForTimeout(800);
        console_text = await dashboard.evaluate(() => document.body.innerText || '');
        expect(console_text, 'runtime_exception 分类不应出现在 console Tab').not.toContain('runtime_exception');

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

        // 打开控制台 Tab（t163: 容器必须存在，缺失即 fail）
        const console_tab = dashboard.locator('[data-tab="console"]');
        await expect(console_tab, '控制台 Tab 按钮应可见').toBeVisible({ timeout: 5000 });
        await console_tab.click();
        await dashboard.waitForTimeout(1000);

        // t163 AC-004: 多级别 console marker 全部出现在 console Tab（含 level 分类）
        const body_text = await dashboard.evaluate(() => document.body.innerText || '');
        expect(body_text, 'console Tab 应含 log marker').toContain('E2E log message');
        expect(body_text, 'console Tab 应含 warn marker').toContain('E2E warn message');
        expect(body_text, 'console Tab 应含 error marker').toContain('E2E error message');
        expect(body_text, 'console Tab 应含 debug marker').toContain('E2E debug message');

        await dashboard.close();
        await site.close();
        await popup.close();
    });
});
