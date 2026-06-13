// tests/e2e-mcp.spec.ts
// E2E: launches Chrome with extension + local bridge, verifies MCP command flow
import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { create_bridge_server } from '../src/agent/bridge/server';
import { parse_bridge_config } from '../src/agent/bridge/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../dist');

const BRIDGE_PORT = 18731;
const BRIDGE_TOKEN = 'e2e-test-token-abc123xyz';

let browser: Awaited<ReturnType<typeof chromium.launchPersistentContext>>;
let extension_id: string;
let bridge: { close: () => Promise<void>; url: string };

test.beforeAll(async () => {
    // Start bridge server
    bridge = await create_bridge_server(parse_bridge_config({
        port: BRIDGE_PORT,
        token: BRIDGE_TOKEN
    }));

    // Launch Chrome with extension
    browser = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-first-run',
            '--no-default-browser-check',
        ],
    });

    const sw = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
    extension_id = sw.url().split('/')[2];

    // Write bridge config via extension page
    const page = await browser.newPage();
    await page.goto(`chrome-extension://${extension_id}/src/popup/popup.html`);
    await page.waitForLoadState('domcontentloaded');

    // Step 1: Write config
    await page.evaluate(async (cfg) => {
        await chrome.storage.local.set({
            user_config: {
                mouse_precision: 'clicks',
                keyboard_capture_mode: 'none',
                capture_input_values: false,
                capture_request_body: false,
                capture_response_body: false,
                redact_data: true,
                theme: 'follow-system',
                locale: 'en',
                system_time_timezone: 'browser',
                detail_time_display_mode: 'system',
                export_capture_directory: '',
                export_log_directory: '',
                export_filename_template: 'capture_all_{capture_id}_{date}.{ext}',
                export_save_as: true,
                agent_bridge_enabled: true,
                agent_bridge_url: cfg.url,
                agent_bridge_token: cfg.token,
                agent_bridge_poll_interval_ms: 500
            }
        });
    }, { url: `http://127.0.0.1:${BRIDGE_PORT}`, token: BRIDGE_TOKEN });

    // Step 2: Test if SW can reach bridge
    const sw_fetch_test = await page.evaluate(async () => {
        return new Promise<string>((resolve) => {
            chrome.runtime.sendMessage({ action: 'test_bridge_fetch' }, (response: any) => {
                resolve(JSON.stringify(response));
            });
        });
    });
    console.log('SW bridge fetch test:', sw_fetch_test);

    // Step 3: Restart bridge client in SW
    const restart_result = await page.evaluate(async () => {
        return new Promise<string>((resolve) => {
            chrome.runtime.sendMessage({ action: 'restart_bridge' }, (response: any) => {
                resolve(JSON.stringify(response));
            });
        });
    });
    console.log('restart_bridge result:', restart_result);

    await page.close();

    // Step 4: Manually send heartbeat from extension to verify bridge accepts it
    const page2 = await browser.newPage();
    await page2.goto(`chrome-extension://${extension_id}/src/popup/popup.html`);
    const heartbeat_test = await page2.evaluate(async (cfg) => {
        try {
            const res = await fetch(`${cfg.url}/extension/heartbeat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cfg.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ version: 'test', active_capture_id: null })
            });
            return { status: res.status, body: await res.text() };
        } catch (e: any) {
            return { error: e.message };
        }
    }, { url: `http://127.0.0.1:${BRIDGE_PORT}`, token: BRIDGE_TOKEN });
    console.log('manual heartbeat from extension:', JSON.stringify(heartbeat_test));
    await page2.close();

    // Wait for bridge client to start polling
    await new Promise(resolve => setTimeout(resolve, 3000));
});

test.afterAll(async () => {
    await browser?.close();
    await bridge?.close();
});

async function bridge_post(path: string, body: unknown): Promise<any> {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}${path}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${BRIDGE_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    return res.json();
}

test.describe('MCP Bridge E2E', () => {
    test('bridge health check', async () => {
        const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/health`);
        const data = await res.json() as Record<string, unknown>;
        expect(data.ok).toBe(true);
    });

    test('extension comes online via heartbeat', async () => {
        const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/mcp/status`, {
            headers: { 'Authorization': `Bearer ${BRIDGE_TOKEN}` }
        });
        const data = await res.json() as Record<string, unknown>;
        expect(data.extension_online).toBe(true);
    });

    test('MCP: sessions.list', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'e2e_list', type: 'captures.list', payload: {}, created_at: Date.now()
        });
        expect(data.ok).toBe(true);
        expect(data.data).toHaveProperty('total');
    });

    test('MCP: recording.start', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'e2e_start', type: 'capture.start',
            payload: { capture_id: 'e2e_capture_1' }, created_at: Date.now()
        });
        expect(data.ok).toBe(true);
        expect(data.data).toHaveProperty('capture_id', 'e2e_session_1');
    });

    test('MCP: sources.list', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'e2e_sources', type: 'sources.list',
            payload: { capture_id: 'e2e_capture_1' }, created_at: Date.now()
        });
        expect(data.ok).toBe(true);
    });

    test('MCP: session.get_all_data', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'e2e_alldata', type: 'capture.get_all_data',
            payload: { capture_id: 'e2e_capture_1' }, created_at: Date.now()
        });
        expect(data.ok).toBe(true);
        expect(data.data).toHaveProperty('session');
    });

    test('MCP: session.export json', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'e2e_export', type: 'capture.export',
            payload: { capture_id: 'e2e_capture_1', format: 'json' }, created_at: Date.now()
        });
        expect(data.ok).toBe(true);
        expect(data.data).toHaveProperty('format', 'json');
    });

    test('MCP: recording.stop', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'e2e_stop', type: 'capture.stop',
            payload: {}, created_at: Date.now()
        });
        expect(data.ok).toBe(true);
        expect(data.data).toHaveProperty('status', 'stopped');
    });

    test('MCP: sessions.get returns details', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'e2e_get', type: 'captures.get',
            payload: { capture_id: 'e2e_capture_1' }, created_at: Date.now()
        });
        expect(data.ok).toBe(true);
        expect(data.data).toHaveProperty('id', 'e2e_session_1');
    });

    test('unauthenticated request is rejected', async () => {
        const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/mcp/status`);
        const data = await res.json() as Record<string, unknown>;
        expect(data.ok).toBe(false);
    });
});
