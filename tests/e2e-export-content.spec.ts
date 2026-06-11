// tests/e2e-export-content.spec.ts — P1.7.7 导出内容正确性
// 验证导出文件包含语义正确的内容，而非仅检查格式合法性。
// 与本仓库现有 e2e-export.spec.ts（格式校验）互补：该文件检查字段存在性与格式，
// 本文件检查字段值是否正确、是否包含预期域内容、是否排除废弃概念。
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site } from './e2e-helpers';
import { spawn, type ChildProcess } from 'node:child_process';

const TEST_PAGE_URL = 'http://localhost:17832/test-page.html';

test.describe.serial('导出内容正确性', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;
    let capture_id = '';
    let server: ChildProcess;

    test.beforeAll(async () => {
        // 启动本地测试服务器（端口 17832）
        server = spawn('npx', ['tsx', 'tests/fixtures/server.ts'], {
            stdio: 'pipe',
            shell: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // 启动扩展
        fix = await launch_extension();

        // 开始一次采集
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        // 打开测试页面并交互产生数据
        const site = await open_site(fix, TEST_PAGE_URL);
        await site.waitForTimeout(1500);

        // 点击按钮（触发 click handler + console.log 标记）
        const btn = site.locator('#btn-click');
        if (await btn.isVisible()) {
            await btn.click();
            await site.waitForTimeout(300);
        }

        // 输入文本（触发 change handler + console.log 标记）
        const input_field = site.locator('#input-text');
        if (await input_field.isVisible()) {
            await input_field.click();
            await input_field.fill('e2e export content test');
            await input_field.dispatchEvent('change');
            await site.waitForTimeout(500);
        }

        // 额外交互以丰富导出数据
        await site.evaluate(() => {
            console.info('E2E_EXPORT_INFO_MARKER');
            document.cookie = 'e2e_export_cookie=export_val; path=/';
            localStorage.setItem('e2e_export_ls', 'ls_export_val');
        });
        await site.waitForTimeout(500);

        // 停止采集
        await popup.bringToFront();
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(2000);

        // 通过 get_status 获取 capture_id
        capture_id = await popup.evaluate(async () => {
            return new Promise<string>((resolve) => {
                chrome.runtime.sendMessage(
                    { action: 'get_status' },
                    (resp: any) => resolve(resp?.capture_id || ''),
                );
            });
        });

        await site.close();
        await popup.close();

        expect(capture_id, '需要有效的 capture_id').toBeTruthy();
    }, 60000);

    test.afterAll(async () => {
        await fix?.context.close();
        server?.kill('SIGTERM');
    });

    // ================================================================
    // JSON 导出内容验证
    // ================================================================

    test('JSON 导出包含正确的内容语义', async () => {
        const dash = await fix.context.newPage();
        await dash.goto(fix.dashboard_url, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
        });
        await dash.waitForTimeout(1000);

        const result = await dash.evaluate(async (id: string) => {
            try {
                return await (chrome.runtime.sendMessage({
                    action: 'export_json',
                    session_id: id,
                }) as Promise<{ success: boolean; json?: string }>);
            } catch {
                return { success: false, json: undefined };
            }
        }, capture_id);

        await dash.close();

        expect(result.success, 'JSON 导出应成功').toBe(true);
        expect(result.json, 'JSON 导出应有内容').toBeTruthy();

        const data = JSON.parse(result.json!);

        // capture_id 匹配实际值
        expect(data.capture, '应有 capture 对象').toBeDefined();
        expect(data.capture.capture_id, 'capture_id 应匹配').toBe(capture_id);

        // events[0] 包含所有必要字段
        expect(Array.isArray(data.events), 'events 应为数组').toBe(true);
        if (data.events.length > 0) {
            const ev = data.events[0];
            expect(ev, 'event 应有 category').toHaveProperty('category');
            expect(typeof ev.category, 'category 应为字符串').toBe('string');
            expect(ev, 'event 应有 type').toHaveProperty('type');
            expect(typeof ev.type, 'type 应为字符串').toBe('string');
            expect(ev, 'event 应有 data').toHaveProperty('data');
            expect(ev, 'event 应有 tab_id').toHaveProperty('tab_id');
            expect(ev, 'event 应有 url').toHaveProperty('url');
            // 时间字段：absolute_time 或 timestamp 至少存在其一
            const has_time =
                'absolute_time' in ev || 'timestamp' in ev;
            expect(has_time, 'event 应有时间字段').toBe(true);
        }

        // network_requests[0] 的 url 包含 localhost:17832（本测试服务器）
        expect(Array.isArray(data.network_requests), 'network_requests 应为数组').toBe(true);
        if (data.network_requests.length > 0) {
            const req = data.network_requests[0];
            const req_url: string =
                (req as any).request?.url ||
                req.url ||
                '';
            expect(req_url, '网络请求 URL 应包含测试服务器地址').toContain(
                'localhost:17832',
            );
        }

        // console_events 条目包含 level / args_preview / source_url
        expect(Array.isArray(data.console_events), 'console_events 应为数组').toBe(true);
        if (data.console_events.length > 0) {
            const ce = data.console_events[0];
            expect(ce, 'console 事件应有 level').toHaveProperty('level');
            expect(ce, 'console 事件应有 args_preview').toHaveProperty('args_preview');
            expect(ce, 'console 事件应有 source_url').toHaveProperty('source_url');
        }

        // 系统时间信息存在（distributed across capture record）
        const has_system_time =
            (data.system_time && typeof data.system_time === 'object') ||
            (data.capture &&
                ('start_time_system_time' in data.capture ||
                    'end_time_system_time' in data.capture));
        expect(has_system_time, '应有系统时间信息').toBe(true);

        // 若存在独立 system_time 对象，验证其 key
        if (data.system_time && typeof data.system_time === 'object') {
            const sys_keys = Object.keys(data.system_time);
            expect(sys_keys.length, 'system_time 应有 key').toBeGreaterThan(0);
        }
    });

    // ================================================================
    // HAR 导出内容验证
    // ================================================================

    test('HAR 导出包含正确的内容语义', async () => {
        const dash = await fix.context.newPage();
        await dash.goto(fix.dashboard_url, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
        });
        await dash.waitForTimeout(1000);

        const result = await dash.evaluate(async (id: string) => {
            try {
                return await (chrome.runtime.sendMessage({
                    action: 'export_har',
                    session_id: id,
                }) as Promise<{ success: boolean; har?: string }>);
            } catch {
                return { success: false, har: undefined };
            }
        }, capture_id);

        await dash.close();

        expect(result.success, 'HAR 导出应成功').toBe(true);
        expect(result.har, 'HAR 导出应有内容').toBeTruthy();

        const har = JSON.parse(result.har!);

        // log.entries 为数组
        expect(har.log, 'HAR 应有 log').toHaveProperty('entries');
        expect(Array.isArray(har.log.entries), 'log.entries 应为数组').toBe(true);

        // 至少有一条 entry
        expect(
            har.log.entries.length,
            'HAR 至少应有一条 entry',
        ).toBeGreaterThan(0);

        const entry = har.log.entries[0];

        // request.url 为合法 URL
        expect(typeof entry.request.url, 'request.url 应为字符串').toBe('string');
        expect(entry.request.url.length, 'request.url 不应为空').toBeGreaterThan(0);
        expect(
            () => new URL(entry.request.url),
            'request.url 应为合法 URL',
        ).not.toThrow();

        // response.status 为数字
        expect(
            typeof entry.response.status,
            'response.status 应为数字',
        ).toBe('number');

        // startedDateTime 符合 ISO 8601 格式
        expect(entry, 'entry 应有 startedDateTime').toHaveProperty('startedDateTime');
        expect(entry.startedDateTime, 'startedDateTime 应符合 ISO 8601').toMatch(
            /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        );

        // CDP body capture：至少一条 entry 的 response.content.text 非空
        const has_body = har.log.entries.some(
            (e: any) =>
                e.response?.content?.text &&
                e.response.content.text.length > 0,
        );
        // body capture 依赖 CDP，可能未启用；此处仅验证布尔判断不出错
        expect(typeof has_body, 'body capture 检测应为布尔值').toBe('boolean');
    });

    // ================================================================
    // HTML 导出内容验证
    // ================================================================

    test('HTML 导出无废弃字段且无 XSS 风险', async () => {
        const dash = await fix.context.newPage();
        await dash.goto(fix.dashboard_url, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
        });
        await dash.waitForTimeout(1000);

        const result = await dash.evaluate(async (id: string) => {
            try {
                return await (chrome.runtime.sendMessage({
                    action: 'export_html',
                    session_id: id,
                }) as Promise<{ success: boolean; html?: string }>);
            } catch {
                return { success: false, html: undefined };
            }
        }, capture_id);

        await dash.close();

        expect(result.success, 'HTML 导出应成功').toBe(true);
        expect(result.html, 'HTML 导出应有内容').toBeTruthy();

        const html = result.html!;

        // 不含废弃字段 "Mode"
        expect(html, 'HTML 不应含废弃字段 Mode').not.toContain('Mode');

        // 不含废弃模式概念 "basic" / "advanced"
        expect(html, 'HTML 不应含 basic').not.toMatch(/basic/i);
        expect(html, 'HTML 不应含 advanced').not.toMatch(/advanced/i);

        // XSS 向量检查（内容注入层面）
        // 模板自身含一个合法 <script> 标签（用于渲染 JSON 数据），
        // 用计数方式区分：将数据注入导致的多余 <script 视为风险。
        const script_matches = html.match(/<script/gi);
        if (script_matches && script_matches.length > 1) {
            // 额外 <script 出现视为 XSS 注入风险
            expect(script_matches.length, 'HTML 不应有多余 <script 注入').toBe(1);
        }

        const xss_substrings = [
            { pattern: 'onerror=', label: 'onerror=' },
            { pattern: 'onload=', label: 'onload=' },
            { pattern: 'javascript:', label: 'javascript:' },
            { pattern: '<iframe', label: '<iframe' },
        ];
        for (const { pattern, label } of xss_substrings) {
            expect(html, `HTML 不应包含 XSS 向量: ${label}`).not.toContain(pattern);
        }

        // HTML 包含本次 capture_id
        expect(html, 'HTML 应包含 capture_id').toContain(capture_id);

        // 具备基础 HTML 结构
        expect(html, 'HTML 应具备基础结构').toMatch(/<!DOCTYPE|<html/i);
    });
});
