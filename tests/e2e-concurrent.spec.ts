// tests/e2e-concurrent.spec.ts — P5.1 并发多 Tab 采集
// 验证：不同 tab 事件有不同 tab_id，时间线合并有序
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

interface ExportResult {
    success: boolean;
    json?: string;
}

interface CaptureEvent {
    tab_id: number;
    absolute_time: string;
    url?: string;
    category?: string;
}

async function export_via_dashboard(
    fix: Awaited<ReturnType<typeof launch_extension>>,
    capture_id: string,
): Promise<ExportResult> {
    const dashboard = await fix.context.newPage();
    await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await dashboard.waitForTimeout(1000);
    const result = await dashboard.evaluate(async (id: string) => {
        try {
            return await (chrome.runtime.sendMessage({
                action: 'export_json',
                capture_id: id,
            }) as Promise<ExportResult>);
        } catch {
            return { success: false, json: undefined };
        }
    }, capture_id);
    await dashboard.close();
    return result;
}

async function get_latest_capture_id(page: Awaited<ReturnType<typeof open_popup>>): Promise<string> {
    return await page.evaluate(async () => {
        const sessions = await (chrome.runtime.sendMessage({
            action: 'list_captures',
        }) as Promise<Array<{ capture_id: string }>>);
        if (!sessions || sessions.length === 0) return '';
        return sessions[sessions.length - 1].capture_id;
    });
}

test.describe.serial('并发多 Tab 采集', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('两 tab 事件有不同 tab_id（baidu + toutiao）', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        // 同时打开两个网站（toutiao 失败则硬终止，不降级为单 tab）
        const [baidu, toutiao] = await Promise.all([
            open_site(fix, TEST_SITES.baidu),
            open_site(fix, TEST_SITES.toutiao),
        ]);

        // baidu 搜索
        const search_input = baidu.locator('#kw');
        if (await search_input.isVisible()) {
            await search_input.click();
            await search_input.fill('concurrent tab test');
            await baidu.locator('#su').click();
            await baidu.waitForTimeout(3000);
        }

        // toutiao 滚动
        await toutiao.waitForTimeout(1000);
        await toutiao.evaluate(() => window.scrollBy(0, 600));
        await toutiao.waitForTimeout(1500);
        await toutiao.evaluate(() => window.scrollBy(0, 1000));
        await toutiao.waitForTimeout(1500);

        // 关闭 site pages
        await baidu.close().catch(() => {});
        await toutiao.close().catch(() => {});

        // 停止采集
        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();

        // 获取最新 session 的 capture_id
        const capture_id = await get_latest_capture_id(popup);
        expect(capture_id, '应有 capture_id').toBeTruthy();

        // 导出 JSON 验证 tab_id
        const result = await export_via_dashboard(fix, capture_id);
        expect(result.success, 'JSON 导出应成功').toBe(true);
        expect(result.json, 'JSON 导出应有内容').toBeTruthy();

        const data = JSON.parse(result.json!);
        const events = (data.events || []) as CaptureEvent[];

        // 过滤有效 tab_id（tab_id > 0）
        const valid_events = events.filter((e) => e.tab_id > 0);
        expect(valid_events.length, '应有 tab_id > 0 的事件').toBeGreaterThan(0);

        // 至少 2 个不同 tab_id
        const unique_tab_ids = new Set(valid_events.map((e) => e.tab_id));
        expect(unique_tab_ids.size, '至少应有 2 个不同 tab_id').toBeGreaterThanOrEqual(2);

        // 每个 tab_id 都有事件
        for (const tid of unique_tab_ids) {
            const tab_events = valid_events.filter((e) => e.tab_id === tid);
            expect(tab_events.length, `tab_id=${tid} 应有事件`).toBeGreaterThan(0);
        }

        // 时间线按 absolute_time 升序
        for (let i = 1; i < events.length; i++) {
            const prev = new Date(events[i - 1].absolute_time).getTime();
            const curr = new Date(events[i].absolute_time).getTime();
            expect(prev, `事件 [${i}] 时间应不早于前一个`).toBeLessThanOrEqual(curr);
        }

        await popup.close();
    });

    test('时间线合并：同一 session 两 tab 事件可展示（baidu + qq）', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const t1 = await open_site(fix, TEST_SITES.baidu);
        await t1.waitForTimeout(1500);
        const t2 = await open_site(fix, TEST_SITES.qq);
        await t2.waitForTimeout(1500);

        // 停止采集
        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();

        // 获取 capture_id 并导出
        const capture_id = await get_latest_capture_id(popup);
        expect(capture_id, '应有 capture_id').toBeTruthy();

        const result = await export_via_dashboard(fix, capture_id);
        expect(result.success, 'JSON 导出应成功').toBe(true);
        expect(result.json, 'JSON 导出应有内容').toBeTruthy();

        const data = JSON.parse(result.json!);
        const events = (data.events || []) as CaptureEvent[];

        expect(events.length, '应有事件').toBeGreaterThan(0);

        // 至少 2 个不同 tab_id
        const unique_tab_ids = new Set(
            events.filter((e) => e.tab_id > 0).map((e) => e.tab_id),
        );
        expect(unique_tab_ids.size, '至少应有 2 个不同 tab_id').toBeGreaterThanOrEqual(2);

        // 每个 tab 都有事件
        for (const tid of unique_tab_ids) {
            const has_events = events.some((e) => e.tab_id === tid);
            expect(has_events, `tab_id=${tid} 应有事件`).toBe(true);
        }

        // 时间线有序
        for (let i = 1; i < events.length; i++) {
            const prev = new Date(events[i - 1].absolute_time).getTime();
            const curr = new Date(events[i].absolute_time).getTime();
            expect(prev, `事件 [${i}] 时间应不早于前一个`).toBeLessThanOrEqual(curr);
        }

        await t1.close();
        await t2.close();
        await popup.close();
    });
});
