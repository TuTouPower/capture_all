// tests/unit/storage_list_captures_limit.test.ts
// @vitest-environment jsdom
// t198 AC-001: list_captures limit 入参校验——负数/0/小数给出明确行为（clamp），合法值语义不变。
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { init_db, create_capture, list_captures, STORE_NAMES } from '../../src/extension/background/storage';

const BASE_CONFIG = { capture_network: false, capture_console: false };

function make_record(capture_id: string, started_at: string): Record<string, unknown> {
    return {
        capture_id,
        name: 'Capture ' + capture_id,
        status: 'completed',
        started_at,
        ended_at: null,
        duration_ms: 0,
        start_url: 'https://example.com',
        end_url: null,
        tab_id: 42,
        window_id: 1,
        config_snapshot: BASE_CONFIG,
        stats: { event_count: 0, user_action_count: 0, nav_count: 0, request_count: 0, log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0, total_body_bytes: 0 },
        tags: [],
        created_at: started_at,
        updated_at: started_at,
    };
}

beforeEach(async () => {
    const db = await init_db();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAMES.CAPTURES, 'readwrite');
        tx.objectStore(STORE_NAMES.CAPTURES).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
});

describe('t198 AC-001: list_captures limit 入参校验', () => {
    it('合法值语义不变：undefined 全量、正整数截断', async () => {
        await create_capture(make_record('c1', '2026-01-01T01:00:00Z') as never);
        await create_capture(make_record('c2', '2026-01-01T02:00:00Z') as never);
        await create_capture(make_record('c3', '2026-01-01T03:00:00Z') as never);
        expect((await list_captures()).length).toBe(3);
        expect((await list_captures(2)).length).toBe(2);
    });

    it('负数/0 clamp 到 1（不静默返回空数组）', async () => {
        await create_capture(make_record('c1', '2026-01-01T01:00:00Z') as never);
        await create_capture(make_record('c2', '2026-01-01T02:00:00Z') as never);
        const neg = await list_captures(-5);
        expect(neg.length).toBe(1);
        expect(neg[0].capture_id).toBe('c2'); // 倒序（最新优先）仍生效
        expect((await list_captures(0)).length).toBe(1);
    });

    it('小数向下取整（明确截断，非静默行为）', async () => {
        await create_capture(make_record('c1', '2026-01-01T01:00:00Z') as never);
        await create_capture(make_record('c2', '2026-01-01T02:00:00Z') as never);
        await create_capture(make_record('c3', '2026-01-01T03:00:00Z') as never);
        expect((await list_captures(2.7)).length).toBe(2);
    });

    it('NaN 视为全量（不返回空数组，非 clamp 到 1）', async () => {
        await create_capture(make_record('c1', '2026-01-01T01:00:00Z') as never);
        await create_capture(make_record('c2', '2026-01-01T02:00:00Z') as never);
        // 两条记录区分「全量（2）」与「clamp 到 1（1）」
        expect((await list_captures(Number.NaN)).length).toBe(2);
    });
});
