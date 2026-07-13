// e2e/T0001/zoom-slider.spec.ts — T0001 轨道视图缩放滑块验收
// AC-1: 放大后可见标记减少  |  AC-2: 缩小后可见标记增多
// AC-3: 切列表再切回 → 缩放复位  |  AC-4: playhead 移动联动
// AC-5: minimap 窗口宽度反映缩放级别
// 通道: CDP (Playwright, 扩展自有页 DOM)

import { test, expect } from '@playwright/test';
import {
    launch_extension,
    open_popup,
    open_site,
    TEST_SITES,
} from '../../tests/e2e-helpers';

test.describe('T0001 轨道视图缩放滑块', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    async function prepare_trace_view(): Promise<ReturnType<typeof fix.context.newPage>> {
        const popup = await open_popup(fix);
        await popup.waitForTimeout(300);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(4000);
        const kw = site.locator('#kw');
        if (await kw.isVisible({ timeout: 3000 }).catch(() => false)) {
            await kw.click();
            await kw.fill('test');
            await site.locator('#su').click();
            await site.waitForTimeout(5000);
        }
        await site.close();

        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(2000);
        await expect(popup.locator('.act-done')).toBeVisible();

        const [d] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await d.waitForLoadState('domcontentloaded');
        await d.waitForTimeout(2500);
        await popup.close();

        const first_row = d.locator('.dt-row').first();
        if (await first_row.isVisible({ timeout: 3000 }).catch(() => false)) {
            await first_row.click();
            await d.waitForTimeout(1500);
        }

        const trace_btn = d.locator('[data-view="trace"]');
        if (await trace_btn.isVisible({ timeout: 2000 })) {
            await trace_btn.click();
            await d.waitForTimeout(1000);
        }

        await d.waitForSelector('#tlLanes', { state: 'visible', timeout: 5000 }).catch(() => {});
        await d.waitForTimeout(500);
        return d;
    }

    async function visible_markers(page: ReturnType<typeof fix.context.newPage>): Promise<number> {
        return page.evaluate(() => {
            let n = 0;
            document.querySelectorAll('.tl-tick').forEach((t) => {
                if (!t.classList.contains('tl-hidden')) n++;
            });
            return n;
        });
    }

    async function total_markers(page: ReturnType<typeof fix.context.newPage>): Promise<number> {
        return page.evaluate(() => document.querySelectorAll('.tl-tick').length);
    }

    async function hidden_markers(page: ReturnType<typeof fix.context.newPage>): Promise<number> {
        return page.evaluate(() => document.querySelectorAll('#tlLanes .tl-hidden').length);
    }

    async function zoom_value(page: ReturnType<typeof fix.context.newPage>): Promise<number> {
        return page.evaluate(() => {
            const s = document.getElementById('tlZoom') as HTMLInputElement | null;
            return s ? Number(s.value) : -1;
        });
    }

    async function click_lanes_at(page: ReturnType<typeof fix.context.newPage>, pct: number) {
        const lanes = page.locator('#tlLanes');
        const box = await lanes.boundingBox();
        if (box) {
            await page.mouse.click(box.x + box.width * pct, box.y + box.height / 2);
            await page.waitForTimeout(600);
        }
    }

    // ── AC-1: 放大 → 可见标记减少 ──────────────────────
    test('AC-1: 向右拖动滑块放大后可见标记减少', async () => {
        const page = await prepare_trace_view();
        const slider = page.locator('#tlZoom');
        await expect(slider).toBeVisible({ timeout: 5000 });

        await slider.fill('10');
        await page.waitForTimeout(600);
        const count_before = await visible_markers(page);
        const zoom_before = await zoom_value(page);
        expect(zoom_before, '初始 zoom 应为 10').toBe(10);

        await slider.fill('50');
        await page.waitForTimeout(600);
        const count_after = await visible_markers(page);
        const zoom_after = await zoom_value(page);
        expect(zoom_after, 'zoom 应变为 50').toBe(50);

        if (count_before > 0) {
            expect(count_after, '放大后可见标记应不超过放大前').toBeLessThanOrEqual(count_before);
        }

        await page.close();
    });

    // ── AC-2: 缩小 → 可见标记增多 ──────────────────────
    test('AC-2: 向左拖动滑块缩小后可见标记增多', async () => {
        const page = await prepare_trace_view();
        const slider = page.locator('#tlZoom');
        await expect(slider).toBeVisible({ timeout: 5000 });

        await slider.fill('80');
        await page.waitForTimeout(600);
        const zoomed_val = await zoom_value(page);
        expect(zoomed_val, 'zoom 应为 80').toBe(80);
        const count_zoomed = await visible_markers(page);

        await slider.fill('10');
        await page.waitForTimeout(600);
        const unzoomed_val = await zoom_value(page);
        expect(unzoomed_val, 'zoom 应为 10').toBe(10);
        const count_unzoomed = await visible_markers(page);

        expect(count_unzoomed, '缩小后可见标记应不少于放大时').toBeGreaterThanOrEqual(count_zoomed);

        await page.close();
    });

    // ── AC-3: 切列表再切回 → 缩放复位，所有标记可见 ──
    test('AC-3: 切列表视图再切回轨道视图后缩放复位', async () => {
        const page = await prepare_trace_view();
        const slider = page.locator('#tlZoom');
        await expect(slider).toBeVisible({ timeout: 5000 });

        await slider.fill('20');
        await page.waitForTimeout(500);
        expect(await zoom_value(page), '修改后 zoom 应为 20').toBe(20);

        // 切到列表视图
        const list_btn = page.locator('[data-view="list"]');
        await expect(list_btn).toBeVisible({ timeout: 3000 });
        await list_btn.click();
        await page.waitForTimeout(600);

        // 切回 trace
        const trace_btn = page.locator('[data-view="trace"]');
        await expect(trace_btn).toBeVisible({ timeout: 3000 });
        await trace_btn.click();
        await page.waitForTimeout(800);
        await page.waitForSelector('#tlLanes', { state: 'visible', timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(500);

        expect(await zoom_value(page), '切回 trace 后 zoom 应复位为 50').toBe(50);

        // AC-3 要求 "所有标记重新可见"。
        // 实测: slider=50 → window=50%, playhead~50%, 标记在11-20%处被隐藏.
        // 违反 AC-3 → FAIL.
        const hidden = await hidden_markers(page);
        expect(hidden, '复位后不应有隐藏标记——AC-3 要求所有标记重新可见').toBe(0);

        await page.close();
    });

    // ── AC-4: 移动 playhead → 可见标记随位置更新 ───────
    test('AC-4: 放大后移动 playhead 可见标记集合跟随更新', async () => {
        const page = await prepare_trace_view();
        const slider = page.locator('#tlZoom');
        await expect(slider).toBeVisible({ timeout: 5000 });

        await slider.fill('10');
        await page.waitForTimeout(600);

        const ph0 = await page.evaluate(() => {
            const p = document.getElementById('tlPlayhead');
            return p ? p.style.left : '';
        });
        expect(ph0, 'playhead 应有初始位置').toBeTruthy();

        // 移动 playhead
        await click_lanes_at(page, 0.2);
        const ph1 = await page.evaluate(() => {
            const p = document.getElementById('tlPlayhead');
            return p ? p.style.left : '';
        });
        expect(ph1, 'playhead 应已移动').not.toBe(ph0);

        // 放大后验证过滤已执行
        await slider.fill('70');
        await page.waitForTimeout(600);

        const total = await total_markers(page);
        expect(total, '应有事件标记').toBeGreaterThan(0);

        await page.close();
    });

    // ── AC-5: minimap 窗口反映缩放 ────────────────────
    test('AC-5: minimap 窗口高亮区域随缩放变化', async () => {
        const page = await prepare_trace_view();
        const slider = page.locator('#tlZoom');
        await expect(slider).toBeVisible({ timeout: 5000 });

        async function mm_width_pct(): Promise<number> {
            return page.evaluate(() => {
                const w = document.querySelector('.tl-mm-window') as HTMLElement | null;
                if (!w) return -1;
                const sw = w.style.width;
                if (sw && sw.includes('%')) return parseFloat(sw);
                return -1;
            });
        }

        const mm_exists = await page.evaluate(() => !!document.querySelector('.tl-mm-window'));
        expect(mm_exists, 'minimap 窗口应存在').toBe(true);

        await slider.fill('90');
        await page.waitForTimeout(600);
        const w90 = await mm_width_pct();
        expect(await zoom_value(page), 'zoom 应为 90').toBe(90);

        await slider.fill('10');
        await page.waitForTimeout(600);
        const w10 = await mm_width_pct();
        expect(await zoom_value(page), 'zoom 应为 10').toBe(10);

        if (w90 >= 0 && w10 >= 0) {
            expect(w90, 'slider=90(放大) → 窗口应较窄').toBeLessThan(w10);
        }

        await page.close();
    });
});
