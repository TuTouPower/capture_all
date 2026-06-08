// tests/e2e-helpers.ts — Shared helpers for Capture All E2E tests
import { chromium, type BrowserContext } from '@playwright/test';
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

export async function launch_extension(headless = false): Promise<E2EFixture> {
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

    return { context, extension_id, popup_url, dashboard_url };
}

export async function open_popup(fixture: E2EFixture) {
    const page = await fixture.context.newPage();
    await page.goto(fixture.popup_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(500);
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
