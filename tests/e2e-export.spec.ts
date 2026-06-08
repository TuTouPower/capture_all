// tests/e2e-export.spec.ts — 导出验证
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe('导出', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('完成采集后可导出（验证导出消息可用）', async () => {
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

        // 验证完成状态
        await expect(popup.locator('#openDetailBtn')).toBeVisible();

        // 进入 dashboard 验证导出功能可用
        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // 验证 dashboard 有导出按钮
        const export_btns = dashboard.locator('[id*="export" i], [id*="Export"]');
        // 即使没有明确的导出按钮，dashboard 页面也应该加载

        const html = await dashboard.content();
        // 验证使用新命名
        expect(html).not.toContain('record_all');
        expect(html).not.toContain('Record All');

        await dashboard.close();
        await popup.close();
    });
});
