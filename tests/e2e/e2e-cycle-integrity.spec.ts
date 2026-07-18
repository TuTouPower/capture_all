// tests/e2e-cycle-integrity.spec.ts — P1.7.6 多轮采集数据隔离
// Verify multiple start-stop cycles produce independent capture sessions
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

interface CaptureInfo {
    capture_id: string;
    name: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    duration_ms: number;
    stats: {
        event_count: number;
        nav_count: number;
        request_count: number;
        log_count: number;
        error_count: number;
        storage_change_count: number;
        cookie_change_count: number;
    };
}

interface ExportResult {
    success: boolean;
    json?: string;
}

test.describe.serial('多轮采集数据隔离', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => {
        fix = await launch_extension();
    });

    test.afterAll(async () => {
        await fix.context.close();
    });

    test('场景 1: 三轮开始-停止 → 独立 capture 数据不泄漏', async () => {
        const popup = await open_popup(fix);

        // ── Cycle 1: baidu.com ──
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site1 = await open_site(fix, TEST_SITES.baidu);
        await site1.waitForTimeout(2000);

        const input1 = site1.locator('#kw');
        if (await input1.isVisible()) {
            await input1.click();
            await input1.fill('cycle 1 test');
            await site1.locator('#su').click();
            await site1.waitForTimeout(3000);
        }
        await site1.close();
        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // ── Cycle 2: toutiao.com ──
        await expect(popup.locator('.act-done'), 'Cycle 1 完成').toBeVisible();
        await popup.locator('#newBtn').click();
        await popup.waitForTimeout(500);
        await expect(popup.locator('#startBtn'), 'Cycle 2 就绪').toBeVisible();

        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site2 = await open_site(fix, TEST_SITES.toutiao);
        await site2.waitForTimeout(3000);
        await site2.close();
        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // ── Cycle 3: qq.com ──
        await expect(popup.locator('.act-done'), 'Cycle 2 完成').toBeVisible();
        await popup.locator('#newBtn').click();
        await popup.waitForTimeout(500);
        await expect(popup.locator('#startBtn'), 'Cycle 3 就绪').toBeVisible();

        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site3 = await open_site(fix, TEST_SITES.qq);
        await site3.waitForTimeout(3000);
        await site3.close();
        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        await expect(popup.locator('.act-done'), 'Cycle 3 完成').toBeVisible();

        // ── 获取所有 sessions ──
        const captures: CaptureInfo[] = await popup.evaluate(() =>
            chrome.runtime.sendMessage({ action: 'list_captures' })
        );

        expect(captures, '至少应有 3 个 capture').toBeDefined();
        expect(Array.isArray(captures), 'captures 应为数组').toBe(true);
        expect(captures.length, '应有 3 个 capture').toBeGreaterThanOrEqual(3);

        // 取最近 3 个
        const recent = captures.slice(-3);
        expect(recent.length).toBe(3);

        // 每个 session 有不同 capture_id
        const ids = recent.map((s) => s.capture_id);
        expect(ids[0], 'session 1 有 capture_id').toBeTruthy();
        expect(ids[1], 'session 2 有 capture_id').toBeTruthy();
        expect(ids[2], 'session 3 有 capture_id').toBeTruthy();
        expect(new Set(ids).size, '3 个 capture_id 应全部不同').toBe(3);

        // ── 分别导出每个 session ──
        const exports: ExportResult[] = [];
        for (const capture of recent) {
            const result: ExportResult = await popup.evaluate(
                (sid) => chrome.runtime.sendMessage({ action: 'export_json', capture_id: sid }),
                capture.capture_id
            );
            exports.push(result);
        }

        for (let i = 0; i < exports.length; i++) {
            expect(exports[i].success, `Capture ${i + 1} 导出应成功`).toBe(true);
            expect(exports[i].json, `Capture ${i + 1} 导出应有内容`).toBeTruthy();
        }

        // ── 验证数据隔离 ──
        const parsed = exports.map((e) => JSON.parse(e.json!));

        // Capture 1: 包含 baidu.com 相关 URL
        const data1 = JSON.stringify(parsed[0]);
        expect(
            data1.includes('baidu.com'),
            'Capture 1 应包含 baidu.com URL'
        ).toBe(true);

        // Capture 2: 包含 toutiao.com 相关 URL
        const data2 = JSON.stringify(parsed[1]);
        expect(
            data2.includes('toutiao.com'),
            'Capture 2 应包含 toutiao.com URL'
        ).toBe(true);

        // Capture 3: 包含 qq.com 相关 URL
        const data3 = JSON.stringify(parsed[2]);
        expect(
            data3.includes('qq.com'),
            'Capture 3 应包含 qq.com URL'
        ).toBe(true);

        // ── 验证无数据泄漏 ──
        // Capture 1 不应包含 toutiao.com 或 qq.com
        expect(
            data1,
            'Capture 1 不应包含 toutiao.com（无泄漏）'
        ).not.toContain('toutiao.com');
        expect(
            data1,
            'Capture 1 不应包含 qq.com（无泄漏）'
        ).not.toContain('qq.com');

        // Capture 2 不应包含 baidu.com 的搜索关键词（确保是独立数据）
        expect(
            data2,
            'Capture 2 不应包含 baidu.com（无泄漏）'
        ).not.toContain('baidu.com');

        // Capture 3 不应包含 baidu.com
        expect(
            data3,
            'Capture 3 不应包含 baidu.com（无泄漏）'
        ).not.toContain('baidu.com');

        await popup.close();
    });

    test('场景 2: 立即停止（0 事件）→ 正常完成不崩溃', async () => {
        const popup = await open_popup(fix);

        // 开始采集
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(300);

        // 立即停止（500ms 内）
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // 验证完成状态
        await expect(
            popup.locator('.act-done'),
            '应立即显示完成状态'
        ).toBeVisible({ timeout: 5000 });

        // 通过 sendMessage 导出 JSON，验证数据有效
        const result: ExportResult = await popup.evaluate(() =>
            chrome.runtime.sendMessage({ action: 'list_captures' })
                .then((captures: CaptureInfo[]) => {
                    if (captures && captures.length > 0) {
                        const latest = captures[captures.length - 1];
                        return chrome.runtime.sendMessage({
                            action: 'export_json',
                            capture_id: latest.capture_id,
                        });
                    }
                    return { success: false };
                })
        );

        expect(result.success, '0 事件 capture 导出应成功').toBe(true);
        expect(result.json, '0 事件 capture 导出应有内容').toBeTruthy();

        const data = JSON.parse(result.json!);
        expect(data, '导出数据应有 capture_id').toHaveProperty('capture_id');
        expect(data, '导出数据应有 status').toHaveProperty('status');
        expect(
            data.status,
            '状态应为 completed'
        ).toBe('completed');

        // duration_ms >= 0
        expect(data, '导出数据应有 duration_ms').toHaveProperty('duration_ms');
        expect(
            typeof data.duration_ms,
            'duration_ms 应为 number'
        ).toBe('number');
        expect(data.duration_ms, 'duration_ms 应 > 0').toBeGreaterThan(0);

        // 验证是合法 JSON（重新 parse 不抛错）
        expect(() => JSON.parse(result.json!)).not.toThrow();

        await popup.close();
    });

    test('场景 3: 停止后重新开始 → 状态正确切换', async () => {
        const popup = await open_popup(fix);

        // ── 第一轮：开始 → 停止 ──
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(300);

        // 短暂访问任意页面
        const site1 = await open_site(fix, TEST_SITES.baidu);
        await site1.waitForTimeout(1500);
        await site1.close();
        await popup.bringToFront();
        await popup.waitForTimeout(300);

        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // 验证第一轮完成
        await expect(
            popup.locator('.act-done'),
            '第一轮完成状态'
        ).toBeVisible({ timeout: 5000 });

        // 验证就绪按钮可见（#newBtn 或 #startBtn）
        const new_btn = popup.locator('#newBtn');
        const ready = await new_btn.isVisible();
        expect(ready, '#newBtn 应可见（可开始新采集）').toBe(true);

        // ── 第二轮：新采集 → 停止 ──
        await popup.locator('#newBtn').click();
        await popup.waitForTimeout(500);
        await expect(
            popup.locator('#startBtn'),
            '第二轮 #startBtn 应可见'
        ).toBeVisible();

        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        // 验证进入采集中状态
        await expect(
            popup.locator('#stopBtn'),
            '第二轮 #stopBtn 应可见（采集中）'
        ).toBeVisible({ timeout: 3000 });

        const site2 = await open_site(fix, TEST_SITES.qq);
        await site2.waitForTimeout(2000);
        await site2.close();
        await popup.bringToFront();
        await popup.waitForTimeout(300);

        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // 验证第二轮完成
        await expect(
            popup.locator('.act-done'),
            '第二轮完成状态'
        ).toBeVisible({ timeout: 5000 });

        // 验证可以再次开始新采集
        await expect(
            popup.locator('#newBtn'),
            '第二轮完成后 #newBtn 应可见'
        ).toBeVisible();

        await popup.close();
    });
});
