import { build_record_id, parse_record_id, type AgentDataSourceSummary, type AgentRecordDetail, type AgentRecordPreview, type AgentQueryRange } from '../agent/shared/protocol';
import type { ConsoleLog, ErrorLog, NetworkRequest, RecordEvent, Session } from '../shared/types';
import { get_console_logs, get_error_logs, get_events, get_network_requests, get_session } from './storage';

export type AgentDataSource = 'record_events' | 'network_requests' | 'console_logs' | 'error_logs';

type AgentRecord = RecordEvent | NetworkRequest | ConsoleLog | ErrorLog;

export interface AgentSessionData {
    session: Session;
    sources: {
        record_events: RecordEvent[];
        network_requests: NetworkRequest[];
        console_logs: ConsoleLog[];
        error_logs: ErrorLog[];
    };
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

const ALL_SOURCES: AgentDataSource[] = ['record_events', 'network_requests', 'console_logs', 'error_logs'];
const FULL_DATA_LIMIT = 100000;

export async function load_agent_session_data(session_id: string): Promise<AgentSessionData> {
    const session = await get_session(session_id);
    if (!session) {
        throw new Error('SESSION_NOT_FOUND');
    }

    const [events, network_requests, console_logs, error_logs] = await Promise.all([
        get_events(session_id, 0, FULL_DATA_LIMIT),
        get_network_requests(session_id, 0, FULL_DATA_LIMIT),
        get_console_logs(session_id, 0, FULL_DATA_LIMIT),
        get_error_logs(session_id, 0, FULL_DATA_LIMIT)
    ]);

    return to_agent_session_data(session, events, network_requests, console_logs, error_logs);
}

export function to_agent_session_data(
    session: Session,
    record_events: RecordEvent[],
    network_requests: NetworkRequest[],
    console_logs: ConsoleLog[],
    error_logs: ErrorLog[]
): AgentSessionData {
    return {
        session,
        sources: {
            record_events,
            network_requests,
            console_logs,
            error_logs
        }
    };
}

export function list_data_sources_from_session_data(data: AgentSessionData): AgentDataSourceSummary[] {
    return ALL_SOURCES
        .map(source => summarize_source(source, data.sources[source]))
        .filter(summary => summary.count > 0);
}

export function list_records_from_session_data(data: AgentSessionData, query: ListRecordsQuery): AgentRecordListResult {
    const records = get_source_records(data, query.source);
    const filtered = filter_and_sort_records(records, query);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? filtered.length;

    return {
        total: filtered.length,
        records: filtered.slice(offset, offset + limit).map((record, index) => to_record_preview(query.source, record, offset + index + 1))
    };
}

export function get_record_from_session_data(
    data: AgentSessionData,
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

export function get_timeline_from_session_data(data: AgentSessionData, query: TimelineQuery = {}): AgentRecordListResult {
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

export function get_timeline_item_from_session_data(data: AgentSessionData, item_id: string): AgentRecordDetail<AgentRecord> {
    const parsed = parse_record_id(item_id);
    return get_record_from_session_data(data, parsed.source as AgentDataSource, item_id);
}

function summarize_source(source: AgentDataSource, records: AgentRecord[]): AgentDataSourceSummary {
    const sorted = [...records].sort((a, b) => a.relative_time - b.relative_time);
    const types = Array.from(new Set(sorted.map(record => get_record_type(source, record)))).sort();

    return {
        source,
        count: sorted.length,
        time_range: {
            start: sorted[0]?.relative_time ?? null,
            end: sorted[sorted.length - 1]?.relative_time ?? null
        },
        types
    };
}

function get_source_records(data: AgentSessionData, source: AgentDataSource): AgentRecord[] {
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
    if (query.start_time !== undefined && record.relative_time < query.start_time) {
        return false;
    }
    if (query.end_time !== undefined && record.relative_time > query.end_time) {
        return false;
    }
    return true;
}

function sort_records(a: AgentRecord, b: AgentRecord, order: AgentQueryRange['order']): number {
    const direction = order === 'desc' ? -1 : 1;
    return (a.relative_time - b.relative_time) * direction;
}

function to_record_preview(source: AgentDataSource, record: AgentRecord, index: number): AgentRecordPreview {
    return {
        record_id: build_record_id(source, get_native_record_id(record)),
        source,
        index,
        time: record.relative_time,
        absolute_time: record.absolute_time,
        type: get_record_type(source, record),
        summary: get_record_summary(source, record),
        preview: get_record_preview(source, record)
    };
}

function get_native_record_id(record: AgentRecord): string {
    return `${record.relative_time}:${record.absolute_time}`;
}

function get_record_type(source: AgentDataSource, record: AgentRecord): string {
    switch (source) {
        case 'record_events':
            return (record as RecordEvent).type;
        case 'network_requests':
            return (record as NetworkRequest).method;
        case 'console_logs':
            return (record as ConsoleLog).level;
        case 'error_logs':
            return (record as ErrorLog).source;
    }
}

function get_record_summary(source: AgentDataSource, record: AgentRecord): string {
    switch (source) {
        case 'record_events': {
            const event = record as RecordEvent;
            return `${event.type} ${event.url}`;
        }
        case 'network_requests': {
            const request = record as NetworkRequest;
            return `${request.method} ${request.url} → ${request.status_code}`;
        }
        case 'console_logs': {
            const log = record as ConsoleLog;
            return `${log.level} ${log.args.join(' ')}`;
        }
        case 'error_logs': {
            const error = record as ErrorLog;
            return `${error.source} ${error.message}`;
        }
    }
}

function get_record_preview(source: AgentDataSource, record: AgentRecord): Record<string, unknown> {
    switch (source) {
        case 'record_events': {
            const event = record as RecordEvent;
            return { url: event.url, tab_id: event.tab_id, frame_id: event.frame_id };
        }
        case 'network_requests': {
            const request = record as NetworkRequest;
            return { url: request.url, status: request.status_code, duration: request.duration_ms };
        }
        case 'console_logs': {
            const log = record as ConsoleLog;
            return { url: log.url, line: log.line, args: log.args };
        }
        case 'error_logs': {
            const error = record as ErrorLog;
            return { message: error.message, source: error.source };
        }
    }
}
