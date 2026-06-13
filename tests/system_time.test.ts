import { describe, expect, test } from 'vitest';
import {
    add_system_times_to_capture_data,
    format_system_time,
    format_system_time_filename,
    parse_utc_offset
} from '../src/shared/system_time';
import { migrate_iana_timezone } from '../src/shared/user_config';
import type { CaptureEvent, CaptureRecord, ConsoleEventData, NetworkRequestData } from '../src/shared/types';

const config = { system_time_timezone: 'UTC+8' as const };
const config_utc = { system_time_timezone: 'UTC' as const };
const config_browser = { system_time_timezone: 'browser' as const };
const config_utc_plus_1 = { system_time_timezone: 'UTC+1' as const };
const config_utc_minus_5 = { system_time_timezone: 'UTC-5' as const };

const capture: CaptureRecord = {
    capture_id: 'capture_1',
    name: 'capture_1',
    status: 'completed',
    started_at: '2024-01-01T00:00:00.000Z',
    ended_at: '2024-01-01T00:01:00.000Z',
    duration_ms: 60000,
    start_url: 'https://example.com',
    end_url: 'https://example.com',
    tab_id: 1,
    window_id: null,
    config_snapshot: {},
    stats: { event_count: 1, user_action_count: 0, nav_count: 1, request_count: 1, log_count: 1, error_count: 0, storage_change_count: 0, cookie_change_count: 0 },
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
    response_headers: {},
    request_body: null,
    request_body_status: 'not_enabled',
    response_body: null,
    response_body_status: 'not_enabled',
    duration_ms: 30,
    resource_type: 'fetch',
    start_time_ms: 1704067202000,
    end_time_ms: 1704067202030
};

const log: ConsoleEventData & { tab_id: number; relative_time: number; absolute_time: number } = {
    capture_id: 'capture_1',
    tab_id: 1,
    relative_time: 30,
    absolute_time: 1704067203000,
    level: 'info',
    args_preview: ['ready'],
    args_status: 'captured' as const,
    stack_trace: null,
    source_url: 'https://example.com',
    line: 1,
    column: 1,
    repeat_count: null,
    related_network_request_id: null
};

// ============================================================
// parse_utc_offset
// ============================================================
describe('parse_utc_offset', () => {
    test('parses UTC+8 to 480 minutes', () => {
        expect(parse_utc_offset('UTC+8')).toBe(480);
    });

    test('parses UTC+1 to 60 minutes', () => {
        expect(parse_utc_offset('UTC+1')).toBe(60);
    });

    test('parses UTC-5 to -300 minutes', () => {
        expect(parse_utc_offset('UTC-5')).toBe(-300);
    });

    test('parses UTC to 0 minutes', () => {
        expect(parse_utc_offset('UTC')).toBe(0);
    });

    test('returns null for browser', () => {
        expect(parse_utc_offset('browser')).toBeNull();
    });

    test('parses UTC+0 to 0 minutes', () => {
        expect(parse_utc_offset('UTC+0')).toBe(0);
    });

    test('parses UTC-12 to -720 minutes', () => {
        expect(parse_utc_offset('UTC-12')).toBe(-720);
    });

    test('parses UTC+12 to 720 minutes', () => {
        expect(parse_utc_offset('UTC+12')).toBe(720);
    });
});

// ============================================================
// system time formatting — P0.34 UTC offset
// ============================================================
describe('system time formatting with UTC offsets', () => {
    test('formats timestamps in UTC+8 timezone', () => {
        expect(format_system_time(1704067200000, config)).toBe('2024-01-01 08:00:00');
    });

    test('formats timestamps in UTC+1 timezone', () => {
        expect(format_system_time(1704067200000, config_utc_plus_1)).toBe('2024-01-01 01:00:00');
    });

    test('formats timestamps in UTC-5 timezone', () => {
        expect(format_system_time(1704067200000, config_utc_minus_5)).toBe('2023-12-31 19:00:00');
    });

    test('formats timestamps in UTC', () => {
        expect(format_system_time(1704067200000, config_utc)).toBe('2024-01-01 00:00:00');
    });

    test('formats filename timestamps in configured timezone', () => {
        // P0.60: compact format YYYYMMDD_HHMMSS
        expect(format_system_time_filename(1704067200000, config)).toBe('20240101_080000');
    });

    test('filename uses offset time for UTC+8', () => {
        // P0.60: compact format YYYYMMDD_HHMMSS
        expect(format_system_time_filename('2024-01-01T00:00:00.000Z', config)).toBe('20240101_080000');
    });

    test('filename uses offset time for UTC-5', () => {
        // P0.60: compact format YYYYMMDD_HHMMSS
        expect(format_system_time_filename('2024-01-01T00:00:00.000Z', config_utc_minus_5)).toBe('20231231_190000');
    });
});

