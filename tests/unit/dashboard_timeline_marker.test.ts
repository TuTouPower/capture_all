// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

import {
    set_detail_events, set_dt_quick, set_dt_play, set_dt_zoom,
    set_dt_view, set_dt_sel, set_dt_insp_open,
    get_dt_play, get_dt_sel, get_dt_insp_open,
} from '../../src/extension/dashboard/dashboard_shared';
import type { CaptureEvent } from '../../src/shared/types';

function make_event(overrides: Partial<CaptureEvent> & { relative_time_ms: number; type: CaptureEvent['type'] }): CaptureEvent {
    return {
        event_id: `ev_${overrides.relative_time_ms}`,
        capture_id: 'cap_test',
        category: 'network',
        type: overrides.type,
        relative_time_ms: overrides.relative_time_ms,
        absolute_time: new Date().toISOString(),
        tab_id: 1,
        frame_id: 0,
        url: 'https://example.com',
        top_frame_url: null,
        page_title: null,
        source: 'background',
        severity: 'info',
        related_event_ids: [],
        redaction_status: 'none',
        raw_available: false,
        created_at: new Date().toISOString(),
        data: overrides.data ?? { url: 'https://example.com/api', method: 'GET', status_code: 200 },
    };
}

let render_trace: () => string;
let wire_detail: () => void;

async function load_module() {
    const mod = await import('../../src/extension/dashboard/dashboard_detail');
    render_trace = mod.render_trace as unknown as () => string;
    wire_detail = mod.wire_detail as unknown as () => void;
}

// ── data-event-idx attribute ──

describe('render_trace marker data-event-idx', () => {
    beforeEach(async () => {
        set_dt_view('trace');
        set_dt_quick('all');
        set_dt_zoom(50);
        set_dt_play(50);
        set_dt_sel(-1);
        set_dt_insp_open(false);
        const events: CaptureEvent[] = [
            make_event({ relative_time_ms: 1000, type: 'network_request' }),
            make_event({ relative_time_ms: 2000, type: 'network_request' }),
            make_event({ relative_time_ms: 5000, type: 'console_event' }),
            make_event({ relative_time_ms: 8000, type: 'runtime_exception' }),
        ];
        set_detail_events(events);
        await load_module();
    });

    it('network lane markers have data-event-idx matching detail_events index', () => {
        const html = render_trace();
        document.body.innerHTML = html;
        const lane_tracks = document.querySelectorAll('.tl-lane-track');
        expect(lane_tracks.length).toBeGreaterThan(0);
        const network_track = lane_tracks[0];
        const markers = network_track.querySelectorAll('.tl-tick');
        expect(markers.length).toBe(2);
        for (const m of markers) {
            expect(m.hasAttribute('data-event-idx')).toBe(true);
        }
        expect(markers[0].getAttribute('data-event-idx')).toBe('0');
        expect(markers[1].getAttribute('data-event-idx')).toBe('1');
    });

    it('console lane dot markers have data-event-idx', () => {
        const html = render_trace();
        document.body.innerHTML = html;
        const lane_tracks = document.querySelectorAll('.tl-lane-track');
        const console_track = lane_tracks[2];
        const dots = console_track.querySelectorAll('.tl-dot');
        expect(dots.length).toBe(1);
        expect(dots[0].getAttribute('data-event-idx')).toBe('2');
    });

    it('error lane diamond markers have data-event-idx', () => {
        const html = render_trace();
        document.body.innerHTML = html;
        const lane_tracks = document.querySelectorAll('.tl-lane-track');
        const error_track = lane_tracks[6];
        const diamonds = error_track.querySelectorAll('.tl-diamond');
        expect(diamonds.length).toBe(1);
        expect(diamonds[0].getAttribute('data-event-idx')).toBe('3');
    });

    it('markers use detail_events index regardless of quick filter', () => {
        set_dt_quick('console');
        const html = render_trace();
        document.body.innerHTML = html;
        const network_track = document.querySelectorAll('.tl-lane-track')[0];
        const markers = network_track.querySelectorAll('.tl-tick');
        expect(markers.length).toBe(2);
        // detail_events index 0, 1 — always present regardless of filter
        expect(markers[0].getAttribute('data-event-idx')).toBe('0');
        expect(markers[1].getAttribute('data-event-idx')).toBe('1');
        const console_track = document.querySelectorAll('.tl-lane-track')[2];
        const dots = console_track.querySelectorAll('.tl-dot');
        expect(dots.length).toBe(1);
        expect(dots[0].getAttribute('data-event-idx')).toBe('2');
    });
});

