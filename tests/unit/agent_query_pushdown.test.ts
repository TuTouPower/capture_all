// tests/unit/agent_query_pushdown.test.ts
// t161 AC-001/002/003/005: Agent 查询下推——点查只访问对应 store、limit 约束读取量、
// count 不读记录体、与纯函数路径结果等价（对拍）
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init_db, create_capture, write_events, write_network_requests, write_console_events, STORE_NAMES, _storage_stats_for_test, _reset_storage_stats_for_test } from '../../src/extension/background/storage';
import {
    get_entry_pushdown,
    list_entries_pushdown,
    list_sources_pushdown,
    get_timeline_pushdown,
    load_agent_capture_data,
    list_entries_from_capture_data,
} from '../../src/extension/background/agent_data_queries';
import type { CaptureEvent, CaptureRecord, NetworkRequestData, ConsoleEventData } from '../../src/shared/types';

function make_capture(capture_id: string): CaptureRecord {
    return {
        capture_id,
        name: 'Capture',
        status: 'completed',
        started_at: '2026-01-01T00:00:00Z',
        ended_at: '2026-01-01T00:10:00Z',
        duration_ms: 600000,
        start_url: 'https://example.com',
        end_url: null,
        tab_id: 1,
        window_id: null,
        config_snapshot: {},
        stats: { event_count: 0, user_action_count: 0, nav_count: 0, request_count: 0, log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0, total_body_bytes: 0 },
        tags: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:10:00Z',
    };
}

const TEST_STORES = [STORE_NAMES.USER_ACTION_EVENTS, STORE_NAMES.NAVIGATION_EVENTS, STORE_NAMES.NETWORK_REQUESTS, STORE_NAMES.CONSOLE_EVENTS, STORE_NAMES.ERROR_EVENTS, STORE_NAMES.STORAGE_CHANGES, STORE_NAMES.COOKIE_CHANGES, STORE_NAMES.CAPTURES];

