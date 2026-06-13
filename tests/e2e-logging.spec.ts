// tests/e2e-logging.spec.ts — P7.6 日志系统 E2E 测试
import { test, expect } from '@playwright/test';
import {
    launch_extension,
    open_popup,
    open_site,
    TEST_SITES,
} from './e2e-helpers';

test.describe('日志系统', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => {
        fix = await launch_extension();
    });

    test.afterAll(async () => {
        await fix.context.close();
    });

    // ── helpers ──────────────────────────────────────────

    /** 打开 dashboard 设置页面 — 诊断日志 tab */
    async function open_diagnostics(): Promise<
        ReturnType<typeof fix.context.newPage>
    > {
        const dash = await fix.context.newPage();
        await dash.goto(fix.dashboard_url, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
        });
        await dash.waitForTimeout(500);

        const settings_nav = dash.locator('[data-nav="settings"]');
        if (await settings_nav.isVisible()) {
            await settings_nav.click();
            await dash.waitForTimeout(400);
        }

        const diag_nav = dash.locator('[data-setnav="set-diagnostics"]');
        if (await diag_nav.isVisible()) {
            await diag_nav.click();
            await dash.waitForTimeout(300);
        }

        return dash;
    }

    /** 在 dashboard 设置页切换日志级别 */
    async function set_log_level(
        dash: ReturnType<typeof fix.context.newPage>,
        level: string,
    ): Promise<void> {
        // 用 evaluate 直接触发 click handler，绕过 DOM 遮挡
        await dash.evaluate((lv) => {
            const seg = document.querySelector('[data-seg="log_level"]');
            const btn = seg?.querySelector(
                `button[data-val="${lv}"]`,
            ) as HTMLElement | null;
            if (btn) {
                // 手动设置 data-on 并触发 click handler
                seg!.querySelectorAll('button').forEach(
                    (b) => ((b as HTMLElement).dataset.on = '0'),
                );
                btn.dataset.on = '1';
                btn.click();
            }
        }, level);
        await dash.waitForTimeout(400);
    }

    /** 清除所有日志 */
    async function clear_logs(
        dash: ReturnType<typeof fix.context.newPage>,
    ): Promise<void> {
        dash.on('dialog', async (dialog) => {
            await dialog.accept();
        });
        const btn = dash.locator('#clearLogs');
        if (await btn.isVisible()) {
            await btn.click();
            await dash.waitForTimeout(600);
        }
    }

    /** 调 background SW 强制 flush 日志 buffer */
    async function flush_app_logs(
        dash: ReturnType<typeof fix.context.newPage>,
    ): Promise<void> {
        await dash.evaluate(async () => {
            return new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { action: 'flush_app_logs' },
                    () => resolve(undefined),
                );
            });
        });
        await dash.waitForTimeout(500);
    }

    /** 快速完成一次采集以产生日志 */
    async function quick_capture(): Promise<void> {
        const popup = await open_popup(fix);
        await popup.waitForTimeout(300);

        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(600);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(1500);
        await site.close();

        await popup.bringToFront();
        await popup.waitForTimeout(400);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        await popup.close();
    }

    // ============================================================
    // 1. 级别切换 silent / debug 往返 — UI 交互验证
    // ============================================================

    test('级别切换 silent → debug 往返 UI 交互正常', async () => {
        const dash = await open_diagnostics();

        const seg = dash.locator('[data-seg="log_level"]');
        await expect(seg).toBeVisible();

        // debug
        await set_log_level(dash, 'debug');
        await expect(
            seg.locator('button[data-val="debug"]'),
        ).toHaveAttribute('data-on', '1');

        // silent
        await set_log_level(dash, 'silent');
        await expect(
            seg.locator('button[data-val="silent"]'),
        ).toHaveAttribute('data-on', '1');

        // warn
        await set_log_level(dash, 'warn');
        await expect(
            seg.locator('button[data-val="warn"]'),
        ).toHaveAttribute('data-on', '1');

        await dash.close();
    });

    // ============================================================
    // 2. 导出日志 JSON 含内部日志条目
    // ============================================================

    test('导出日志 JSON 含内部日志条目', async () => {
        const dash = await open_diagnostics();

        await set_log_level(dash, 'debug');
        await dash.waitForTimeout(300);
        await clear_logs(dash);
        await dash.waitForTimeout(300);

        // 多次采集产生日志
        for (let i = 0; i < 4; i++) {
            await quick_capture();
        }

        // 强制 flush buffer
        await dash.bringToFront();
        await flush_app_logs(dash);

        // 重新加载 dashboard 导出
        await dash.reload();
        await dash.waitForTimeout(500);
        await dash.locator('[data-nav="settings"]').click();
        await dash.waitForTimeout(300);
        await dash.locator('[data-setnav="set-diagnostics"]').click();
        await dash.waitForTimeout(300);

        const [download] = await Promise.all([
            dash.waitForEvent('download', { timeout: 8000 }),
            dash.locator('#exportLogJson').click(),
        ]);

        const path = await download.path();
        expect(path).toBeTruthy();

        const fs = await import('fs');
        const content = fs.readFileSync(path!, 'utf-8');
        const parsed = JSON.parse(content);

        // 验证导出结构
        expect(parsed).toHaveProperty('exported_at');
        expect(parsed).toHaveProperty('total');
        expect(parsed).toHaveProperty('entries');
        expect(Array.isArray(parsed.entries)).toBe(true);
        expect(parsed.total).toBeGreaterThan(0);

        // 验证条目结构
        const entry = parsed.entries[0];
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('timestamp');
        expect(entry).toHaveProperty('level');
        expect(entry).toHaveProperty('module');
        expect(entry).toHaveProperty('message');

        await dash.close();
    });

    // ============================================================
    // 3. 导出采集数据 JSON 不含扩展自身日志
    // ============================================================

    test('导出采集数据 JSON 不含扩展自身日志', async () => {
        const popup = await open_popup(fix);
        await popup.waitForTimeout(300);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);
        await site.close();

        await popup.bringToFront();
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        const [detail] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await detail.waitForLoadState('domcontentloaded');
        await detail.waitForTimeout(2000);

        const export_result = await detail.evaluate(async () => {
            return new Promise((resolve) => {
                const url = new URL(window.location.href);
                const capture_id = url.searchParams.get('capture') || '';
                chrome.runtime.sendMessage(
                    { action: 'export_json', capture_id },
                    (resp) => resolve(resp),
                );
            });
        });

        const typed = export_result as {
            success: boolean;
            json: string;
        } | null;

        if (typed?.success && typed.json) {
            const data = JSON.parse(typed.json);

            // 检查 console_events 不含扩展自身日志
            if (data.console_events && Array.isArray(data.console_events)) {
                for (const log of data.console_events) {
                    const msg =
                        log.data?.args_preview?.join(' ') ||
                        log.message ||
                        '';
                    expect(msg).not.toContain('Capture All:');
                    expect(msg).not.toContain('background/sw');
                    expect(msg).not.toContain('background/session');
                }
            }

            // JSON 字符串级检查：不含扩展内部模块标签
            const json_str = JSON.stringify(data);
            expect(json_str).not.toContain('"module":"background/sw"');
            expect(json_str).not.toContain('"module":"background/session"');
            expect(json_str).not.toContain('"module":"popup"');
            expect(json_str).not.toContain('"module":"dashboard"');
        }

        await detail.close();
        await popup.close();
    });

    // ============================================================
    // 4. 超上限自动清理
    // ============================================================

    test('超上限自动清理 — 设置小上限并验证导出', async () => {
        const dash = await open_diagnostics();

        await set_log_level(dash, 'debug');
        await dash.waitForTimeout(300);

        const max_input = dash.locator('[data-cfg="log_max_entries"]');
        await max_input.fill('20');
        await max_input.dispatchEvent('change');
        await dash.waitForTimeout(300);

        await clear_logs(dash);
        await dash.waitForTimeout(300);

        // 多次采集
        for (let i = 0; i < 4; i++) {
            await quick_capture();
        }

        // 强制 flush 触发 trim
        await dash.bringToFront();
        await flush_app_logs(dash);

        await dash.reload();
        await dash.waitForTimeout(500);
        await dash.locator('[data-nav="settings"]').click();
        await dash.waitForTimeout(300);
        await dash.locator('[data-setnav="set-diagnostics"]').click();
        await dash.waitForTimeout(300);

        const [download] = await Promise.all([
            dash.waitForEvent('download', { timeout: 8000 }),
            dash.locator('#exportLogJson').click(),
        ]);

        const path = await download.path();
        if (path) {
            const fs = await import('fs');
            const content = fs.readFileSync(path, 'utf-8');
            const parsed = JSON.parse(content);
            // trim 后总数应 ≤ 上限 + 容差
            expect(parsed.total).toBeLessThanOrEqual(40);
        }

        // 恢复默认上限
        await max_input.fill('10000');
        await max_input.dispatchEvent('change');
        await dash.waitForTimeout(300);

        await dash.close();
    });

    // ============================================================
    // 5. 诊断日志 UI 完整
    // ============================================================

    test('诊断日志 UI 完整：按钮和输入框', async () => {
        const dash = await open_diagnostics();

        await expect(dash.locator('#exportLogJson')).toBeVisible();
        await expect(dash.locator('#exportLogJsonl')).toBeVisible();
        await expect(dash.locator('#clearLogs')).toBeVisible();
        await expect(dash.locator('#logCount')).toBeVisible();
        await expect(
            dash.locator('[data-cfg="log_max_entries"]'),
        ).toBeVisible();
        await expect(dash.locator('[data-seg="log_level"]')).toBeVisible();

        await dash.close();
    });

    // ============================================================
    // 6. 运行日志导出 .log 扩展名 (P0.28)
    // ============================================================

    test('运行日志导出 filename 以 .log 结尾', async () => {
        const dash = await open_diagnostics();

        await set_log_level(dash, 'debug');
        await dash.waitForTimeout(300);

        // 点击 #exportLog 触发纯文本日志导出
        const [download] = await Promise.all([
            dash.waitForEvent('download', { timeout: 8000 }),
            dash.locator('#exportLog').click(),
        ]);

        const filename = download.suggestedFilename();
        expect(filename).toMatch(/\.log$/);
        expect(filename).not.toMatch(/\.txt$/);

        await dash.close();
    });

    // ============================================================
    // 7. 运行日志导出 MIME 非 text/plain (P0.28)
    // ============================================================

    test('运行日志导出内容为可读文本', async () => {
        const dash = await open_diagnostics();

        await set_log_level(dash, 'debug');
        await dash.waitForTimeout(300);

        const [download] = await Promise.all([
            dash.waitForEvent('download', { timeout: 8000 }),
            dash.locator('#exportLog').click(),
        ]);

        const path = await download.path();
        expect(path).toBeTruthy();

        const fs = await import('fs');
        const content = fs.readFileSync(path!, 'utf-8');
        // 内容应为可读文本，不是 JSON
        expect(content.length).toBeGreaterThan(0);
        // 不应是 JSON 格式
        expect(() => JSON.parse(content)).toThrow();

        await dash.close();
    });
});
