// @vitest-environment jsdom
// tests/unit/dashboard_detail_idx_map.test.ts
// t153 AC-004: 时间线渲染消除 O(n²)（预建 Map<event, idx>，替代 detail_events.indexOf）。
// 行为等价：data-ev / data-event-idx 仍为全量 detail_events 索引（过滤/分 lane 后不变）。
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    set_detail_events, set_dt_quick, set_dt_view,
} from '../../src/extension/dashboard/dashboard_shared';
import { _render_dt_list_for_test, render_trace } from '../../src/extension/dashboard/dashboard_detail';
import type { CaptureEvent } from '../../src/shared/types';

function make_event(id: string, type: CaptureEvent['type'], relative_time_ms: number): CaptureEvent {
    return {
        event_id: id,
        capture_id: 'cap',
        category: 'network',
        type,
        relative_time_ms,
        absolute_time: '2026-01-01T00:00:00.000Z',
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
        created_at: '2026-01-01T00:00:00.000Z',
        data: { url: 'https://example.com/api', method: 'GET', status_code: 200 },
    };
}

describe('时间线 idx 映射（t153 AC-004）', () => {
    beforeEach(() => {
        set_dt_view('list');
        set_dt_quick('all');
        set_detail_events([
            make_event('e1', 'network_request', 100),
            make_event('e2', 'network_request', 200),
            make_event('e3', 'console_event', 300),
            make_event('e4', 'network_request', 400),
        ]);
    });

    it('render_dt_list 的 data-ev 为全量 detail_events 索引（quick 过滤后仍指向全量下标）', () => {
        // 过滤到仅 console 事件 → 渲染子集，但 data-ev 必须指向全量数组下标 2（非子集 0）
        set_dt_quick('console');
        const html = _render_dt_list_for_test();
        document.body.innerHTML = html;
        const rows = document.querySelectorAll<HTMLElement>('tr[data-ev]');
        expect(rows.length).toBe(1);
        expect(rows[0].dataset.ev).toBe('2');
    });

    it('render_trace 的 data-event-idx 为全量索引（各 lane 子集仍正确）', () => {
        const html = render_trace();
        document.body.innerHTML = html;
        const markers = document.querySelectorAll<HTMLElement>('[data-event-idx]');
        // network lane: idx 0,1,3；console lane: idx 2（lanes 顺序 network→console）
        expect(markers.length).toBe(4);
        const idxs = Array.from(markers).map((m) => m.dataset.eventIdx);
        expect(idxs).toEqual(['0', '1', '3', '2']);
    });

    it('调用路径锚点：渲染路径不再调用 detail_events.indexOf（O(n²) 已消除）', () => {
        const src = readFileSync(
            resolve(__dirname, '../../src/extension/dashboard/dashboard_detail.ts'),
            'utf8',
        );
        expect(src).not.toMatch(/detail_events\.indexOf/);
    });
});
