// tests/e2e-9223.spec.ts
// E2E tests: launches Chrome with extension on CDP port 9223
import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../dist');

let browser: Awaited<ReturnType<typeof chromium.launchPersistentContext>>;
let extension_id: string;

test.beforeAll(async () => {
    browser = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-first-run',
            '--no-default-browser-check',
        ],
    });

    // Wait for service worker
    const sw = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker', { timeout: 30000 });
    extension_id = sw.url().split('/')[2];
});

test.afterAll(async () => {
    await browser.close();
});

test.describe('Record All on 9223 Chrome', () => {
    test('extension is loaded with correct ID', () => {
        expect(extension_id).toBeTruthy();
        expect(extension_id.length).toBeGreaterThan(10);
    });

    test('popup renders with mode buttons', async () => {
        const page = await browser.newPage();
        await page.goto(`chrome-extension://${extension_id}/popup/popup.html`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('#basicBtn')).toBeVisible();
        await expect(page.locator('#advancedBtn')).toBeVisible();
        await expect(page.locator('#startBtn')).toBeVisible();
        await page.close();
    });

    test('mode selection toggles', async () => {
        const page = await browser.newPage();
        await page.goto(`chrome-extension://${extension_id}/popup/popup.html`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('#basicBtn')).toHaveClass(/selected/);
        await page.locator('#advancedBtn').click();
        await expect(page.locator('#advancedBtn')).toHaveClass(/selected/);
        await page.locator('#basicBtn').click();
        await expect(page.locator('#basicBtn')).toHaveClass(/selected/);
        await page.close();
    });

    test('start and stop recording', async () => {
        const popup = await browser.newPage();
        await popup.goto(`chrome-extension://${extension_id}/popup/popup.html`);
        await popup.waitForLoadState('domcontentloaded');

        // Start
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(1000);
        await expect(popup.locator('#stopBtn')).toBeVisible();
        const status = await popup.locator('.status-text').textContent();
        expect(status).toBe('Recording');

        // Stop
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1000);
        await expect(popup.locator('#startBtn')).toBeVisible();
        await popup.close();
    });

    test('detail page has all tabs', async () => {
        const page = await browser.newPage();
        await page.goto(`chrome-extension://${extension_id}/detail/detail.html?session=test`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('.tab-btn[data-tab="timeline"]')).toBeVisible();
        await expect(page.locator('.tab-btn[data-tab="network"]')).toBeVisible();
        await expect(page.locator('.tab-btn[data-tab="console"]')).toBeVisible();
        await expect(page.locator('.tab-btn[data-tab="events"]')).toBeVisible();
        await page.close();
    });

    test('detail page tab switching', async () => {
        const page = await browser.newPage();
        await page.goto(`chrome-extension://${extension_id}/detail/detail.html?session=test`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('#timeline-tab')).toHaveClass(/active/);
        await page.locator('.tab-btn[data-tab="network"]').click();
        await expect(page.locator('#network-tab')).toHaveClass(/active/);
        await page.locator('.tab-btn[data-tab="events"]').click();
        await expect(page.locator('#events-tab')).toHaveClass(/active/);
        await page.close();
    });

    test('full flow: record -> navigate -> stop -> check history', async () => {
        const popup = await browser.newPage();
        await popup.goto(`chrome-extension://${extension_id}/popup/popup.html`);
        await popup.waitForLoadState('domcontentloaded');

        // Start recording
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(1000);

        // Navigate
        const testPage = await browser.newPage();
        await testPage.goto('https://example.com');
        await testPage.waitForLoadState('domcontentloaded');
        await testPage.mouse.click(100, 100);
        await testPage.waitForTimeout(2000);

        // Stop
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(3000); // Wait for flush

        // Check history
        const items = popup.locator('.history-item');
        const count = await items.count();
        expect(count).toBeGreaterThanOrEqual(1);

        // Get session ID and open detail
        const sessionId = await items.first().getAttribute('data-id');
        const detail = await browser.newPage();
        await detail.goto(`chrome-extension://${extension_id}/detail/detail.html?session=${sessionId}`);
        await detail.waitForLoadState('domcontentloaded');
        await detail.waitForTimeout(3000); // Wait for data load

        // Check timeline has events
        const events = detail.locator('.timeline-item');
        const eventCount = await events.count();
        expect(eventCount).toBeGreaterThan(0);

        await testPage.close();
        await detail.close();
        await popup.close();
    });
});
