import { build_record_id, parse_record_id, type AgentDataSourceSummary, type AgentRecordDetail, type AgentRecordPreview, type AgentQueryRange } from '../../shared/protocol';
import { AGENT_DATA_SOURCES } from '../../shared/constants';
import { stable_fingerprint } from '../../shared/id';
import type { CaptureEvent, CaptureRecord, ConsoleEventData, CookieChangeData, NetworkRequestData, RuntimeExceptionData, StorageChangeData } from '../../shared/types';
import {
    get_console_events,
    get_cookie_changes,
    get_error_events,
    get_events_by_category,
    get_network_requests,
    get_storage_changes,
    get_capture,
    query_by_store_keyset,
    count_by_store_keyset,
    first_last_keys_by_store,
    get_store_record_by_id,
    STORE_NAMES,
    type KeysetToken,
} from './storage';
import { fetch_all_records } from '../shared/paged_reader';
import type { KeysetPage } from './storage';

// t179: 数据源枚举唯一来源 = shared/constants.AGENT_DATA_SOURCES（MCP Zod 同步派生，防漂移）
export type AgentDataSource = typeof AGENT_DATA_SOURCES[number];

type AgentRecord = CaptureEvent | NetworkRequestData | ConsoleEventData | RuntimeExceptionData | StorageChangeData | CookieChangeData;

export interface AgentCaptureData {
    capture: CaptureRecord;
    sources: Record<AgentDataSource, AgentRecord[]>;
}

interface ListRecordsQuery extends AgentQueryRange {
    source: AgentDataSource;
}

interface TimelineQuery extends AgentQueryRange {
    sources?: AgentDataSource[];
}

interface AgentRecordListResult {
    total: number;
    records: AgentRecordPreview[];
}

const ALL_SOURCES: AgentDataSource[] = [...AGENT_DATA_SOURCES];

export async function load_agent_capture_data(capture_id: string): Promise<AgentCaptureData> {
    const capture = await get_capture(capture_id);
    if (!capture) {
        throw new Error('CAPTURE_NOT_FOUND');
    }

    // t156: 分页聚合统一走 shared/paged_reader 的 fetch_all_records
    const [user_action_events, navigation_events, network_requests, console_events, error_events, storage_changes, cookie_changes, capture_lifecycle_events] = await Promise.all([
        fetch_all_records((o, l) => get_events_by_category(capture_id, 'user_action', o, l)),
        fetch_all_records((o, l) => get_events_by_category(capture_id, 'navigation', o, l)),
        fetch_all_records((o, l) => get_network_requests(capture_id, o, l)),
        fetch_all_records((o, l) => get_console_events(capture_id, o, l)),
        fetch_all_records((o, l) => get_error_events(capture_id, o, l)),
        fetch_all_records((o, l) => get_storage_changes(capture_id, o, l)),
        fetch_all_records((o, l) => get_cookie_changes(capture_id, o, l)),
        // t180: lifecycle 视为完整采集证据，Agent 数据源包含 capture_lifecycle_events
        fetch_all_records((o, l) => get_events_by_category(capture_id, 'capture_lifecycle', o, l))
    ]);

    return {
        capture,
        sources: {
            user_action_events,
            navigation_events,
            network_requests,
            console_events,
            error_events,
            storage_changes,
            cookie_changes,
            capture_lifecycle_events
        }
    };
}

export function list_data_sources_from_capture_data(data: AgentCaptureData): AgentDataSourceSummary[] {
    return ALL_SOURCES
        .map(source => summarize_source(source, data.sources[source]))
        .filter(summary => summary.count > 0);
}

export function list_entries_from_capture_data(data: AgentCaptureData, query: ListRecordsQuery): AgentRecordListResult {
    const records = get_source_records(data, query.source);
    const filtered = filter_and_sort_records(records, query);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? filtered.length;

    return {
        total: filtered.length,
        records: filtered.slice(offset, offset + limit).map((record, index) => to_record_preview(query.source, record, offset + index + 1))
    };
}

