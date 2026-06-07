// tests/e2e.spec.ts
import { test, expect, chromium } from '@playwright/test';

const SERVE_URL = 'http://localhost:4174';

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
    test('popup loads with mode buttons', async () => {
        const page = await context.newPage();
        await page.goto(`${SERVE_URL}/src/popup/popup.html`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('#basicBtn')).toBeVisible();
        await expect(page.locator('#advancedBtn')).toBeVisible();
        await expect(page.locator('#startBtn')).toBeVisible();
        await expect(page.locator('#startBtn')).toHaveText('Start Recording');

        await page.close();
    });

    test('detail page loads with tabs', async () => {
        const page = await context.newPage();
        await page.goto(`${SERVE_URL}/src/detail/detail.html?session=test123`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('.tab-btn[data-tab="timeline"]')).toBeVisible();
        await expect(page.locator('.tab-btn[data-tab="network"]')).toBeVisible();
        await expect(page.locator('.tab-btn[data-tab="console"]')).toBeVisible();
        await expect(page.locator('.tab-btn[data-tab="events"]')).toBeVisible();

        await expect(page.locator('#exportJsonBtn')).toBeVisible();
        await expect(page.locator('#exportHtmlBtn')).toBeVisible();

        await page.close();
    });

    test('detail page tab switching works', async () => {
        const page = await context.newPage();
        await page.goto(`${SERVE_URL}/src/detail/detail.html?session=test123`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('#timeline-tab')).toHaveClass(/active/);

        await page.locator('.tab-btn[data-tab="network"]').click();
        await expect(page.locator('#network-tab')).toHaveClass(/active/);
        await expect(page.locator('#timeline-tab')).not.toHaveClass(/active/);

        await page.locator('.tab-btn[data-tab="console"]').click();
        await expect(page.locator('#console-tab')).toHaveClass(/active/);

        await page.locator('.tab-btn[data-tab="events"]').click();
        await expect(page.locator('#events-tab')).toHaveClass(/active/);

        await page.close();
    });

    test('popup mode selection toggles correctly', async () => {
        const page = await context.newPage();
        await page.goto(`${SERVE_URL}/src/popup/popup.html`);
        await page.waitForLoadState('domcontentloaded');

        const basicBtn = page.locator('#basicBtn');
        const advancedBtn = page.locator('#advancedBtn');

        await expect(basicBtn).toHaveClass(/selected/);
        await expect(advancedBtn).not.toHaveClass(/selected/);

        await advancedBtn.click();
        await expect(advancedBtn).toHaveClass(/selected/);
        await expect(basicBtn).not.toHaveClass(/selected/);

        await basicBtn.click();
        await expect(basicBtn).toHaveClass(/selected/);
        await expect(advancedBtn).not.toHaveClass(/selected/);

        await page.close();
    });
});