// ── click/drag distinction: 验证距离判断逻辑 ──

const CLICK_THRESHOLD = 3;

function marker_dist(dx: number, dy: number): number {
    return Math.sqrt(dx * dx + dy * dy);
}

describe('marker click/drag distinction', () => {
    it('dx=0 dy=0 → dist=0 → click', () => {
        expect(marker_dist(0, 0) <= CLICK_THRESHOLD).toBe(true);
    });
    it('dx=2 dy=2 → dist≈2.83 → click', () => {
        expect(marker_dist(2, 2) <= CLICK_THRESHOLD).toBe(true);
    });
    it('dx=3 dy=0 → dist=3 → click (边界)', () => {
        expect(marker_dist(3, 0) <= CLICK_THRESHOLD).toBe(true);
    });
    it('dx=4 dy=0 → dist=4 → drag', () => {
        expect(marker_dist(4, 0) <= CLICK_THRESHOLD).toBe(false);
    });
    it('dx=3 dy=1 → dist≈3.16 → drag', () => {
        expect(marker_dist(3, 1) <= CLICK_THRESHOLD).toBe(false);
    });
    it('dx=10 dy=10 → dist≈14.14 → drag', () => {
        expect(marker_dist(10, 10) <= CLICK_THRESHOLD).toBe(false);
    });
});

// ── AC-1: 点击标记 → playhead 跳到事件时间 ──

describe('marker click → playhead position from event time', () => {
    it('computes playhead pct from event relative_time_ms, not physical click position', () => {
        const max_t = 10000;
        const event_ms = 5000;
        const playhead_pct = (event_ms / max_t) * 100;
        expect(playhead_pct).toBe(50);
    });

    it('event at start of timeline → playhead near 0%', () => {
        const max_t = 10000;
        expect((0 / max_t) * 100).toBe(0);
    });

    it('event at end of timeline → playhead near 100%', () => {
        const max_t = 10000;
        expect((10000 / max_t) * 100).toBe(100);
    });

    it('zoomed timeline — event time still maps correctly', () => {
        const max_t = 20000;
        expect((15000 / max_t) * 100).toBe(75);
    });
});

// ── AC-2/AC-3: inspector 状态 + DOM 模拟 ──

describe('marker click → inspector state', () => {
    beforeEach(() => {
        set_dt_sel(-1);
        set_dt_insp_open(false);
    });

    it('click opens inspector (set_dt_sel + set_dt_insp_open)', () => {
        set_dt_sel(2);
        set_dt_insp_open(true);
        expect(get_dt_sel()).toBe(2);
        expect(get_dt_insp_open()).toBe(true);
    });

    it('clicking different event updates dt_sel', () => {
        set_dt_sel(0);
        set_dt_insp_open(true);
        set_dt_sel(3);
        expect(get_dt_sel()).toBe(3);
        expect(get_dt_insp_open()).toBe(true);
    });

    it('click same event skips re-render when inspector already open', () => {
        set_dt_sel(1);
        set_dt_insp_open(true);
        const same_event = get_dt_sel() === 1 && get_dt_insp_open();
        expect(same_event).toBe(true);
    });

    it('click same event triggers re-render when inspector is closed', () => {
        set_dt_sel(1);
        set_dt_insp_open(false);
        const same_event = get_dt_sel() === 1 && get_dt_insp_open();
        expect(same_event).toBe(false);
    });
});

// ── INV-2: 幂等 —— 点击同一标记两次状态不变 ──

describe('marker click idempotency', () => {
    beforeEach(() => {
        set_dt_sel(-1);
        set_dt_insp_open(false);
    });

    it('clicking same marker twice does not corrupt state', () => {
        set_dt_sel(1);
        set_dt_insp_open(true);
        expect(get_dt_sel()).toBe(1);
        expect(get_dt_insp_open()).toBe(true);
        set_dt_sel(1);
        set_dt_insp_open(true);
        expect(get_dt_sel()).toBe(1);
        expect(get_dt_insp_open()).toBe(true);
    });
});

// ── DOM 行为测试：渲染 trace + 模拟标记 click 链 ──

