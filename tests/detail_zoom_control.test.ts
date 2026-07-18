// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

// ── 状态层测试：_dt_zoom 存取器行为 ──
import {
    get_dt_zoom, set_dt_zoom,
    get_dt_zoom_window_pct,
    get_dt_view, set_dt_view,
    get_dt_play, set_dt_play,
} from '../src/extension/dashboard/dashboard_shared';

describe('_dt_zoom 状态存取', () => {
    beforeEach(() => { set_dt_zoom(50); set_dt_view('trace'); });

    it('默认值为 50', () => { expect(get_dt_zoom()).toBe(50); });

    it('set_dt_zoom / get_dt_zoom 读写一致', () => {
        set_dt_zoom(30); expect(get_dt_zoom()).toBe(30);
        set_dt_zoom(80); expect(get_dt_zoom()).toBe(80);
    });
});

describe('set_dt_view 联动缩放重置', () => {
    beforeEach(() => { set_dt_zoom(50); });

    it("set_dt_view('list') 重置 slider 为 50 并恢复全时间范围", () => {
        set_dt_zoom(30);
        set_dt_view('list');
        expect(get_dt_zoom()).toBe(50);
        expect(get_dt_zoom_window_pct()).toBe(100);
    });

    it("set_dt_view('trace') 保留重置后的全时间范围", () => {
        set_dt_view('list');
        set_dt_view('trace');
        expect(get_dt_zoom()).toBe(50);
        expect(get_dt_zoom_window_pct()).toBe(100);
    });

    it('首次 slider 输入退出全览并恢复普通映射', () => {
        set_dt_view('list');
        set_dt_view('trace');
        set_dt_zoom(50);
        expect(get_dt_zoom()).toBe(50);
        expect(get_dt_zoom_window_pct()).toBe(50);
    });

    it("set_dt_view('trace') 不改变用户缩放", () => {
        set_dt_zoom(30);
        set_dt_view('trace');
        expect(get_dt_zoom()).toBe(30);
        expect(get_dt_zoom_window_pct()).toBe(70);
    });
});

// ── 映射逻辑层测试：slider → window_pct ──
function slider_to_window_pct(slider_value: number): number {
    return Math.max(5, 100 - slider_value);
}

describe('slider_to_window_pct 映射', () => {
    it('slider=0 → 100%（全可见）', () => { expect(slider_to_window_pct(0)).toBe(100); });
    it('slider=50 → 50%（默认）', () => { expect(slider_to_window_pct(50)).toBe(50); });
    it('slider=100 → 5%（最大放大、下限钳制）', () => { expect(slider_to_window_pct(100)).toBe(5); });
    it('slider=95 → 5%（钳位边界刚好到下限）', () => { expect(slider_to_window_pct(95)).toBe(5); });
    it('slider=96 → 5%（钳位生效）', () => { expect(slider_to_window_pct(96)).toBe(5); });
});

// ── 窗口计算逻辑测试 ──
function calc_window(dt_zoom: number, dt_play: number, maxT: number) {
    const window_pct = slider_to_window_pct(dt_zoom);
    const win_width_ms = maxT * window_pct / 100;
    const playhead_ms = (dt_play / 100) * maxT;
    const half_win = win_width_ms / 2;
    const win_left = Math.max(0, Math.min(maxT - win_width_ms, playhead_ms - half_win));
    const win_right = win_left + win_width_ms;
    return { window_pct, win_width_ms, win_left, win_right };
}

describe('缩放窗口计算', () => {
    it('默认 zoom=50 playhead=2500ms maxT=10000ms → 窗口左右对称', () => {
        const w = calc_window(50, 25, 10000);
        expect(w.window_pct).toBe(50);
        expect(w.win_width_ms).toBe(5000);
        expect(w.win_left).toBe(0);
    });

    it('zoom=0 (全可见) → win_width_ms = maxT', () => {
        const w = calc_window(0, 50, 10000);
        expect(w.window_pct).toBe(100);
        expect(w.win_width_ms).toBe(10000);
    });

    it('zoom=80 playhead=5000ms maxT=10000ms → 窗口缩小、playhead 居中', () => {
        const w = calc_window(80, 50, 10000);
        expect(w.window_pct).toBe(20);
        expect(w.win_width_ms).toBe(2000);
        expect(w.win_left).toBe(4000);
    });

    it('playhead 靠近 t=0 时左边界钳制到 0', () => {
        const w = calc_window(80, 5, 10000);
        expect(w.win_left).toBe(0);
    });

    it('playhead 靠近 maxT 时右边界不超过 maxT', () => {
        const w = calc_window(80, 95, 10000);
        expect(w.win_right).toBe(10000);
    });
});

// ── 过滤逻辑测试（无 DOM，模拟 core 算法） ──
function filter_marks(
    marks: { left: number; event_ms: number }[],
    dt_zoom: number, dt_play: number, maxT: number
): { visible: boolean }[] {
    const w = calc_window(dt_zoom, dt_play, maxT);
    return marks.map((m) => {
        const visible = m.event_ms >= w.win_left && m.event_ms <= w.win_right;
        return { visible };
    });
}