function make_event(i: number, capture_id = 'c1', relative_time_ms = i * 10): CaptureEvent {
    return {
        event_id: `evt_${String(i).padStart(4, '0')}`,
        capture_id,
        category: 'user_action',
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

function make_request(i: number): NetworkRequestData {
    return {
        request_id: `req_${i}`,
        event_id: `req_evt_${i}`,
        capture_id: 'c1',
        method: 'GET',
        url: `https://example.com/${i}`,
        url_status: 'captured',
        status_code: 200,
        status_text: 'OK',
        protocol: 'http/2',
        resource_type: 'fetch',
        initiator: null,
        duration_ms: 10,
        start_time_ms: i,
        end_time_ms: i + 10,
        request_headers: null,
        response_headers: null,
        headers_status: 'captured',
        request_body: null,
        request_body_status: 'not_enabled',
        request_body_encoding: null,
        request_body_bytes: null,
        request_body_mime: null,
        response_body: null,
        response_preview: null,
        response_body_status: 'not_enabled',
        response_body_encoding: null,
        response_body_bytes: null,
        mime_type: null,
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: null,
        cache_status: null,
        error_text: null,
        capture_method: 'web_request',
        body_capture_mode: 'off',
        relative_time_ms: i,
    };
}

beforeEach(async () => {
    const db = await init_db();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(TEST_STORES, 'readwrite');
        for (const name of TEST_STORES) tx.objectStore(name).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    await create_capture(make_capture('c1'));
    await create_capture(make_capture('c2'));
    _reset_storage_stats_for_test();
    vi.restoreAllMocks();
});

describe('agent 查询下推', () => {
    it('AC-001: data.get 点查只访问对应 store 对应记录（主键直查）', async () => {
        await write_events([make_event(1), make_event(2)]);
        await write_network_requests([make_request(1)]);

        const entry = await get_entry_pushdown('c1', 'user_action_events', 'user_action_events:evt_0002');
        expect(entry.data).toMatchObject({ event_id: 'evt_0002' });
        // AC-001: 点查只做 1 次主键读，不做任何 keyset 扫描（旧实现全量读会 keyset_cursor_reads > 0）
        expect(_storage_stats_for_test.point_reads).toBe(1);
        expect(_storage_stats_for_test.keyset_cursor_reads).toBe(0);

        // 缺失 → RECORD_NOT_FOUND
        await expect(get_entry_pushdown('c1', 'user_action_events', 'user_action_events:evt_missing')).rejects.toThrow('RECORD_NOT_FOUND');
        // 跨 capture 误查被拒（主键全局但归属校验）
        await write_events([make_event(9, 'c2')]);
        await expect(get_entry_pushdown('c1', 'user_action_events', 'user_action_events:evt_0009')).rejects.toThrow('RECORD_NOT_FOUND');
    });

    it('AC-002: data.list limit=1 读取量受 limit 约束，不加载全量', async () => {
        const events = Array.from({ length: 50 }, (_, i) => make_event(i));
        await write_events(events);

        // limit=1 → 仅返回 1 条；total 用索引 count（不读记录体）。
        // 读取量 O(limit) 由 storage_keyset.test.ts AC-004（cursor advance 次数 = limit）直接覆盖；
        // 此处验证下推层契约：keyset limit 透传（list_entries_pushdown 内 limit: offset+limit）。
        const result = await list_entries_pushdown('c1', {
            source: 'user_action_events',
            offset: 0,
            limit: 1,
        } as never);
        expect(result.records.length).toBe(1);
        expect(result.total).toBe(50);
        // 读取量 = limit（keyset 只读 1 条；旧实现全量加载会读取全部 50 条）
        expect(_storage_stats_for_test.keyset_cursor_reads).toBe(1);
        // AC-004: token 续页端到端——next_token 回传 after 继续，不重不漏
        _reset_storage_stats_for_test();
        const p1 = await list_entries_pushdown('c1', { source: 'user_action_events', offset: 0, limit: 20 } as never);
        expect(p1.records.length).toBe(20);
        expect(p1.next_token).toBeTruthy();
        const p2 = await list_entries_pushdown('c1', { source: 'user_action_events', offset: 0, limit: 20, after: p1.next_token } as never);
        expect(p2.records.length).toBe(20);
        const p3 = await list_entries_pushdown('c1', { source: 'user_action_events', offset: 0, limit: 20, after: p2.next_token } as never);
        expect(p3.records.length).toBe(10);
        const ids = [...p1.records, ...p2.records, ...p3.records].map(r => r.record_id);
        expect(new Set(ids).size).toBe(50);
        // 三页总读取 = 50（O(N)，无 offset skip 放大）
        expect(_storage_stats_for_test.keyset_cursor_reads).toBe(50);
    });

    it('AC-003: sources.list count/range 用索引（不读记录体）；types 为契约扫描', async () => {
        await write_events([make_event(1), make_event(2), make_event(3)]);
        await write_network_requests([make_request(1)]);

        const sources = await list_sources_pushdown('c1');
        const user_source = sources.find(s => s.source === 'user_action_events');
        expect(user_source?.count).toBe(3);
        expect(user_source?.time_range).toEqual({ start: 10, end: 30 });
        const net_source = sources.find(s => s.source === 'network_requests');
        expect(net_source?.count).toBe(1);
        // count/range 走索引：count_reads ≥ 1（index.count），keyset 读取仅来自 types 契约扫描
        // （7 源 × 各 4 条以内的少量记录）——退化 getAll 实现 count_reads=0 会红
        expect(_storage_stats_for_test.count_reads).toBeGreaterThanOrEqual(1);
        expect(_storage_stats_for_test.count_reads).toBe(7);
    });


    it('AC-003b: 生产形态 network（build_network_data 只写 relative_time）经索引可查（f001 回归）', async () => {
        const { build_network_data } = await import('../../src/shared/network_builder');
        // 生产 web_request 路径：input 只带 relative_time（无 relative_time_ms）
        const net = build_network_data({
            capture_id: 'c1',
            event_id: 'net_evt_1',
            request_id: 'req_1',
            method: 'GET',
            url: 'https://example.com/1',
            status_code: 200,
            resource_type: 'fetch',
            duration_ms: 10,
            request_headers: {},
            response_headers: {},
            headers_status: 'captured',
            request_body: null,
            request_body_status: 'not_enabled',
            response_body: null,
            response_preview: null,
            response_body_status: 'not_enabled',
            mime_type: null,
            capture_method: 'web_request',
            body_capture_mode: 'off',
            relative_time: 150,
        } as never);
        await write_network_requests([net as unknown as NetworkRequestData]);

        // build_network_data 复制 relative_time → relative_time_ms，keyset 索引可查
        const sources = await list_sources_pushdown('c1');
        const net_source = sources.find(s => s.source === 'network_requests');
        expect(net_source?.count).toBe(1);
        const list = await list_entries_pushdown('c1', { source: 'network_requests', offset: 0, limit: 10 } as never);
        expect(list.records.length).toBe(1);
    });
    it('AC-005a: data.list 下推结果与纯函数路径等价（记录、排序、total）', async () => {
        const events = [
            make_event(1, 'c1', 300),
            make_event(2, 'c1', 100),
            make_event(3, 'c1', 200),
            make_event(4, 'c1', 400),
        ];
        await write_events(events);

        const pushdown = await list_entries_pushdown('c1', {
            source: 'user_action_events',
            offset: 0,
            limit: 100,
        } as never);
        const pure = list_entries_from_capture_data(await load_agent_capture_data('c1'), {
            source: 'user_action_events',
            offset: 0,
            limit: 100,
        } as never);
        expect(pushdown.total).toBe(pure.total);
        expect(pushdown.records.map(r => r.record_id)).toEqual(pure.records.map(r => r.record_id));
        expect(pushdown.records.map(r => r.time)).toEqual(pure.records.map(r => r.time));
    });

    it('AC-005b: desc 排序与 offset 分页语义等价', async () => {
        const events = Array.from({ length: 6 }, (_, i) => make_event(i, 'c1', i * 10));
        await write_events(events);

        const pushdown = await list_entries_pushdown('c1', {
            source: 'user_action_events',
            offset: 2,
            limit: 2,
            order: 'desc',
        } as never);
        const pure = list_entries_from_capture_data(await load_agent_capture_data('c1'), {
            source: 'user_action_events',
            offset: 2,
            limit: 2,
            order: 'desc',
        } as never);
        expect(pushdown.records.map(r => r.record_id)).toEqual(pure.records.map(r => r.record_id));
        expect(pushdown.records.map(r => r.index)).toEqual([3, 4]);
    });

    it('AC-005c: timeline.list 下推与纯函数等价（跨源合并排序）', async () => {
        await write_events([make_event(1, 'c1', 100), make_event(2, 'c1', 300)]);
        await write_network_requests([make_request(1), make_request(2)]);

        const pushdown = await get_timeline_pushdown('c1', { limit: 100 } as never);
        const pure = await (async () => {
            const { get_timeline_from_capture_data } = await import('../../src/extension/background/agent_data_queries');
            return get_timeline_from_capture_data(await load_agent_capture_data('c1'), { limit: 100 } as never);
        })();
        expect(pushdown.total).toBe(pure.total);
        expect(pushdown.records.map(r => r.record_id)).toEqual(pure.records.map(r => r.record_id));
        // 时间升序
        const times = pushdown.records.map(r => r.time);
        expect(times).toEqual([...times].sort((a, b) => a - b));
    });
});
