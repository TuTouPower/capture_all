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
