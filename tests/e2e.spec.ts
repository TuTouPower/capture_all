// tests/e2e.spec.ts
// Headless basic smoke tests (no extension loaded, just static HTML render).
// detail.html 已删除（死代码，用户实际通过 dashboard ?page=detail 访问）。
// dashboard / detail tab 完整测试在 e2e-ext project（加载真实扩展）覆盖。
import { test, expect, chromium } from '@playwright/test';

const SERVE_URL = 'http://127.0.0.1:4174';

let browser: Awaited<ReturnType<typeof chromium.launch>>;
let context: Awaited<ReturnType<typeof browser.newContext>>;

test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
});

test.afterAll(async () => {
    await browser.close();
});

test.describe('Record All UI', () => {
    test('popup loads with start button', async () => {
        const page = await context.newPage();
        await page.goto(`${SERVE_URL}/src/extension/popup/popup.html`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('#startBtn')).toBeVisible();
        await expect(page.locator('#startBtn')).toHaveText(/Start Capture|开始采集/);

        await page.close();
    });
});
