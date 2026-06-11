// tests/e2e-capture-local.spec.ts
// P1.7.2 本地页面全开采集 — 验证字段结构 + 精确内容
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup } from './e2e-helpers';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_SCRIPT = path.resolve(__dirname, 'fixtures/server.ts');
const LOCAL_PAGE_URL = 'http://localhost:17832/test-page.html';
const LOCAL_API_URL = '/api/test';

function start_server(): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
        const proc = spawn('npx', ['tsx', SERVER_SCRIPT], {
            cwd: PROJECT_ROOT,
            stdio: 'pipe',
            env: { ...process.env },
        });

        const timeout = setTimeout(() => {
            reject(new Error('Server start timeout (10s)'));
        }, 10000);

        let started = false;
        proc.stdout?.on('data', (chunk: Buffer) => {
            if (!started && chunk.toString().includes('E2E test server running')) {
                started = true;
                clearTimeout(timeout);
                resolve(proc);
            }
        });

        proc.stderr?.on('data', () => {
            // tsx 可能输出启动噪声，不影响结果
        });

        proc.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        proc.on('exit', (code) => {
            if (!started) {
                clearTimeout(timeout);
                reject(new Error(`Server exited with code ${code} before ready`));
            }
        });
    });
}

test.describe.serial('本地页面全开采集 — 字段结构 + 精确内容', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;
    let server: ChildProcess;

    test.beforeAll(async () => {
        server = await start_server();
        fix = await launch_extension();
    });

    test.afterAll(async () => {
        server.kill('SIGTERM');
        // 等待子进程退出
        await new Promise((r) => setTimeout(r, 500));
        await fix.context.close();
    });

    test('全开采集本地页面 → 导出 JSON → 结构与内容验证', async () => {
        // ── 1. 打开 popup ──
        const popup = await open_popup(fix);

        // ── 2. 确保 8 个标签全部 ON ──
        const off_cards = popup.locator('.mcard.mcard-off');
        const off_count = await off_cards.count();
        if (off_count > 0) {
            for (let i = 0; i < off_count; i++) {
                await off_cards.nth(i).click();
                await popup.waitForTimeout(150);
            }
        }
        // 验证没有 off 的卡片了
        await expect(popup.locator('.mcard.mcard-off')).toHaveCount(0);

        // ── 3. 开始采集 ──
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        // ── 4. 打开本地测试页面 ──
        const site = await fix.context.newPage();
        await site.goto(LOCAL_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });

        // ── 5. 等待 3s，页面脚本执行完毕 ──
        await site.waitForTimeout(3000);

        // ── 6. 点击 #btn-click ──
        await site.locator('#btn-click').click();
        await site.waitForTimeout(300);

        // ── 7. 在 #input-text 输入 ──
        await site.locator('#input-text').fill('hello e2e');
        await site.waitForTimeout(300);

        // ── 8. 点击 #btn-error 触发错误 ──
        await site.locator('#btn-error').click();
        // JS error 不会让页面崩溃，Playwright 默认不 fail on error

        // ── 9. 等待 1s ──
        await site.waitForTimeout(1000);

        // ── 10. 关闭测试页面 ──
        await site.close();

        // ── 11. 停止采集 ──
        await popup.bringToFront();
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(2000);

        // ── 12. 获取 capture_id ──
        const status = await popup.evaluate(async () => {
            try {
                return await chrome.runtime.sendMessage({ action: 'get_status' });
            } catch {
                return null;
            }
        }) as { capture_id?: string } | null;

        const capture_id = status?.capture_id;
        expect(capture_id, '应有 capture_id').toBeTruthy();

        // ── 13. 导出 JSON ──
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1000);

        const export_result = await dashboard.evaluate(async (id) => {
            try {
                return await chrome.runtime.sendMessage({
                    action: 'export_json',
                    session_id: id,
                }) as { success: boolean; json?: string };
            } catch {
                return { success: false, json: undefined };
            }
        }, capture_id);

        await dashboard.close();
        await popup.close();

        expect(export_result.success, 'JSON 导出应成功').toBe(true);
        expect(export_result.json, 'JSON 导出应有内容').toBeTruthy();

        const data = JSON.parse(export_result.json!);

        // ================================================================
        // 14. 结构验证
        // ================================================================

        // ── CaptureRecord 顶层字段 ──
        expect(data.capture, '导出应包含 capture').toBeDefined();
        expect(data.capture_id, 'capture_id 应匹配').toBe(capture_id);
        expect(data.capture.status, 'status 应为 completed').toBe('completed');
        expect(data.capture.mode, 'mode 应为 standard').toBe('standard');
        expect(typeof data.capture.started_at, 'started_at 应为 string').toBe('string');
        expect(typeof data.capture.ended_at, 'ended_at 应为 string').toBe('string');
        expect(data.capture.duration_ms, 'duration_ms 应 > 0').toBeGreaterThan(0);
        expect(data.capture.config_snapshot, 'config_snapshot 应存在').toBeDefined();

        // ── tags 数组精确匹配七标签 ──
        expect(Array.isArray(data.capture.tags), 'tags 应为数组').toBe(true);
        expect(data.capture.tags.sort(), 'tags 应为七标签').toEqual([
            'Storage',
            'Cookie',
            '用户行为',
            '控制台',
            '错误异常',
            '网络请求',
            '页面导航',
        ].sort());

        // ── config_snapshot 字段 ──
        const snapshot = data.capture.config_snapshot || {};
        expect(snapshot.capture_network, 'config_snapshot.capture_network 应为 true').toBe(true);
        expect(snapshot.capture_console, 'config_snapshot.capture_console 应为 true').toBe(true);
        expect(snapshot.capture_response_body, 'config_snapshot.capture_response_body 应为 true').toBe(true);
        expect(snapshot.capture_mode, 'config_snapshot 不应含 capture_mode').toBeUndefined();

        // ── 导出顶层数组 ──
        expect(Array.isArray(data.events), 'events 应为数组').toBe(true);
        expect(Array.isArray(data.network_requests), 'network_requests 应为数组').toBe(true);
        expect(Array.isArray(data.console_events), 'console_events 应为数组').toBe(true);

        // ── NetworkRequest 字段结构 ──
        expect(data.network_requests.length, 'network_requests 应 > 0').toBeGreaterThan(0);
        for (const req of data.network_requests) {
            expect(typeof req.url, `req.url 应为 string: ${JSON.stringify(req.url).slice(0, 80)}`).toBe('string');
            expect(req.url.length, 'req.url 应非空').toBeGreaterThan(0);
            expect(typeof req.method, 'req.method 应为 string').toBe('string');
            expect(typeof req.status_code, 'req.status_code 应为 number').toBe('number');
            expect(req.duration_ms, 'req.duration_ms 应存在').toBeDefined();
            expect(typeof req.resource_type, 'req.resource_type 应为 string').toBe('string');
            expect(req.tab_id, 'req.tab_id 应存在').toBeDefined();
            expect(req.response_body_status, 'response_body_status 应存在').toBeDefined();
            expect(req.request_body_status, 'request_body_status 应存在').toBeDefined();
        }

        // ── ConsoleEvent 字段结构 ──
        expect(data.console_events.length, 'console_events 应 > 0').toBeGreaterThan(0);
        for (const evt of data.console_events) {
            expect(typeof evt.level, 'console level 应为 string').toBe('string');
            expect(Array.isArray(evt.args_preview), 'args_preview 应为数组').toBe(true);
            expect(evt.source_url, 'source_url 应存在').toBeDefined();
            expect(evt.args_status, 'args_status 应存在').toBeDefined();
        }

        // ── CaptureEvent 字段结构 ──
        expect(data.events.length, 'events 应 > 0').toBeGreaterThan(0);
        for (const evt of data.events) {
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

        // ================================================================
        // 15. 内容验证（精确 — 页面确定性）
        // ================================================================

        // ── Network: /api/test 请求 ──
        const api_req = data.network_requests.find(
            (r: { url: string }) => r.url.includes(LOCAL_API_URL),
        );
        expect(api_req, '应存在 /api/test 请求').toBeDefined();
        expect(api_req.method, '/api/test method 应为 GET').toBe('GET');
        expect(api_req.status_code, '/api/test status_code 应为 200').toBe(200);

        // response_body 内容仅在 CDP 捕获成功时验证
        if (api_req.response_body_status === 'captured') {
            expect(
                typeof api_req.response_body,
                '/api/test response_body 应为 string',
            ).toBe('string');
            expect(
                api_req.response_body,
                '/api/test response_body 应包含 E2E_API_MARKER',
            ).toContain('E2E_API_MARKER');
        }

        // ── Console: E2E_LOG_MARKER (level=log) ──
        const log_evt = data.console_events.find(
            (c: { level: string; args_preview: string[] }) =>
                c.level === 'log' &&
                c.args_preview.some((a: string) => String(a).includes('E2E_LOG_MARKER')),
        );
        expect(log_evt, '应存在 console.log 包含 E2E_LOG_MARKER').toBeDefined();

        // ── Console: E2E_WARN_MARKER (level=warn) ──
        const warn_evt = data.console_events.find(
            (c: { level: string; args_preview: string[] }) =>
                c.level === 'warn' &&
                c.args_preview.some((a: string) => String(a).includes('E2E_WARN_MARKER')),
        );
        expect(warn_evt, '应存在 console.warn 包含 E2E_WARN_MARKER').toBeDefined();

        // ── UserAction: click on "Click Me" ──
        const click_evt = data.events.find(
            (e: { category: string; type: string; data?: { action?: string; target_text_preview?: string } }) =>
                e.category === 'user_action' &&
                e.type === 'mouse_event' &&
                e.data?.action === 'click' &&
                e.data?.target_text_preview?.includes('Click Me'),
        );
        expect(click_evt, '应存在 user_action click 目标为 Click Me').toBeDefined();

        // ── Error: E2E_ERROR_MARKER ──
        const error_evt = data.events.find(
            (e: { category: string; type: string; data?: { message?: string; error_name?: string; stack_trace?: string } }) =>
                e.category === 'error' &&
                e.data?.message?.includes('E2E_ERROR_MARKER'),
        );
        expect(error_evt, '应存在 error 包含 E2E_ERROR_MARKER').toBeDefined();
        expect(error_evt.data?.error_name, 'error_name 应为 Error').toBe('Error');
        expect(
            error_evt.data?.stack_trace,
            'stack_trace 应非空',
        ).toBeTruthy();
        expect(
            (error_evt.data?.stack_trace || '').length,
            'stack_trace 长度应 > 0',
        ).toBeGreaterThan(0);

        // ── CookieChange: e2e_test_cookie ──
        const cookie_evt = data.events.find(
            (e: { category: string; type: string; data?: { name?: string } }) =>
                e.category === 'cookie' &&
                e.type === 'cookie_change' &&
                e.data?.name === 'e2e_test_cookie',
        );
        expect(cookie_evt, '应存在 cookie_change 包含 e2e_test_cookie').toBeDefined();

        // ── StorageChange: e2e_test_key ──
        const storage_evt = data.events.find(
            (e: { category: string; type: string; data?: { key?: string; storage_type?: string; action?: string } }) =>
                e.category === 'storage' &&
                e.type === 'storage_change' &&
                e.data?.key === 'e2e_test_key',
        );
        expect(storage_evt, '应存在 storage_change 包含 e2e_test_key').toBeDefined();
        expect(storage_evt.data?.storage_type, 'storage_type 应为 local').toBe('local');
        expect(storage_evt.data?.action, 'action 应为 set').toBe('set');
    });
});
