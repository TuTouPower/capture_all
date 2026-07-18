import { describe, expect, test, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { dispatch_agent_command, type AgentRuntimeHandlers } from '../src/background/agent_command_dispatcher';
import type { AgentCommand } from '../src/shared/protocol';
import { DEFAULT_CONFIG } from '../src/shared/constants';
import type { CaptureConfig } from '../src/shared/types';

vi.mock('../src/background/exporter', () => ({
    export_json: vi.fn(async () => '{}'),
    export_jsonl: vi.fn(async () => ''),
    export_html: vi.fn(async () => '<html></html>'),
    export_har: vi.fn(async () => '{}')
}));

const mock_capture_data = {
    capture: { capture_id: 'c1', started_at: '2024-01-01T00:00:00.000Z', ended_at: null, config_snapshot: {}, stats: { event_count: 0, request_count: 0, log_count: 0, error_count: 0 } },
    sources: { user_action_events: [], navigation_events: [], network_requests: [], console_events: [], error_events: [], storage_changes: [], cookie_changes: [] }
};

vi.mock('../src/background/agent_data_queries', () => ({
    load_agent_capture_data: vi.fn(async () => mock_capture_data),
    list_data_sources_from_capture_data: vi.fn(() => []),
    list_entries_from_capture_data: vi.fn(() => ({ total: 0, records: [] })),
    get_entry_from_capture_data: vi.fn(() => ({ record_id: 'r1', source: 'user_action_events', data: {} })),
    get_timeline_from_capture_data: vi.fn(() => ({ total: 0, records: [] })),
    get_timeline_item_from_capture_data: vi.fn(() => ({ record_id: 'r1', source: 'user_action_events', data: {} }))
}));

const config: CaptureConfig = {
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
    start_capture: vi.fn(async () => ({ success: true })),
    stop_capture: vi.fn(async () => ({ success: true })),
    get_status: vi.fn(() => ({ active_capture_id: 'capture_1' }))
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
    test('starts capture with supplied capture_id and config', async () => {
        const result = await dispatch_agent_command(command('capture.start', {
            capture_id: 'capture_2',
            config
        }), handlers);

        expect(result.ok).toBe(true);
        expect(handlers.start_capture).toHaveBeenCalledWith('capture_2', {
            ...DEFAULT_CONFIG,
            ...config
        });
    });

    test('merges partial config with safe capture defaults', async () => {
        const start_capture = vi.fn(async () => ({ success: true }));

        const result = await dispatch_agent_command(command('capture.start', {
            capture_id: 'capture_partial',
            config: { capture_input_values: false }
        }), {
            ...handlers,
            start_capture
        });

        expect(result.ok).toBe(true);
        expect(start_capture).toHaveBeenCalledWith('capture_partial', {
            ...DEFAULT_CONFIG,
            capture_input_values: false
        });
    });

    test('rejects invalid partial capture config', async () => {
        const start_capture = vi.fn(async () => ({ success: true }));

        const result = await dispatch_agent_command(command('capture.start', {
            config: {
                redact_data: 'false',
                unexpected_field: true
            }
        }), {
            ...handlers,
            start_capture
        });

        expect(result).toMatchObject({
            ok: false,
            error: { code: 'INVALID_QUERY' }
        });
        expect(start_capture).not.toHaveBeenCalled();
    });

    test('maps capture already running errors', async () => {
        const result = await dispatch_agent_command(command('capture.start'), {
            ...handlers,
            start_capture: vi.fn(async () => ({ success: false, error: 'Already recording' }))
        });

        expect(result).toMatchObject({
            ok: false,
            error: { code: 'RECORDING_ALREADY_RUNNING' }
        });
    });

    test('stops capture and maps inactive state', async () => {
        const result = await dispatch_agent_command(command('capture.stop'), {
            ...handlers,
            stop_capture: vi.fn(async () => ({ success: false }))
        });

        expect(result).toMatchObject({
            ok: false,
            error: { code: 'NO_ACTIVE_RECORDING' }
        });
    });

    test('maps capture not found', async () => {
        await expect(dispatch_agent_command(command('captures.get', { capture_id: 'missing' }), handlers)).resolves.toMatchObject({
            ok: false,
            error: { code: 'SESSION_NOT_FOUND' }
        });
    });

    test('generates capture id when not supplied', async () => {
        const result = await dispatch_agent_command(command('capture.start', { config }), handlers);

        expect(result.ok).toBe(true);
        expect(result.data).toHaveProperty('capture_id');
        expect(typeof (result.data as { capture_id: string }).capture_id).toBe('string');
    });

    test('lists captures', async () => {
        const result = await dispatch_agent_command(command('captures.list', { limit: 10 }), handlers);
        expect(result.ok).toBe(true);
        expect((result.data as { total: number }).total).toBe(0);
    });

    test('lists data sources', async () => {
        const result = await dispatch_agent_command(command('sources.list', { capture_id: 's1' }), handlers);
        expect(result.ok).toBe(true);
    });

    test('lists records with query params', async () => {
        const result = await dispatch_agent_command(command('data.list', {
            capture_id: 's1',
            source: 'user_action_events',
            offset: 0,
            limit: 10,
            order: 'asc'
        }), handlers);
        expect(result.ok).toBe(true);
    });

    test('gets record by id', async () => {
        const result = await dispatch_agent_command(command('data.get', {
            capture_id: 's1',
            source: 'user_action_events',
            record_id: 'user_action_events:10:1010'
        }), handlers);
        expect(result.ok).toBe(true);
    });

    test('gets timeline', async () => {
        const result = await dispatch_agent_command(command('timeline.list', {
            capture_id: 's1',
            limit: 5
        }), handlers);
        expect(result.ok).toBe(true);
    });

    test('gets timeline item', async () => {
        const result = await dispatch_agent_command(command('timeline.get', {
            capture_id: 's1',
            item_id: 'user_action_events:10:1010'
        }), handlers);
        expect(result.ok).toBe(true);
    });

    test('exports capture as json', async () => {
        const result = await dispatch_agent_command(command('capture.export', {
            capture_id: 's1',
            format: 'json'
        }), handlers);
        expect(result.ok).toBe(true);
        expect((result.data as { format: string }).format).toBe('json');
    });

    test('gets all capture data', async () => {
        const result = await dispatch_agent_command(command('capture.get_all_data', {
            capture_id: 's1'
        }), handlers);
        expect(result.ok).toBe(true);
    });

    test('rejects invalid query params', async () => {
        const result = await dispatch_agent_command(command('data.list', {
            capture_id: 's1',
            source: 'user_action_events',
            offset: 'not_a_number'
        }), handlers);
        expect(result.ok).toBe(false);
        expect((result as { error?: { code?: string } }).error?.code).toBe('INVALID_QUERY');
    });

    test('rejects unsupported export format', async () => {
        const result = await dispatch_agent_command(command('capture.export', {
            capture_id: 's1',
            format: 'csv'
        }), handlers);
        expect(result.ok).toBe(false);
        expect((result as { error?: { code?: string } }).error?.code).toBe('INVALID_QUERY');
    });

    test('rejects missing required capture_id', async () => {
        const result = await dispatch_agent_command(command('captures.get', {}), handlers);
        expect(result.ok).toBe(false);
        expect((result as { error?: { code?: string } }).error?.code).toBe('INVALID_QUERY');
    });
});
