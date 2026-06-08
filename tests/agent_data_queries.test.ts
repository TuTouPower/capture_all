import { describe, expect, test } from 'vitest';
import {
    get_record_from_session_data,
    get_timeline_from_session_data,
    list_data_sources_from_session_data,
    list_records_from_session_data,
    type AgentSessionData
} from '../src/background/agent_data_queries';
import type { CaptureEvent, CaptureRecord, ConsoleEventData, NetworkRequestData, RuntimeExceptionData } from '../src/shared/types';

const capture: CaptureRecord = {
    capture_id: 'capture_1',
    name: 'capture_1',
    status: 'completed',
    mode: 'standard',
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
        cookie_changes: []
    }
};

describe('agent data queries', () => {
    test('summarizes available data sources', () => {
        expect(list_data_sources_from_session_data(data)).toEqual([
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
        expect(list_records_from_session_data(data, {
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
        expect(get_timeline_from_session_data(data, {
            sources: ['user_action_events', 'navigation_events'],
            start_time: 10,
            end_time: 30,
            order: 'desc'
        }).records.map(record => record.record_id)).toEqual(['navigation_events:page_load_1', 'user_action_events:mouse_1']);
    });

    test('returns complete record details', () => {
        expect(get_record_from_session_data(data, 'network_requests', 'network_requests:request_1')).toEqual({
            record_id: 'network_requests:request_1',
            source: 'network_requests',
            data: network_requests[0]
        });
    });

    test('merges timeline records across sources', () => {
        expect(get_timeline_from_session_data(data, { limit: 3 }).records.map(record => record.record_id)).toEqual([
            'user_action_events:mouse_1',
            'network_requests:request_1',
            'navigation_events:page_load_1'
        ]);
    });
});
