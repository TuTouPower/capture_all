import { describe, expect, test } from 'vitest';
import { add_system_times_to_session_data, format_system_time } from '../shared/system_time';
import type { ConsoleLog, NetworkRequest, RecordEvent, Session } from '../shared/types';

const config = { system_time_timezone: 'Asia/Shanghai' as const };

const session: Session = {
    id: 'session_1',
    start_time: 1704067200000,
    end_time: 1704067260000,
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
    stats: { event_count: 1, request_count: 1, log_count: 1, dom_changes: 0 }
};

const event: RecordEvent = {
    session_id: 'session_1',
    relative_time: 10,
    absolute_time: 1704067201000,
    type: 'page_load',
    data: { load_time_ms: 100, dom_content_loaded_ms: 80 },
    tab_id: 1,
    frame_id: 0,
    url: 'https://example.com'
};

const request: NetworkRequest = {
    session_id: 'session_1',
    relative_time: 20,
    absolute_time: 1704067202000,
    tab_id: 1,
    method: 'GET',
    url: 'https://example.com/api',
    status_code: 200,
    request_headers: {},
    response_headers: {},
    request_body: null,
    request_body_status: 'not_enabled',
    response_body: null,
    response_body_status: 'not_enabled',
    duration_ms: 30,
    resource_type: 'fetch'
};

const log: ConsoleLog = {
    session_id: 'session_1',
    relative_time: 30,
    absolute_time: 1704067203000,
    tab_id: 1,
    level: 'info',
    args: ['ready'],
    stack_trace: null,
    url: 'https://example.com',
    line: 1,
    column: 1
};

describe('system time formatting', () => {
    test('formats timestamps in configured Asia/Shanghai timezone', () => {
        expect(format_system_time(1704067200000, config)).toBe('2024-01-01 08:00:00');
    });

    test('adds system time fields to all exported record groups', () => {
        const data = add_system_times_to_session_data({
            session,
            events: [event],
            network_requests: [request],
            console_logs: [log]
        }, config) as {
            session: Session & { start_time_system_time: string; end_time_system_time: string | null };
            events: Array<RecordEvent & { absolute_time_system_time: string }>;
            network_requests: Array<NetworkRequest & { absolute_time_system_time: string }>;
            console_logs: Array<ConsoleLog & { absolute_time_system_time: string }>;
        };

        expect(data.session.start_time_system_time).toBe('2024-01-01 08:00:00');
        expect(data.session.end_time_system_time).toBe('2024-01-01 08:01:00');
        expect(data.events[0].absolute_time_system_time).toBe('2024-01-01 08:00:01');
        expect(data.network_requests[0].absolute_time_system_time).toBe('2024-01-01 08:00:02');
        expect(data.console_logs[0].absolute_time_system_time).toBe('2024-01-01 08:00:03');
    });
});
