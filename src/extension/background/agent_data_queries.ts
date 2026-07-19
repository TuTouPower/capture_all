import { build_record_id, parse_record_id, type AgentDataSourceSummary, type AgentRecordDetail, type AgentRecordPreview, type AgentQueryRange } from '../../shared/protocol';
import type { CaptureEvent, CaptureRecord, ConsoleEventData, CookieChangeData, NetworkRequestData, RuntimeExceptionData, StorageChangeData } from '../../shared/types';
import {
    get_console_events,
    get_cookie_changes,
    get_error_events,
    get_events_by_category,
    get_network_requests,
    get_storage_changes,
    get_capture
} from './storage';

export type AgentDataSource =
    | 'user_action_events'
    | 'navigation_events'
    | 'network_requests'
    | 'console_events'
    | 'error_events'
    | 'storage_changes'
    | 'cookie_changes';

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

const ALL_SOURCES: AgentDataSource[] = [
    'user_action_events',
    'navigation_events',
    'network_requests',
    'console_events',
    'error_events',
    'storage_changes',
    'cookie_changes'
];

// T043: 分页聚合，替代固定 FULL_DATA_LIMIT=100000 截断
const PAGE_SIZE = 5000;

async function fetch_all<T>(
    fetcher: (offset: number, limit: number) => Promise<T[]>
): Promise<T[]> {
    const all: T[] = [];
    let offset = 0;
    while (true) {
        const batch = await fetcher(offset, PAGE_SIZE);
        if (batch.length === 0) break;
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        offset += batch.length;
    }
    return all;
}

export async function load_agent_capture_data(capture_id: string): Promise<AgentCaptureData> {
    const capture = await get_capture(capture_id);
    if (!capture) {
        throw new Error('SESSION_NOT_FOUND');
    }

    const [user_action_events, navigation_events, network_requests, console_events, error_events, storage_changes, cookie_changes] = await Promise.all([
        fetch_all((o, l) => get_events_by_category(capture_id, 'user_action', o, l)),
        fetch_all((o, l) => get_events_by_category(capture_id, 'navigation', o, l)),
        fetch_all((o, l) => get_network_requests(capture_id, o, l)),
        fetch_all((o, l) => get_console_events(capture_id, o, l)),
        fetch_all((o, l) => get_error_events(capture_id, o, l)),
        fetch_all((o, l) => get_storage_changes(capture_id, o, l)),
        fetch_all((o, l) => get_cookie_changes(capture_id, o, l))
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
            cookie_changes
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
    if ('relative_time_ms' in record) return record.relative_time_ms;
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
    return `${get_record_sort_key(record)}:${get_record_absolute_time(record) ?? ''}`;
}

function get_record_type(source: AgentDataSource, record: AgentRecord): string {
    switch (source) {
        case 'user_action_events':
        case 'navigation_events':
            return (record as CaptureEvent).type;
        case 'network_requests':
            return (record as NetworkRequestData).resource_type;
        case 'console_events':
            return (record as ConsoleEventData).level;
        case 'error_events':
            return (record as RuntimeExceptionData).error_name ?? 'error';
        case 'storage_changes':
            return (record as StorageChangeData).action;
        case 'cookie_changes':
            return (record as CookieChangeData).cause;
    }
}

function get_record_summary(source: AgentDataSource, record: AgentRecord): string {
    switch (source) {
        case 'user_action_events':
        case 'navigation_events': {
            const event = record as CaptureEvent;
            return `${event.type} ${event.url}`;
        }
        case 'network_requests': {
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
            const storage_change = record as StorageChangeData;
            return `${storage_change.storage_type}.${storage_change.action} ${storage_change.key ?? '*'}`;
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
        case 'navigation_events': {
            const event = record as CaptureEvent;
            return { url: event.url, tab_id: event.tab_id, frame_id: event.frame_id };
        }
        case 'network_requests': {
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
            const storage_change = record as StorageChangeData;
            return { key: storage_change.key, origin: storage_change.origin, value_status: storage_change.value_status };
        }
        case 'cookie_changes': {
            const cookie_change = record as CookieChangeData;
            return { name: cookie_change.name, domain: cookie_change.domain, removed: cookie_change.removed };
        }
    }
}
