// tests/unit/t144_timeline_merge_network_console.test.ts
// t144: 时间线并入 network/console 事件——merge_detail_events 转换 + event_kind 分类 + rail 计数。
import { describe, it, expect } from 'vitest';
import { merge_detail_events, event_kind } from '../../src/extension/dashboard/dashboard_shared';
import type { CaptureEvent } from '../../src/shared/types';

function base_event(over: Partial<CaptureEvent> = {}): CaptureEvent {
    return {
        event_id: 'e', capture_id: 'c', category: 'user_action', type: 'input_event',
        relative_time_ms: 0, tab_id: 1, url: '', source: 'test', severity: 'info',
        created_at: 0, absolute_time: '', frame_id: 0, top_frame_url: '', page_title: '',
        data: {}, ...over,
    } as CaptureEvent;
}

function make_snapshot() {
    return {
        user_events: [base_event({ event_id: 'u1', type: 'input_event', relative_time_ms: 100 })],
        nav_events: [],
        error_events: [],
        storage_changes: [],
        cookie_changes: [],
        network_requests: [
            { event_id: 'n1', request_id: 'r1', method: 'GET', url: 'https://x', url_status: 'captured' as const, status_code: 200, status_text: null, protocol: null, resource_type: 'fetch' as const, initiator: null, duration_ms: 5, start_time_ms: 50, end_time_ms: 55, request_headers: null, response_headers: null, headers_status: 'captured' as const, request_body: null, request_body_status: 'not_enabled' as const, response_body: null, response_body_status: 'failed' as const, capture_method: 'webrequest' as const, body_capture_mode: 'webrequest' as const, relative_time: 50 },
        ],
        console_events: [
            { event_id: 'c1', level: 'log' as const, args_preview: ['hi'], args_status: 'captured' as const, stack_trace: null, source_url: null, line: null, column: null, repeat_count: null, related_network_request_id: null },
        ],
    };
}

describe('merge_detail_events (t144 AC-001/002)', () => {
    it('AC-001: network/console 事件并入 detail_events', () => {
        const events = merge_detail_events('c', make_snapshot());
        // 1 user + 1 network + 1 console = 3
        expect(events).toHaveLength(3);
        expect(events.some((e) => e.type === 'network_request')).toBe(true);
        expect(events.some((e) => e.type === 'console_event')).toBe(true);
    });

    it('AC-001b: network/console 事件类型可被 event_kind 分类到对应轨道', () => {
        const events = merge_detail_events('c', make_snapshot());
        const kinds = events.map((e) => event_kind(e));
        expect(kinds).toContain('network'); // network_request → network 轨道
        expect(kinds).toContain('console'); // console_event → console 轨道
    });

    it('AC-002: rail 计数（event_kind 频率）反映 network/console 实际事件数', () => {
        const events = merge_detail_events('c', make_snapshot());
        const counts: Record<string, number> = { all: events.length };
        for (const e of events) { const k = event_kind(e); counts[k] = (counts[k] || 0) + 1; }
        expect(counts.network).toBe(1);
        expect(counts.console).toBe(1);
        expect(counts.all).toBe(3);
    });

    it('AC-003: 无 network/console 事件时 detail_events 不含对应类型（不产生虚假数据）', () => {
        const snap = { ...make_snapshot(), network_requests: [], console_events: [] };
        const events = merge_detail_events('c', snap);
        expect(events).toHaveLength(1); // 仅 user
        expect(events.some((e) => e.type === 'network_request')).toBe(false);
        expect(events.some((e) => e.type === 'console_event')).toBe(false);
    });

    it('AC-006: 排序后相对时间升序（与修复前一致）', () => {
        const events = merge_detail_events('c', make_snapshot());
        const times = events.map((e) => e.relative_time_ms);
        const sorted = [...times].sort((a, b) => a - b);
        expect(times).toEqual(sorted);
    });

    it('AC-001c: console 事件用落库的 relative_time_ms（非恒 0）', () => {
        const snap = make_snapshot();
        snap.console_events[0].relative_time_ms = 500; // 落库复制了相对时间
        const events = merge_detail_events('c', snap);
        const con = events.find((e) => e.type === 'console_event');
        expect(con?.relative_time_ms).toBe(500);
    });

    it('AC-001d: ws 网络记录用 relative_time（绝对 epoch start_time_ms 不撑爆时间线）', () => {
        const snap = make_snapshot();
        // ws 记录：start_time_ms 是绝对 epoch（~1.7e12），relative_time 才是相对值
        snap.network_requests[0] = {
            ...snap.network_requests[0], start_time_ms: Date.now(), relative_time: 12345,
        };
        const events = merge_detail_events('c', snap);
        const net = events.find((e) => e.type === 'network_request');
        expect(net?.relative_time_ms).toBe(12345);
    });

    it('AC-001e: content hook 落库形状（CaptureEvent 顶层 relative_time_ms）被正确读取（f009）', () => {
        const snap = make_snapshot();
        // content hook 落 NETWORK store 是 CaptureEvent 形状：顶层 relative_time_ms，data 为 NetworkRequestData
        snap.network_requests[0] = {
            ...snap.network_requests[0],
            relative_time_ms: 777,
            relative_time: undefined,
        } as never;
        const events = merge_detail_events('c', snap);
        const net = events.find((e) => e.type === 'network_request');
        expect(net?.relative_time_ms).toBe(777);
    });
});
