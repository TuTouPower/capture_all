// tests/e2e-real.spec.ts
// Real E2E: launches Chrome with the extension loaded
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

    // Wait for service worker and get extension ID
    const sw = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
    extension_id = sw.url().split('/')[2];
});

test.afterAll(async () => {
    await browser.close();
});

test.describe('Record All - Real Extension', () => {
    test('popup renders with mode buttons and start button', async () => {
        const popup = await browser.newPage();
        await popup.goto(`chrome-extension://${extension_id}/popup/popup.html`);
        await popup.waitForLoadState('domcontentloaded');

        await expect(popup.locator('#basicBtn')).toBeVisible();
        await expect(popup.locator('#advancedBtn')).toBeVisible();
        await expect(popup.locator('#startBtn')).toBeVisible();
        await expect(popup.locator('#startBtn')).toHaveText('Start Recording');

        // Default mode is basic
        await expect(popup.locator('#basicBtn')).toHaveClass(/selected/);
        await expect(popup.locator('#advancedBtn')).not.toHaveClass(/selected/);

        await popup.close();
    });

    test('mode selection toggles', async () => {
        const popup = await browser.newPage();
        await popup.goto(`chrome-extension://${extension_id}/popup/popup.html`);
        await popup.waitForLoadState('domcontentloaded');

        await popup.locator('#advancedBtn').click();
        await expect(popup.locator('#advancedBtn')).toHaveClass(/selected/);
        await expect(popup.locator('#basicBtn')).not.toHaveClass(/selected/);

        await popup.locator('#basicBtn').click();
        await expect(popup.locator('#basicBtn')).toHaveClass(/selected/);

        await popup.close();
    });

    test('start recording in basic mode', async () => {
        const popup = await browser.newPage();
        await popup.goto(`chrome-extension://${extension_id}/popup/popup.html`);
        await popup.waitForLoadState('domcontentloaded');

        // Click start
        await popup.locator('#startBtn').click();

        // Wait for recording state
        await popup.waitForTimeout(1000);

        // Stop button should be visible
        await expect(popup.locator('#stopBtn')).toBeVisible();
        await expect(popup.locator('#startBtn')).not.toBeVisible();

        // Status should show recording
        const statusText = await popup.locator('.status-text').textContent();
        expect(statusText).toBe('Recording');

        // Stop
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(500);

        // Back to ready state
        await expect(popup.locator('#startBtn')).toBeVisible();

        await popup.close();
    });

    test('detail page loads with tabs', async () => {
        const detail = await browser.newPage();
        await detail.goto(`chrome-extension://${extension_id}/detail/detail.html?session=test`);
        await detail.waitForLoadState('domcontentloaded');

        await expect(detail.locator('.tab-btn[data-tab="timeline"]')).toBeVisible();
        await expect(detail.locator('.tab-btn[data-tab="network"]')).toBeVisible();
        await expect(detail.locator('.tab-btn[data-tab="console"]')).toBeVisible();
        await expect(detail.locator('.tab-btn[data-tab="events"]')).toBeVisible();
        await expect(detail.locator('#exportJsonBtn')).toBeVisible();

        await detail.close();
    });

    test('detail page tab switching', async () => {
        const detail = await browser.newPage();
        await detail.goto(`chrome-extension://${extension_id}/detail/detail.html?session=test`);
        await detail.waitForLoadState('domcontentloaded');

        // Timeline active by default
        await expect(detail.locator('#timeline-tab')).toHaveClass(/active/);

        // Switch to network
        await detail.locator('.tab-btn[data-tab="network"]').click();
        await expect(detail.locator('#network-tab')).toHaveClass(/active/);
        await expect(detail.locator('#timeline-tab')).not.toHaveClass(/active/);

        // Switch to console
        await detail.locator('.tab-btn[data-tab="console"]').click();
        await expect(detail.locator('#console-tab')).toHaveClass(/active/);

        // Switch to events
        await detail.locator('.tab-btn[data-tab="events"]').click();
        await expect(detail.locator('#events-tab')).toHaveClass(/active/);

        await detail.close();
    });

    test('full recording flow: start -> navigate -> stop -> check session', async () => {
        // Open popup and start recording
        const popup = await browser.newPage();
        await popup.goto(`chrome-extension://${extension_id}/popup/popup.html`);
        await popup.waitForLoadState('domcontentloaded');
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(1000);

        // Navigate to a page while recording
        const testPage = await browser.newPage();
        await testPage.goto('https://example.com');
        await testPage.waitForLoadState('domcontentloaded');
        await testPage.waitForTimeout(2000);

        // Stop recording
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1000);

        // Check history list has at least one session
        const historyItems = popup.locator('.history-item');
        const count = await historyItems.count();
        expect(count).toBeGreaterThanOrEqual(1);

        // Check status is back to ready
        const statusText = await popup.locator('.status-text').textContent();
        expect(statusText).toBe('Ready');

        await testPage.close();
        await popup.close();
    });
});
