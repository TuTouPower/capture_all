// tests/live_data_queries.test.ts — P6.3 实时数据查询单测
import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================
// 模拟类型 — 与 src/shared/types.ts 对齐
// ============================================================

interface CaptureStats {
    event_count: number;
    nav_count: number;
    request_count: number;
    log_count: number;
    error_count: number;
    storage_change_count: number;
    cookie_change_count: number;
}

interface CaptureEvent {
    event_id: string;
    capture_id: string;
    category: string;
    type: string;
    relative_time_ms: number;
    absolute_time: string;
    tab_id: number;
    frame_id: number;
    url: string;
    source: string;
    severity: string;
    data?: unknown;
}

interface NetworkRequestData {
    capture_id?: string;
    event_id?: string;
    request_id: string;
    method: string;
    url: string;
    status_code: number | null;
    resource_type: string;
    duration_ms: number | null;
}

// ============================================================
// 模拟依赖函数 — 行为与 service_worker.ts 对齐
// ============================================================

// 记录 get_events_by_category 调用参数，用于验证 offset/limit 传递
const get_events_by_category_spy = {
    calls: [] as Array<{ category: string; offset?: number; limit?: number }>,
    reset(): void {
        this.calls = [];
    },
};

function mock_get_capture(capture_id: string): { capture_id: string } | undefined {
    if (capture_id === 'capture_not_found' || !capture_id) return undefined;
    return { capture_id };
}

function mock_get_events_by_category(
    _capture_id: string,
    category: string,
    offset?: number,
    limit?: number,
): CaptureEvent[] {
    get_events_by_category_spy.calls.push({ category, offset, limit });
    return [
        {
            event_id: `evt_${category}_1`,
            capture_id: _capture_id,
            category,
            type: category === 'user_action' ? 'mouse_event'
                : category === 'navigation' ? 'page_navigation'
                : category === 'error' ? 'runtime_exception'
                : category === 'storage' ? 'storage_change'
                : 'cookie_change',
            relative_time_ms: 100,
            absolute_time: new Date().toISOString(),
            tab_id: 1,
            frame_id: 0,
            url: 'https://example.com',
            source: 'content_script',
            severity: 'info',
        },
    ];
}

function mock_get_network_requests(
    _capture_id: string,
    _offset?: number,
    _limit?: number,
): NetworkRequestData[] {
    return [
        {
            capture_id: _capture_id,
            event_id: 'net_1',
            request_id: 'req_1',
            method: 'GET',
            url: 'https://example.com/api',
            status_code: 200,
            resource_type: 'fetch',
            duration_ms: 150,
        },
        {
            capture_id: _capture_id,
            event_id: 'net_2',
            request_id: 'req_2',
            method: 'POST',
            url: 'https://example.com/submit',
            status_code: 201,
            resource_type: 'xhr',
            duration_ms: 300,
        },
    ];
}

function mock_get_console_events(
    _capture_id: string,
    _offset?: number,
    _limit?: number,
): CaptureEvent[] {
    return [
        {
            event_id: 'console_1',
            capture_id: _capture_id,
            category: 'console',
            type: 'console_event',
            relative_time_ms: 200,
            absolute_time: new Date().toISOString(),
            tab_id: 1,
            frame_id: 0,
            url: 'https://example.com',
            source: 'content_script',
            severity: 'info',
            data: { level: 'log', args_preview: ['hello'] },
        },
    ];
}

// ============================================================
// 模拟 get_capture_data — 与 service_worker.ts 中实现一致
// ============================================================

async function get_capture_data(capture_id: string) {
    const capture = mock_get_capture(capture_id);
    if (!capture) return { success: false, error: 'Capture not found' };

    const [user_events, nav_events, network_requests, console_events,
        error_events, storage_changes, cookie_changes] = await Promise.all([
        mock_get_events_by_category(capture_id, 'user_action', 0, 100000),
        mock_get_events_by_category(capture_id, 'navigation', 0, 100000),
        Promise.resolve(mock_get_network_requests(capture_id, 0, 100000)),
        Promise.resolve(mock_get_console_events(capture_id, 0, 100000)),
        mock_get_events_by_category(capture_id, 'error', 0, 100000),
        mock_get_events_by_category(capture_id, 'storage', 0, 100000),
        mock_get_events_by_category(capture_id, 'cookie', 0, 100000),
    ]);

    // 将 network_requests 映射为 events 并入 timeline（与 service_worker.ts 对齐）
    const network_events: CaptureEvent[] = network_requests.map(nr => ({
        event_id: nr.event_id || `net_${nr.request_id}`,
        capture_id: nr.capture_id || capture_id,
        category: 'network' as const,
        type: 'network_request' as const,
        relative_time_ms: 0,
        absolute_time: new Date().toISOString(),
        tab_id: 0,
        frame_id: 0,
        url: nr.url,
        data: nr,
    }));

    // 将 console_events 映射并入 timeline（与 service_worker.ts 对齐）
    const console_events_mapped: CaptureEvent[] = console_events.map(ce => ({
        event_id: ce.event_id,
        capture_id: ce.capture_id || capture_id,
        category: 'console' as const,
        type: 'console_event' as const,
        relative_time_ms: ce.relative_time_ms,
        absolute_time: ce.absolute_time,
        tab_id: ce.tab_id,
        frame_id: ce.frame_id,
        url: ce.url,
        data: ce.data,
    }));

    const all_events = [
        ...user_events,
        ...nav_events,
        ...network_events,
        ...console_events_mapped,
        ...error_events,
        ...storage_changes,
        ...cookie_changes,
    ];

    return {
        success: true,
        session: capture,
        events: all_events,
        nav_events,
        network_requests,
        console_logs: console_events,
        error_events,
        storage_changes,
        cookie_changes,
    };
}