export function get_entry_from_capture_data(
    data: AgentCaptureData,
    source: AgentDataSource,
    record_id: string
): AgentRecordDetail<AgentRecord> {
    const parsed = parse_record_id(record_id);
    if (parsed.source !== source) {
        throw new Error('RECORD_NOT_FOUND');
    }

    const record = get_source_records(data, source).find(item => get_native_record_id(item) === parsed.native_id);
    if (!record) {
        throw new Error('RECORD_NOT_FOUND');
    }

    return { record_id, source, data: record };
}

export function get_timeline_from_capture_data(data: AgentCaptureData, query: TimelineQuery = {}): AgentRecordListResult {
    const sources = query.sources ?? ALL_SOURCES;
    const records = sources.flatMap(source => get_source_records(data, source).map(record => ({ source, record })));
    const filtered = records
        .filter(item => is_in_time_range(item.record, query))
        .sort((a, b) => sort_records(a.record, b.record, query.order));
    const offset = query.offset ?? 0;
    const limit = query.limit ?? filtered.length;

    return {
        total: filtered.length,
        records: filtered.slice(offset, offset + limit).map((item, index) => to_record_preview(item.source, item.record, offset + index + 1))
    };
}

export function get_timeline_item_from_capture_data(data: AgentCaptureData, item_id: string): AgentRecordDetail<AgentRecord> {
    const parsed = parse_record_id(item_id);
    return get_entry_from_capture_data(data, parsed.source as AgentDataSource, item_id);
}

function get_record_sort_key(record: AgentRecord): number {
    if ('relative_time_ms' in record && typeof record.relative_time_ms === 'number') return record.relative_time_ms;
    if ('relative_time' in record && typeof record.relative_time === 'number') return record.relative_time;
    if ('start_time_ms' in record && typeof record.start_time_ms === 'number') return record.start_time_ms;
    return 0;
}

function summarize_source(source: AgentDataSource, records: AgentRecord[]): AgentDataSourceSummary {
    const sorted = [...records].sort((a, b) => get_record_sort_key(a) - get_record_sort_key(b));
    const types = Array.from(new Set(sorted.map(record => get_record_type(source, record)))).sort();

    return {
        source,
        count: sorted.length,
        time_range: {
            start: sorted.length > 0 ? get_record_sort_key(sorted[0]) : null,
            end: sorted.length > 0 ? get_record_sort_key(sorted[sorted.length - 1]) : null
        },
        types
    };
}

function get_source_records(data: AgentCaptureData, source: AgentDataSource): AgentRecord[] {
    if (!ALL_SOURCES.includes(source)) {
        throw new Error('SOURCE_NOT_FOUND');
    }

    return data.sources[source];
}

function filter_and_sort_records<T extends AgentRecord>(records: T[], query: AgentQueryRange): T[] {
    return records
        .filter(record => is_in_time_range(record, query))
        .sort((a, b) => sort_records(a, b, query.order));
}

function is_in_time_range(record: AgentRecord, query: AgentQueryRange): boolean {
    const sort_key = get_record_sort_key(record);
    if (query.start_time !== undefined && sort_key < query.start_time) {
        return false;
    }
    if (query.end_time !== undefined && sort_key > query.end_time) {
        return false;
    }
    return true;
}

function sort_records(a: AgentRecord, b: AgentRecord, order: AgentQueryRange['order']): number {
    const direction = order === 'desc' ? -1 : 1;
    return (get_record_sort_key(a) - get_record_sort_key(b)) * direction;
}

function to_record_preview(source: AgentDataSource, record: AgentRecord, index: number): AgentRecordPreview {
    return {
        record_id: build_record_id(source, get_native_record_id(record)),
        source,
        index,
        time: get_record_sort_key(record),
        absolute_time: get_record_absolute_time(record),
        type: get_record_type(source, record),
        summary: get_record_summary(source, record),
        preview: get_record_preview(source, record)
    };
}

