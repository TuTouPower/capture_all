// tests/unit/storage_keyset.test.ts
// t161 AC-004: keyset 分页——O(N) 读取（cursor advance 次数受 limit 约束）、token 续页、
// 时间窗口下推、desc、capture 隔离、count/first-last 不读记录体
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
    init_db,
    write_events,
    query_by_store_keyset,
    count_by_store_keyset,
    first_last_keys_by_store,
    get_store_record_by_id,
    get_events_by_category,
    STORE_NAMES,
    _storage_stats_for_test,
    _reset_storage_stats_for_test,
} from '../../src/extension/background/storage';
import type { CaptureEvent } from '../../src/shared/types';

// 测试隔离：每用例清空事件类 store（fake-indexeddb 全局库，避免数据累积污染）
const TEST_STORES = [
    STORE_NAMES.USER_ACTION_EVENTS,
    STORE_NAMES.NAVIGATION_EVENTS,
    STORE_NAMES.NETWORK_REQUESTS,
    STORE_NAMES.CONSOLE_EVENTS,
    STORE_NAMES.ERROR_EVENTS,
    STORE_NAMES.STORAGE_CHANGES,
    STORE_NAMES.COOKIE_CHANGES,
];

beforeEach(async () => {
    const db = await init_db();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(TEST_STORES, 'readwrite');
        for (const name of TEST_STORES) tx.objectStore(name).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    _reset_storage_stats_for_test();
});

function make_event(i: number, capture_id = 'c1', relative_time_ms = i * 10, category: CaptureEvent['category'] = 'user_action'): CaptureEvent {
    return {
        event_id: `evt_${String(i).padStart(4, '0')}`,
        capture_id,
        category,
        type: 'mouse_event',
        relative_time_ms,
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

describe('storage keyset 分页', () => {
    it('AC-004a: 页读取量受 limit 约束（advance 次数 = limit），token 续页不重不漏', async () => {
        const events = Array.from({ length: 23 }, (_, i) => make_event(i));
        await write_events(events);

        const p1 = await query_by_store_keyset<CaptureEvent>('user_action_events', 'c1', { limit: 10 });
        expect(p1.records.length).toBe(10);
        expect(p1.next_token).toBeTruthy();
        expect(p1.records.map(r => r.event_id)).toEqual(events.slice(0, 10).map(e => e.event_id));

        const p2 = await query_by_store_keyset<CaptureEvent>('user_action_events', 'c1', { limit: 10, after: p1.next_token });
        expect(p2.records.length).toBe(10);
        const p3 = await query_by_store_keyset<CaptureEvent>('user_action_events', 'c1', { limit: 10, after: p2.next_token });
        expect(p3.records.length).toBe(3);
        expect(p3.next_token).toBeNull();

        const all = [...p1.records, ...p2.records, ...p3.records].map(r => r.event_id);
        expect(new Set(all).size).toBe(23); // 不重不漏

        // O(N) instrumentation：三页总 cursor 读取 = 23 条（无 offset skip 放大；
        // 退化实现（每页从头 skip）会读取 10+20+23=53 次）
        expect(_storage_stats_for_test.keyset_cursor_reads).toBe(23);
    });

    it('AC-004b: 页间相对时间序一致（时间序 = 索引序）', async () => {
        // 乱序写入（relative_time 与 event_id 无关）
        const events = [
            make_event(1, 'c1', 300),
            make_event(2, 'c1', 100),
            make_event(3, 'c1', 200),
            make_event(4, 'c1', 400),
        ];
        await write_events(events);
        const p1 = await query_by_store_keyset<CaptureEvent>('user_action_events', 'c1', { limit: 2 });
        const p2 = await query_by_store_keyset<CaptureEvent>('user_action_events', 'c1', { limit: 2, after: p1.next_token });
        const times = [...p1.records, ...p2.records].map(r => r.relative_time_ms);
        expect(times).toEqual([100, 200, 300, 400]); // 时间升序，页间不乱
    });

    it('AC-004c: capture 隔离——跨 capture 不混入', async () => {
        await write_events([make_event(1, 'c1', 100), make_event(2, 'c2', 200), make_event(3, 'c1', 300)]);
        const page = await query_by_store_keyset<CaptureEvent>('user_action_events', 'c1', { limit: 100 });
        expect(page.records.map(r => r.capture_id)).toEqual(['c1', 'c1']);
    });

    it('AC-004d: 时间窗口下推（start/end）', async () => {
        await write_events([
            make_event(1, 'c1', 100), make_event(2, 'c1', 200), make_event(3, 'c1', 300), make_event(4, 'c1', 400),
        ]);
        const page = await query_by_store_keyset<CaptureEvent>('user_action_events', 'c1', { limit: 100, start_time: 150, end_time: 350 });
        expect(page.records.map(r => r.relative_time_ms)).toEqual([200, 300]);
    });

    it('AC-004e: desc 方向（prev cursor）', async () => {
        await write_events([
            make_event(1, 'c1', 100), make_event(2, 'c1', 200), make_event(3, 'c1', 300),
        ]);
        const page = await query_by_store_keyset<CaptureEvent>('user_action_events', 'c1', { limit: 100, direction: 'prev' });
        expect(page.records.map(r => r.relative_time_ms)).toEqual([300, 200, 100]);
    });

    it('AC-004f: count 与 first/last 不读记录体（索引级）', async () => {
        await write_events([
            make_event(1, 'c1', 100), make_event(2, 'c1', 200), make_event(3, 'c2', 50),
        ]);
        expect(await count_by_store_keyset('user_action_events', 'c1')).toBe(2);
        expect(await count_by_store_keyset('user_action_events', 'c1', { start_time: 150 })).toBe(1);
        const fl = await first_last_keys_by_store('user_action_events', 'c1');
        expect(fl.first).toBe(100);
        expect(fl.last).toBe(200);
        // 索引级（不读记录体）：2 次 index.count，0 次记录读取（退化 getAll 实现 count_reads=0 红）
        expect(_storage_stats_for_test.count_reads).toBe(2);
        expect(_storage_stats_for_test.keyset_cursor_reads).toBe(0);
    });

    it('AC-004g: 主键点查（data.get 用）', async () => {
        await write_events([make_event(7, 'c1', 100)]);
        const rec = await get_store_record_by_id<CaptureEvent>('user_action_events', 'evt_0007');
        expect(rec?.event_id).toBe('evt_0007');
        expect(await get_store_record_by_id<CaptureEvent>('user_action_events', 'evt_missing')).toBeNull();
    });

    it('t198 AC-004: dom_data 类别事件落 USER_ACTION_EVENTS store（路由断言）', async () => {
        // dom_data 无专属 store（DD-007 已删 dom_mutation 事件），CATEGORY_STORE_MAP 映射回 fallback
        await write_events([make_event(9, 'c1', 100, 'dom_data')]);
        const by_category = await get_events_by_category('c1', 'dom_data');
        expect(by_category.length).toBe(1);
        expect(by_category[0].event_id).toBe('evt_0009');
        expect(by_category[0].category).toBe('dom_data');
        // 与 user_action 同 store：按 store 名查询可见
        const by_store = await get_store_record_by_id<CaptureEvent>('user_action_events', 'evt_0009');
        expect(by_store?.event_id).toBe('evt_0009');
    });
});
