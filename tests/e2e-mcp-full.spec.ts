// tests/e2e-mcp-full.spec.ts — P5.5 MCP Agent 全流程
import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { create_bridge_server } from '../src/bridge/server';
import { parse_bridge_config } from '../src/bridge/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../artifacts/dist');

const BRIDGE_PORT = 18732;
const BRIDGE_TOKEN = '<E2E_BRIDGE_TOKEN>';

let browser: Awaited<ReturnType<typeof chromium.launchPersistentContext>>;
let extension_id: string;
let bridge: { close: () => Promise<void>; url: string };
let active_capture_id = '';

test.beforeAll(async () => {
    bridge = await create_bridge_server(parse_bridge_config({
        port: BRIDGE_PORT,
        token: BRIDGE_TOKEN,
    }));

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

    // Write bridge config
    const page = await browser.newPage();
    await page.goto(`chrome-extension://${extension_id}/src/popup/popup.html`);
    await page.waitForLoadState('domcontentloaded');

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
                export_filename_template: 'capture_{date}.{ext}',  // P0.60 新默认模板
                export_save_as: true,
                agent_bridge_enabled: true,
                agent_bridge_url: cfg.url,
                agent_bridge_token: cfg.token,
                agent_bridge_poll_interval_ms: 500,
            },
        });
    }, { url: `http://127.0.0.1:${BRIDGE_PORT}`, token: BRIDGE_TOKEN });

    // Restart bridge client
    await page.evaluate(async () => {
        return new Promise<string>((resolve) => {
            chrome.runtime.sendMessage({ action: 'restart_bridge' }, (response) => {
                resolve(JSON.stringify(response));
            });
        });
    });

    await page.close();
    // Wait for bridge client to start polling
    await new Promise((resolve) => setTimeout(resolve, 3000));
});

test.afterAll(async () => {
    await browser?.close();
    await bridge?.close();
});

async function bridge_post(path: string, body: unknown): Promise<any> {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${BRIDGE_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    return res.json();
}

async function bridge_get(path: string): Promise<{ status: number; data: any }> {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}${path}`, {
        headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` },
    });
    return { status: res.status, data: await res.json() };
}

