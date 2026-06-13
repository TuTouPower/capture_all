// tests/e2e-capture-baidu.spec.ts
// P0 E2E: 百度全开采集，验证导出 JSON 所有字段结构正确
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe('百度全开采集 — 字段结构验证', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;
    let extension_id: string;

    test.beforeAll(async () => {
        fix = await launch_extension();
        extension_id = fix.extension_id;
    });

    test.afterAll(async () => {
        await fix.context.close();
    });

    test('全开采集百度 → 导出 JSON → 所有字段结构正确', async () => {
        // Open popup and start capture
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        // Open baidu and browse
        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(4000);

        // Interact: click search box and type
        const search_box = site.locator('#kw');
        if (await search_box.isVisible()) {
            await search_box.click();
            await search_box.fill('e2e test');
            await site.waitForTimeout(2000);
        }
        await site.close();

        // Stop capture
        await popup.bringToFront();
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(2000);

        // Get capture_id from SW status
        const status = await popup.evaluate(async () => {
            try {
                return await chrome.runtime.sendMessage({ action: 'get_status' });
            } catch { return null; }
        }) as { capture_id?: string } | null;

        const capture_id = status?.capture_id;
        expect(capture_id, '应有 capture_id').toBeTruthy();

        // Export JSON from dashboard context
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1000);

        const export_result = await dashboard.evaluate(async (id) => {
            try {
                return await chrome.runtime.sendMessage({
                    action: 'export_json',
                    capture_id: id
                }) as { success: boolean; json?: string };
            } catch { return { success: false, json: undefined }; }
        }, capture_id);

        await dashboard.close();
        await popup.close();

        expect(export_result.success, 'JSON 导出应成功').toBe(true);
        expect(export_result.json, 'JSON 导出应有内容').toBeTruthy();

        const data = JSON.parse(export_result.json!);

        // === CaptureRecord 字段 ===
        expect(data.capture_id, 'capture_id 应匹配').toBe(capture_id);
        expect(data.capture.status, 'status 应为 completed').toBe('completed');
        expect(data.capture.mode, 'mode 应为 standard').toBe('standard');
        expect(Array.isArray(data.capture.tags), 'tags 应为数组').toBe(true);
        expect(data.capture.tags.length, 'tags 应至少 1 项').toBeGreaterThan(0);
        expect(data.capture.started_at, 'started_at 应存在').toBeTruthy();
        expect(data.capture.ended_at, 'ended_at 应存在').toBeTruthy();
        expect(data.capture.duration_ms, 'duration_ms 应 > 0').toBeGreaterThan(0);
        expect(data.capture.config_snapshot, 'config_snapshot 应存在').toBeTruthy();

        // config_snapshot 不含 capture_mode
        const snapshot = data.capture.config_snapshot || {};
        expect(snapshot.capture_mode, 'config_snapshot 不应含 capture_mode').toBeUndefined();

        // === 导出顶层字段 ===
        expect(Array.isArray(data.events), 'events 应为数组').toBe(true);
        expect(Array.isArray(data.network_requests), 'network_requests 应为数组').toBe(true);
        expect(Array.isArray(data.console_events), 'console_events 应为数组').toBe(true);
        expect(data.system_time, 'system_time 应存在').toBeTruthy();

        // === NetworkRequest 字段结构 ===
        const net_count = data.network_requests.length;
        expect(net_count, 'network_requests 应 > 0').toBeGreaterThan(0);

        for (const req of data.network_requests.slice(0, 5)) {
            expect(typeof req.url, `req.url 应为 string: ${req.url}`).toBe('string');
            expect(req.url.length, 'req.url 应非空').toBeGreaterThan(0);
            expect(typeof req.method, 'req.method 应为 string').toBe('string');
            expect(typeof req.status_code, 'req.status_code 应为 number').toBe('number');
            expect(req.duration_ms, 'req.duration_ms 应存在').toBeDefined();
            expect(typeof req.resource_type, 'req.resource_type 应为 string').toBe('string');
            expect(req.tab_id, 'req.tab_id 应 > 0').toBeGreaterThan(0);

            // Headers
            if (req.request_headers) {
                expect(typeof req.request_headers, 'request_headers 应为 object').toBe('object');
            }
            if (req.response_headers) {
                expect(typeof req.response_headers, 'response_headers 应为 object').toBe('object');
            }

            // Body status fields must exist
            expect(req.response_body_status, 'response_body_status 应存在').toBeDefined();
            expect(req.request_body_status, 'request_body_status 应存在').toBeDefined();
        }

        // === ConsoleEvent 字段结构 ===
        for (const evt of data.console_events.slice(0, 5)) {
            expect(typeof evt.level, 'console level 应为 string').toBe('string');
            expect(Array.isArray(evt.args_preview), 'args_preview 应为数组').toBe(true);
            expect(typeof evt.source_url, 'source_url 应为 string').toBe('string');
            expect(evt.args_status, 'args_status 应存在').toBeDefined();
        }

        // === CaptureEvent 字段结构 ===
        expect(data.events.length, 'events 应 > 0').toBeGreaterThan(0);
        for (const evt of data.events.slice(0, 10)) {
            expect(typeof evt.category, 'event.category 应为 string').toBe('string');
            expect(evt.category.length, 'event.category 应非空').toBeGreaterThan(0);
            expect(typeof evt.type, 'event.type 应为 string').toBe('string');
            expect(typeof evt.timestamp, 'event.timestamp 应为 number').toBe('number');
            expect(evt.timestamp, 'event.timestamp 应 > 0').toBeGreaterThan(0);
            expect(evt.data, 'event.data 应存在').toBeDefined();
            if (evt.tab_id !== undefined) {
                expect(typeof evt.tab_id, 'event.tab_id 应为 number').toBe('number');
            }
        }
    });
});
