// tests/e2e-real.spec.ts — Real extension E2E (uses shared helpers)
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

let fix: Awaited<ReturnType<typeof launch_extension>>;
let extension_id: string;

test.beforeAll(async () => {
    fix = await launch_extension();
    extension_id = fix.extension_id;
});

test.afterAll(async () => {
    await fix.context.close();
});

test.describe('Capture All — Real Extension', () => {
    test('popup renders with start button', async () => {
        const popup = await open_popup(fix);
        await expect(popup.locator('#startBtn')).toBeVisible();
        await expect(popup.locator('#startBtn')).toBeVisible();
        await popup.close();
    });

    test('start and stop recording flow', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(1000);

        await expect(popup.locator('#stopBtn')).toBeVisible();

        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1000);

        await expect(popup.locator('#newBtn')).toBeVisible();
        await popup.close();
    });

    test('dashboard loads', async () => {
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded' });
        await dashboard.waitForTimeout(1000);

        const html = await dashboard.content();
        expect(html).toContain('Capture All');
        await dashboard.close();
    });

    test('IBM Plex Sans + Mono 字体已加载', async () => {
        const popup = await open_popup(fix);
        await popup.waitForTimeout(500);

        // 等待所有字体就绪
        await popup.evaluate(() => document.fonts.ready);

        const sans_ok = await popup.evaluate(() =>
            document.fonts.check('12px "IBM Plex Sans"'));
        const mono_ok = await popup.evaluate(() =>
            document.fonts.check('12px "IBM Plex Mono"'));

        expect(sans_ok, '"IBM Plex Sans" 字体应已加载').toBe(true);
        expect(mono_ok, '"IBM Plex Mono" 字体应已加载').toBe(true);

        // 确认实际渲染使用了正确字体
        const body_font = await popup.evaluate(() =>
            window.getComputedStyle(document.body).fontFamily);
        expect(body_font).toContain('IBM Plex Sans');

        await popup.close();
    });

    test('full recording flow: start → navigate → stop → check recent', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(1000);

        // Navigate to a page while recording
        const test_page = await open_site(fix, TEST_SITES.baidu);
        await test_page.waitForTimeout(3000);
        await test_page.close();

        // Stop recording
        await popup.bringToFront();
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // Check done state
        await expect(popup.locator('#newBtn')).toBeVisible();
        await popup.close();
    });
});