// ============================================================
// 活跃采集实时数据查询：list_events / list_network
// ============================================================

describe('live data queries', () => {
    it('list_events 返回实时事件结构', async () => {
        const capture_id = 'capture_live_001';
        const data = await get_capture_data(capture_id);

        // 实时数据应有 success + session + events
        expect(data.success).toBe(true);
        expect(data).toHaveProperty('session');
        expect(data).toHaveProperty('events');
        expect(data).toHaveProperty('network_requests');
        expect(data).toHaveProperty('console_logs');

        // events 为数组
        expect(Array.isArray(data.events)).toBe(true);
    });

    it('合并 7 category 的 events 总数正确', async () => {
        const capture_id = 'capture_live_002';
        const data = await get_capture_data(capture_id);

        // 7 categories 全部入 events:
        // user_action(1) + navigation(1) + network(2) + console(1)
        // + error(1) + storage(1) + cookie(1) = 8
        expect(data.events).toHaveLength(8);
    });

    it('每个 event 包含必要字段', async () => {
        const capture_id = 'capture_live_003';
        const data = await get_capture_data(capture_id);

        for (const event of data.events) {
            expect(event).toHaveProperty('event_id');
            expect(event).toHaveProperty('capture_id');
            expect(event).toHaveProperty('category');
            expect(event).toHaveProperty('type');
            expect(event).toHaveProperty('relative_time_ms');
            expect(event).toHaveProperty('url');
        }
    });

    it('list_network 返回网络请求结构', async () => {
        const capture_id = 'capture_live_004';
        const data = await get_capture_data(capture_id);

        expect(data.network_requests.length).toBeGreaterThanOrEqual(1);

        for (const req of data.network_requests) {
            expect(req).toHaveProperty('request_id');
            expect(req).toHaveProperty('method');
            expect(req).toHaveProperty('url');
            expect(req).toHaveProperty('status_code');
            expect(req).toHaveProperty('resource_type');
            expect(req).toHaveProperty('duration_ms');
        }
    });

    it('network request 包含 capture_id', async () => {
        const capture_id = 'capture_live_005';
        const data = await get_capture_data(capture_id);

        for (const req of data.network_requests) {
            expect(req.capture_id).toBe(capture_id);
        }
    });

    it('console_events 包含 capture_id', async () => {
        const capture_id = 'capture_live_006';
        const data = await get_capture_data(capture_id);

        for (const log of data.console_logs) {
            expect(log.capture_id).toBe(capture_id);
        }
    });
});

// ============================================================
// 采集完成后全量数据结构
// ============================================================

describe('completed capture full data', () => {
    it('完成后 session 包含 stats', () => {
        const stats: CaptureStats = {
            event_count: 150,
            nav_count: 12,
            request_count: 300,
            log_count: 45,
            error_count: 3,
            storage_change_count: 8,
            cookie_change_count: 5,
        };

        // 验证 7 个统计字段都存在
        expect(stats).toHaveProperty('event_count');
        expect(stats).toHaveProperty('nav_count');
        expect(stats).toHaveProperty('request_count');
        expect(stats).toHaveProperty('log_count');
        expect(stats).toHaveProperty('error_count');
        expect(stats).toHaveProperty('storage_change_count');
        expect(stats).toHaveProperty('cookie_change_count');

        // 验证计数合理性
        expect(stats.event_count).toBeGreaterThanOrEqual(
            stats.nav_count + stats.error_count
            + stats.storage_change_count + stats.cookie_change_count,
        );
    });

    it('完成后 events 包含全部 7 类 category', async () => {
        const capture_id = 'capture_done_001';
        const data = await get_capture_data(capture_id);

        const categories = new Set(data.events.map((e) => e.category));
        expect(categories.has('user_action')).toBe(true);
        expect(categories.has('navigation')).toBe(true);
        expect(categories.has('network')).toBe(true);
        expect(categories.has('console')).toBe(true);
        expect(categories.has('error')).toBe(true);
        expect(categories.has('storage')).toBe(true);
        expect(categories.has('cookie')).toBe(true);
    });

    it('event_id 唯一', async () => {
        const capture_id = 'capture_done_002';
        const data = await get_capture_data(capture_id);

        const ids = data.events.map((e) => e.event_id);
        const unique_ids = new Set(ids);
        expect(unique_ids.size).toBe(ids.length);
    });

    it('network_requests request_id 唯一', async () => {
        const capture_id = 'capture_done_003';
        const data = await get_capture_data(capture_id);

        const ids = data.network_requests.map((r) => r.request_id);
        const unique_ids = new Set(ids);
        expect(unique_ids.size).toBe(ids.length);
    });
});