// ============================================================
// exported data structure — P0.33 human-readable labels
// ============================================================
describe('exported capture data with system times', () => {
    test('replaces time fields with formatted strings in all exported record groups', () => {
        const data = add_system_times_to_capture_data({
            capture,
            events: [event],
            network_requests: [request],
            console_events: [log]
        }, config);

        // P0.56: original fields replaced, not parallel fields added
        expect(data.capture.started_at).toBe('2024-01-01 08:00:00');
        expect(data.capture.ended_at).toBe('2024-01-01 08:01:00');
        expect(data.events[0].absolute_time).toBe('2024-01-01 08:00:01');
        expect(data.network_requests[0].absolute_time).toBe('2024-01-01 08:00:02');
        expect(data.console_events[0].absolute_time).toBe('2024-01-01 08:00:03');
    });

    test('P0.56 no parallel *_system_time or *_label fields', () => {
        const data = add_system_times_to_capture_data({
            capture,
            events: [event],
            network_requests: [request],
            console_events: [log]
        }, config);

        // Parallel fields should not exist
        expect((data.capture as any).start_time_system_time).toBeUndefined();
        expect((data.capture as any).end_time_system_time).toBeUndefined();
        expect((data.capture as any).start_time_label).toBeUndefined();
        expect((data.capture as any).end_time_label).toBeUndefined();
        expect((data.capture as any).started_at_utc).toBeUndefined();
        expect((data.capture as any).ended_at_utc).toBeUndefined();
        expect((data.events[0] as any).absolute_time_system_time).toBeUndefined();
        expect((data.events[0] as any).absolute_time_label).toBeUndefined();
    });

    test('P0.56 replaced time fields do not end with Z (not UTC raw)', () => {
        const data = add_system_times_to_capture_data({
            capture,
            events: [event],
            network_requests: [request],
            console_events: [log]
        }, config);

        expect(data.capture.started_at).not.toMatch(/Z$/);
        expect(data.capture.ended_at).not.toMatch(/Z$/);
        expect(data.events[0].absolute_time).not.toMatch(/Z$/);
    });

    test('P0.56 no raw UNIX timestamps in exported data', () => {
        const data = add_system_times_to_capture_data({
            capture,
            events: [event],
            network_requests: [request],
            console_events: [log]
        }, config);

        // started_at/ended_at should be formatted strings, not UNIX numbers
        expect(typeof data.capture.started_at).toBe('string');
        expect(typeof data.capture.ended_at).toBe('string');
        expect(data.capture.started_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        // absolute_time should be formatted string
        expect(typeof data.events[0].absolute_time).toBe('string');
        expect(data.events[0].absolute_time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    test('P0.38 started_at/ended_at use user timezone (not UTC Z)', () => {
        const data = add_system_times_to_capture_data({
            capture,
            events: [event],
            network_requests: [],
            console_events: []
        }, config);

        // Top-level fields now use formatted timezone, not raw UTC
        expect(data.capture.started_at).toBe('2024-01-01 08:00:00');
        expect(data.capture.ended_at).toBe('2024-01-01 08:01:00');
        expect(data.capture.started_at).not.toMatch(/Z$/);
        expect(data.capture.ended_at).not.toMatch(/Z$/);
    });

    test('P0.38 system_time_timezone is written to export data', () => {
        const data = add_system_times_to_capture_data({
            capture,
            events: [],
            network_requests: [],
            console_events: []
        }, config);

        expect(data.system_time_timezone).toBe('UTC+8');
        expect(data.capture.system_time_timezone).toBe('UTC+8');
    });

    test('P0.38 system_time_timezone works with browser config', () => {
        const data = add_system_times_to_capture_data({
            capture,
            events: [],
            network_requests: [],
            console_events: []
        }, config_browser);

        expect(data.system_time_timezone).toBe('browser');
        expect(data.capture.system_time_timezone).toBe('browser');
    });

    test('P0.56 replaced time with UTC config does not end with Z', () => {
        const data = add_system_times_to_capture_data({
            capture,
            events: [event],
            network_requests: [],
            console_events: []
        }, config_utc);

        expect(data.capture.started_at).not.toMatch(/Z$/);
    });

    test('P0.56 replaced time with browser config does not end with Z', () => {
        const data = add_system_times_to_capture_data({
            capture,
            events: [event],
            network_requests: [],
            console_events: []
        }, config_browser);

        expect(data.capture.started_at).not.toMatch(/Z$/);
    });
});

// ============================================================
// Legacy IANA migration — P0.34
// ============================================================
describe('legacy IANA timezone migration', () => {
    test('old Asia/Shanghai migrates to UTC+8', () => {
        expect(migrate_iana_timezone('Asia/Shanghai')).toBe('UTC+8');
    });

    test('old America/New_York migrates to UTC-5', () => {
        expect(migrate_iana_timezone('America/New_York')).toBe('UTC-5');
    });

    test('old Asia/Tokyo migrates to UTC+9', () => {
        expect(migrate_iana_timezone('Asia/Tokyo')).toBe('UTC+9');
    });

    test('old Europe/London migrates to UTC', () => {
        expect(migrate_iana_timezone('Europe/London')).toBe('UTC');
    });

    test('unknown old value falls back to browser', () => {
        expect(migrate_iana_timezone('Some/Unknown')).toBe('browser');
    });

    test('already-valid UTC+8 passes through unchanged', () => {
        expect(migrate_iana_timezone('UTC+8')).toBe('UTC+8');
    });

    test('already-valid UTC passes through unchanged', () => {
        expect(migrate_iana_timezone('UTC')).toBe('UTC');
    });

    test('already-valid browser passes through unchanged', () => {
        expect(migrate_iana_timezone('browser')).toBe('browser');
    });
});