function get_record_absolute_time(record: AgentRecord): number | null {
    if ('absolute_time' in record) {
        const value = record.absolute_time;
        if (typeof value === 'number') return value;
        if (typeof value !== 'string') return null;
        const timestamp = new Date(value).getTime();
        return Number.isNaN(timestamp) ? null : timestamp;
    }
    return null;
}

function get_native_record_id(record: AgentRecord): string {
    if ('event_id' in record && record.event_id) return record.event_id;
    if ('request_id' in record && record.request_id) return record.request_id;
    // t152 AC-007: 无 event_id/request_id 时追加记录内容稳定指纹，防 (sort_key, absolute_time) 碰撞
    return `${get_record_sort_key(record)}:${get_record_absolute_time(record) ?? ''}:${stable_fingerprint(record)}`;
}

// t152 AC-003: network_requests store 混存 ws_frame/ws_message（CaptureEvent 形态）与 NetworkRequestData。
// 以是否带 type 字段判别事件形态，查询按 type 路由，避免 ws_frame 记录被误读成请求。
function is_event_record(record: AgentRecord): record is CaptureEvent {
    return 'type' in record;
}

function get_record_type(source: AgentDataSource, record: AgentRecord): string {
    switch (source) {
        case 'user_action_events':
        case 'navigation_events':
        case 'capture_lifecycle_events': // t180: lifecycle 为 CaptureEvent 形态
            return (record as CaptureEvent).type;
        case 'network_requests':
            return is_event_record(record)
                ? (record as CaptureEvent).type
                : (record as NetworkRequestData).resource_type;
        case 'console_events':
            return (record as ConsoleEventData).level;
        case 'error_events':
            return (record as RuntimeExceptionData).error_name ?? 'error';
        case 'storage_changes': {
            // AC-004: storage 事件 payload 在 event.data（CaptureEvent 形状），非顶层
            // f003: AC-004 后 payload 在 event.data；旧采集顶层形记录（无 data 键）fallback 读 record 自身，防旧数据查询崩溃
            const sd = ((record as CaptureEvent).data ?? record) as unknown as StorageChangeData;
            return sd.action;
        }
        case 'cookie_changes':
            return (record as CookieChangeData).cause;
    }
}

function get_record_summary(source: AgentDataSource, record: AgentRecord): string {
    switch (source) {
        case 'user_action_events':
        case 'navigation_events':
        case 'capture_lifecycle_events': { // t180: lifecycle 为 CaptureEvent 形态
            const event = record as CaptureEvent;
            return `${event.type} ${event.url}`;
        }
        case 'network_requests': {
            if (is_event_record(record)) {
                const event = record as CaptureEvent;
                // AC-004/f002: ws_message/ws_frame 事件 url 在 data.ws_url，base 事件 url=''
                const ws_url = (event.data as { ws_url?: string } | null)?.ws_url;
                return `${event.type} ${ws_url ?? event.url}`;
            }
            const request = record as NetworkRequestData;
            return `${request.method} ${request.url} → ${request.status_code ?? 'pending'}`;
        }
        case 'console_events': {
            const log = record as ConsoleEventData;
            return `${log.level} ${log.args_preview.join(' ')}`;
        }
        case 'error_events': {
            const error = record as RuntimeExceptionData;
            return `${error.error_name ?? 'error'} ${error.message}`;
        }
        case 'storage_changes': {
            // AC-004: storage 事件 payload 在 event.data（CaptureEvent 形状），非顶层
            // f003: AC-004 后 payload 在 event.data；旧采集顶层形记录（无 data 键）fallback 读 record 自身，防旧数据查询崩溃
            const sd = ((record as CaptureEvent).data ?? record) as unknown as StorageChangeData;
            return `${sd.storage_type}.${sd.action} ${sd.key ?? '*'}`;
        }
        case 'cookie_changes': {
            const cookie_change = record as CookieChangeData;
            return `${cookie_change.cause} ${cookie_change.domain}${cookie_change.path}`;
        }
    }
}

