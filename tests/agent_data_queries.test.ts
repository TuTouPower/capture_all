import { describe, expect, test } from 'vitest';
import {
    get_record_from_session_data,
    get_timeline_from_session_data,
    list_data_sources_from_session_data,
    list_records_from_session_data,
    to_agent_session_data
} from '../src/background/agent_data_queries';
import type { ConsoleLog, ErrorLog, NetworkRequest, RecordEvent, Session } from '../src/shared/types';

const session: Session = {
    id: 'session_1',
    start_time: 1000,
    end_time: 5000,
    config: {
        capture_mode: 'basic',
        mouse_precision: 'clicks',
        capture_console: false,
        capture_network: true,
        keyboard_capture_mode: 'none',
        capture_input_values: false,
        capture_request_body: false,
        capture_response_body: false,
        redact_sensitive_headers: true,
        redact_url_query: true,
        redact_data: true,
        sample_rate_ms: 50
    },
    stats: { event_count: 2, request_count: 1, log_count: 1, dom_changes: 0 }
};

const events: RecordEvent[] = [
    {
        session_id: 'session_1',
        relative_time: 30,
        absolute_time: 1030,
        type: 'page_load',
        data: { load_time_ms: 20, dom_content_loaded_ms: 10 },
        tab_id: 1,
        frame_id: 0,
        url: 'https://example.com'
    },
    {
        session_id: 'session_1',
        relative_time: 10,
        absolute_time: 1010,
        type: 'mouse',
        data: {
            action: 'click',
            x: 1,
            y: 2,
            button: 0,
            target_selector: '#login',
            target_xpath: '//*[@id="login"]',
            target_tag: 'BUTTON',
            target_text: 'Login'
        },
        tab_id: 1,
        frame_id: 0,
        url: 'https://example.com/login'
    }
];

const network_requests: NetworkRequest[] = [{
    session_id: 'session_1',
    relative_time: 20,
    absolute_time: 1020,
    tab_id: 1,
    method: 'POST',
    url: 'https://example.com/api/login',
    status_code: 401,
    request_headers: { 'content-type': 'application/json' },
    response_headers: {},
    request_body: '{"user":"a"}',
    request_body_status: 'captured',
    response_body: null,
    response_body_status: 'not_enabled',
    duration_ms: 50,
    resource_type: 'fetch'
}];

const console_logs: ConsoleLog[] = [{
    session_id: 'session_1',
    relative_time: 40,
    absolute_time: 1040,
    tab_id: 1,
    level: 'error',
    args: ['failed'],
    stack_trace: null,
    url: 'https://example.com',
    line: 1,
    column: 2
}];

const error_logs: ErrorLog[] = [{
    session_id: 'session_1',
    relative_time: 50,
    absolute_time: 1050,
    message: 'worker failed',
    stack_trace: 'stack',
    source: 'service_worker'
}];

const data = to_agent_session_data(session, events, network_requests, console_logs, error_logs);

describe('agent data queries', () => {
    test('summarizes available data sources', () => {
        expect(list_data_sources_from_session_data(data)).toEqual([
            {
                source: 'record_events',
                count: 2,
                time_range: { start: 10, end: 30 },
                types: ['mouse', 'page_load']
            },
            {
                source: 'network_requests',
                count: 1,
                time_range: { start: 20, end: 20 },
                types: ['POST']
            },
            {
                source: 'console_logs',
                count: 1,
                time_range: { start: 40, end: 40 },
                types: ['error']
            },
            {
                source: 'error_logs',
                count: 1,
                time_range: { start: 50, end: 50 },
                types: ['service_worker']
            }
        ]);
    });

    test('lists records with pagination and stable ids', () => {
        expect(list_records_from_session_data(data, {
            source: 'record_events',
            offset: 1,
            limit: 1,
            order: 'asc'
        })).toEqual({
            total: 2,
            records: [{
                record_id: 'record_events:30:1030',
                source: 'record_events',
                index: 2,
                time: 30,
                absolute_time: 1030,
                type: 'page_load',
                summary: 'page_load https://example.com',
                preview: { url: 'https://example.com', tab_id: 1, frame_id: 0 }
            }]
        });
    });

    test('filters records by time and desc order', () => {
        expect(list_records_from_session_data(data, {
            source: 'record_events',
            start_time: 10,
            end_time: 30,
            order: 'desc'
        }).records.map(record => record.record_id)).toEqual(['record_events:30:1030', 'record_events:10:1010']);
    });

    test('returns complete record details', () => {
        expect(get_record_from_session_data(data, 'network_requests', 'network_requests:20:1020')).toEqual({
            record_id: 'network_requests:20:1020',
            source: 'network_requests',
            data: network_requests[0]
        });
    });

    test('merges timeline records across sources', () => {
        expect(get_timeline_from_session_data(data, { limit: 3 }).records.map(record => record.record_id)).toEqual([
            'record_events:10:1010',
            'network_requests:20:1020',
            'record_events:30:1030'
        ]);
    });
});
