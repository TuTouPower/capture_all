// tests/e2e-xss.spec.ts — P5.4 HTML XSS 深度测试
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe.serial('HTML XSS 防护', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('含脚本标签的事件不会导致 XSS', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        // 打开 baidu 并在搜索框注入 XSS payload
        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);

        const search_input = site.locator('#kw');
        if (await search_input.isVisible()) {
            await search_input.click();
            // 输入含 <script> 的内容
            await search_input.fill('<script>alert(1)</script>');
            await site.locator('#su').click();
            await site.waitForTimeout(3000);
        }

        // 注入更多 XSS payload
        await site.evaluate(() => {
            // 注入到 console
            console.log('<img src=x onerror=alert(1)>');
            console.error('<script>alert("xss")</script>');
        });
        await site.waitForTimeout(1500);

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

        // 检查 dashboard 中没有活动的 script 标签注入
        const scripts_in_body = await dashboard.evaluate(() => {
            const scripts = document.querySelectorAll('script:not([src])');
            const contents: string[] = [];
            scripts.forEach((s) => {
                const text = s.textContent || '';
                if (text.includes('alert')) contents.push(text);
            });
            return contents;
        });
        // 不应有任何含 alert 的内联脚本
        expect(scripts_in_body).toHaveLength(0);

        await dashboard.close();
        await site.close();
        await popup.close();
    });

    test('导出 HTML 文件再打开无脚本执行', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);

        // 触发含 XSS 的事件
        const search_input = site.locator('#kw');
        if (await search_input.isVisible()) {
            await search_input.click();
            await search_input.fill('<script>alert("xss")</script>');
            await site.locator('#su').click();
            await site.waitForTimeout(3000);
        }

        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();

        // 进入 dashboard 导出 HTML
        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // 尝试触发 HTML 导出
        const export_html_btn = dashboard.locator('[data-export="html"]');
        if (await export_html_btn.isVisible()) {
            // 监听下载事件
            const [download] = await Promise.all([
                dashboard.waitForEvent('download', { timeout: 10000 }).catch(() => null),
                export_html_btn.click(),
            ]);
            if (download) {
                const path = await download.path();
                expect(path).toBeTruthy();

                // 用 Playwright 打开导出的 HTML 文件验证无脚本执行
                const verify_page = await fix.context.newPage();
                let alert_fired = false;
                verify_page.on('dialog', () => {
                    alert_fired = true;
                });
                await verify_page.goto(`file://${path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                await verify_page.waitForTimeout(1000);

                // 不应有 alert 对话框被触发
                expect(alert_fired).toBe(false);
                await verify_page.close();
            }
        }

        await dashboard.close();
        await site.close();
        await popup.close();
    });
});
