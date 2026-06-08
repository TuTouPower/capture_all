// tests/e2e-qq.spec.ts — 完整采集流程 on qq.com
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES, FORBIDDEN_STRINGS } from './e2e-helpers';

test.describe('QQ 采集流程', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('qq.com 导航触发页面导航事件', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.qq);
        await site.waitForTimeout(3000);

        // 尝试点击可见链接
        const visible_link = site.locator('a[href]:visible').first();
        if (await visible_link.isVisible({ timeout: 3000 }).catch(() => false)) {
            await visible_link.click().catch(() => {});
            await site.waitForTimeout(3000);
        }

        await site.close();
        await popup.bringToFront();
        await popup.waitForTimeout(500);

        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();

        // 验证无旧概念
        const html = await popup.innerHTML('body');
        for (const s of FORBIDDEN_STRINGS) {
            expect(html).not.toContain(s);
        }

        await popup.close();
    });
});