function get_record_preview(source: AgentDataSource, record: AgentRecord): Record<string, unknown> {
    switch (source) {
        case 'user_action_events':
        case 'navigation_events':
        case 'capture_lifecycle_events': { // t180: lifecycle 为 CaptureEvent 形态
            const event = record as CaptureEvent;
            return { url: event.url, tab_id: event.tab_id, frame_id: event.frame_id };
        }
        case 'network_requests': {
            if (is_event_record(record)) {
                const event = record as CaptureEvent;
                // f002: ws_message/ws_frame 事件 url 在 data.ws_url，base 事件 url=''
                const ws_url = (event.data as { ws_url?: string } | null)?.ws_url;
                return { url: ws_url ?? event.url, tab_id: event.tab_id, frame_id: event.frame_id };
            }
            const request = record as NetworkRequestData;
            return { url: request.url, status: request.status_code, duration: request.duration_ms };
        }
        case 'console_events': {
            const log = record as ConsoleEventData;
            return { source_url: log.source_url, line: log.line, args_preview: log.args_preview };
        }
        case 'error_events': {
            const error = record as RuntimeExceptionData;
            return { message: error.message, error_name: error.error_name };
        }
        case 'storage_changes': {
            // AC-004: storage 事件 payload 在 event.data（CaptureEvent 形状），非顶层
            // f003: AC-004 后 payload 在 event.data；旧采集顶层形记录（无 data 键）fallback 读 record 自身，防旧数据查询崩溃
            const sd = ((record as CaptureEvent).data ?? record) as unknown as StorageChangeData;
            return { key: sd.key, origin: sd.origin, value_status: sd.value_status };
        }
        case 'cookie_changes': {
            const cookie_change = record as CookieChangeData;
            return { name: cookie_change.name, domain: cookie_change.domain, removed: cookie_change.removed };
        }
    }
}

// ============================================================
// t161: 下推查询路径——谓词/order/limit 推入 IndexedDB（keyset 分页，d008），
// 不再先 Promise.all 加载七源全量再内存过滤。对外返回契约与纯函数路径等价（AC-005）。
// ============================================================

const SOURCE_STORE: Record<AgentDataSource, string> = {
    user_action_events: STORE_NAMES.USER_ACTION_EVENTS,
    navigation_events: STORE_NAMES.NAVIGATION_EVENTS,
    network_requests: STORE_NAMES.NETWORK_REQUESTS,
    console_events: STORE_NAMES.CONSOLE_EVENTS,
    error_events: STORE_NAMES.ERROR_EVENTS,
    storage_changes: STORE_NAMES.STORAGE_CHANGES,
    cookie_changes: STORE_NAMES.COOKIE_CHANGES,
    capture_lifecycle_events: STORE_NAMES.CAPTURE_LIFECYCLE_EVENTS, // t180: lifecycle 加入 Agent source
};

export interface AgentRecordListResultWithToken extends AgentRecordListResult {
    next_token?: KeysetToken | null;
}

/** t161 AC-001: 点查——主键 store.get，只访问对应 store 对应记录（不触及其他六源）。 */
export async function get_entry_pushdown(
    capture_id: string,
    source: AgentDataSource,
    record_id: string,
): Promise<AgentRecordDetail<AgentRecord>> {
    const parsed = parse_record_id(record_id);
    if (parsed.source !== source) {
        throw new Error('RECORD_NOT_FOUND');
    }
    const record = await get_store_record_by_id<AgentRecord>(SOURCE_STORE[source], parsed.native_id);
    // 主键为全局 event_id，校验归属 capture 防跨采集误查
    if (!record || !record_belongs_to_capture(record, capture_id)) {
        throw new Error('RECORD_NOT_FOUND');
    }
    return { record_id, source, data: record };
}

/** t161 AC-002/004: 单源 keyset 分页——读取量受 offset+limit 约束，不加载七源全量；
 * 谓词（start/end）与 order 推入索引；返回 next_token 供下一页从 last key 继续。 */