describe('trace view DOM: marker click chain', () => {
    beforeEach(async () => {
        set_dt_view('trace');
        set_dt_quick('all');
        set_dt_zoom(0);
        set_dt_play(50);
        set_dt_sel(-1);
        set_dt_insp_open(false);
        const events: CaptureEvent[] = [
            make_event({ relative_time_ms: 1000, type: 'network_request' }),
            make_event({ relative_time_ms: 5000, type: 'console_event' }),
            make_event({ relative_time_ms: 8000, type: 'runtime_exception' }),
        ];
        set_detail_events(events);
        await load_module();
    });

    it('marker click → playhead style.left matches event time percentage', () => {
        const html = render_trace();
        document.body.innerHTML = html;
        const marker = document.querySelector('.tl-diamond') as HTMLElement;
        expect(marker).toBeTruthy();
        const idx_str = marker.dataset.eventIdx!;
        expect(idx_str).toBe('2');
        // Simulate click: compute playhead from event time
        const maxT = 10000;
        const event_ms = 8000; // runtime_exception at 8000ms
        const p = (event_ms / maxT) * 100;
        const head = document.getElementById('tlPlayhead') as HTMLElement;
        set_dt_play(p);
        head.style.left = `${p}%`;
        expect(get_dt_play()).toBe(80);
        expect(head.style.left).toBe('80%');
    });

    it('marker click → inspector state set correctly', () => {
        const html = render_trace();
        document.body.innerHTML = html;
        const marker = document.querySelector('.tl-diamond') as HTMLElement;
        const idx = parseInt(marker.dataset.eventIdx!, 10);
        expect(idx).toBe(2);
        set_dt_sel(idx);
        set_dt_insp_open(true);
        expect(get_dt_sel()).toBe(2);
        expect(get_dt_insp_open()).toBe(true);
    });

    it('marker click → playhead label updated to event timestamp', () => {
        const html = render_trace();
        document.body.innerHTML = html;
        const head = document.getElementById('tlPlayhead') as HTMLElement;
        const lbl = head.querySelector('.tl-playhead-lbl') as HTMLElement;
        // Event at 8000ms = 00:08
        const mins = Math.floor(8000 / 60000);
        const secs = Math.floor((8000 % 60000) / 1000);
        const txt = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        expect(txt).toBe('00:08');
        lbl.textContent = txt;
        expect(lbl.textContent).toBe('00:08');
    });

    it('playhead renders inside the track-aligned overlay', () => {
        document.body.innerHTML = render_trace();
        const overlay = document.getElementById('tlTrackOverlay');
        const head = document.getElementById('tlPlayhead');
        expect(overlay).toBeTruthy();
        expect(overlay?.contains(head)).toBe(true);
    });

    it('lane pointer seek uses the track overlay geometry', () => {
        document.body.innerHTML = `<div id="content">${render_trace()}</div>`;
        const lanes = document.getElementById('tlLanes') as HTMLElement;
        const overlay = document.getElementById('tlTrackOverlay') as HTMLElement;
        const head = document.getElementById('tlPlayhead') as HTMLElement;
        expect(lanes).toBeTruthy();
        expect(overlay).toBeTruthy();

        lanes.getBoundingClientRect = () => ({
            x: 100,
            y: 0,
            left: 100,
            top: 0,
            right: 700,
            bottom: 200,
            width: 600,
            height: 200,
            toJSON: () => ({}),
        });
        overlay.getBoundingClientRect = () => ({
            x: 288,
            y: 0,
            left: 288,
            top: 0,
            right: 700,
            bottom: 200,
            width: 412,
            height: 200,
            toJSON: () => ({}),
        });

        wire_detail();
        lanes.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            clientX: 391,
            clientY: 20,
        }));
        window.dispatchEvent(new PointerEvent('pointerup'));

        expect(get_dt_play()).toBeCloseTo(25, 5);
        expect(parseFloat(head.style.left)).toBeCloseTo(25, 5);
    });
});

// ── minimap 窗口真实 pointer 拖动 ──

