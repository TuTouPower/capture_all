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

    const popup_url = `chrome-extension://${extension_id}/src/extension/popup/popup.html`;
    const dashboard_url = `chrome-extension://${extension_id}/src/extension/dashboard/dashboard.html`;

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

// Popup mcard 用 data-key 标识（与 i18n locale 无关）。
// dashboard 硬编码中文 label → 用 REQUIRED_LABELS；
// popup mcard 通过 i18n 渲染 → 用 REQUIRED_KEYS + data-key selector。
export const REQUIRED_KEYS = [
    'event_count', 'nav_count', 'request_count', 'log_count',
    'error_count', 'storage_change_count', 'cookie_change_count',
] as const;

export const FORBIDDEN_STRINGS = [
    '深度采集', '标准采集', '就绪', 'Record All', 'record_all', '录制',
];
// 注：'记录' 作为普通名词合法使用（如"采集记录"指 capture list），
// CLAUDE.md 禁止的是作为动词/产品术语的 '录制'。'记录' 不属于禁词。

export interface CaptureDataResult {
    success: boolean;
    error?: string;
    events?: Array<Record<string, unknown>>;
    network_requests?: Array<Record<string, unknown>>;
}

/**
 * Verify capture data via export_json (P0.47 design).
 *
 * SW `get_capture_data` deliberately returns only capture metadata to avoid
 * the 64MB sendMessage limit (see tests/sw_action_contract.test.ts). Full
 * event data lives in IndexedDB and is consumed via `read_capture_snapshot`
 * (page-context direct read) or `export_json` (SW-serialized snapshot).
 *
 * This helper picks the latest capture and asks the SW to export_json it,
 * then parses the JSON to expose { capture, events, network_requests,
 * console_events } — matching what the dashboard / detail pages consume.
 */
export async function verify_capture_data(page: Page): Promise<CaptureDataResult> {
    return await page.evaluate(async () => {
        try {
            const captures = await (chrome.runtime.sendMessage({
                action: 'list_captures',
            }) as Promise<Array<{ capture_id: string }>>);
            if (!Array.isArray(captures) || captures.length === 0) {
                return { success: false, error: 'No captures found' };
            }
            const latest = captures[captures.length - 1];
            const export_result = await (chrome.runtime.sendMessage({
                action: 'export_json',
                capture_id: latest.capture_id,
            }) as Promise<{ success: boolean; json?: string; error?: string }>);
            if (!export_result.success || !export_result.json) {
                return { success: false, error: export_result.error || 'export_json failed' };
            }
            const parsed = JSON.parse(export_result.json) as {
                capture?: unknown;
                events?: Array<Record<string, unknown>>;
                network_requests?: Array<Record<string, unknown>>;
            };
            return {
                success: true,
                events: parsed.events ?? [],
                network_requests: parsed.network_requests ?? [],
            };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'sendMessage failed';
            return { success: false, error: msg };
        }
    });
}
