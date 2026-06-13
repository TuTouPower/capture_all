// tests/e2e-cdp-capture.spec.ts
// E2E tests: extension-loaded Chrome recording + body capture verification
import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../artifacts/dist');

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

    const sw = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker', { timeout: 30000 });
    extension_id = sw.url().split('/')[2];
});

test.afterAll(async () => {
    await browser.close();
});

test.describe('CDP Capture - extension smoke', () => {
    test('extension is loaded with correct ID', () => {
        expect(extension_id).toBeTruthy();
        expect(extension_id.length).toBeGreaterThan(10);
    });

    test('popup renders with mode buttons', async () => {
        const page = await browser.newPage();
        await page.goto(`chrome-extension://${extension_id}/src/popup/popup.html`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('#basicBtn')).toBeVisible();
        await expect(page.locator('#advancedBtn')).toBeVisible();
        await expect(page.locator('#startBtn')).toBeVisible();
        await page.close();
    });

    test('start and stop recording', async () => {
        const popup = await browser.newPage();
        await popup.goto(`chrome-extension://${extension_id}/src/popup/popup.html`);
        await popup.waitForLoadState('domcontentloaded');

        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(1000);
        await expect(popup.locator('#stopBtn')).toBeVisible();
        const status = await popup.locator('.status-text').textContent();
        expect(status).toBe('Recording');

        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1000);
        await expect(popup.locator('#startBtn')).toBeVisible();
        await popup.close();
    });
});