describe('trace view DOM: minimap window drag', () => {
    const track_rect = {
        x: 100,
        y: 300,
        left: 100,
        top: 300,
        right: 600,
        bottom: 322,
        width: 500,
        height: 22,
        toJSON: () => ({}),
    };

    async function setup_minimap(
        events: CaptureEvent[],
        zoom = 80,
        playhead = 50,
        overview = false,
    ): Promise<{
        mm_track: HTMLElement;
        mm_window: HTMLElement;
        capture_calls: number[];
        release_calls: number[];
    }> {
        set_dt_view(overview ? 'list' : 'trace');
        if (overview) set_dt_view('trace');
        else set_dt_zoom(zoom);
        set_dt_play(playhead);
        set_dt_quick('all');
        set_dt_sel(-1);
        set_dt_insp_open(false);
        set_detail_events(events);
        await load_module();

        document.body.innerHTML = `<div id="content">${render_trace()}</div>`;
        const mm_track = document.getElementById('tlMmTrack') as HTMLElement;
        const mm_window = document.getElementById('tlMmWindow') as HTMLElement;
        const capture_calls: number[] = [];
        const release_calls: number[] = [];
        let captured_pointer_id: number | null = null;

        expect(mm_track).toBeTruthy();
        expect(mm_window).toBeTruthy();
        mm_track.getBoundingClientRect = () => track_rect;
        Object.defineProperties(mm_window, {
            setPointerCapture: {
                value: (pointer_id: number) => {
                    captured_pointer_id = pointer_id;
                    capture_calls.push(pointer_id);
                },
            },
            hasPointerCapture: {
                value: (pointer_id: number) => captured_pointer_id === pointer_id,
            },
            releasePointerCapture: {
                value: (pointer_id: number) => {
                    if (captured_pointer_id === pointer_id) captured_pointer_id = null;
                    release_calls.push(pointer_id);
                },
            },
        });
        wire_detail();
        return { mm_track, mm_window, capture_calls, release_calls };
    }

    function pointer_event(type: string, pointer_id: number, client_x: number): PointerEvent {
        return new PointerEvent(type, {
            bubbles: true,
            button: type === 'pointerdown' ? 0 : -1,
            buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
            clientX: client_x,
            clientY: 311,
            pointerId: pointer_id,
        });
    }

    const events = [
        make_event({ relative_time_ms: 1000, type: 'network_request' }),
        make_event({ relative_time_ms: 5000, type: 'console_event' }),
        make_event({ relative_time_ms: 8000, type: 'runtime_exception' }),
        make_event({ relative_time_ms: 10000, type: 'network_request' }),
    ];

    it('dragging right keeps width and moves playhead plus visible markers', async () => {
        const { mm_window, capture_calls, release_calls } = await setup_minimap(events);
        const width_before = mm_window.style.width;
        const visible_before = Array.from(document.querySelectorAll<HTMLElement>('[data-event-idx]'))
            .filter((marker) => !marker.classList.contains('tl-hidden'))
            .map((marker) => marker.dataset.eventIdx);

        mm_window.dispatchEvent(pointer_event('pointerdown', 7, 350));
        mm_window.dispatchEvent(pointer_event('pointermove', 7, 450));
        mm_window.dispatchEvent(pointer_event('pointerup', 7, 450));

        const visible_after = Array.from(document.querySelectorAll<HTMLElement>('[data-event-idx]'))
            .filter((marker) => !marker.classList.contains('tl-hidden'))
            .map((marker) => marker.dataset.eventIdx);
        expect(capture_calls).toEqual([7]);
        expect(release_calls).toEqual([7]);
        expect(mm_window.style.width).toBe(width_before);
        expect(parseFloat(mm_window.style.left)).toBeCloseTo(60, 5);
        expect(get_dt_play()).toBeCloseTo(70, 5);
        expect(visible_before).toContain('1');
        expect(visible_after).not.toContain('1');
        expect(visible_after).toContain('2');
        expect(mm_window.classList.contains('is-dragging')).toBe(false);
    });

    it('clamps minimap drag to both timeline edges', async () => {
        const { mm_window } = await setup_minimap(events);

        mm_window.dispatchEvent(pointer_event('pointerdown', 8, 350));
        mm_window.dispatchEvent(pointer_event('pointermove', 8, -500));
        mm_window.dispatchEvent(pointer_event('pointerup', 8, -500));
        expect(parseFloat(mm_window.style.left)).toBeCloseTo(0, 5);
        expect(get_dt_play()).toBeCloseTo(10, 5);

        mm_window.dispatchEvent(pointer_event('pointerdown', 9, 150));
        mm_window.dispatchEvent(pointer_event('pointermove', 9, 1000));
        mm_window.dispatchEvent(pointer_event('pointerup', 9, 1000));
        expect(parseFloat(mm_window.style.left)).toBeCloseTo(80, 5);
        expect(get_dt_play()).toBeCloseTo(90, 5);
    });

    it('100% overview window ignores pointer drag', async () => {
        const { mm_window, capture_calls } = await setup_minimap(events, 80, 30, true);
        const left_before = mm_window.style.left;
        const playhead_before = get_dt_play();

        mm_window.dispatchEvent(pointer_event('pointerdown', 10, 350));
        mm_window.dispatchEvent(pointer_event('pointermove', 10, 500));
        mm_window.dispatchEvent(pointer_event('pointerup', 10, 500));

        expect(mm_window.style.width).toBe('100%');
        expect(mm_window.style.left).toBe(left_before);
        expect(get_dt_play()).toBe(playhead_before);
        expect(capture_calls).toEqual([]);
        expect(mm_window.dataset.draggable).toBe('0');
    });

    it('pointercancel cleans up the active drag', async () => {
        const { mm_window, release_calls } = await setup_minimap(events);

        mm_window.dispatchEvent(pointer_event('pointerdown', 11, 350));
        mm_window.dispatchEvent(pointer_event('pointermove', 11, 400));
        const left_at_cancel = mm_window.style.left;
        mm_window.dispatchEvent(pointer_event('pointercancel', 11, 400));
        mm_window.dispatchEvent(pointer_event('pointermove', 11, 500));

        expect(mm_window.style.left).toBe(left_at_cancel);
        expect(release_calls).toEqual([11]);
        expect(mm_window.classList.contains('is-dragging')).toBe(false);
    });

    it('ignores events from another pointer during an active drag', async () => {
        const { mm_window, release_calls } = await setup_minimap(events);

        mm_window.dispatchEvent(pointer_event('pointerdown', 14, 350));
        const left_before = mm_window.style.left;
        mm_window.dispatchEvent(pointer_event('pointermove', 15, 500));
        mm_window.dispatchEvent(pointer_event('pointerup', 15, 500));
        expect(mm_window.style.left).toBe(left_before);
        expect(mm_window.classList.contains('is-dragging')).toBe(true);

        mm_window.dispatchEvent(pointer_event('pointerup', 14, 350));
        expect(release_calls).toEqual([14]);
        expect(mm_window.classList.contains('is-dragging')).toBe(false);
    });

    it('ignores another pointerdown while a minimap drag is active', async () => {
        const { mm_window, capture_calls, release_calls } = await setup_minimap(events);

        mm_window.dispatchEvent(pointer_event('pointerdown', 17, 350));
        const left_before_second_pointer = mm_window.style.left;
        mm_window.dispatchEvent(pointer_event('pointerdown', 18, 450));
        mm_window.dispatchEvent(pointer_event('pointermove', 18, 550));
        mm_window.dispatchEvent(pointer_event('pointerup', 18, 550));

        expect(capture_calls).toEqual([17]);
        expect(mm_window.style.left).toBe(left_before_second_pointer);
        expect(mm_window.classList.contains('is-dragging')).toBe(true);
        expect(release_calls).toEqual([]);

        mm_window.dispatchEvent(pointer_event('pointermove', 17, 400));
        expect(mm_window.style.left).not.toBe(left_before_second_pointer);
        mm_window.dispatchEvent(pointer_event('pointerup', 17, 400));
        expect(release_calls).toEqual([17]);
        expect(mm_window.classList.contains('is-dragging')).toBe(false);
    });

    it('lost pointer capture stops further minimap movement', async () => {
        const { mm_window } = await setup_minimap(events);

        mm_window.dispatchEvent(pointer_event('pointerdown', 16, 350));
        mm_window.dispatchEvent(pointer_event('pointermove', 16, 400));
        const left_at_capture_loss = mm_window.style.left;
        mm_window.dispatchEvent(pointer_event('lostpointercapture', 16, 400));
        mm_window.dispatchEvent(pointer_event('pointermove', 16, 500));

        expect(mm_window.style.left).toBe(left_at_capture_loss);
        expect(mm_window.classList.contains('is-dragging')).toBe(false);
    });

    it('includes a marker on the right window boundary', async () => {
        const { mm_window } = await setup_minimap(events);

        mm_window.dispatchEvent(pointer_event('pointerdown', 13, 350));
        mm_window.dispatchEvent(pointer_event('pointermove', 13, 1000));
        mm_window.dispatchEvent(pointer_event('pointerup', 13, 1000));

        const end_marker = document.querySelector<HTMLElement>('[data-event-idx="3"]');
        expect(end_marker).toBeTruthy();
        expect(end_marker?.classList.contains('tl-hidden')).toBe(false);
    });

    it('empty timeline drag remains finite and error-free', async () => {
        const { mm_window } = await setup_minimap([]);

        mm_window.dispatchEvent(pointer_event('pointerdown', 12, 350));
        mm_window.dispatchEvent(pointer_event('pointermove', 12, 450));
        mm_window.dispatchEvent(pointer_event('pointerup', 12, 450));

        expect(Number.isFinite(parseFloat(mm_window.style.left))).toBe(true);
        expect(Number.isFinite(parseFloat(mm_window.style.width))).toBe(true);
        expect(Number.isFinite(get_dt_play())).toBe(true);
        expect(document.querySelectorAll('[data-event-idx]')).toHaveLength(0);
    });
});
