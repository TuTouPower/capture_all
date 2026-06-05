import { describe, expect, test, vi } from 'vitest';
import { dispatch_agent_command, type AgentRuntimeHandlers } from '../src/background/agent_command_dispatcher';
import type { AgentCommand } from '../src/agent/shared/protocol';
import type { RecordConfig } from '../src/shared/types';

vi.mock('../src/background/storage', () => ({
    list_sessions: vi.fn(async () => []),
    get_session: vi.fn(async () => null)
}));

vi.mock('../src/background/exporter', () => ({
    export_json: vi.fn(async () => '{}'),
    export_jsonl: vi.fn(async () => ''),
    export_html: vi.fn(async () => '<html></html>'),
    export_har: vi.fn(async () => '{}')
}));

const mock_session_data = {
    session: { id: 's1', start_time: 1000, end_time: 2000, config: {}, stats: { event_count: 0, request_count: 0, log_count: 0, dom_changes: 0 } },
    sources: { record_events: [], network_requests: [], console_logs: [], error_logs: [] }
};

vi.mock('../src/background/agent_data_queries', () => ({
    load_agent_session_data: vi.fn(async () => mock_session_data),
    list_data_sources_from_session_data: vi.fn(() => []),
    list_records_from_session_data: vi.fn(() => ({ total: 0, records: [] })),
    get_record_from_session_data: vi.fn(() => ({ record_id: 'r1', source: 'record_events', data: {} })),
    get_timeline_from_session_data: vi.fn(() => ({ total: 0, records: [] })),
    get_timeline_item_from_session_data: vi.fn(() => ({ record_id: 'r1', source: 'record_events', data: {} }))
}));

const config: RecordConfig = {
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
};

const handlers: AgentRuntimeHandlers = {
    start_recording: vi.fn(async () => ({ success: true })),
    stop_recording: vi.fn(async () => ({ success: true })),
    get_status: vi.fn(() => ({ active_session_id: 'session_1' }))
};

function command(type: AgentCommand['type'], payload: Record<string, unknown> = {}): AgentCommand {
    return {
        command_id: `cmd_${type}`,
        type,
        payload,
        created_at: 1
    };
}

describe('agent command dispatcher', () => {
    test('starts recording with supplied session id and config', async () => {
        const result = await dispatch_agent_command(command('recording.start', {
            session_id: 'session_2',
            config
        }), handlers);

        expect(result.ok).toBe(true);
        expect(handlers.start_recording).toHaveBeenCalledWith('session_2', config);
    });

    test('maps recording already running errors', async () => {
        const result = await dispatch_agent_command(command('recording.start'), {
            ...handlers,
            start_recording: vi.fn(async () => ({ success: false, error: 'Already recording' }))
        });

        expect(result).toMatchObject({
            ok: false,
            error: { code: 'RECORDING_ALREADY_RUNNING' }
        });
    });

    test('stops recording and maps inactive state', async () => {
        const result = await dispatch_agent_command(command('recording.stop'), {
            ...handlers,
            stop_recording: vi.fn(async () => ({ success: false }))
        });

        expect(result).toMatchObject({
            ok: false,
            error: { code: 'NO_ACTIVE_RECORDING' }
        });
    });

    test('maps session not found', async () => {
        await expect(dispatch_agent_command(command('sessions.get', { session_id: 'missing' }), handlers)).resolves.toMatchObject({
            ok: false,
            error: { code: 'SESSION_NOT_FOUND' }
        });
    });

    test('generates session id when not supplied', async () => {
        const result = await dispatch_agent_command(command('recording.start', { config }), handlers);

        expect(result.ok).toBe(true);
        expect(result.data).toHaveProperty('session_id');
        expect(typeof (result.data as { session_id: string }).session_id).toBe('string');
    });

    test('lists sessions', async () => {
        const result = await dispatch_agent_command(command('sessions.list', { limit: 10 }), handlers);
        expect(result.ok).toBe(true);
        expect((result.data as { total: number }).total).toBe(0);
    });

    test('lists data sources', async () => {
        const result = await dispatch_agent_command(command('sources.list', { session_id: 's1' }), handlers);
        expect(result.ok).toBe(true);
    });

    test('lists records with query params', async () => {
        const result = await dispatch_agent_command(command('records.list', {
            session_id: 's1',
            source: 'record_events',
            offset: 0,
            limit: 10,
            order: 'asc'
        }), handlers);
        expect(result.ok).toBe(true);
    });

    test('gets record by id', async () => {
        const result = await dispatch_agent_command(command('records.get', {
            session_id: 's1',
            source: 'record_events',
            record_id: 'record_events:10:1010'
        }), handlers);
        expect(result.ok).toBe(true);
    });

    test('gets timeline', async () => {
        const result = await dispatch_agent_command(command('timeline.list', {
            session_id: 's1',
            limit: 5
        }), handlers);
        expect(result.ok).toBe(true);
    });

    test('gets timeline item', async () => {
        const result = await dispatch_agent_command(command('timeline.get', {
            session_id: 's1',
            item_id: 'record_events:10:1010'
        }), handlers);
        expect(result.ok).toBe(true);
    });

    test('exports session as json', async () => {
        const result = await dispatch_agent_command(command('session.export', {
            session_id: 's1',
            format: 'json'
        }), handlers);
        expect(result.ok).toBe(true);
        expect((result.data as { format: string }).format).toBe('json');
    });

    test('gets all session data', async () => {
        const result = await dispatch_agent_command(command('session.get_all_data', {
            session_id: 's1'
        }), handlers);
        expect(result.ok).toBe(true);
    });

    test('rejects invalid query params', async () => {
        const result = await dispatch_agent_command(command('records.list', {
            session_id: 's1',
            source: 'record_events',
            offset: 'not_a_number'
        }), handlers);
        expect(result.ok).toBe(false);
        expect((result as { error?: { code?: string } }).error?.code).toBe('INVALID_QUERY');
    });

    test('rejects unsupported export format', async () => {
        const result = await dispatch_agent_command(command('session.export', {
            session_id: 's1',
            format: 'csv'
        }), handlers);
        expect(result.ok).toBe(false);
        expect((result as { error?: { code?: string } }).error?.code).toBe('INVALID_QUERY');
    });

    test('rejects missing required session_id', async () => {
        const result = await dispatch_agent_command(command('sessions.get', {}), handlers);
        expect(result.ok).toBe(false);
        expect((result as { error?: { code?: string } }).error?.code).toBe('INVALID_QUERY');
    });
});
