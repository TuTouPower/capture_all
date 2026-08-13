// tests/unit/capture_data_reader.test.ts
// t156 AC-001/002/005: 页面快照读取器全量分页（替代固定 100000 截断）
// AC-003/004 见 capture_archive_count.test.ts（mock read_capture_snapshot + archive builder 单测）
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { read_capture_snapshot } from '../../src/extension/shared/capture_data_reader';
import type { CaptureEvent, CaptureRecord } from '../../src/shared/types';

vi.mock('../../src/extension/background/storage', () => ({
    get_capture: vi.fn(),
    get_events_by_category: vi.fn(),
    get_network_requests: vi.fn(),
    get_console_events: vi.fn(),
    get_error_events: vi.fn(),
    get_storage_changes: vi.fn(),
    get_cookie_changes: vi.fn(),
}));

import {
    get_capture,
    get_events_by_category,
    get_network_requests,
    get_console_events,
    get_error_events,
    get_storage_changes,
    get_cookie_changes,
} from '../../src/extension/background/storage';

function make_event(i: number, category: 'user_action' | 'navigation'): CaptureEvent {
    return {
        event_id: `evt_${i}`,
        capture_id: 'capture_big',
        category,
        type: category === 'user_action' ? 'mouse_event' : 'page_load',
        relative_time_ms: i,
        absolute_time: '2026-01-01T00:00:00Z',
        tab_id: 1,
        frame_id: 0,
        url: 'https://example.com',
        top_frame_url: null,
        page_title: null,
        source: 'content_script',
        severity: 'info',
        related_event_ids: [],
        redaction_status: 'none',
        raw_available: true,
        created_at: '2026-01-01T00:00:00Z',
    };
}

function make_capture(user_action_count: number, nav_count: number): CaptureRecord {
    return {
        capture_id: 'capture_big',
        name: 'big',
        status: 'completed',
        started_at: '2026-01-01T00:00:00Z',
        ended_at: '2026-01-01T00:10:00Z',
        duration_ms: 600000,
        start_url: 'https://example.com',
        end_url: null,
        tab_id: 1,
        window_id: null,
        config_snapshot: {},
        stats: {
            event_count: user_action_count + nav_count,
            user_action_count,
            nav_count,
            request_count: 0,
            log_count: 0,
            error_count: 0,
            storage_change_count: 0,
            cookie_change_count: 0,
            total_body_bytes: 0,
        },
        tags: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:10:00Z',
    };
}

describe('read_capture_snapshot', () => {
    const USER_ACTION_COUNT = 100001;

    beforeEach(() => {
        vi.clearAllMocks();
        get_capture.mockResolvedValue(make_capture(USER_ACTION_COUNT, 0));
        // 分页 fixture：user_action 100001 条，其余类别为空
        get_events_by_category.mockImplementation(async (_id: string, category: string, offset = 0, limit = 100) => {
            if (category !== 'user_action') return [];
            return Array.from({ length: Math.min(limit, USER_ACTION_COUNT - offset) }, (_, k) => make_event(offset + k, 'user_action'));
        });
        get_network_requests.mockResolvedValue([]);
        get_console_events.mockResolvedValue([]);
        get_error_events.mockResolvedValue([]);
        get_storage_changes.mockResolvedValue([]);
        get_cookie_changes.mockResolvedValue([]);
    });

    it('AC-001: 单类别记录数 > 100000 时返回全部记录，且等于持久化统计值', async () => {
        const snapshot = await read_capture_snapshot('capture_big');
        expect(snapshot.user_events.length).toBe(USER_ACTION_COUNT);
        expect(snapshot.user_events.length).toBeGreaterThan(100000);
        // 与持久化统计一致
        const capture = await get_capture('capture_big');
        expect(snapshot.user_events.length).toBe(capture!.stats.user_action_count);
    });

    it('AC-002: 跨页读取遵循 PAGE_SIZE=5000，offset 单调递增，第二页及以后正确追加', async () => {
        const calls: Array<[string, number, number]> = [];
        get_events_by_category.mockImplementation(async (_id: string, category: string, offset = 0, limit = 100) => {
            if (category !== 'user_action') return [];
            calls.push([category, offset, limit]);
            return Array.from({ length: Math.min(limit, USER_ACTION_COUNT - offset) }, (_, k) => make_event(offset + k, 'user_action'));
        });
        const snapshot = await read_capture_snapshot('capture_big');
        // offset 单调递增序列：0, 5000, ..., 100000
        expect(calls.map(c => c[1])).toEqual([0, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000, 75000, 80000, 85000, 90000, 95000, 100000]);
        // limit 恒为 PAGE_SIZE
        for (const c of calls) expect(c[2]).toBe(5000);
        // 不丢不重：返回的 event_id 与注入源一一对应
        expect(snapshot.user_events.length).toBe(USER_ACTION_COUNT);
        expect(snapshot.user_events[5000].event_id).toBe('evt_5000');
        expect(snapshot.user_events[100000].event_id).toBe('evt_100000');
        const ids = new Set(snapshot.user_events.map(e => e.event_id));
        expect(ids.size).toBe(USER_ACTION_COUNT);
    });

    it('AC-005: 读取路径不保留静默截断上限——>100000 条全量返回', async () => {
        const snapshot = await read_capture_snapshot('capture_big');
        // 无固定 100000 截断：单类别全量返回（AC-001 已断言与持久化统计一致）
        expect(snapshot.user_events.length).toBe(USER_ACTION_COUNT);
    });
});
