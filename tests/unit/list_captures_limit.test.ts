// tests/unit/list_captures_limit.test.ts
// t153 AC-007: list_captures 支持可选 limit 截断（最旧优先倒序的前 N 条），默认全量。
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { create_capture, list_captures } from '../../src/extension/background/storage';
import type { CaptureRecord } from '../../src/shared/types';

function make_capture(id: string, started_at: string): CaptureRecord {
    return {
        capture_id: id,
        name: id,
        status: 'completed',
        started_at,
        ended_at: null,
        duration_ms: 0,
        start_url: '',
        end_url: null,
        tab_id: 1,
        window_id: null,
        config_snapshot: {},
        stats: {
            event_count: 0, user_action_count: 0, nav_count: 0, request_count: 0,
            log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0,
            total_body_bytes: 0,
        },
        tags: [],
        created_at: started_at,
        updated_at: started_at,
    } as CaptureRecord;
}

describe('list_captures limit（t153 AC-007）', () => {
    it('limit 截断为最旧优先倒序的前 N 条', async () => {
        await create_capture(make_capture('c1', '2026-01-01T00:00:00.000Z'));
        await create_capture(make_capture('c2', '2026-01-02T00:00:00.000Z'));
        await create_capture(make_capture('c3', '2026-01-03T00:00:00.000Z'));
        const limited = await list_captures(2);
        expect(limited.map((c) => c.capture_id)).toEqual(['c3', 'c2']);
    });

    it('默认（无 limit）返回全部（行为不变）', async () => {
        await create_capture(make_capture('c4', '2026-01-04T00:00:00.000Z'));
        const all = await list_captures();
        expect(all.map((c) => c.capture_id).sort()).toEqual(['c1', 'c2', 'c3', 'c4']);
    });

    it('limit 大于存量时返回全部', async () => {
        const all = await list_captures(100);
        expect(all.map((c) => c.capture_id).sort()).toEqual(['c1', 'c2', 'c3', 'c4']);
    });
});
