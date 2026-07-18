// tests/e2e-stop.spec.ts — 停止采集按钮验证（验证 P0.2 修复）
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe.serial('停止采集', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('点击停止 → 进入完成状态', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);
        await site.close();
        await popup.bringToFront();
        await popup.waitForTimeout(500);

        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        await expect(popup.locator('.act-done')).toBeVisible({ timeout: 5000 });
        await expect(popup.locator('#newBtn')).toBeVisible();
        await popup.close();
    });

    test('立即停止（0 事件）→ 正常完成', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        await expect(popup.locator('.act-done')).toBeVisible({ timeout: 5000 });
        await popup.close();
    });

    test('连续 3 次开始-停止循环', async () => {
        const popup = await open_popup(fix);

        for (let i = 0; i < 3; i++) {
            await popup.locator('#startBtn').click();
            await popup.waitForTimeout(500);
            const site = await open_site(fix, TEST_SITES.baidu);
            await site.waitForTimeout(1000);
            await site.close();
            await popup.bringToFront();
            await popup.waitForTimeout(300);
            await popup.locator('#stopBtn').click();
            await popup.waitForTimeout(1500);

            await expect(popup.locator('.act-done')).toBeVisible({ timeout: 5000 });

            // 开始新采集
            await popup.locator('#newBtn').click();
            await popup.waitForTimeout(500);
            await expect(popup.locator('#startBtn')).toBeVisible({ timeout: 3000 });
        }

        await popup.close();
    });
});