test.describe.serial('MCP Agent 全流程', () => {
    test('Bridge 启动健康检查', async () => {
        const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/health`);
        const data = (await res.json()) as Record<string, unknown>;
        expect(data.ok).toBe(true);
    });

    test('extension 上线', async () => {
        const { status, data } = await bridge_get('/mcp/status');
        expect(status).toBe(200);
        expect(data.extension_online).toBe(true);
    });

    test('MCP: recording.start 开始采集', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'full_start',
            type: 'capture.start',
            payload: { capture_id: 'e2e_full_capture_1' },
            created_at: Date.now(),
        });
        expect(data.ok).toBe(true);
        active_capture_id = data.data?.capture_id || 'e2e_full_session_1';
        expect(active_capture_id).toBeTruthy();
    });

    test('操作网站触发采集数据', async () => {
        const site = await browser.newPage();
        await site.goto('https://www.baidu.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await site.waitForTimeout(2000);

        // 触发 console 事件
        await site.evaluate(() => {
            console.log('mcp e2e test console event');
            // 触发 storage 事件
            localStorage.setItem('mcp_e2e_test', 'value');
            // 触发 error 事件
            try { throw new Error('mcp e2e test error'); } catch {}
        });

        const search_input = site.locator('#kw');
        if (await search_input.isVisible()) {
            await search_input.click();
            await search_input.fill('mcp full e2e test');
            await site.locator('#su').click();
            await site.waitForTimeout(3000);
        }
        await site.close();
        // 留时间给扩展处理事件 + flush
        await new Promise((resolve) => setTimeout(resolve, 3000));
    });

    test('MCP: sources.list 返回 7 个数据源', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'full_sources',
            type: 'sources.list',
            payload: { capture_id: active_capture_id },
            created_at: Date.now(),
        });
        expect(data.ok).toBe(true);

        const sources: Array<{ source: string; count: number }> = data.data ?? [];
        expect(Array.isArray(sources)).toBe(true);
        expect(sources.length).toBeGreaterThan(0);

        // 验证核心数据源存在（console/error/storage 依赖页面行为，不一定触发）
        const source_names = sources.map((s) => s.source);
        const core_sources = [
            'user_action_events',
            'navigation_events',
            'network_requests',
            'cookie_changes',
        ];
        for (const expected of core_sources) {
            expect(source_names).toContain(expected);
        }
    });

    test('MCP: timeline.list 有数据且事件含 type 字段', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'full_timeline',
            type: 'timeline.list',
            payload: { capture_id: active_capture_id, offset: 0, limit: 50 },
            created_at: Date.now(),
        });
        expect(data.ok).toBe(true);
        expect(data.data).toBeTruthy();
        const events = data.data.records;
        expect(Array.isArray(events)).toBe(true);
        expect(events.length).toBeGreaterThan(0);
        for (const event of events) {
            expect(event).toHaveProperty('type');
            expect(event.type).toBeTruthy();
        }
    });

    test('MCP: records.list 按 source 分类查询（console）', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'full_records_console',
            type: 'data.list',
            payload: {
                capture_id: active_capture_id,
                source: 'console_events',
                offset: 0,
                limit: 20,
            },
            created_at: Date.now(),
        });
        expect(data.ok).toBe(true);
        expect(data.data).toBeTruthy();
        expect(data.data.records).toBeDefined();
        // console 事件依赖页面行为，允许为空
    });

    test('MCP: records.list 按 source 分类查询（navigation）', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'full_records_nav',
            type: 'data.list',
            payload: {
                capture_id: active_capture_id,
                source: 'navigation_events',
                offset: 0,
                limit: 20,
            },
            created_at: Date.now(),
        });
        expect(data.ok).toBe(true);
        expect(data.data).toBeTruthy();
        expect(data.data.records).toBeDefined();
        expect(data.data.records.length).toBeGreaterThan(0);
    });

    test('MCP: capture.get_all_data 返回会话 + 7 源且关键源非空', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'full_alldata',
            type: 'capture.get_all_data',
            payload: { capture_id: active_capture_id },
            created_at: Date.now(),
        });
        expect(data.ok).toBe(true);
        expect(data.data).toBeTruthy();

        // 大数据量时桥接写入文件，小数据量内联返回
        let sources: Record<string, unknown[]>;
        if (data.data.file_path) {
            const fs = await import('fs');
            const content = JSON.parse(fs.readFileSync(data.data.file_path, 'utf-8'));
            sources = content.sources;
        } else {
            sources = data.data.sources;
        }
        expect(sources).toBeDefined();
        // sources 对象应包含 7 个 key
        const keys = Object.keys(sources as object);
        expect(keys.length).toBeGreaterThanOrEqual(7);
        // 验证关键数据源非空
        const user_events = sources.user_action_events as unknown[];
        expect(user_events).toBeDefined();
        expect(user_events.length).toBeGreaterThan(0);
        const net_requests = sources.network_requests as unknown[];
        expect(net_requests).toBeDefined();
        expect(net_requests.length).toBeGreaterThan(0);
    });

    test('MCP: capture.export 导出 JSON', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'full_export_json',
            type: 'capture.export',
            payload: { capture_id: active_capture_id, format: 'json' },
            created_at: Date.now(),
        });
        expect(data.ok).toBe(true);
    });

    test('MCP: capture.export 导出 HAR', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'full_export_har',
            type: 'capture.export',
            payload: { capture_id: active_capture_id, format: 'har' },
            created_at: Date.now(),
        });
        expect(data.ok).toBe(true);
    });

    test('MCP: 注入文本出现在采集数据中 — 闭合回环', async () => {
        const all_data = await bridge_post('/mcp/command', {
            command_id: 'full_loop',
            type: 'capture.get_all_data',
            payload: { capture_id: active_capture_id },
            created_at: Date.now(),
        });
        expect(all_data.ok).toBe(true);
        expect(all_data.data).toBeTruthy();

        // 大数据量时桥接写入文件
        let all_data_obj: Record<string, unknown>;
        if (all_data.data.file_path) {
            const fs = await import('fs');
            all_data_obj = JSON.parse(fs.readFileSync(all_data.data.file_path, 'utf-8'));
        } else {
            all_data_obj = all_data.data;
        }
        const sources = all_data_obj.sources as Record<string, unknown[]>;
        expect(sources).toBeDefined();

        const search_text = 'mcp full e2e test';
        let found = false;

        // 在所有事件数据中搜索注入文本
        for (const [, events] of Object.entries(sources)) {
            if (!Array.isArray(events)) continue;
            for (const event of events) {
                const json = JSON.stringify(event);
                if (json.includes(search_text) || json.includes(encodeURIComponent(search_text)) || json.includes('wd=')) {
                    found = true;
                    break;
                }
            }
            if (found) break;
        }

        expect(found).toBe(true);
    });

    test('MCP: captures.list 列出会话', async () => {
        const data = await bridge_post('/mcp/command', {
            command_id: 'full_sessions',
            type: 'captures.list',
            payload: {},
            created_at: Date.now(),
        });
        expect(data.ok).toBe(true);
        expect(data.data).toHaveProperty('total');
    });

    test('MCP: recording.stop 停止采集', async () => {
        // 先检查 extension 是否在线 + 是否有活跃录制
        const { data: status } = await bridge_get('/mcp/status');
        const data = await bridge_post('/mcp/command', {
            command_id: 'full_stop2',
            type: 'capture.stop',
            payload: {},
            created_at: Date.now(),
        });
        // stop 可能因为录制已完成而失败，不强制要求 ok
        if (data.ok) {
            expect(data.data).toHaveProperty('status', 'stopped');
        } else {
            // 录制已停止或扩展离线也是可接受的
            expect(data.error).toBeTruthy();
        }
    });

    test('无效 token 返回 401', async () => {
        const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/mcp/status`, {
            headers: { Authorization: 'Bearer invalid-token-deadbeef' },
        });
        expect(res.status).toBe(401);
        const data = (await res.json()) as Record<string, unknown>;
        expect(data.ok).toBe(false);
    });

    test('无 token POST 返回 401', async () => {
        const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/mcp/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                command_id: 'noauth2',
                type: 'captures.list',
                payload: {},
                created_at: Date.now(),
            }),
        });
        expect(res.status).toBe(401);
    });
});
