// tests/e2e-helpers.ts — Shared helpers for Capture All E2E tests
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const EXTENSION_PATH = path.resolve(__dirname, '../artifacts/dist');

export interface E2EFixture {
    context: BrowserContext;
    extension_id: string;
    popup_url: string;
    dashboard_url: string;
}

async function wait_for_sw_ready(context: BrowserContext, popup_url: string): Promise<void> {
    const check_page = await context.newPage();
    try {
        await check_page.goto(popup_url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            const result = await check_page.evaluate(async () => {
                try {
                    return await chrome.runtime.sendMessage({ action: 'get_status' });
                } catch {
                    return null;
                }
            });
            if (result) return;
            await new Promise((r) => setTimeout(r, 500));
        }
        throw new Error('Service worker 未在 15s 内就绪');
    } finally {
        await check_page.close();
    }
}

export async function launch_extension(headless = false): Promise<E2EFixture> {
    if (!fs.existsSync(EXTENSION_PATH) || !fs.existsSync(path.join(EXTENSION_PATH, 'manifest.json'))) {
        throw new Error('请先运行 npm run build');
    }

    const context = await chromium.launchPersistentContext('', {
        headless,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-gpu',
        ],
        viewport: { width: 1280, height: 800 },
    });

    let extension_id = '';
    const sw = context.serviceWorkers()[0];
    if (sw) {
        extension_id = sw.url().split('/')[2];
    } else {
        const worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
        extension_id = worker.url().split('/')[2];
    }

    const popup_url = `chrome-extension://${extension_id}/src/popup/popup.html`;
    const dashboard_url = `chrome-extension://${extension_id}/src/dashboard/dashboard.html`;

    await wait_for_sw_ready(context, popup_url);

    return { context, extension_id, popup_url, dashboard_url };
}

export async function close_extension(context: BrowserContext): Promise<void> {
    await context.close();
}

export async function open_popup(fixture: E2EFixture) {
    const page = await fixture.context.newPage();
    await page.goto(fixture.popup_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('#startBtn', { state: 'visible', timeout: 5000 });
    return page;
}

export async function open_site(fixture: E2EFixture, url: string) {
    const page = await fixture.context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return page;
}

export const TEST_SITES = {
    baidu: 'https://www.baidu.com',
    toutiao: 'https://www.toutiao.com',
    qq: 'https://www.qq.com',
    sina: 'https://www.sina.com.cn',
} as const;

export const REQUIRED_LABELS = [
    '用户行为', '页面导航', '网络请求', '控制台', '错误异常', 'Storage', 'Cookie',
];

export const FORBIDDEN_STRINGS = [
    '深度采集', '标准采集', '就绪', 'Record All', 'record_all', '录制', '记录',
];

export interface CaptureDataResult {
    success: boolean;
    error?: string;
    events?: Array<Record<string, unknown>>;
    network_requests?: Array<Record<string, unknown>>;
}

/**
 * Call get_capture_data via chrome.runtime.sendMessage from an extension page.
 * Lists sessions, picks the latest, and fetches its data.
 * Must be called from a popup or dashboard page (extension context).
 */
export async function verify_capture_data(page: Page): Promise<CaptureDataResult> {
    return await page.evaluate(async () => {
        try {
            const sessions = await (chrome.runtime.sendMessage({
                action: 'list_sessions',
            }) as Promise<Array<{ capture_id: string }>>);
            if (!Array.isArray(sessions) || sessions.length === 0) {
                return { success: false, error: 'No sessions found' };
            }
            const latest = sessions[sessions.length - 1];
            const data = await (chrome.runtime.sendMessage({
                action: 'get_session_data',
                session_id: latest.capture_id,
            }) as Promise<CaptureDataResult>);
            return data;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'sendMessage failed';
            return { success: false, error: msg };
        }
    });
}