test.describe('CDP Capture - recording with body capture', () => {
    test('record site, verify body_capture_mode is set', async () => {
        const popup = await browser.newPage();
        await popup.goto(`chrome-extension://${extension_id}/src/popup/popup.html`);
        await popup.waitForLoadState('domcontentloaded');

        // Start recording
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(1000);

        // Open a test page with rich content that generates network requests
        const testPage = await browser.newPage();
        await testPage.route('https://example.com/**', async route => {
            const url = route.request().url();
            if (url === 'https://example.com/' || url === 'https://example.com') {
                await route.fulfill({
                    contentType: 'text/html',
                    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test Page</title>
  <link rel="stylesheet" href="https://example.com/style.css">
</head>
<body>
  <h1>CDP Body Capture Test</h1>
  <p id="intro">This page exercises the extension's network capture.</p>
  <button id="btn-click">Click Me</button>
  <img src="https://example.com/logo.png" alt="logo" width="100" height="100">
  <script src="https://example.com/app.js"></script>
  <script>
    document.getElementById('btn-click').addEventListener('click', function () {
      document.getElementById('intro').textContent = 'Clicked!';
    });
    fetch('https://example.com/data.json').catch(function () {});
  </script>
</body>
</html>`,
                });
            } else if (url === 'https://example.com/style.css') {
                await route.fulfill({
                    contentType: 'text/css',
                    body: 'body { font-family: sans-serif; color: #333; } h1 { color: #3b82f6; }',
                });
            } else if (url === 'https://example.com/app.js') {
                await route.fulfill({
                    contentType: 'application/javascript',
                    body: 'console.log("CDP capture test script loaded");',
                });
            } else if (url === 'https://example.com/logo.png') {
                await route.fulfill({
                    contentType: 'image/png',
                    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
                });
            } else {
                await route.fulfill({
                    contentType: 'application/json',
                    body: '{"status":"ok","message":"mock response"}',
                });
            }
        });
        await testPage.goto('https://example.com');
        await testPage.waitForLoadState('networkidle');
        await testPage.waitForTimeout(1000);

        // Interact with the page to generate user events
        const btn = testPage.locator('#btn-click');
        await btn.click();
        await testPage.waitForTimeout(1000);

        // Stop recording
        await popup.bringToFront();
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(3000);

        // Verify body_capture_mode via get_session_data
        const session_data = await popup.evaluate(async () => {
            try {
                const sessions = await (chrome.runtime.sendMessage({
                    action: 'list_captures',
                }) as Promise<Array<{ capture_id: string }>>);
                if (!Array.isArray(sessions) || sessions.length === 0) {
                    return { error: 'No sessions found' };
                }
                const latest = sessions[sessions.length - 1];
                const data = await (chrome.runtime.sendMessage({
                    action: 'get_capture_data',
                    session_id: latest.capture_id,
                }) as Promise<any>);
                return data;
            } catch (e: unknown) {
                return { error: e instanceof Error ? e.message : String(e) };
            }
        });

        expect(session_data.success).toBe(true);
        expect(session_data.capture).toBeDefined();

        // body_capture_mode should be set (not undefined)
        // In extension context without bridge, typical values: 'extension_cdp' or 'fallback_hook'
        const mode = session_data.capture.body_capture_mode;
        expect(['extension_cdp', 'fallback_hook', 'external_cdp_bridge']).toContain(mode);

        // Verify some network requests were captured
        const network_requests = session_data.network_requests || [];
        expect(network_requests.length).toBeGreaterThan(0);

        await testPage.close();
        await popup.close();
    });

    test('export JSON contains network requests with response_body_status', async () => {
        const popup = await browser.newPage();
        await popup.goto(`chrome-extension://${extension_id}/src/popup/popup.html`);
        await popup.waitForLoadState('domcontentloaded');

        // Start recording
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(1000);

        // Navigate to generate network requests
        const testPage = await browser.newPage();
        await testPage.route('https://example.com/**', async route => {
            const url = route.request().url();
            if (url === 'https://example.com/' || url === 'https://example.com') {
                await route.fulfill({
                    contentType: 'text/html',
                    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Export Test</title>
  <link rel="stylesheet" href="https://example.com/theme.css">
</head>
<body>
  <h1>Export Test Page</h1>
  <p>Testing JSON export with network body capture verification.</p>
  <img src="https://example.com/hero.jpg" alt="hero" width="200" height="150">
  <script>
    fetch('https://example.com/api/items').catch(function () {});
    fetch('https://example.com/api/config').catch(function () {});
  </script>
</body>
</html>`,
                });
            } else if (url === 'https://example.com/theme.css') {
                await route.fulfill({
                    contentType: 'text/css',
                    body: 'h1 { color: #3b82f6; } p { font-size: 14px; }',
                });
            } else if (url === 'https://example.com/hero.jpg') {
                await route.fulfill({
                    contentType: 'image/jpeg',
                    body: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64'),
                });
            } else {
                await route.fulfill({
                    contentType: 'application/json',
                    body: '{"data":[],"total":0}',
                });
            }
        });
        await testPage.goto('https://example.com');
        await testPage.waitForLoadState('networkidle');
        await testPage.waitForTimeout(500);

        // Stop recording
        await popup.bringToFront();
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(3000);

        // Export JSON via chrome.runtime.sendMessage
        const export_result = await popup.evaluate(async () => {
            try {
                const sessions = await (chrome.runtime.sendMessage({
                    action: 'list_captures',
                }) as Promise<Array<{ capture_id: string }>>);
                if (!Array.isArray(sessions) || sessions.length === 0) {
                    return { error: 'No sessions found' };
                }
                const latest = sessions[sessions.length - 1];
                const exported = await (chrome.runtime.sendMessage({
                    action: 'export_json',
                    session_id: latest.capture_id,
                }) as Promise<{ success: boolean; json: string }>);
                return exported;
            } catch (e: unknown) {
                return { error: e instanceof Error ? e.message : String(e) };
            }
        });

        expect(export_result.success).toBe(true);
        expect(export_result.json).toBeDefined();

        // Parse JSON
        const json_data = JSON.parse(export_result.json!);
        expect(json_data.capture).toBeDefined();
        expect(json_data.network_requests).toBeDefined();

        const network_requests: any[] = json_data.network_requests || [];
        expect(network_requests.length).toBeGreaterThan(0);

        // Every network request should have response_body_status
        for (const req of network_requests) {
            expect(req).toHaveProperty('response_body_status');
            expect(typeof req.response_body_status).toBe('string');
        }

        // At least one network request should have body capture attempted
        // (not all will be 'not_enabled')
        const captured_or_attempted = network_requests.filter(
            (req: any) => req.response_body_status !== 'not_enabled'
        );
        expect(captured_or_attempted.length).toBeGreaterThan(0);

        await testPage.close();
        await popup.close();
    });
});
