import { chromium } from 'playwright';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DIST_DIR = join(PROJECT_ROOT, 'artifacts', 'dist');
const SCREENSHOTS_DIR = join(PROJECT_ROOT, 'store', 'screenshots');
const FIXTURE_URL = 'http://127.0.0.1:17832/test-page.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensure_dirs() {
    for (const dir of [SCREENSHOTS_DIR]) {
        try { await stat(dir); } catch { await mkdir(dir, { recursive: true }); }
    }
}

async function wait_for_url(url, timeout = 10_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
            if (res.ok) return true;
        } catch {}
        await sleep(500);
    }
    return false;
}

async function shot(page, name) {
    const file = join(SCREENSHOTS_DIR, `${name}.png`);
    await page.screenshot({
        path: file,
        type: 'png',
        animations: 'disabled',
        caret: 'hide',
    });
    process.stdout.write(`Saved: ${file}\n`);
}

async function prepare_popup_shot(popup) {
    await popup.addStyleTag({
        content: `
            html, body {
                width: 1280px !important;
                height: 800px !important;
                overflow: hidden !important;
            }
            body {
                display: grid !important;
                place-items: center !important;
                background:
                    radial-gradient(circle at 20% 20%, #dce8ff 0, transparent 34%),
                    radial-gradient(circle at 82% 74%, #e8ddff 0, transparent 32%),
                    #f4f6fb !important;
            }
            .popup {
                border: 1px solid rgba(28, 28, 24, .12);
                border-radius: 18px;
                box-shadow: 0 28px 80px rgba(34, 51, 84, .20);
                transform: scale(1.35);
            }
        `,
    });
}

async function start_capture(popup) {
    await popup.locator('#startBtn').click();
    await popup.locator('#stopBtn').waitFor({ state: 'visible' });
}

async function generate_capture(context, popup) {
    await start_capture(popup);
    const fixture = await context.newPage();
    await fixture.goto(FIXTURE_URL, { waitUntil: 'domcontentloaded' });
    await fixture.locator('#btn-click').click();
    await fixture.locator('#input-text').fill('store screenshot');
    await fixture.locator('#input-text').press('Tab');
    await fixture.locator('#btn-error').click();
    await Promise.all([
        fixture.waitForResponse((response) =>
            response.url().includes('/api/test?store_screenshot=1')
            && response.status() === 200),
        fixture.evaluate(() => fetch('/api/test?store_screenshot=1', { cache: 'no-store' })),
    ]);
    await sleep(1_000);

    await popup.bringToFront();
    await prepare_popup_shot(popup);
    await shot(popup, '02-live-capture');
    await popup.locator('#stopBtn').click();
    await popup.locator('.act-done').waitFor({ state: 'visible' });
    await fixture.close();

    const captures = await popup.evaluate(() => chrome.runtime.sendMessage({ action: 'list_captures' }));
    if (!captures?.[0]?.capture_id) throw new Error('Capture data was not created');
    return captures[0].capture_id;
}

async function get_extension_id(context) {
    const service_worker = context.serviceWorkers()[0]
        ?? await context.waitForEvent('serviceworker', { timeout: 30_000 });
    return new URL(service_worker.url()).host;
}

async function main() {
    await ensure_dirs();
    if (!(await wait_for_url(FIXTURE_URL))) {
        throw new Error('E2E fixture server is not running on port 17832');
    }
    const launch_args = [
        '--no-sandbox', '--disable-setuid-sandbox',
        '--ignore-certificate-errors', '--allow-running-insecure-content',
        `--disable-extensions-except=${DIST_DIR}`,
        `--load-extension=${DIST_DIR}`,
        '--window-size=1280,800',
        '--lang=zh-CN',
    ];
    const context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        headless: true,
        args: launch_args,
        viewport: { width: 1280, height: 800 },
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        ignoreHTTPSErrors: true,
    });
    try {
        const extension_id = await get_extension_id(context);
        const popup_url = `chrome-extension://${extension_id}/src/extension/popup/popup.html`;
        const dashboard_url = `chrome-extension://${extension_id}/src/extension/dashboard/dashboard.html`;

        const popup = await context.newPage();
        await popup.goto(popup_url, { waitUntil: 'domcontentloaded' });
        await popup.locator('#startBtn').waitFor({ state: 'visible' });

        const capture_id = await generate_capture(context, popup);

        const dashboard = await context.newPage();
        const detail_url = `${dashboard_url}?capture=${encodeURIComponent(capture_id)}&page=detail`;
        await dashboard.goto(detail_url, { waitUntil: 'domcontentloaded' });
        await dashboard.locator('tr[data-ev]').first().waitFor({ state: 'visible' });
        await dashboard.evaluate(() => {
            document.querySelector('.titlebar')?.remove();
        });
        await shot(dashboard, '01-timeline-overview');

        await dashboard.locator('[data-tab="network"]').click();
        const api_request = dashboard.locator('[data-netidx]').filter({
            hasText: '/api/test?store_screenshot=1',
        });
        await api_request.waitFor({ state: 'visible' });
        await api_request.click();
        await dashboard.locator('.dt-insp').filter({
            hasText: '/api/test?store_screenshot=1',
        }).waitFor({ state: 'visible' });
        await shot(dashboard, '03-request-inspector');

        await dashboard.goto(`${dashboard_url}?page=settings`, { waitUntil: 'domcontentloaded' });
        const privacy_nav = dashboard.locator('[data-setnav="set-privacy"]');
        await privacy_nav.click();
        await dashboard.locator('#set-privacy').waitFor({ state: 'visible' });
        await privacy_nav.evaluate((selected_nav) => {
            document.querySelectorAll('[data-setnav]').forEach((nav) => {
                nav.dataset.on = nav === selected_nav ? '1' : '0';
            });
        });
        await shot(dashboard, '04-privacy-settings');

        await dashboard.goto(`${dashboard_url}?page=exports`, { waitUntil: 'domcontentloaded' });
        await dashboard.locator('.exp-task').first().waitFor({ state: 'visible' });
        await shot(dashboard, '05-export-tasks');

        await popup.close();
        await dashboard.close();
        process.stdout.write(`\nAll screenshots saved to: ${SCREENSHOTS_DIR}\n`);
    } finally {
        await context.close();
    }
}

main().catch((err) => {
    process.stderr.write(`Screenshot script failed: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
});
