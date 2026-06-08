import { describe, expect, test } from 'vitest';
import { add_system_times_to_capture_data, format_system_time } from '../src/shared/system_time';
import type { CaptureEvent, CaptureRecord, ConsoleEventData, NetworkRequestData } from '../src/shared/types';

const config = { system_time_timezone: 'Asia/Shanghai' as const };

const capture: CaptureRecord = {
    capture_id: 'capture_1',
    name: 'capture_1',
    status: 'completed',
    mode: 'standard',
    started_at: '2024-01-01T00:00:00.000Z',
    ended_at: '2024-01-01T00:01:00.000Z',
    duration_ms: 60000,
    start_url: 'https://example.com',
    end_url: 'https://example.com',
    tab_id: 1,
    window_id: null,
    config_snapshot: {},
    stats: { event_count: 1, request_count: 1, log_count: 1, error_count: 0, storage_change_count: 0, cookie_change_count: 0 },
    export_status: 'not_exported',
    tags: [],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:01:00.000Z'
};

const event: CaptureEvent = {
    event_id: 'event_1',
    capture_id: 'capture_1',
    category: 'navigation',
    type: 'page_load',
    relative_time_ms: 10,
    absolute_time: '2024-01-01T00:00:01.000Z',
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
    created_at: '2024-01-01T00:00:01.000Z',
    data: { load_time_ms: 100, dom_content_loaded_ms: 80 }
};

const request: NetworkRequestData = {
    request_id: 'request_1',
    capture_id: 'capture_1',
    tab_id: 1,
    relative_time: 20,
    absolute_time: 1704067202000,
    method: 'GET',
    url: 'https://example.com/api',
    url_status: 'captured',
    status_code: 200,
    request_headers: {},
    request_headers_status: 'full',
    response_headers: {},
    response_headers_status: 'full',
    request_body: null,
    request_body_status: 'not_enabled',
    response_body: null,
    response_body_status: 'not_enabled',
    duration_ms: 30,
    resource_type: 'fetch',
    start_time_ms: 1704067202000,
    end_time_ms: 1704067202030,
    created_at: '2024-01-01T00:00:02.000Z'
};

const log = {
    tab_id: 1,
    relative_time: 30,
    absolute_time: 1704067203000,
    level: 'info',
    args_preview: ['ready'],
    args_status: 'captured',
    stack_trace: null,
    source_url: 'https://example.com',
    line: 1,
    column: 1,
    repeat_count: null,
    related_network_request_id: null
} satisfies ConsoleEventData & { tab_id: number; relative_time: number; absolute_time: number };

describe('system time formatting', () => {
    test('formats timestamps in configured Asia/Shanghai timezone', () => {
        expect(format_system_time(1704067200000, config)).toBe('2024-01-01 08:00:00');
    });

    test('adds system time fields to all exported record groups', () => {
        const data = add_system_times_to_capture_data({
            capture,
            events: [event],
            network_requests: [request],
            console_events: [log]
        }, config);

        expect(data.capture.start_time_system_time).toBe('2024-01-01 08:00:00');
        expect(data.capture.end_time_system_time).toBe('2024-01-01 08:01:00');
        expect(data.events[0].absolute_time_system_time).toBe('2024-01-01 08:00:01');
        expect(data.network_requests[0].absolute_time_system_time).toBe('2024-01-01 08:00:02');
        expect(data.console_events[0].absolute_time_system_time).toBe('2024-01-01 08:00:03');
    });
});