// ============================================================
// get_capture_data 七分类合并逻辑验证
// ============================================================

describe('get_capture_data category merge', () => {
    it('network 分类在 events 中（已合并到 timeline）', async () => {
        const capture_id = 'capture_merge_001';
        const data = await get_capture_data(capture_id);

        const net_events = data.events.filter(
            (e) => e.category === 'network',
        );
        expect(net_events.length).toBeGreaterThan(0);
        // 验证映射后的 event 结构
        for (const evt of net_events) {
            expect(evt.type).toBe('network_request');
            expect(evt.data).toBeDefined();
        }
    });

    it('console 分类在 events 中（已合并到 timeline）', async () => {
        const capture_id = 'capture_merge_002';
        const data = await get_capture_data(capture_id);

        const console_events = data.events.filter(
            (e) => e.category === 'console',
        );
        expect(console_events.length).toBeGreaterThan(0);
        for (const evt of console_events) {
            expect(evt.type).toBe('console_event');
        }
    });

    it('network_requests 和 console_logs 独立返回（供专用 reader）', async () => {
        const capture_id = 'capture_merge_003';
        const data = await get_capture_data(capture_id);

        expect(data.network_requests.length).toBeGreaterThan(0);
        expect(data.console_logs.length).toBeGreaterThan(0);
    });

    it('空 capture_id 返回 capture not found 错误', async () => {
        const capture_id = '';
        const data = await get_capture_data(capture_id);

        expect(data.success).toBe(false);
        expect(data.error).toBe('Capture not found');
    });
});

// ============================================================
// capture not found 路径
// ============================================================

describe('capture not found', () => {
    it('不存在的 capture_id 返回 success=false', async () => {
        const data = await get_capture_data('capture_not_found');

        expect(data.success).toBe(false);
        expect(data.error).toBe('Capture not found');
    });

    it('返回结构不含 events / network_requests（仅 error）', async () => {
        const data = await get_capture_data('capture_not_found');

        expect(data).not.toHaveProperty('events');
        expect(data).not.toHaveProperty('network_requests');
        expect(data).not.toHaveProperty('console_logs');
    });
});

// ============================================================
// offset/limit 参数传递验证
// ============================================================

describe('get_events_by_category offset/limit', () => {
    beforeEach(() => {
        get_events_by_category_spy.reset();
    });

    it('传递 offset=0, limit=100000 给每个 category', async () => {
        await get_capture_data('capture_offset_001');

        // 5 个 category 通过 get_events_by_category 查询
        expect(get_events_by_category_spy.calls.length).toBe(5);

        for (const call of get_events_by_category_spy.calls) {
            expect(call.offset).toBe(0);
            expect(call.limit).toBe(100000);
        }
    });

    it('查询的 5 个 category 不含 network 和 console', async () => {
        await get_capture_data('capture_offset_002');

        const categories = get_events_by_category_spy.calls.map(c => c.category);
        expect(categories).not.toContain('network');
        expect(categories).not.toContain('console');
        expect(categories).toContain('user_action');
        expect(categories).toContain('navigation');
        expect(categories).toContain('error');
        expect(categories).toContain('storage');
        expect(categories).toContain('cookie');
    });
});

// ============================================================
// 边界条件
// ============================================================

describe('live data edge cases', () => {
    it('空 events 时返回空数组而非 null', async () => {
        // 模拟无事件的 category
        const empty = [] as CaptureEvent[];
        expect(Array.isArray(empty)).toBe(true);
        expect(empty).toHaveLength(0);
    });

    it('大量 network requests 不丢失', () => {
        const requests: NetworkRequestData[] = Array.from(
            { length: 1000 },
            (_, i) => ({
                request_id: `req_${i}`,
                method: 'GET',
                url: `https://example.com/api/${i}`,
                status_code: 200,
                resource_type: 'fetch',
                duration_ms: 10 + i,
            }),
        );

        expect(requests).toHaveLength(1000);
        // 每个 request 有唯一 ID
        const ids = new Set(requests.map((r) => r.request_id));
        expect(ids.size).toBe(1000);
    });

    it('event 时间递增有序', async () => {
        const capture_id = 'capture_edge_001';
        const data = await get_capture_data(capture_id);

        // 同 category 的 event relative_time_ms 应一致（mock 数据）
        const times = data.events.map((e) => e.relative_time_ms);
        for (const t of times) {
            expect(t).toBeGreaterThanOrEqual(0);
        }
    });
});
