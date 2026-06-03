// tests/e2e.spec.ts
import { test, expect, chromium } from '@playwright/test';

const CDP_URL = 'http://localhost:9223';
const SERVE_URL = 'http://localhost:4174';

let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>;
let context: Awaited<ReturnType<typeof browser.newContext>>;

test.beforeAll(async () => {
    browser = await chromium.connectOverCDP(CDP_URL);
    context = browser.contexts()[0] || await browser.newContext();
});

test.afterAll(async () => {
    await browser.close();
});

test.describe('Record All Extension', () => {
    test('popup loads with mode buttons', async () => {
        const page = await context.newPage();
        await page.goto(`${SERVE_URL}/popup/popup.html`);
        await page.waitForLoadState('domcontentloaded');

        const basicBtn = page.locator('#basicBtn');
        const advancedBtn = page.locator('#advancedBtn');
        await expect(basicBtn).toBeVisible();
        await expect(advancedBtn).toBeVisible();

        const startBtn = page.locator('#startBtn');
        await expect(startBtn).toBeVisible();
        await expect(startBtn).toHaveText('Start Recording');

        await page.close();
    });

    test('detail page loads with tabs', async () => {
        const page = await context.newPage();
        await page.goto(`${SERVE_URL}/detail/detail.html?session=test123`);
        await page.waitForLoadState('domcontentloaded');

        const timelineTab = page.locator('.tab-btn[data-tab="timeline"]');
        const networkTab = page.locator('.tab-btn[data-tab="network"]');
        const consoleTab = page.locator('.tab-btn[data-tab="console"]');
        const eventsTab = page.locator('.tab-btn[data-tab="events"]');

        await expect(timelineTab).toBeVisible();
        await expect(networkTab).toBeVisible();
        await expect(consoleTab).toBeVisible();
        await expect(eventsTab).toBeVisible();

        await expect(page.locator('#exportJsonBtn')).toBeVisible();
        await expect(page.locator('#exportHtmlBtn')).toBeVisible();

        await page.close();
    });

    test('detail page tab switching works', async () => {
        const page = await context.newPage();
        await page.goto(`${SERVE_URL}/detail/detail.html?session=test123`);
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
        await page.goto(`${SERVE_URL}/popup/popup.html`);
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
