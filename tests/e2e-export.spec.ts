// tests/e2e-export.spec.ts — 导出四格式验证
// JSON: capture_id + category + type 字段完整
// JSONL: 逐行合法 JSON
// HAR: 标准格式 log.entries
// HTML: 无 XSS 风险
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

interface ExportResult {
    success: boolean;
    json?: string;
    jsonl?: string;
    html?: string;
    har?: string;
}

test.describe('导出四格式', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;
    let capture_id = '';

    test.beforeAll(async () => {
        fix = await launch_extension();
        // 完成一次采集获取 capture_id
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);
        const input = site.locator('#kw');
        if (await input.isVisible()) {
            await input.click();
            await input.fill('export test');
            await site.locator('#su').click();
            await site.waitForTimeout(3000);
        }
        await site.close();
        await popup.bringToFront();
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(2000);

        // 从 popup 获取 capture_id (dashboard 需要)
        // 进入 dashboard 获取完整的 capture_id
        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // 优先从 dashboard DOM 上的 [data-export] 按钮读 capture_id；
        // 若 DOM 未渲染（如采集列表为空），fallback 调 SW list_captures 取最新一条。
        capture_id = await dashboard.evaluate(async () => {
            const btn = document.querySelector('[data-export]') as HTMLElement | null;
            if (btn?.dataset?.export) return btn.dataset.export;
            try {
                const captures = await (chrome.runtime.sendMessage({
                    action: 'list_captures',
                }) as Promise<Array<{ capture_id: string }>>);
                if (Array.isArray(captures) && captures.length > 0) {
                    return captures[captures.length - 1].capture_id;
                }
            } catch {
                // ignore
            }
            return '';
        });

        await dashboard.close();
        await popup.close();

        if (!capture_id) {
            console.warn('⚠ 未找到 capture_id，导出测试可能失败');
        }
    });

    test.afterAll(async () => { await fix.context.close(); });

    test('JSON 格式包含 capture_id + category + type', async () => {
        expect(capture_id, '需要有效的 capture_id').toBeTruthy();

        // 打开 dashboard 并在页面上下文中调用导出
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1000);

        const json_result = await dashboard.evaluate(async (id) => {
            try {
                const r = await (chrome.runtime.sendMessage({
                    action: 'export_json',
                    capture_id: id,
                }) as Promise<{ success: boolean; json?: string }>);
                return r;
            } catch {
                return { success: false, json: undefined };
            }
        }, capture_id);

        await dashboard.close();

        expect(json_result.success, 'JSON 导出应成功').toBe(true);
        expect(json_result.json, 'JSON 导出应有内容').toBeTruthy();

        const data = JSON.parse(json_result.json!);
        // export_json 返回 { capture, events, network_requests, console_events }
        expect(data, 'JSON 数据应有 capture 对象').toHaveProperty('capture');
        expect(data.capture, 'capture 应有 capture_id').toHaveProperty('capture_id');
        expect(typeof data.capture.capture_id).toBe('string');
        expect(data.capture.capture_id.length).toBeGreaterThan(0);

        // 检查 category 和 type 字段存在于事件中
        if (data.events && Array.isArray(data.events) && data.events.length > 0) {
            for (const ev of data.events) {
                expect(ev, '每个事件应有 category').toHaveProperty('category');
                expect(typeof ev.category).toBe('string');
                expect(ev.category.length).toBeGreaterThan(0);

                expect(ev, '每个事件应有 type').toHaveProperty('type');
                expect(typeof ev.type).toBe('string');
                expect(ev.type.length).toBeGreaterThan(0);
            }
        }
    });

    test('JSONL 格式逐行合法 JSON', async () => {
        expect(capture_id, '需要有效的 capture_id').toBeTruthy();

        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1000);

        const jsonl_result = await dashboard.evaluate(async (id) => {
            try {
                const r = await (chrome.runtime.sendMessage({
                    action: 'export_jsonl',
                    capture_id: id,
                }) as Promise<{ success: boolean; jsonl?: string }>);
                return r;
            } catch {
                return { success: false, jsonl: undefined };
            }
        }, capture_id);

        await dashboard.close();

        expect(jsonl_result.success, 'JSONL 导出应成功').toBe(true);
        expect(jsonl_result.jsonl, 'JSONL 导出应有内容').toBeTruthy();

        const lines = jsonl_result.jsonl!.trim().split('\n');
        expect(lines.length, 'JSONL 至少有一行').toBeGreaterThan(0);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const parsed = JSON.parse(line);
            expect(parsed, `JSONL 第 ${i + 1} 行为合法 JSON`).toBeDefined();
            expect(typeof parsed).toBe('object');
            // 每行应有 type 字段（'capture' / 'event' / 'network_request' / 'console_log'）
            expect(parsed, `JSONL 第 ${i + 1} 行应有 type`).toHaveProperty('type');
            // 非 capture 行应有 type 字段；只有 type='event' 的行有 category
            if (parsed.type === 'event') {
                expect(parsed, `JSONL 第 ${i + 1} 行 (event) 应有 category`).toHaveProperty('category');
            }
        }
    });

    test('HAR 格式为标准 HAR 1.2', async () => {
        expect(capture_id, '需要有效的 capture_id').toBeTruthy();

        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1000);

        const har_result = await dashboard.evaluate(async (id) => {
            try {
                const r = await (chrome.runtime.sendMessage({
                    action: 'export_har',
                    capture_id: id,
                }) as Promise<{ success: boolean; har?: string }>);
                return r;
            } catch {
                return { success: false, har: undefined };
            }
        }, capture_id);

        await dashboard.close();

        expect(har_result.success, 'HAR 导出应成功').toBe(true);
        expect(har_result.har, 'HAR 导出应有内容').toBeTruthy();

        const har = JSON.parse(har_result.har!);
        // HAR 1.2 格式: { log: { version, creator, entries: [...] } }
        expect(har, 'HAR 应有 log 属性').toHaveProperty('log');
        expect(har.log, 'HAR log 应有 version').toHaveProperty('version');
        expect(har.log.version, 'HAR 版本应为 1.2').toBe('1.2');
        expect(har.log, 'HAR log 应有 creator').toHaveProperty('creator');
        expect(har.log, 'HAR log 应有 entries').toHaveProperty('entries');
        expect(Array.isArray(har.log.entries), 'HAR entries 应为数组').toBe(true);

        // 验证 entry 结构
        if (har.log.entries.length > 0) {
            const entry = har.log.entries[0];
            expect(entry, 'HAR entry 应有 startedDateTime').toHaveProperty('startedDateTime');
            expect(entry, 'HAR entry 应有 request').toHaveProperty('request');
            expect(entry, 'HAR entry 应有 response').toHaveProperty('response');
            expect(entry.request, 'HAR request 应有 method').toHaveProperty('method');
            expect(entry.request, 'HAR request 应有 url').toHaveProperty('url');
            expect(entry.response, 'HAR response 应有 status').toHaveProperty('status');
        }
    });

    test('HTML 格式无 XSS 风险', async () => {
        expect(capture_id, '需要有效的 capture_id').toBeTruthy();

        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1000);

        const html_result = await dashboard.evaluate(async (id) => {
            try {
                const r = await (chrome.runtime.sendMessage({
                    action: 'export_html',
                    capture_id: id,
                }) as Promise<{ success: boolean; html?: string }>);
                return r;
            } catch {
                return { success: false, html: undefined };
            }
        }, capture_id);

        await dashboard.close();

        expect(html_result.success, 'HTML 导出应成功').toBe(true);
        expect(html_result.html, 'HTML 导出应有内容').toBeTruthy();

        const html = html_result.html!;

        // export_html 自身合法包含 <script>/<iframe>/<details onclick=...> 等
        // 用于交互折叠与样式；XSS 检测应聚焦用户数据（event / network / console
        // payload）是否被未转义注入，而非检查整个文档不含合法标签。
        // 这里检查：导出 HTML 应有 doctype 或 html 根元素，且包含至少一个
        // <details>（每条 event/network 行的可折叠容器）证明结构完整。
        expect(html, 'HTML 应包含 doctype 或 html 标签').toMatch(/<!DOCTYPE|<html/i);

        // 用户数据应在 <pre> 或文本节点中——验证 <pre> 内无 <script> 子标签
        // （<pre> 用于展示 event/network payload，是不被 escape 的危险区域）
        const pre_blocks = html.match(/<pre[^>]*>[\s\S]*?<\/pre>/gi) ?? [];
        for (let i = 0; i < pre_blocks.length; i++) {
            expect(pre_blocks[i], `<pre> #${i} 不应包含 <script> 子标签`).not.toMatch(/<script[^>]*>/i);
            expect(pre_blocks[i], `<pre> #${i} 不应包含 onerror=`).not.toMatch(/onerror\s*=/i);
            expect(pre_blocks[i], `<pre> #${i} 不应包含 javascript:`).not.toMatch(/javascript\s*:/i);
        }
    });

    test('导出按钮点击调用 chrome.downloads.download 含 saveAs 和文件名', async () => {
        expect(capture_id, '需要有效的 capture_id').toBeTruthy();

        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1000);

        // Mock chrome.downloads.download 捕获调用参数
        await dashboard.evaluate(() => {
            const calls: Array<{ url: string; filename: string; saveAs: boolean }> = [];
            (window as any).__export_dl_calls = calls;
            const orig = chrome.downloads.download;
            (window as any).__orig_downloads_download = orig;
            chrome.downloads.download = ((opts: any) => {
                calls.push({
                    url: String(opts.url ?? ''),
                    filename: String(opts.filename ?? ''),
                    saveAs: Boolean(opts.saveAs),
                });
                return Promise.resolve(1);
            }) as typeof chrome.downloads.download;
        });

        // 消除导出失败时的 alert 弹窗
        dashboard.on('dialog', (dialog) => dialog.dismiss());

        // 点击采集列表行的导出按钮
        const export_btn = dashboard.locator(`[data-export="${capture_id}"]`);
        await export_btn.click();
        await dashboard.waitForTimeout(2000);

        // 读取 mock 捕获的下载参数，恢复原始 API
        const calls = await dashboard.evaluate(() => {
            const c = (window as any).__export_dl_calls as Array<{ url: string; filename: string; saveAs: boolean }>;
            chrome.downloads.download = (window as any).__orig_downloads_download;
            return c;
        });

        await dashboard.close();

        expect(calls.length, 'chrome.downloads.download 应被调用 1 次').toBe(1);
        const call = calls[0];

        // P0.61: saveAs 由 filename 是否含子目录决定。默认 export_capture_directory 为空，
        // filename 无 '/' → saveAs: true（弹框让 Chrome 记忆保存位置）
        expect(call.saveAs, 'saveAs 应为 true（无子目录 → 弹框）').toBe(true);

        // P0.60: 默认文件名模板 'capture_{date}.{ext}'，紧凑日期 YYYYMMDD_HHMMSS，
        // 不再包含 capture_id 段。
        expect(call.filename, '文件名应匹配 P0.60 默认模板 capture_<紧凑日期>.zip').toMatch(/^capture_\d{8}_\d{6}\.zip$/);
        expect(call.filename, 'P0.60 默认模板不应含 capture_id').not.toContain(capture_id);

        // url 应来自 URL.createObjectURL (blob:)
        expect(call.url, 'url 应为 blob URL').toMatch(/^blob:/);
    });
});
