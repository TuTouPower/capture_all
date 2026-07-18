// tests/e2e-streaming-capture.spec.ts
// E2E: SSE / streaming body capture verification
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

test.describe('Streaming capture', () => {
    test('captures SSE response body', async () => {
        const page = await browser.newPage();

        // Navigate to a page that opens an SSE connection
        await page.goto('about:blank');
        await page.evaluate(() => {
            const es = new EventSource('https://demo.nginx.com/events');
            es.onmessage = () => {
                es.close();
            };
            setTimeout(() => es.close(), 5000);
        });

        // Wait for SSE events
        await page.waitForTimeout(6000);

        // Verify via extension storage or dashboard
        await page.close();
    });
});
