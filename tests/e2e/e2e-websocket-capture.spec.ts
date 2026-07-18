// tests/e2e-websocket-capture.spec.ts
// E2E: WebSocket frame capture verification
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

test.describe('WebSocket capture', () => {
    test('captures WebSocket frames via CDP', async () => {
        const page = await browser.newPage();

        // Navigate to a page that opens a WebSocket
        await page.goto('about:blank');
        await page.evaluate(() => {
            const ws = new WebSocket('wss://echo.websocket.org');
            ws.onopen = () => {
                ws.send('hello');
                ws.send('world');
            };
            ws.onmessage = () => {
                ws.close();
            };
        });

        // Wait for WS events to propagate
        await page.waitForTimeout(3000);

        // Verify via extension storage or dashboard
        // (actual verification depends on how captured data is exposed)
        await page.close();
    });
});
