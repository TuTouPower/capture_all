// tests/e2e-toggle-effects.spec.ts — P1.7.3 弹窗 8 开关功能验证
// Each popup toggle OFF must prevent its data category from being captured.
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup } from './e2e-helpers';

const TEST_PAGE = 'http://localhost:17832/test-page.html';

interface ToggleTestSpec {
    label: string;
    data_key: string;
    config_field: string;
    missing_tag: string | null;
    verify_fn: (data: Record<string, unknown>) => void;
}

// ── Helper: perform one capture cycle with a toggle OFF ────────────────────
async function capture_with_toggle_off(
    fix: Awaited<ReturnType<typeof launch_extension>>,
    data_key: string,
) {
    // 1. Open popup
    const popup = await open_popup(fix);

    // 2. Click toggle to turn OFF
    const toggle = popup.locator(`.mcard-toggle[data-key="${data_key}"]`);
    await toggle.click();
    await popup.waitForTimeout(300);
    // Verify OFF state
    await expect(
        popup.locator(`.mcard-toggle[data-key="${data_key}"].mcard-off`),
        `${data_key} 切换后应处于 OFF 状态`
    ).toBeVisible();

    // 3. Start capture
    await popup.locator('#startBtn').click();
    await popup.waitForTimeout(500);

    // 4. Open test page
    const site = await fix.context.newPage();
    await site.goto(TEST_PAGE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await site.waitForTimeout(3000); // 等待初始事件（console、cookie、storage、fetch）

    // 5. Interact to generate all category events
    await site.locator('#btn-click').click();
    await site.waitForTimeout(300);
    await site.locator('#input-text').fill('toggle test ' + data_key);
    await site.waitForTimeout(300);
    await site.locator('#btn-error').click();
    await site.waitForTimeout(1000);
    await site.close();

    // 6. Stop capture
    await popup.bringToFront();
    await popup.locator('#stopBtn').click();
    await popup.waitForTimeout(2000);

    // 7. Get capture_id from popup recent row
    const capture_id = await popup.evaluate(() => {
        const row = document.querySelector('.recent-row') as HTMLElement | null;
        return row?.dataset?.session || '';
    });
    if (!capture_id) {
        // Fallback: use list_sessions
        const sessions = await popup.evaluate(() =>
            chrome.runtime.sendMessage({ action: 'list_sessions' })
        );
        const latest = sessions?.[0];
        if (!latest) throw new Error('无法获取 capture_id');
        return { popup, capture_id: latest.capture_id };
    }

    return { popup, capture_id };
}

// ── Helper: export JSON from dashboard ─────────────────────────────────────
async function export_json(fix: Awaited<ReturnType<typeof launch_extension>>, capture_id: string) {
    const dashboard = await fix.context.newPage();
    await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await dashboard.waitForTimeout(1000);

    const result = await dashboard.evaluate(async (id) => {
        try {
            const r = await (chrome.runtime.sendMessage({
                action: 'export_json',
                session_id: id,
            }) as Promise<{ success: boolean; json?: string }>);
            return r;
        } catch {
            return { success: false, json: undefined };
        }
    }, capture_id);

    await dashboard.close();
    return result;
}

// ── Verify helpers ────────────────────────────────────────────────────────

function expect_has_data(condition: boolean, label: string) {
    expect(condition, `${label} 应仍有数据`).toBe(true);
}

function expect_no_data(condition: boolean, label: string) {
    expect(condition, `关闭 ${label} 后不应有数据`).toBe(true);
}

// ── Test Suite ────────────────────────────────────────────────────────────

test.describe('弹窗开关功能验证', () => {
    test.describe.configure({ mode: 'serial' });

    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => {
        fix = await launch_extension();
    });

    test.afterAll(async () => {
        await fix.context.close();
    });

    // ── Test 1: 用户行为 OFF ──────────────────────────────────────────────
    test('1. 关闭 用户行为 开关后停止采集用户行为事件', async () => {
        const { popup, capture_id } = await capture_with_toggle_off(fix, 'event_count');
        const result = await export_json(fix, capture_id);
        expect(result.success, 'JSON export should succeed').toBe(true);

        const data = JSON.parse(result.json!);
        const capture = data.capture;

        // a) events 中无 category='user_action'
        const user_events = (data.events as Array<{ category: string }>)
            .filter((e) => e.category === 'user_action');
        expect_no_data(user_events.length === 0, '用户行为');

        // b) 其他类型事件仍存在
        const non_user = (data.events as Array<{ category: string }>)
            .filter((e) => e.category !== 'user_action');
        expect_has_data(non_user.length > 0, '非用户行为事件');
        expect_has_data((data.console_events as unknown[]).length > 0, '控制台事件');
        expect_has_data((data.network_requests as unknown[]).length > 0, '网络请求');

        // c) config_snapshot
        expect(capture.config_snapshot.event_count_enabled).toBe(false);

        // d) tags
        expect(capture.tags).not.toContain('用户行为');

        await popup.close();
    });

    // ── Test 2: 页面导航 OFF ──────────────────────────────────────────────
    test('2. 关闭 页面导航 开关后停止采集页面导航事件', async () => {
        const { popup, capture_id } = await capture_with_toggle_off(fix, 'nav_count');
        const result = await export_json(fix, capture_id);
        expect(result.success, 'JSON export should succeed').toBe(true);

        const data = JSON.parse(result.json!);
        const capture = data.capture;

        // a) events 中无 category='navigation'
        const nav_events = (data.events as Array<{ category: string }>)
            .filter((e) => e.category === 'navigation');
        expect_no_data(nav_events.length === 0, '页面导航');

        // b) 其他类型事件仍存在
        const non_nav = (data.events as Array<{ category: string }>)
            .filter((e) => e.category !== 'navigation');
        expect_has_data(non_nav.length > 0, '非导航事件');
        expect_has_data((data.console_events as unknown[]).length > 0, '控制台事件');
        expect_has_data((data.network_requests as unknown[]).length > 0, '网络请求');

        // c) config_snapshot
        expect(capture.config_snapshot.nav_count_enabled).toBe(false);

        // d) tags
        expect(capture.tags).not.toContain('页面导航');

        await popup.close();
    });

    // ── Test 3: 网络请求 OFF ──────────────────────────────────────────────
    test('3. 关闭 网络请求 开关后停止采集网络请求', async () => {
        const { popup, capture_id } = await capture_with_toggle_off(fix, 'request_count');
        const result = await export_json(fix, capture_id);
        expect(result.success, 'JSON export should succeed').toBe(true);

        const data = JSON.parse(result.json!);
        const capture = data.capture;

        // a) network_requests.length = 0
        const network_requests = (data.network_requests as unknown[]) || [];
        expect_no_data(network_requests.length === 0, '网络请求');

        // b) 控制台/事件仍存在
        expect_has_data((data.console_events as unknown[]).length > 0, '控制台事件');
        expect_has_data((data.events as unknown[]).length > 0, '事件');

        // c) config_snapshot
        expect(capture.config_snapshot.capture_network).toBe(false);

        // d) tags
        expect(capture.tags).not.toContain('网络请求');

        await popup.close();
    });

    // ── Test 4: 控制台 OFF ────────────────────────────────────────────────
    test('4. 关闭 控制台 开关后停止采集控制台事件', async () => {
        const { popup, capture_id } = await capture_with_toggle_off(fix, 'log_count');
        const result = await export_json(fix, capture_id);
        expect(result.success, 'JSON export should succeed').toBe(true);

        const data = JSON.parse(result.json!);
        const capture = data.capture;

        // a) console_events.length = 0
        const console_events = (data.console_events as unknown[]) || [];
        expect_no_data(console_events.length === 0, '控制台');

        // b) 网络请求/事件仍存在
        expect_has_data((data.network_requests as unknown[]).length > 0, '网络请求');
        expect_has_data((data.events as unknown[]).length > 0, '事件');

        // c) config_snapshot
        expect(capture.config_snapshot.capture_console).toBe(false);

        // d) tags
        expect(capture.tags).not.toContain('控制台');

        await popup.close();
    });

    // ── Test 5: 错误异常 OFF ──────────────────────────────────────────────
    test('5. 关闭 错误异常 开关后停止采集错误事件', async () => {
        const { popup, capture_id } = await capture_with_toggle_off(fix, 'error_count');
        const result = await export_json(fix, capture_id);
        expect(result.success, 'JSON export should succeed').toBe(true);

        const data = JSON.parse(result.json!);
        const capture = data.capture;

        // a) events 中无 category='error'
        const error_events = (data.events as Array<{ category: string }>)
            .filter((e) => e.category === 'error');
        expect_no_data(error_events.length === 0, '错误异常');

        // b) 其他类型事件仍存在
        const non_error = (data.events as Array<{ category: string }>)
            .filter((e) => e.category !== 'error');
        expect_has_data(non_error.length > 0, '非错误事件');
        expect_has_data((data.console_events as unknown[]).length > 0, '控制台事件');
        expect_has_data((data.network_requests as unknown[]).length > 0, '网络请求');

        // c) config_snapshot
        expect(capture.config_snapshot.error_count_enabled).toBe(false);

        // d) tags
        expect(capture.tags).not.toContain('错误异常');

        await popup.close();
    });

    // ── Test 6: Storage OFF ────────────────────────────────────────────────
    test('6. 关闭 Storage 开关后停止采集 Storage 变更', async () => {
        const { popup, capture_id } = await capture_with_toggle_off(fix, 'storage_change_count');
        const result = await export_json(fix, capture_id);
        expect(result.success, 'JSON export should succeed').toBe(true);

        const data = JSON.parse(result.json!);
        const capture = data.capture;

        // a) events 中无 category='storage'
        const storage_events = (data.events as Array<{ category: string }>)
            .filter((e) => e.category === 'storage');
        expect_no_data(storage_events.length === 0, 'Storage');

        // b) 其他类型事件仍存在
        const non_storage = (data.events as Array<{ category: string }>)
            .filter((e) => e.category !== 'storage');
        expect_has_data(non_storage.length > 0, '非 Storage 事件');
        expect_has_data((data.console_events as unknown[]).length > 0, '控制台事件');
        expect_has_data((data.network_requests as unknown[]).length > 0, '网络请求');

        // c) config_snapshot
        expect(capture.config_snapshot.storage_change_count_enabled).toBe(false);

        // d) tags
        expect(capture.tags).not.toContain('Storage');

        await popup.close();
    });

    // ── Test 7: Cookie OFF ─────────────────────────────────────────────────
    test('7. 关闭 Cookie 开关后停止采集 Cookie 变更', async () => {
        const { popup, capture_id } = await capture_with_toggle_off(fix, 'cookie_change_count');
        const result = await export_json(fix, capture_id);
        expect(result.success, 'JSON export should succeed').toBe(true);

        const data = JSON.parse(result.json!);
        const capture = data.capture;

        // a) events 中无 category='cookie'
        const cookie_events = (data.events as Array<{ category: string }>)
            .filter((e) => e.category === 'cookie');
        expect_no_data(cookie_events.length === 0, 'Cookie');

        // b) 其他类型事件仍存在
        const non_cookie = (data.events as Array<{ category: string }>)
            .filter((e) => e.category !== 'cookie');
        expect_has_data(non_cookie.length > 0, '非 Cookie 事件');
        expect_has_data((data.console_events as unknown[]).length > 0, '控制台事件');
        expect_has_data((data.network_requests as unknown[]).length > 0, '网络请求');

        // c) config_snapshot
        expect(capture.config_snapshot.cookie_change_count_enabled).toBe(false);

        // d) tags
        expect(capture.tags).not.toContain('Cookie');

        await popup.close();
    });

    // ── Test 8: 脱敏 OFF ──────────────────────────────────────────────────
    test('8. 关闭 脱敏 开关后 redact_data 为 false', async () => {
        const { popup, capture_id } = await capture_with_toggle_off(fix, 'mask');
        const result = await export_json(fix, capture_id);
        expect(result.success, 'JSON export should succeed').toBe(true);

        const data = JSON.parse(result.json!);
        const capture = data.capture;

        // a) config_snapshot.redact_data = false
        expect(capture.config_snapshot.redact_data).toBe(false);

        // b) 所有类型事件仍应正常采集（mask 不影响任何 category）
        expect_has_data((data.events as unknown[]).length > 0, '事件');
        expect_has_data((data.console_events as unknown[]).length > 0, '控制台事件');
        expect_has_data((data.network_requests as unknown[]).length > 0, '网络请求');

        // c) tags 应包含所有 7 个标签（mask 无对应标签，不影响 tags）
        expect(capture.tags).toContain('用户行为');
        expect(capture.tags).toContain('页面导航');
        expect(capture.tags).toContain('网络请求');
        expect(capture.tags).toContain('控制台');
        expect(capture.tags).toContain('错误异常');
        expect(capture.tags).toContain('Storage');
        expect(capture.tags).toContain('Cookie');

        await popup.close();
    });
});
