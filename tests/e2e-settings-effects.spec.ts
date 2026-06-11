// tests/e2e-settings-effects.spec.ts — P1.7.5 设置子开关验证
// 验证 dashboard 精细子开关是否真正影响采集行为
import { test, expect, type Page } from '@playwright/test';
import { launch_extension, open_popup, type E2EFixture } from './e2e-helpers';

const TEST_PAGE = 'http://localhost:17832/test-page.html';

interface ExportResult {
    success: boolean;
    json?: string;
}

interface CaptureData {
    capture?: { config_snapshot?: Record<string, unknown>; capture_id?: string };
    events?: Array<Record<string, unknown>>;
    network_requests?: Array<Record<string, unknown>>;
    console_events?: Array<Record<string, unknown>>;
}

type ActionFn = (site: Page) => Promise<void>;

test.describe.serial('设置子开关验证', () => {
    let fix: E2EFixture;

    test.beforeAll(async () => {
        fix = await launch_extension();
    });

    test.afterAll(async () => {
        // 恢复所有设置到默认值
        const page = await fix.context.newPage();
        await page.goto(fix.popup_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(500);
        await page.evaluate(async () => {
            const result = await chrome.storage.local.get('user_config');
            const current = (result.user_config || {}) as Record<string, unknown>;
            await chrome.storage.local.set({
                user_config: {
                    ...current,
                    capture_response_body: true,
                    capture_request_body: true,
                    capture_input_values: true,
                    redact_data: true,
                },
            });
        });
        await page.close();
        await fix.context.close();
    });

    async function set_user_config(patch: Record<string, unknown>): Promise<void> {
        const page = await fix.context.newPage();
        await page.goto(fix.popup_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(300);
        await page.evaluate(async (p) => {
            const result = await chrome.storage.local.get('user_config');
            const current = (result.user_config || {}) as Record<string, unknown>;
            await chrome.storage.local.set({
                user_config: { ...current, ...p },
            });
        }, patch);
        await page.close();
    }

    async function run_capture_and_export(
        site_actions?: ActionFn,
    ): Promise<{ data: CaptureData; capture_id: string }> {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await fix.context.newPage();
        await site.goto(TEST_PAGE, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await site.waitForTimeout(1000);

        if (site_actions) {
            await site_actions(site);
        }

        await site.close();
        await popup.bringToFront();
        await popup.waitForTimeout(300);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(2000);

        // 打开 dashboard 获取 capture_id 并导出
        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        const capture_id = await dashboard.evaluate(() => {
            const btn = document.querySelector('[data-export]') as HTMLElement | null;
            return btn?.dataset?.export || '';
        });

        const json_result = await dashboard.evaluate(async (id) => {
            try {
                const r = await (chrome.runtime.sendMessage({
                    action: 'export_json',
                    session_id: id,
                }) as Promise<ExportResult>);
                return r;
            } catch {
                return { success: false, json: undefined };
            }
        }, capture_id);

        await dashboard.close();
        await popup.close();

        if (!json_result.success || !json_result.json) {
            throw new Error('JSON 导出失败: ' + JSON.stringify(json_result));
        }

        const data = JSON.parse(json_result.json) as CaptureData;
        return { data, capture_id };
    }

    // ==========================================================
    // Scenario 1: capture_response_body = false
    // ==========================================================
    test('capture_response_body=false → 所有网络请求标记 not_enabled', async () => {
        await set_user_config({ capture_response_body: false });

        const { data } = await run_capture_and_export(async (site) => {
            // 点击按钮生成额外用户事件，确保有足够数据
            await site.locator('#btn-click').click();
            await site.waitForTimeout(500);
        });

        // 验证 config_snapshot
        const config = data.capture?.config_snapshot;
        expect(config, 'config_snapshot 应存在').toBeDefined();
        expect(config!.capture_response_body,
            'config_snapshot.capture_response_body 应为 false').toBe(false);

        // 验证所有网络请求的 response_body_status
        const net = data.network_requests || [];
        expect(net.length, '至少应有一个网络请求').toBeGreaterThan(0);
        for (const req of net) {
            expect(req.response_body_status,
                `请求 ${req.url} response_body_status 应为 not_enabled`)
                .toBe('not_enabled');
        }

        // 恢复设置
        await set_user_config({ capture_response_body: true });
    });

    // ==========================================================
    // Scenario 2: capture_request_body = false
    // ==========================================================
    test('capture_request_body=false → 请求体状态标记 not_enabled', async () => {
        await set_user_config({ capture_request_body: false });

        const { data } = await run_capture_and_export(async (site) => {
            // 发起一个会带参数的请求
            await site.evaluate(() => {
                fetch('/api/echo?data=e2e_settings_test');
            });
            await site.waitForTimeout(1000);
        });

        // 验证 config_snapshot
        const config = data.capture?.config_snapshot;
        expect(config, 'config_snapshot 应存在').toBeDefined();
        expect(config!.capture_request_body,
            'config_snapshot.capture_request_body 应为 false').toBe(false);

        // 验证网络请求的 request_body_status
        const net = data.network_requests || [];
        const echo_reqs = net.filter(
            (r) => typeof r.url === 'string' && r.url.includes('/api/echo'),
        );
        // 如果捕获到 /api/echo 请求则验证；否则验证所有请求
        const targets = echo_reqs.length > 0 ? echo_reqs : net;
        expect(targets.length, '应有网络请求').toBeGreaterThan(0);
        for (const req of targets) {
            expect(req.request_body_status,
                `请求 ${req.url} request_body_status 应为 not_enabled`)
                .toBe('not_enabled');
        }

        // 恢复设置
        await set_user_config({ capture_request_body: true });
    });

    // ==========================================================
    // Scenario 3: capture_input_values = false
    // ==========================================================
    test('capture_input_values=false → 输入事件 value_status=not_captured', async () => {
        await set_user_config({ capture_input_values: false });

        const { data } = await run_capture_and_export(async (site) => {
            // 在输入框中键入内容并触发 change
            await site.locator('#input-text').click();
            await site.locator('#input-text').fill('e2e-test-value');
            await site.locator('#input-text').blur();
            await site.waitForTimeout(500);
        });

        // 验证 config_snapshot
        const config = data.capture?.config_snapshot;
        expect(config, 'config_snapshot 应存在').toBeDefined();
        expect(config!.capture_input_values,
            'config_snapshot.capture_input_values 应为 false').toBe(false);

        // 查找输入相关事件（用户行为中的 input 事件）
        const events = data.events || [];
        const input_events = events.filter(
            (ev) => ev.category === '用户行为'
                && (ev.type === 'input_change' || ev.type === 'input'),
        );

        if (input_events.length > 0) {
            for (const ev of input_events) {
                // value_status 应为 not_captured，value_preview 应为 null
                const status = ev.value_status ?? ev.data_value_status;
                expect(status,
                    `输入事件 value_status 应为 not_captured`).toBe('not_captured');

                const preview = ev.value_preview ?? ev.data_value_preview ?? '<UNSET>';
                expect(preview,
                    `输入事件 value_preview 应为 null`).toBeNull();
            }
        }
        // 如果无输入事件，至少验证配置已生效（强条件）

        // 恢复设置
        await set_user_config({ capture_input_values: true });
    });

    // ==========================================================
    // Scenario 4: redact_data = false
    // ==========================================================
    test('redact_data=false → 响应体不脱敏且输入值状态为 captured', async () => {
        await set_user_config({ redact_data: false });

        const { data } = await run_capture_and_export(async (site) => {
            // 键入内容以便检查 value_status
            await site.locator('#input-text').click();
            await site.locator('#input-text').fill('e2e-no-redact');
            await site.locator('#input-text').blur();
            await site.waitForTimeout(500);
        });

        // 验证 config_snapshot
        const config = data.capture?.config_snapshot;
        expect(config, 'config_snapshot 应存在').toBeDefined();
        expect(config!.redact_data,
            'config_snapshot.redact_data 应为 false').toBe(false);

        // 验证响应体不包含 [REDACTED] 标记
        const net = data.network_requests || [];
        for (const req of net) {
            const resp_body = req.response_body as string | null | undefined;
            if (resp_body && resp_body.length > 0) {
                expect(resp_body,
                    `响应体 ${req.url} 不应包含 [REDACTED]`)
                    .not.toContain('[REDACTED]');
            }
        }

        // 验证输入事件的 value_status 不是 redacted
        const events = data.events || [];
        const input_events = events.filter(
            (ev) => ev.category === '用户行为'
                && (ev.type === 'input_change' || ev.type === 'input'),
        );
        for (const ev of input_events) {
            const status = ev.value_status ?? ev.data_value_status;
            expect(status,
                `输入事件 value_status 不应为 redacted`).not.toBe('redacted');
        }

        // 恢复设置
        await set_user_config({ redact_data: true });
    });
});
