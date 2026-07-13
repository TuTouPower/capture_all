// e2e/T0001/zoom-slider.spec.ts — T0001 轨道视图缩放滑块验收
// AC-1: 放大后可见标记减少  |  AC-2: 缩小后可见标记增多
// AC-3: 切列表再切回 → 缩放复位  |  AC-4: playhead 移动联动
// AC-5: minimap 窗口宽度反映缩放级别
// 通道: CDP (Playwright, 扩展自有页 DOM)

import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
    launch_extension,
    open_popup,
    open_site,
} from '../../tests/e2e-helpers';

test.describe('T0001 轨道视图缩放滑块', () => {
    const marker_selector = '.tl-tick,.tl-dot,.tl-diamond';
    let fix: Awaited<ReturnType<typeof launch_extension>>;
    let is_context_ready = false;

    test.beforeEach(async () => {
        is_context_ready = false;
        fix = await launch_extension();
        is_context_ready = true;
        await fix.context.tracing.start({
            screenshots: true,
            snapshots: true,
            sources: true,
        });
    });

    test.afterEach(async ({}, test_info) => {
        if (!is_context_ready) return;

        try {
            if (test_info.status === test_info.expectedStatus) {
                await fix.context.tracing.stop();
            } else {
                await fix.context.tracing.stop({ path: test_info.outputPath('trace.zip') });
            }
        } finally {
            await fix.context.close();
            is_context_ready = false;
        }
    });

    async function prepare_trace_view(): Promise<ReturnType<typeof fix.context.newPage>> {
        const popup = await open_popup(fix);
        await popup.waitForTimeout(300);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, 'http://127.0.0.1:17832/test-page.html');
        await site.waitForLoadState('domcontentloaded');
        const input = site.locator('#input-text');
        const click_button = site.locator('#btn-click');
        await expect(input, '本地测试页 input 应可见').toBeVisible({ timeout: 3000 });
        await expect(click_button, '本地测试页点击按钮应可见').toBeVisible({ timeout: 3000 });

        await input.fill('trace-start');
        await input.blur();
        await site.waitForTimeout(400);
        await click_button.click();
        await site.waitForTimeout(400);

        const error_button = site.locator('#btn-error');
        if (await error_button.isVisible({ timeout: 1000 }).catch(() => false)) {
            await error_button.click();
        }
        await site.waitForTimeout(400);
        await input.fill('trace-end');
        await input.blur();
        await site.waitForTimeout(400);
        await click_button.click();
        await site.waitForTimeout(400);
        await input.fill('trace-final');
        await input.blur();
        await site.waitForTimeout(400);
        await click_button.click();
        await site.waitForTimeout(400);
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

        const trace_btn = d.locator('[data-view="trace"]');
        const is_detail_open = await trace_btn.isVisible({ timeout: 3000 }).catch(() => false);
        if (!is_detail_open) {
            const first_row = d.locator('.dt-row').first();
            await expect(first_row, '采集列表应至少有一行数据').toBeVisible({ timeout: 3000 });
            await first_row.click();
            await expect(trace_btn, '点击采集行后轨道视图入口应可见').toBeVisible({ timeout: 3000 });
        }
        await expect(trace_btn, '详情页轨道视图入口应可见').toBeVisible({ timeout: 3000 });
        await trace_btn.click();

        const lanes = d.locator('#tlLanes');
        await expect(lanes, '轨道区域应可见').toBeVisible({ timeout: 5000 });
        await expect.poll(() => total_markers(d), {
            message: '轨道视图应生成事件标记',
        }).toBeGreaterThan(0);
        return d;
    }

    async function visible_markers(page: Page): Promise<number> {
        return page.evaluate((selector) => Array.from(document.querySelectorAll(selector))
            .filter((marker) => !marker.classList.contains('tl-hidden')).length, marker_selector);
    }

    async function total_markers(page: Page): Promise<number> {
        return page.evaluate((selector) => document.querySelectorAll(selector).length, marker_selector);
    }

    async function hidden_markers(page: Page): Promise<number> {
        return page.evaluate((selector) => Array.from(document.querySelectorAll(selector))
            .filter((marker) => marker.classList.contains('tl-hidden')).length, marker_selector);
    }

    async function visible_marker_ids(page: Page): Promise<string[]> {
        return page.evaluate((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector))
            .filter((marker) => !marker.classList.contains('tl-hidden'))
            .map((marker) => {
                const lane = marker.closest<HTMLElement>('.tl-lane');
                const lane_id = lane?.id
                    || lane?.dataset.lane
                    || lane?.getAttribute('data-type')
                    || lane?.className
                    || 'unknown-lane';
                const data_attributes = Object.entries(marker.dataset)
                    .sort(([left_key], [right_key]) => left_key.localeCompare(right_key))
                    .map(([key, value]) => `${key}=${value}`)
                    .join('|');
                return [
                    lane_id,
                    marker.title,
                    data_attributes,
                    marker.style.left,
                ].join('::');
            })
            .sort(), marker_selector);
    }

    async function marker_positions(page: Page): Promise<number[]> {
        return page.evaluate((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector))
            .map((marker) => marker.style.left.trim())
            .filter((left) => left.endsWith('%'))
            .map((left) => Number.parseFloat(left))
            .filter((left) => Number.isFinite(left) && left >= 0 && left <= 100)
            .sort((left, right) => left - right)
            .filter((left, index, positions) => index === 0 || left !== positions[index - 1]), marker_selector);
    }

    async function zoom_value(page: ReturnType<typeof fix.context.newPage>): Promise<number> {
        return page.evaluate(() => {
            const s = document.getElementById('tlZoom') as HTMLInputElement | null;
            return s ? Number(s.value) : -1;
        });
    }

    async function drag_range_slider(
        page: Page,
        slider: Locator,
        target_value: number,
    ): Promise<void> {
        const range = await slider.evaluate((element) => {
            const input = element as HTMLInputElement;
            return {
                min: Number(input.min || 0),
                max: Number(input.max || 100),
                step: Number(input.step || 1),
                value: Number(input.value),
            };
        });
        const box = await slider.boundingBox();
        expect(box, 'range slider 应有可交互边界').not.toBeNull();
        if (!box) return;

        const clamped_value = Math.min(range.max, Math.max(range.min, target_value));
        const stepped_value = range.min + Math.round((clamped_value - range.min) / range.step) * range.step;
        const thumb_radius = Math.min(box.height / 2, box.width / 2);
        const track_start = box.x + thumb_radius;
        const track_width = Math.max(1, box.width - thumb_radius * 2);
        const range_size = range.max - range.min;
        expect(range_size, 'range slider max 应大于 min').toBeGreaterThan(0);
        const target_ratio = (stepped_value - range.min) / range_size;
        const current_ratio = (range.value - range.min) / range_size;
        const target_x = track_start + track_width * target_ratio;
        const start_x = track_start + track_width * current_ratio;
        const y = box.y + box.height / 2;

        await page.mouse.move(start_x, y);
        await page.mouse.down();
        try {
            const move_steps = 20;
            for (let step_index = 1; step_index <= move_steps; step_index++) {
                const progress = step_index / move_steps;
                await page.mouse.move(start_x + (target_x - start_x) * progress, y);
                await page.waitForTimeout(50);
            }
        } finally {
            await page.mouse.up();
        }

        await expect.poll(() => zoom_value(page), {
            message: `pointer 拖动后 zoom 应为 ${stepped_value}`,
        }).toBe(stepped_value);
    }

    interface PlayheadPosition {
        left_pct: number;
        viewport_x: number;
    }

    async function playhead_position(page: Page): Promise<PlayheadPosition> {
        return page.locator('#tlPlayhead').evaluate((element) => {
            const playhead = element as HTMLElement;
            return {
                left_pct: Number.parseFloat(playhead.style.left),
                viewport_x: playhead.getBoundingClientRect().left,
            };
        });
    }

    interface LaneClickTarget {
        track_pct: number;
        click_viewport_x: number;
        click_viewport_y: number;
    }

    async function click_lane_track_empty_at(page: Page, track_pct: number): Promise<LaneClickTarget> {
        const target = await page.locator('#tlLanes').evaluate((lanes_element, args) => {
            const lanes = lanes_element as HTMLElement;
            const tracks = Array.from(lanes.querySelectorAll<HTMLElement>('.tl-lane-track'));
            const marker_boxes = Array.from(lanes.querySelectorAll<HTMLElement>(args.marker_selector))
                .filter((marker) => !marker.classList.contains('tl-hidden'))
                .map((marker) => marker.getBoundingClientRect());

            for (const track of tracks) {
                const track_box = track.getBoundingClientRect();
                const click_track_pct = Math.min(0.995, Math.max(0.005, args.track_pct));
                const click_viewport_x = track_box.left + track_box.width * click_track_pct;
                for (const y_ratio of [0.1, 0.9, 0.2, 0.8]) {
                    const click_viewport_y = track_box.top + track_box.height * y_ratio;
                    const hit = document.elementFromPoint(click_viewport_x, click_viewport_y);
                    const hits_marker = hit?.closest(args.marker_selector) != null
                        || marker_boxes.some((box) => (
                            click_viewport_x >= box.left
                            && click_viewport_x <= box.right
                            && click_viewport_y >= box.top
                            && click_viewport_y <= box.bottom
                        ));
                    if (hit && track.contains(hit) && !hits_marker) {
                        return {
                            track_pct: click_track_pct,
                            click_viewport_x,
                            click_viewport_y,
                        };
                    }
                }
            }
            return null;
        }, { marker_selector, track_pct });

        expect(target, `应能在 track 的 ${track_pct * 100}% 横坐标找到 marker 外空白点`).not.toBeNull();
        if (!target) throw new Error('未找到可点击 lane track 空白点');

        const hit_is_marker = await page.evaluate(({ click_viewport_x, click_viewport_y, selector }) => {
            const hit = document.elementFromPoint(click_viewport_x, click_viewport_y);
            return hit?.closest(selector) != null;
        }, {
            click_viewport_x: target.click_viewport_x,
            click_viewport_y: target.click_viewport_y,
            selector: marker_selector,
        });
        expect(hit_is_marker, '点击目标不得命中 marker').toBe(false);

        await page.mouse.click(target.click_viewport_x, target.click_viewport_y);
        return target;
    }

    async function expect_playhead_at(
        page: Page,
        target: LaneClickTarget,
        previous_viewport_x: number,
    ): Promise<PlayheadPosition> {
        await expect.poll(async () => (await playhead_position(page)).left_pct, {
            message: `playhead style.left 应接近 track 坐标 ${target.track_pct * 100}%`,
        }).toBeCloseTo(target.track_pct * 100, 1);

        const position = await playhead_position(page);
        expect(
            Math.abs(position.viewport_x - previous_viewport_x),
            'playhead 用户可观察 viewport 位置应发生变化',
        ).toBeGreaterThan(3);
        return position;
    }

    function expect_playhead_visually_aligned(
        position: PlayheadPosition,
        target: LaneClickTarget,
    ): void {
        expect(
            Math.abs(position.viewport_x - target.click_viewport_x),
            `playhead viewport_x 应接近实际点击 viewport_x；playhead=${position.viewport_x}, click=${target.click_viewport_x}`,
        ).toBeLessThanOrEqual(3);
    }

    interface MinimapState {
        left_pct: number;
        width_pct: number;
        viewport_x: number;
        viewport_width: number;
        track_viewport_x: number;
        track_viewport_width: number;
        playhead_pct: number;
        playhead_viewport_x: number;
        time_label: string;
    }

    async function minimap_state(page: Page): Promise<MinimapState> {
        return page.locator('.tl-mm-window').evaluate((window_element) => {
            const minimap_window = window_element as HTMLElement;
            const minimap_track = minimap_window.parentElement as HTMLElement | null;
            const playhead = document.getElementById('tlPlayhead') as HTMLElement | null;
            const time_label = document.getElementById('tlPlaytime');
            if (!minimap_track || !playhead || !time_label) {
                throw new Error('minimap track、playhead 与时间标签必须存在');
            }

            const left_pct = Number.parseFloat(minimap_window.style.left);
            const width_pct = Number.parseFloat(minimap_window.style.width);
            const playhead_pct = Number.parseFloat(playhead.style.left);
            if (![left_pct, width_pct, playhead_pct].every(Number.isFinite)) {
                throw new Error('minimap left/width 与 playhead left 必须是有效百分比');
            }

            const window_box = minimap_window.getBoundingClientRect();
            const track_box = minimap_track.getBoundingClientRect();
            const playhead_box = playhead.getBoundingClientRect();
            return {
                left_pct,
                width_pct,
                viewport_x: window_box.left,
                viewport_width: window_box.width,
                track_viewport_x: track_box.left,
                track_viewport_width: track_box.width,
                playhead_pct,
                playhead_viewport_x: playhead_box.left,
                time_label: time_label.textContent?.trim() || '',
            };
        });
    }

    async function drag_minimap_window(page: Page, target_viewport_x: number): Promise<void> {
        const minimap_window = page.locator('.tl-mm-window');
        const box = await minimap_window.boundingBox();
        expect(box, 'minimap 红色窗口应有可交互边界').not.toBeNull();
        if (!box) throw new Error('minimap 红色窗口无可交互边界');

        const start_x = box.x + box.width / 2;
        const start_y = box.y + box.height / 2;
        await page.mouse.move(start_x, start_y);
        await page.mouse.down();
        try {
            const move_steps = 16;
            for (let step_index = 1; step_index <= move_steps; step_index++) {
                const progress = step_index / move_steps;
                await page.mouse.move(start_x + (target_viewport_x - start_x) * progress, start_y);
                await page.waitForTimeout(25);
            }
        } finally {
            await page.mouse.up();
        }
    }

    async function drag_minimap_window_with_held_screenshot(
        page: Page,
        target_viewport_x: number,
        test_info: TestInfo,
    ): Promise<void> {
        const minimap_window = page.locator('.tl-mm-window');
        const box = await minimap_window.boundingBox();
        expect(box, 'minimap 红色窗口应有可交互边界').not.toBeNull();
        if (!box) throw new Error('minimap 红色窗口无可交互边界');

        const start_x = box.x + box.width / 2;
        const start_y = box.y + box.height / 2;
        const midpoint_x = start_x + (target_viewport_x - start_x) / 2;
        await page.mouse.move(start_x, start_y);
        await page.mouse.down();
        try {
            const phase_steps = 8;
            for (let step_index = 1; step_index <= phase_steps; step_index++) {
                const progress = step_index / phase_steps;
                await page.mouse.move(start_x + (midpoint_x - start_x) * progress, start_y);
                await page.waitForTimeout(25);
            }
            await attach_minimap_screenshot(page, test_info, 'minimap-drag-pointer-held');
            for (let step_index = 1; step_index <= phase_steps; step_index++) {
                const progress = step_index / phase_steps;
                await page.mouse.move(midpoint_x + (target_viewport_x - midpoint_x) * progress, start_y);
                await page.waitForTimeout(25);
            }
        } finally {
            await page.mouse.up();
        }
    }

    async function attach_minimap_screenshot(
        page: Page,
        test_info: TestInfo,
        name: string,
    ): Promise<void> {
        const minimap = page.locator('.tl-minimap');
        await expect(minimap, '截图前 minimap 应可见').toBeVisible();
        await test_info.attach(name, {
            body: await minimap.screenshot(),
            contentType: 'image/png',
        });
    }

    function expect_minimap_physical_alignment(state: MinimapState): void {
        const expected_viewport_x = state.track_viewport_x
            + state.track_viewport_width * state.left_pct / 100;
        expect(
            Math.abs(state.viewport_x - expected_viewport_x),
            `minimap style.left 应对应物理位置；actual=${state.viewport_x}, expected=${expected_viewport_x}`,
        ).toBeLessThanOrEqual(3);
    }

    function expect_playhead_at_window_center(state: MinimapState): void {
        expect(
            state.playhead_pct,
            'playhead 百分比应保持在 minimap 窗口中心',
        ).toBeCloseTo(state.left_pct + state.width_pct / 2, 1);
    }

    // ── AC-1: 放大 → 可见标记减少 ──────────────────────
    test('AC-1: 向右拖动滑块放大后可见标记减少', async () => {
        const page = await prepare_trace_view();
        const slider = page.locator('#tlZoom');
        await expect(slider).toBeVisible({ timeout: 5000 });

        await drag_range_slider(page, slider, 10);
        const count_before = await visible_markers(page);
        const zoom_before = await zoom_value(page);
        expect(zoom_before, '向左拖动后 zoom 应为 10').toBe(10);
        expect(count_before, '放大前应有可见标记').toBeGreaterThan(0);

        await drag_range_slider(page, slider, 50);
        await expect.poll(() => zoom_value(page), {
            message: '向右拖动后 zoom 应达到目标值 50',
        }).toBe(50);
        await expect.poll(() => visible_markers(page), {
            message: `放大后可见 marker 数应严格少于 ${count_before}`,
        }).toBeLessThan(count_before);

        await page.close();
    });

    // ── AC-2: 缩小 → 可见标记增多 ──────────────────────
    test('AC-2: 向左拖动滑块缩小后可见标记增多', async () => {
        const page = await prepare_trace_view();
        const slider = page.locator('#tlZoom');
        await expect(slider).toBeVisible({ timeout: 5000 });

        await drag_range_slider(page, slider, 80);
        const zoomed_value = await zoom_value(page);
        expect(zoomed_value, '向右拖动后 zoom 应为 80').toBe(80);
        const count_zoomed = await visible_markers(page);

        await drag_range_slider(page, slider, 10);
        await expect.poll(() => zoom_value(page), {
            message: '向左拖动后 zoom 应达到目标值 10',
        }).toBe(10);
        await expect.poll(() => visible_markers(page), {
            message: `缩小后可见 marker 数应严格多于 ${count_zoomed}`,
        }).toBeGreaterThan(count_zoomed);

        await page.close();
    });

    // ── AC-3: 切列表再切回 → 缩放复位，所有标记可见 ──
    test('AC-3: 切列表视图再切回轨道视图后缩放复位', async () => {
        const page = await prepare_trace_view();
        const slider = page.locator('#tlZoom');
        await expect(slider).toBeVisible({ timeout: 5000 });

        await drag_range_slider(page, slider, 20);
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
        await expect(page.locator('#tlLanes'), '切回后轨道区域应可见').toBeVisible({ timeout: 5000 });

        await expect.poll(() => zoom_value(page), {
            message: '切回 trace 后 zoom 应复位为 approved spec 默认值 50',
        }).toBe(50);

        const total = await total_markers(page);
        const hidden = await hidden_markers(page);
        expect(total, '复位后应有事件标记').toBeGreaterThan(0);
        expect(hidden, '复位后不应有隐藏标记——AC-3 要求所有标记重新可见').toBe(0);

        await page.close();
    });

    // ── AC-4: 移动 playhead → 可见标记随位置更新 ───────
    test('AC-4: 放大后移动 playhead 可见标记集合跟随更新', async () => {
        const page = await prepare_trace_view();
        const slider = page.locator('#tlZoom');
        await expect(slider).toBeVisible({ timeout: 5000 });

        const positions = await marker_positions(page);
        expect(positions.length, '应至少有两个不同 marker 位置').toBeGreaterThanOrEqual(2);
        const early_position = positions[0];
        const late_position = positions[positions.length - 1];
        expect(
            late_position - early_position,
            `marker 分布应覆盖至少 30 个百分点，实际位置: ${positions.join(', ')}`,
        ).toBeGreaterThanOrEqual(30);

        await drag_range_slider(page, slider, 55);

        const initial_playhead = await playhead_position(page);
        const early_target = await click_lane_track_empty_at(page, early_position / 100);
        const early_playhead = await expect_playhead_at(page, early_target, initial_playhead.viewport_x);
        await expect.poll(() => visible_markers(page), {
            message: '早期 playhead 位置应有可见 marker',
        }).toBeGreaterThan(0);
        const markers_at_start = await visible_marker_ids(page);

        const late_target = await click_lane_track_empty_at(page, late_position / 100);
        const late_playhead = await expect_playhead_at(page, late_target, early_playhead.viewport_x);
        await expect.poll(async () => JSON.stringify(await visible_marker_ids(page)), {
            message: `移动到晚期空白点后可见集合应变化；marker 位置: ${positions.join(', ')}；锚点: ${early_position} → ${late_position}`,
        }).not.toBe(JSON.stringify(markers_at_start));
        const markers_at_end = await visible_marker_ids(page);
        expect(markers_at_end, '晚期 playhead 位置应有可见标记').not.toHaveLength(0);
        expect(markers_at_end, '早期与晚期 playhead 窗口可见集合应不同').not.toEqual(markers_at_start);

        const start_marker_set = new Set(markers_at_start);
        const end_marker_set = new Set(markers_at_end);
        const markers_leaving_window = markers_at_start.filter((marker_id) => !end_marker_set.has(marker_id));
        const markers_entering_window = markers_at_end.filter((marker_id) => !start_marker_set.has(marker_id));
        expect(
            markers_leaving_window,
            'playhead 从早期移到晚期后，至少一个旧 marker 应离开可见窗口',
        ).not.toHaveLength(0);
        expect(
            markers_entering_window,
            'playhead 从早期移到晚期后，至少一个新 marker 应进入可见窗口',
        ).not.toHaveLength(0);

        expect_playhead_visually_aligned(early_playhead, early_target);
        expect_playhead_visually_aligned(late_playhead, late_target);

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

        async function mm_left_pct(): Promise<number> {
            return page.evaluate(() => {
                const window_element = document.querySelector('.tl-mm-window') as HTMLElement | null;
                if (!window_element) return -1;
                const left = window_element.style.left;
                if (left && left.endsWith('%')) return Number.parseFloat(left);
                return -1;
            });
        }

        const mm_exists = await page.evaluate(() => !!document.querySelector('.tl-mm-window'));
        expect(mm_exists, 'minimap 窗口应存在').toBe(true);

        await drag_range_slider(page, slider, 90);
        const w90 = await mm_width_pct();
        expect(await zoom_value(page), 'zoom 应为 90').toBe(90);

        await drag_range_slider(page, slider, 10);
        const w10 = await mm_width_pct();
        expect(await zoom_value(page), 'zoom 应为 10').toBe(10);

        expect(w90, 'slider=90 时 minimap 窗口宽度应有效').toBeGreaterThan(0);
        expect(w10, 'slider=10 时 minimap 窗口宽度应有效').toBeGreaterThan(0);
        expect(w90, 'slider=90(放大) → 窗口应较窄').toBeLessThan(w10);

        const positions = await marker_positions(page);
        expect(positions.length, '应至少有两个不同 marker 位置').toBeGreaterThanOrEqual(2);
        const early_position = positions[0];
        const late_position = positions[positions.length - 1];
        expect(
            late_position - early_position,
            `marker 分布应覆盖至少 30 个百分点，实际位置: ${positions.join(', ')}`,
        ).toBeGreaterThanOrEqual(30);

        const zoom = 70;
        const window_width_pct = Math.max(5, 100 - zoom);
        const expected_minimap_left = (playhead_pct: number): number => Math.max(
            0,
            Math.min(100 - window_width_pct, playhead_pct - window_width_pct / 2),
        );
        await drag_range_slider(page, slider, zoom);

        const initial_playhead = await playhead_position(page);
        const early_target = await click_lane_track_empty_at(page, early_position / 100);
        const early_playhead = await expect_playhead_at(page, early_target, initial_playhead.viewport_x);
        const early_left = await mm_left_pct();
        expect(early_left, '早期 playhead 对应 minimap left 应符合居中并夹紧语义').toBeCloseTo(
            expected_minimap_left(early_playhead.left_pct),
            1,
        );

        const late_target = await click_lane_track_empty_at(page, late_position / 100);
        const late_playhead = await expect_playhead_at(page, late_target, early_playhead.viewport_x);
        await expect.poll(() => mm_left_pct(), {
            message: `晚期 playhead 对应 minimap left 应符合居中并夹紧语义；marker 位置: ${positions.join(', ')}`,
        }).toBeCloseTo(expected_minimap_left(late_playhead.left_pct), 1);
        const late_left = await mm_left_pct();
        expect(late_left, '晚期 playhead 对应 minimap left 应符合居中并夹紧语义').toBeCloseTo(
            expected_minimap_left(late_playhead.left_pct),
            1,
        );

        expect_playhead_visually_aligned(early_playhead, early_target);
        expect_playhead_visually_aligned(late_playhead, late_target);

        await page.close();
    });

    test('minimap 红色窗口真实拖动可平移可见时间窗口', async ({}, test_info) => {
        const page = await prepare_trace_view();
        const slider = page.locator('#tlZoom');
        await expect(slider).toBeVisible({ timeout: 5000 });
        await drag_range_slider(page, slider, 80);

        const positions = await marker_positions(page);
        expect(positions.length, 'minimap 拖动验收应至少有两个不同 marker 位置').toBeGreaterThanOrEqual(2);

        const initial = await minimap_state(page);
        expect(initial.width_pct, 'zoom=80 时 minimap 窗口 width 应小于 100%').toBeLessThan(100);
        expect(initial.width_pct, 'minimap 窗口 width 应为正数').toBeGreaterThan(0);

        const max_left = 100 - initial.width_pct;
        const clamp_left = (left: number): number => Math.max(0, Math.min(max_left, left));
        const positions_in_closed_window = (left: number): number[] => positions.filter((position) => (
            position >= left && position <= left + initial.width_pct
        ));
        const desired_late_left = max_left;
        const late_expected_positions = positions_in_closed_window(desired_late_left);
        expect(
            late_expected_positions.length,
            `marker 数据不足：右端闭区间应至少包含一个 marker；window=[${desired_late_left}, 100], positions=${positions.join(', ')}`,
        ).toBeGreaterThan(0);

        const early_candidate_lefts = Array.from(new Set(positions
            .filter((position) => position < desired_late_left)
            .map((position) => clamp_left(position - initial.width_pct / 2))))
            .sort((left, right) => left - right);
        const desired_early_left = early_candidate_lefts.find((early_left) => {
            if (early_left >= desired_late_left) return false;
            const early_positions = positions_in_closed_window(early_left);
            const early_set = new Set(early_positions);
            const late_set = new Set(late_expected_positions);
            const has_leaving = early_positions.some((position) => !late_set.has(position));
            const has_entering = late_expected_positions.some((position) => !early_set.has(position));
            return has_leaving && has_entering;
        });

        expect(
            desired_early_left,
            `marker 数据不足：找不到与右端窗口同时有 entering/leaving 的早期簇窗口；width=${initial.width_pct}, positions=${positions.join(', ')}`,
        ).not.toBeUndefined();
        if (desired_early_left == null) throw new Error('找不到早期 marker 簇窗口');
        expect(desired_late_left, '右端窗口 left 应严格大于早期簇窗口').toBeGreaterThan(desired_early_left);
        const early_expected_positions = positions_in_closed_window(desired_early_left);
        const early_expected_set = new Set(early_expected_positions);
        const late_expected_set = new Set(late_expected_positions);
        expect(
            early_expected_positions.filter((position) => !late_expected_set.has(position)),
            '计算出的早期簇窗口应至少有一个 marker 在右端窗口离开',
        ).not.toHaveLength(0);
        expect(
            late_expected_positions.filter((position) => !early_expected_set.has(position)),
            '计算出的右端窗口应至少有一个新 marker 进入',
        ).not.toHaveLength(0);

        const early_target_x = initial.viewport_x + initial.viewport_width / 2
            + initial.track_viewport_width * (desired_early_left - initial.left_pct) / 100;
        await drag_minimap_window(page, early_target_x);
        const before = await minimap_state(page);
        const markers_before = await visible_marker_ids(page);
        expect(before.left_pct, '真实拖动后窗口应定位到早期 marker 簇').toBeCloseTo(desired_early_left, 1);
        expect(markers_before.length, '早期 marker 簇窗口应有可见 marker').toBeGreaterThan(0);
        expect(before.time_label, '真实拖动前时间标签不得为空').not.toBe('');
        expect_minimap_physical_alignment(before);
        expect_playhead_at_window_center(before);
        await attach_minimap_screenshot(page, test_info, 'minimap-drag-before');

        const late_target_x = before.track_viewport_x
            + before.track_viewport_width
            + before.viewport_width;
        await drag_minimap_window_with_held_screenshot(page, late_target_x, test_info);
        const after_right = await minimap_state(page);
        expect(after_right.left_pct, '真实拖动后窗口应定位到右端').toBeCloseTo(desired_late_left, 1);
        const markers_after_right = await visible_marker_ids(page);
        await attach_minimap_screenshot(page, test_info, 'minimap-drag-middle');

        expect(await zoom_value(page), '拖动 minimap 不得改变 zoom').toBe(80);
        expect(after_right.width_pct, '拖动后 minimap width 百分比应近似不变').toBeCloseTo(before.width_pct, 2);
        expect(after_right.left_pct, '向右拖动后 minimap left 百分比应严格增加').toBeGreaterThan(before.left_pct);
        expect(after_right.viewport_x, '向右拖动后红框 viewport x 应严格增加').toBeGreaterThan(before.viewport_x);
        expect(after_right.playhead_viewport_x, '向右拖动后 playhead viewport x 应严格增加').toBeGreaterThan(
            before.playhead_viewport_x,
        );
        expect(after_right.time_label, '向右拖动后时间标签应改变').not.toBe(before.time_label);
        expect_minimap_physical_alignment(after_right);
        expect_playhead_at_window_center(after_right);

        const before_marker_set = new Set(markers_before);
        const after_marker_set = new Set(markers_after_right);
        const leaving_markers = markers_before.filter((marker_id) => !after_marker_set.has(marker_id));
        const entering_markers = markers_after_right.filter((marker_id) => !before_marker_set.has(marker_id));
        expect(
            leaving_markers,
            `前置数据不足或窗口未平移：至少一个旧 marker 应离开；before=${markers_before.join(', ')}`,
        ).not.toHaveLength(0);
        expect(
            entering_markers,
            `前置数据不足或窗口未平移：至少一个新 marker 应进入；after=${markers_after_right.join(', ')}`,
        ).not.toHaveLength(0);

        const middle_box = await page.locator('.tl-mm-window').boundingBox();
        expect(middle_box, '向左端拖动前红框应有边界').not.toBeNull();
        if (!middle_box) throw new Error('向左端拖动前红框无边界');
        await drag_minimap_window(page, after_right.track_viewport_x - middle_box.width);
        const at_left = await minimap_state(page);
        expect(at_left.left_pct, '拖到左端后 left 应约为 0').toBeCloseTo(0, 1);
        expect_playhead_at_window_center(at_left);
        expect_minimap_physical_alignment(at_left);

        const left_box = await page.locator('.tl-mm-window').boundingBox();
        expect(left_box, '向右端拖动前应重新读取红框边界').not.toBeNull();
        if (!left_box) throw new Error('向右端拖动前红框无边界');
        await drag_minimap_window(
            page,
            at_left.track_viewport_x + at_left.track_viewport_width + left_box.width,
        );
        const at_right = await minimap_state(page);
        expect(at_right.left_pct, '拖到右端后 left 应约为 100-width').toBeCloseTo(
            100 - at_right.width_pct,
            1,
        );
        expect_playhead_at_window_center(at_right);
        expect_minimap_physical_alignment(at_right);
        await attach_minimap_screenshot(page, test_info, 'minimap-drag-after');

        await page.close();
    });

    test('minimap 红色窗口真实拖动在 100% overview 时 no-op', async () => {
        const page = await prepare_trace_view();
        const list_btn = page.locator('[data-view="list"]');
        const trace_btn = page.locator('[data-view="trace"]');
        await expect(list_btn).toBeVisible({ timeout: 3000 });
        await list_btn.click();
        await expect(trace_btn).toBeVisible({ timeout: 3000 });
        await trace_btn.click();
        await expect(page.locator('.tl-mm-window'), '切回 trace 后 minimap 红框应可见').toBeVisible();

        const before = await minimap_state(page);
        const markers_before = await visible_marker_ids(page);
        const zoom_before = await zoom_value(page);
        expect(before.width_pct, 'list→trace 后应恢复 100% overview').toBeCloseTo(100, 2);
        expect(before.left_pct, '100% overview 的 left 应为 0').toBeCloseTo(0, 2);

        await drag_minimap_window(
            page,
            before.viewport_x + before.viewport_width / 2 + before.track_viewport_width * 0.2,
        );
        const after = await minimap_state(page);
        const markers_after = await visible_marker_ids(page);

        expect(await zoom_value(page), '100% overview 拖动不得改变 zoom').toBe(zoom_before);
        expect(after.left_pct, '100% overview 拖动不得改变 left').toBeCloseTo(before.left_pct, 3);
        expect(after.width_pct, '100% overview 拖动不得改变 width').toBeCloseTo(before.width_pct, 3);
        expect(after.playhead_pct, '100% overview 拖动不得改变 playhead').toBeCloseTo(before.playhead_pct, 3);
        expect(markers_after, '100% overview 拖动不得改变可见 marker identity 集合').toEqual(markers_before);
        expect_minimap_physical_alignment(after);

        await page.close();
    });
});