export async function list_entries_pushdown(
    capture_id: string,
    query: ListRecordsQuery,
): Promise<AgentRecordListResultWithToken> {
    const source = query.source;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100000;
    const take = Math.max(1, offset + limit);
    const page = await query_by_store_keyset<AgentRecord>(SOURCE_STORE[source], capture_id, {
        limit: take,
        start_time: query.start_time,
        end_time: query.end_time,
        direction: query.order === 'desc' ? 'prev' : 'next',
        after: query.after,
    });
    // prev cursor 已降序（新→旧），next cursor 已升序——与纯函数 sort 语义一致，无需重排
    const records = page.records.slice(offset, offset + limit);
    const total = await count_by_store_keyset(SOURCE_STORE[source], capture_id, {
        start_time: query.start_time,
        end_time: query.end_time,
    });
    return {
        total,
        records: records.map((record, index) => to_record_preview(source, record, offset + index + 1)),
        next_token: page.next_token,
    };
}

/** t161 AC-003: sources.list 下推——count/range 用索引 count 与 first/last cursor（不读记录体）；
 * types 为契约字段需扫描记录 type（见 spec 风险与回退标注）。 */
export async function list_sources_pushdown(capture_id: string): Promise<AgentDataSourceSummary[]> {
    const summaries = await Promise.all(ALL_SOURCES.map(async (source) => {
        const store = SOURCE_STORE[source];
        const count = await count_by_store_keyset(store, capture_id);
        const { first, last } = await first_last_keys_by_store(store, capture_id);
        const types = count > 0 ? await collect_source_types(source, capture_id) : [];
        return { source, count, time_range: { start: first, end: last }, types };
    }));
    return summaries.filter(s => s.count > 0);
}

/** t161: timeline.list 下推——per-source keyset 各取前 (offset+limit) 条（读取量有界），
 * 内存合并跨源排序后 slice；契约语义与纯函数等价。 */
export async function get_timeline_pushdown(
    capture_id: string,
    query: TimelineQuery = {},
): Promise<AgentRecordListResult> {
    const sources = query.sources ?? ALL_SOURCES;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100000;
    const take = Math.max(1, offset + limit);
    const direction = query.order === 'desc' ? 'prev' : 'next';
    const per_source = await Promise.all(sources.map(async (source) => {
        const page = await query_by_store_keyset<AgentRecord>(SOURCE_STORE[source], capture_id, {
            limit: take,
            start_time: query.start_time,
            end_time: query.end_time,
            direction,
        });
        return page.records.map(record => ({ source, record }));
    }));
    const merged = per_source.flat()
        .sort((a, b) => sort_records(a.record, b.record, query.order))
        .slice(offset, offset + limit);
    const total = (await Promise.all(sources.map(s => count_by_store_keyset(SOURCE_STORE[s], capture_id, {
        start_time: query.start_time,
        end_time: query.end_time,
    })))).reduce((a, b) => a + b, 0);
    return {
        total,
        records: merged.map((item, index) => to_record_preview(item.source, item.record, offset + index + 1)),
    };
}

/** 点查归属校验（CaptureEvent 必有 capture_id；NetworkRequestData 可选） */
function record_belongs_to_capture(record: AgentRecord, capture_id: string): boolean {
    const cid = (record as { capture_id?: string }).capture_id;
    return cid === undefined || cid === capture_id;
}

async function collect_source_types(source: AgentDataSource, capture_id: string): Promise<string[]> {
    const types = new Set<string>();
    let after: KeysetToken | null = null;
    while (true) {
        const page: KeysetPage<AgentRecord> = await query_by_store_keyset<AgentRecord>(SOURCE_STORE[source], capture_id, { limit: 5000, after });
        for (const record of page.records) {
            types.add(get_record_type(source, record));
        }
        if (!page.next_token) break;
        after = page.next_token;
    }
    return Array.from(types).sort();
}