describe('apply_zoom_filter 过滤逻辑', () => {
    const marks = [
        { left: 10, event_ms: 1000 },   // near start
        { left: 25, event_ms: 2500 },   // near playhead (25%)
        { left: 50, event_ms: 5000 },   // middle
        { left: 80, event_ms: 8000 },   // near end
        { left: 95, event_ms: 9500 },
    ];
    const maxT = 10000;

    it('默认 zoom=50 playhead=50% → playhead 附近事件可见', () => {
        const r = filter_marks(marks, 50, 50, maxT);
        // window = 50%, centered at 5000 → [2500, 7500]
        expect(r[0].visible).toBe(false);
        expect(r[1].visible).toBe(true);
        expect(r[2].visible).toBe(true);
        expect(r[3].visible).toBe(false);
    });

    it('放大后 playhead 附近事件可见、远端事件不可见', () => {
        const r = filter_marks(marks, 80, 50, maxT);
        // window_pct = 20%, centered at 5000 → [4000, 6000]
        expect(r[0].visible).toBe(false);
        expect(r[1].visible).toBe(false);
        expect(r[2].visible).toBe(true);
        expect(r[3].visible).toBe(false);
    });

    it('playhead 右移后右侧新事件进入窗口、左侧事件离开', () => {
        const r = filter_marks(marks, 80, 80, maxT);
        // window_pct = 20%, centered at 8000 → [7000, 9000]
        expect(r[2].visible).toBe(false);
        expect(r[3].visible).toBe(true);
    });
});

// ── DOM 行为测试：apply_zoom_filter 等价逻辑驱动真实 DOM ──
function build_timeline_dom(marks: { left: number; event_ms: number }[]): {
    container: HTMLElement;
    mm_window: HTMLElement;
} {
    document.body.innerHTML = '';
    const container = document.createElement('div');
    const track = document.createElement('div');
    track.className = 'tl-lane-track';
    for (const m of marks) {
        const span = document.createElement('span');
        span.className = 'tl-tick';
        span.style.left = `${m.left}%`;
        track.appendChild(span);
    }
    container.appendChild(track);
    const mm = document.createElement('div');
    mm.className = 'tl-mm-window';
    container.appendChild(mm);
    document.body.appendChild(container);
    return { container, mm_window: mm };
}

function apply_zoom_filter_dom(
    dt_zoom: number, dt_play: number, maxT: number
): { visible_count: number; hidden_count: number; mm_width: string; mm_left: string } {
    const w = calc_window(dt_zoom, dt_play, maxT);
    const tracks = document.querySelectorAll('.tl-lane-track');
    let visible = 0, hidden = 0;
    for (const track of tracks) {
        const marks = track.querySelectorAll<HTMLElement>('.tl-tick, .tl-dot, .tl-diamond');
        for (const m of marks) {
            const left = parseFloat(m.style.left || '0');
            const ev_ms = (left / 100) * maxT;
            if (ev_ms >= w.win_left && ev_ms <= w.win_right) {
                m.classList.remove('tl-hidden');
                visible++;
            } else {
                m.classList.add('tl-hidden');
                hidden++;
            }
        }
    }
    const mm = document.querySelector<HTMLElement>('.tl-mm-window')!;
    mm.style.width = `${w.window_pct}%`;
    mm.style.left = `${(w.win_left / maxT) * 100}%`;
    return { visible_count: visible, hidden_count: hidden, mm_width: mm.style.width, mm_left: mm.style.left };
}

describe('apply_zoom_filter DOM 行为', () => {
    const maxT = 10000;
    const marks = [
        { left: 10, event_ms: 1000 },
        { left: 25, event_ms: 2500 },
        { left: 50, event_ms: 5000 },
        { left: 80, event_ms: 8000 },
    ];

    it('默认 zoom=50 时 playhead 附近事件可见、远端事件 hidden', () => {
        build_timeline_dom(marks);
        const r = apply_zoom_filter_dom(50, 50, maxT);
        expect(r.visible_count).toBe(2);
        expect(r.hidden_count).toBe(2);
        // 2500ms 和 5000ms 在窗口 [2500, 7500] 内
        expect(document.querySelectorAll('.tl-tick')[1].classList.contains('tl-hidden')).toBe(false);
        expect(document.querySelectorAll('.tl-tick')[0].classList.contains('tl-hidden')).toBe(true);
    });

    it('放大后可见减少、hidden 增多', () => {
        build_timeline_dom(marks);
        const r = apply_zoom_filter_dom(80, 50, maxT);
        expect(r.visible_count).toBe(1);
        expect(r.hidden_count).toBe(3);
    });

    it('playhead 移动后窗口跟随平移', () => {
        build_timeline_dom(marks);
        apply_zoom_filter_dom(80, 50, maxT);
        expect(document.querySelectorAll('.tl-tick')[2].classList.contains('tl-hidden')).toBe(false);
        // 移动 playhead 到 80%
        apply_zoom_filter_dom(80, 80, maxT);
        expect(document.querySelectorAll('.tl-tick')[2].classList.contains('tl-hidden')).toBe(true);
        expect(document.querySelectorAll('.tl-tick')[3].classList.contains('tl-hidden')).toBe(false);
    });

    it('minimap 窗口同步更新 width 和 left', () => {
        build_timeline_dom(marks);
        const r = apply_zoom_filter_dom(80, 50, maxT);
        expect(r.mm_width).toBe('20%');
        expect(r.mm_left).toBe('40%');
    });
});

describe('INV-3 playhead 为窗口中心', () => {
    it('win_left 以 playhead 为中心计算', () => {
        const w = calc_window(80, 50, 10000);
        const center = w.win_left + w.win_width_ms / 2;
        expect(center).toBe(5000);
    });
});
