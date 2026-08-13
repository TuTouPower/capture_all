import { describe, expect, test, vi } from 'vitest';
import {
    get_entry_from_capture_data,
    get_timeline_from_capture_data,
    get_timeline_item_from_capture_data,
    list_data_sources_from_capture_data,
    list_entries_from_capture_data,
    load_agent_capture_data,
    type AgentDataSource,
    type AgentSessionData
} from '../../src/extension/background/agent_data_queries';
import type { CaptureEvent, CaptureRecord, ConsoleEventData, CookieChangeData, NetworkRequestData, RuntimeExceptionData, StorageChangeData } from '../../src/shared/types';

vi.mock('../../src/extension/background/storage', async (import_original) => ({
    ...await import_original<typeof import('../../src/extension/background/storage')>(),
    get_capture: vi.fn(),
    get_events_by_category: vi.fn(),
    get_network_requests: vi.fn(),
    get_console_events: vi.fn(),
    get_error_events: vi.fn(),
    get_storage_changes: vi.fn(),
    get_cookie_changes: vi.fn(),
    // t161: 下推路径用到的 storage API——importOriginal 保留真实实现，测试覆盖旧路径用例不受影响
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

const capture: CaptureRecord = {
    capture_id: 'capture_1',
    name: 'capture_1',
    status: 'completed',
    started_at: '1970-01-01T00:00:01.000Z',
    ended_at: '1970-01-01T00:00:05.000Z',
    duration_ms: 4000,
    start_url: 'https://example.com',
    end_url: 'https://example.com/login',
    tab_id: 1,
    window_id: null,
    config_snapshot: {},
    stats: { event_count: 2, request_count: 1, log_count: 1, error_count: 1, storage_change_count: 0, cookie_change_count: 0 },
    export_status: 'not_exported',
    tags: [],
    created_at: '1970-01-01T00:00:01.000Z',
    updated_at: '1970-01-01T00:00:05.000Z'
};

const events: CaptureEvent[] = [
    {
        event_id: 'page_load_1',
        capture_id: 'capture_1',
        category: 'navigation',
        type: 'page_load',
        relative_time_ms: 30,
        absolute_time: '1970-01-01T00:00:01.030Z',
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
        created_at: '1970-01-01T00:00:01.030Z',
        data: { load_time_ms: 20, dom_content_loaded_ms: 10 }
    },
    {
        event_id: 'mouse_1',
        capture_id: 'capture_1',
        category: 'user_action',
        type: 'mouse_event',
        relative_time_ms: 10,
        absolute_time: '1970-01-01T00:00:01.010Z',
        tab_id: 1,
        frame_id: 0,
        url: 'https://example.com/login',
        top_frame_url: null,
        page_title: null,
        source: 'content_script',
        severity: 'info',
        related_event_ids: [],
        redaction_status: 'none',
        raw_available: true,
        created_at: '1970-01-01T00:00:01.010Z',
        data: { action: 'click', x: 1, y: 2, target_selector: '#login' }
    }
];

const network_requests: NetworkRequestData[] = [{
    request_id: 'request_1',
    capture_id: 'capture_1',
    relative_time: 20,
    absolute_time: 1020,
    tab_id: 1,
    method: 'POST',
    url: 'https://example.com/api/login',
    url_status: 'captured',
    status_code: 401,
    status_text: 'Unauthorized',
    protocol: 'https',
    resource_type: 'fetch',
    initiator: null,
    duration_ms: 50,
    start_time_ms: 20,
    end_time_ms: 70,
    request_headers: { 'content-type': 'application/json' },
    response_headers: {},
    headers_status: 'captured',
    request_body: '{"user":"a"}',
    request_body_status: 'captured',
    response_body: null,
    response_preview: null,
    response_body_status: 'not_enabled',
    mime_type: 'application/json',
    request_size_bytes: null,
    response_size_bytes: null,
    transfer_size_bytes: null,
    from_cache: false,
    cache_status: 'none',
    error_text: null,
    capture_method: 'web_request',
    body_capture_mode: 'none'
}];

const console_events = [{
    level: 'error',
    args_preview: ['failed'],
    args_status: 'captured',
    stack_trace: null,
    source_url: 'https://example.com',
    line: 1,
    column: 2,
    repeat_count: null,
    related_network_request_id: null,
    relative_time: 40,
    absolute_time: 1040
}] as Array<ConsoleEventData & { relative_time: number; absolute_time: number }>;

const error_events = [{
    message: 'worker failed',
    error_name: 'Error',
    stack_trace: 'stack',
    source_url: null,
    line: null,
    column: null,
    exception_id: null,
    severity: 'error',
    related_event_ids: [],
    relative_time: 50,
    absolute_time: 1050
}] as Array<RuntimeExceptionData & { relative_time: number; absolute_time: number }>;

const data: AgentSessionData = {
    capture,
    sources: {
        user_action_events: [events[1]],
        navigation_events: [events[0]],
        network_requests,
        console_events,
        error_events,
        storage_changes: [],
        cookie_changes: [],
        capture_lifecycle_events: [] // t180: Agent 数据源 8 源
    }
};

describe('agent data queries', () => {
    test('summarizes available data sources', () => {
        expect(list_data_sources_from_capture_data(data)).toEqual([
            {
                source: 'user_action_events',
                count: 1,
                time_range: { start: 10, end: 10 },
                types: ['mouse_event']
            },
            {
                source: 'navigation_events',
                count: 1,
                time_range: { start: 30, end: 30 },
                types: ['page_load']
            },
            {
                source: 'network_requests',
                count: 1,
                time_range: { start: 20, end: 20 },
                types: ['fetch']
            },
            {
                source: 'console_events',
                count: 1,
                time_range: { start: 40, end: 40 },
                types: ['error']
            },
            {
                source: 'error_events',
                count: 1,
                time_range: { start: 50, end: 50 },
                types: ['Error']
            }
        ]);
    });

    test('lists records with pagination and stable ids', () => {
        expect(list_entries_from_capture_data(data, {
            source: 'navigation_events',
            offset: 0,
            limit: 1,
            order: 'asc'
        })).toEqual({
            total: 1,
            records: [{
                record_id: 'navigation_events:page_load_1',
                source: 'navigation_events',
                index: 1,
                time: 30,
                absolute_time: 1030,
                type: 'page_load',
                summary: 'page_load https://example.com',
                preview: { url: 'https://example.com', tab_id: 1, frame_id: 0 }
            }]
        });
    });

    test('filters records by time and desc order', () => {
        expect(get_timeline_from_capture_data(data, {
            sources: ['user_action_events', 'navigation_events'],
            start_time: 10,
            end_time: 30,
            order: 'desc'
        }).records.map(record => record.record_id)).toEqual(['navigation_events:page_load_1', 'user_action_events:mouse_1']);
    });

    test('returns complete record details', () => {
        expect(get_entry_from_capture_data(data, 'network_requests', 'network_requests:request_1')).toEqual({
            record_id: 'network_requests:request_1',
            source: 'network_requests',
            data: network_requests[0]
        });
    });

    test('merges timeline records across sources', () => {
        expect(get_timeline_from_capture_data(data, { limit: 3 }).records.map(record => record.record_id)).toEqual([
            'user_action_events:mouse_1',
            'network_requests:request_1',
            'navigation_events:page_load_1'
        ]);
    });

    test('get_timeline_item_from_capture_data delegates to get_entry_from_capture_data', () => {
        const result = get_timeline_item_from_capture_data(data, 'network_requests:request_1');
        expect(result).toEqual({
            record_id: 'network_requests:request_1',
            source: 'network_requests',
            data: network_requests[0]
        });
    });

    test('get_timeline_item_from_capture_data throws for unknown record', () => {
        expect(() => get_timeline_item_from_capture_data(data, 'network_requests:r_nonexistent')).toThrow(
            'RECORD_NOT_FOUND'
        );
    });

    // ── t151 AC-005: 分页切片边界与结构化错误码补充 ────────────────
    test('list_entries 分页切片：offset 越界返回空、limit=0 返回空、正常切片', () => {
        const many = Array.from({ length: 5 }, (_, i) => ({
            event_id: `nav_${i}`,
            capture_id: 'capture_1',
            category: 'navigation',
            type: 'route_change',
            relative_time_ms: i * 10,
            tab_id: 1,
            url: 'https://x',
            source: 'content_script',
            severity: 'info',
            created_at: i,
            data: {},
        })) as CaptureEvent[];
        const d: AgentSessionData = { capture, sources: { ...data.sources, navigation_events: many } };

        const beyond = list_entries_from_capture_data(d, { source: 'navigation_events', offset: 10, limit: 100, order: 'asc' });
        expect(beyond.total).toBe(5);
        expect(beyond.records).toHaveLength(0);

        const zero = list_entries_from_capture_data(d, { source: 'navigation_events', offset: 0, limit: 0, order: 'asc' });
        expect(zero.total).toBe(5);
        expect(zero.records).toHaveLength(0);

        const page = list_entries_from_capture_data(d, { source: 'navigation_events', offset: 2, limit: 2, order: 'asc' });
        expect(page.records).toHaveLength(2);
        expect(page.records[0].record_id).toContain('nav_2');
        expect(page.records[1].record_id).toContain('nav_3');
    });

    test('timeline 分页 offset 切片', () => {
        const r = get_timeline_from_capture_data(data, { offset: 1, limit: 1, order: 'asc' });
        // data 各 source 按时间升序：mouse(10) → request(20) → page_load(30) → console(40) → error(50)
        expect(r.records.map((x) => x.record_id)).toEqual(['network_requests:request_1']);
    });

    test('无效 source → SOURCE_NOT_FOUND', () => {
        expect(() => list_entries_from_capture_data(data, { source: 'bogus' as AgentDataSource })).toThrow('SOURCE_NOT_FOUND');
    });

    test('storage_changes 事件 payload 在 event.data 内（AC-004 回归：summary/preview 读 data 字段）', () => {
        const d = {
            capture: {},
            sources: {
                user_action_events: [], navigation_events: [], network_requests: [], console_events: [], error_events: [],
                storage_changes: [{
                    event_id: 's1', capture_id: 'c', type: 'storage_change',
                    relative_time_ms: 50, tab_id: 1, url: '', source: 'test', severity: 'info',
                    // AC-004: StorageChangeData 在 data 内，非顶层
                    data: { action: 'set', storage_type: 'local', key: 'theme', origin: 'https://x', value_status: 'captured' },
                } as CaptureEvent],
                cookie_changes: [],
                capture_lifecycle_events: [], // t180: Agent 数据源 8 源
            },
        };
        const res = list_entries_from_capture_data(d as never, { source: 'storage_changes', offset: 0, limit: 10, order: 'asc' });
        expect(res.total).toBe(1);
        expect(res.records[0].type).toBe('set');
        expect(res.records[0].summary).toBe('local.set theme');
        expect(res.records[0].preview).toEqual({ key: 'theme', origin: 'https://x', value_status: 'captured' });
    });

    test('storage_changes 旧顶层形记录（无 data 键，AC-004 前采集）fallback 读 record 自身不崩溃（f003）', () => {
        const d = {
            capture: {},
            sources: {
                user_action_events: [], navigation_events: [], network_requests: [], console_events: [], error_events: [],
                // 旧采集顶层形：StorageChangeData 直接顶层（无 CaptureEvent data 嵌套）
                storage_changes: [{
                    action: 'remove', storage_type: 'session', key: 'auth', origin: 'https://y', value_status: 'captured',
                } as CaptureEvent],
                cookie_changes: [],
                capture_lifecycle_events: [], // t180: Agent 数据源 8 源
            },
        };
        const res = list_entries_from_capture_data(d as never, { source: 'storage_changes', offset: 0, limit: 10, order: 'asc' });
        expect(res.total).toBe(1);
        expect(res.records[0].type).toBe('remove');
        expect(res.records[0].summary).toBe('session.remove auth');
    });
});

describe('load_agent_capture_data', () => {
    test('loads all 8 data sources and wraps capture', async () => {
        const mock_capture: CaptureRecord = {
            capture_id: 'cap-1',
            name: 'Test Capture',
            status: 'completed',
            started_at: '1970-01-01T00:00:00.000Z',
            ended_at: '1970-01-01T00:00:05.000Z',
            duration_ms: 5000,
            start_url: 'https://example.com',
            end_url: 'https://example.com/done',
            tab_id: 1,
            window_id: null,
            config_snapshot: {},
            stats: { event_count: 0, request_count: 0, log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0 },
            export_status: 'not_exported',
            tags: [],
            created_at: '1970-01-01T00:00:00.000Z',
            updated_at: '1970-01-01T00:00:05.000Z'
        };

        vi.mocked(get_capture).mockResolvedValue(mock_capture);
        vi.mocked(get_events_by_category).mockResolvedValue([]);
        vi.mocked(get_network_requests).mockResolvedValue([]);
        vi.mocked(get_console_events).mockResolvedValue([]);
        vi.mocked(get_error_events).mockResolvedValue([]);
        vi.mocked(get_storage_changes).mockResolvedValue([]);
        vi.mocked(get_cookie_changes).mockResolvedValue([]);

        const result = await load_agent_capture_data('cap-1');

        expect(result.capture).toEqual(mock_capture);
        expect(result.sources).toEqual({
            user_action_events: [],
            navigation_events: [],
            network_requests: [],
            console_events: [],
            error_events: [],
            storage_changes: [],
            cookie_changes: [],
            capture_lifecycle_events: [] // t180: lifecycle 加入 Agent source（8 源）
        });

        expect(get_capture).toHaveBeenCalledWith('cap-1');
        // T043: 分页聚合，首次以 offset=0, PAGE_SIZE=5000 调用
        expect(get_events_by_category).toHaveBeenCalledWith('cap-1', 'user_action', 0, 5000);
        expect(get_events_by_category).toHaveBeenCalledWith('cap-1', 'navigation', 0, 5000);
        expect(get_network_requests).toHaveBeenCalledWith('cap-1', 0, 5000);
        expect(get_console_events).toHaveBeenCalledWith('cap-1', 0, 5000);
        expect(get_error_events).toHaveBeenCalledWith('cap-1', 0, 5000);
        expect(get_storage_changes).toHaveBeenCalledWith('cap-1', 0, 5000);
        expect(get_cookie_changes).toHaveBeenCalledWith('cap-1', 0, 5000);
        // t180: lifecycle 加入 Agent source，分页读取包含 capture_lifecycle 类别
        expect(get_events_by_category).toHaveBeenCalledWith('cap-1', 'capture_lifecycle', 0, 5000);
    });

    test('throws CAPTURE_NOT_FOUND when capture is missing', async () => {
        vi.mocked(get_capture).mockResolvedValue(null);

        await expect(load_agent_capture_data('cap-missing')).rejects.toThrow('CAPTURE_NOT_FOUND');
    });

    test('loads non-empty data sources', async () => {
        const mock_capture: CaptureRecord = {
            capture_id: 'cap-2',
            name: 'Cap 2',
            status: 'completed',
            started_at: '1970-01-01T00:00:00.000Z',
            ended_at: '1970-01-01T00:00:10.000Z',
            duration_ms: 10000,
            start_url: 'https://test.com',
            end_url: 'https://test.com/end',
            tab_id: 2,
            window_id: null,
            config_snapshot: {},
            stats: { event_count: 1, request_count: 1, log_count: 1, error_count: 0, storage_change_count: 0, cookie_change_count: 0 },
            export_status: 'not_exported',
            tags: [],
            created_at: '1970-01-01T00:00:00.000Z',
            updated_at: '1970-01-01T00:00:10.000Z'
        };

        const nav_event: CaptureEvent = {
            event_id: 'nav-1',
            capture_id: 'cap-2',
            category: 'navigation',
            type: 'page_load',
            relative_time_ms: 10,
            absolute_time: '1970-01-01T00:00:00.010Z',
            tab_id: 2,
            frame_id: 0,
            url: 'https://test.com',
            top_frame_url: null,
            page_title: 'Test',
            source: 'content_script',
            severity: 'info',
            related_event_ids: [],
            redaction_status: 'none',
            raw_available: true,
            created_at: '1970-01-01T00:00:00.010Z',
            data: { load_time_ms: 50 }
        };

        const console_log: ConsoleEventData = {
            level: 'log',
            args_preview: ['hello'],
            args_status: 'captured',
            stack_trace: null,
            source_url: 'https://test.com/app.js',
            line: 10,
            column: 5,
            repeat_count: null,
            related_network_request_id: null,
            relative_time: 20,
            absolute_time: 20
        } as ConsoleEventData & { relative_time: number; absolute_time: number };

        const storage_change: StorageChangeData = {
            storage_type: 'localStorage',
            action: 'set',
            key: 'theme',
            origin: 'https://test.com',
            new_value: 'dark',
            old_value: null,
            value_status: 'captured',
            relative_time: 30,
            absolute_time: 30
        } as StorageChangeData & { relative_time: number; absolute_time: number };

        const cookie_change: CookieChangeData = {
            name: 'session',
            domain: '.test.com',
            path: '/',
            cause: 'set',
            value: 'abc',
            value_status: 'captured',
            removed: false,
            relative_time: 40,
            absolute_time: 40
        } as CookieChangeData & { relative_time: number; absolute_time: number };

        vi.mocked(get_capture).mockResolvedValue(mock_capture);
        vi.mocked(get_events_by_category)
            .mockResolvedValueOnce([]) // user_action
            .mockResolvedValueOnce([nav_event]); // navigation
        vi.mocked(get_network_requests).mockResolvedValue([]);
        vi.mocked(get_console_events).mockResolvedValue([console_log]);
        vi.mocked(get_error_events).mockResolvedValue([]);
        vi.mocked(get_storage_changes).mockResolvedValue([storage_change]);
        vi.mocked(get_cookie_changes).mockResolvedValue([cookie_change]);

        const result = await load_agent_capture_data('cap-2');

        expect(result.capture).toBe(mock_capture);
        expect(result.sources.user_action_events).toEqual([]);
        expect(result.sources.navigation_events).toEqual([nav_event]);
        expect(result.sources.console_events).toEqual([console_log]);
        expect(result.sources.storage_changes).toEqual([storage_change]);
        expect(result.sources.cookie_changes).toEqual([cookie_change]);
    });

    // ── t151 AC-005: fetch_all 跨页聚合（满页 5000 后按 offset 续取） ──
    test('fetch_all 跨页聚合：满页后按 offset 续取，不丢不重', async () => {
        const cap_multi: CaptureRecord = {
            capture_id: 'cap_multi',
            name: 'Multi',
            status: 'completed',
            started_at: '1970-01-01T00:00:00.000Z',
            ended_at: '1970-01-01T00:01:00.000Z',
            duration_ms: 60000,
            start_url: 'https://x',
            end_url: null,
            tab_id: 1,
            window_id: null,
            config_snapshot: {},
            stats: { event_count: 0, request_count: 0, log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0 },
            export_status: 'not_exported',
            tags: [],
            created_at: '1970-01-01T00:00:00.000Z',
            updated_at: '1970-01-01T00:01:00.000Z'
        };

        const big_page = Array.from({ length: 5000 }, (_, i) => ({
            event_id: `evt_${i}`,
            capture_id: 'cap_multi',
            category: 'user_action',
            type: 'click',
            relative_time_ms: i,
            tab_id: 1,
            url: 'https://x',
            source: 'test',
            severity: 'info',
            created_at: i,
            data: {},
        }));
        const last = {
            event_id: 'evt_last',
            capture_id: 'cap_multi',
            category: 'user_action',
            type: 'click',
            relative_time_ms: 5000,
            tab_id: 1,
            url: 'https://x',
            source: 'test',
            severity: 'info',
            created_at: 5000,
            data: {},
        };

        vi.mocked(get_capture).mockResolvedValue(cap_multi);
        vi.mocked(get_events_by_category).mockImplementation(async (_capture_id, category, offset) => {
            if (category === 'user_action') return offset === 0 ? big_page : [last];
            return [];
        });
        vi.mocked(get_network_requests).mockResolvedValue([]);
        vi.mocked(get_console_events).mockResolvedValue([]);
        vi.mocked(get_error_events).mockResolvedValue([]);
        vi.mocked(get_storage_changes).mockResolvedValue([]);
        vi.mocked(get_cookie_changes).mockResolvedValue([]);

        const result = await load_agent_capture_data('cap_multi');
        expect(result.sources.user_action_events).toHaveLength(5001);
        expect(get_events_by_category).toHaveBeenCalledWith('cap_multi', 'user_action', 0, 5000);
        expect(get_events_by_category).toHaveBeenCalledWith('cap_multi', 'user_action', 5000, 5000);
    });
});
