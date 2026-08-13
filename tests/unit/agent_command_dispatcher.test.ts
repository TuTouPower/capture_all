import { describe, expect, test, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { dispatch_agent_command, type AgentRuntimeHandlers } from '../../src/extension/background/agent_command_dispatcher';
import type { AgentCommand } from '../../src/shared/protocol';
import { DEFAULT_CONFIG } from '../../src/shared/constants';
import type { CaptureConfig } from '../../src/shared/types';
import {
    get_entry_pushdown,
    list_entries_pushdown,
} from '../../src/extension/background/agent_data_queries';
import { export_json } from '../../src/extension/background/exporter';

vi.mock('../../src/extension/background/exporter', () => ({
    export_json: vi.fn(async () => '{}'),
    export_jsonl: vi.fn(async () => ''),
    export_html: vi.fn(async () => '<html></html>'),
    export_har: vi.fn(async () => '{}')
}));

const mock_capture_data = {
    capture: { capture_id: 'c1', started_at: '2024-01-01T00:00:00.000Z', ended_at: null, config_snapshot: {}, stats: { event_count: 0, request_count: 0, log_count: 0, error_count: 0 } },
    sources: { user_action_events: [], navigation_events: [], network_requests: [], console_events: [], error_events: [], storage_changes: [], cookie_changes: [] }
};

vi.mock('../../src/extension/background/agent_data_queries', () => ({
    load_agent_capture_data: vi.fn(async () => mock_capture_data),
    list_data_sources_from_capture_data: vi.fn(() => []),
    list_entries_from_capture_data: vi.fn(() => ({ total: 0, records: [] })),
    get_entry_from_capture_data: vi.fn(() => ({ record_id: 'r1', source: 'user_action_events', data: {} })),
    get_timeline_from_capture_data: vi.fn(() => ({ total: 0, records: [] })),
    get_timeline_item_from_capture_data: vi.fn(() => ({ record_id: 'r1', source: 'user_action_events', data: {} })),
    // t161: dispatcher 改走下推路径，mock 对应新函数
    get_entry_pushdown: vi.fn(async () => ({ record_id: 'r1', source: 'user_action_events', data: {} })),
    list_entries_pushdown: vi.fn(async () => ({ total: 0, records: [], next_token: null })),
    list_sources_pushdown: vi.fn(async () => []),
    get_timeline_pushdown: vi.fn(async () => ({ total: 0, records: [] })),
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
            error: { code: 'CAPTURE_ALREADY_RUNNING' }
        });
    });

    test('stops capture and maps inactive state', async () => {
        const result = await dispatch_agent_command(command('capture.stop'), {
            ...handlers,
            stop_capture: vi.fn(async () => ({ success: false }))
        });

        expect(result).toMatchObject({
            ok: false,
            error: { code: 'NO_ACTIVE_CAPTURE' }
        });
    });

    test('maps capture not found', async () => {
        await expect(dispatch_agent_command(command('captures.get', { capture_id: 'missing' }), handlers)).resolves.toMatchObject({
            ok: false,
            error: { code: 'CAPTURE_NOT_FOUND' }
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

    test('sanitizes unexpected internal errors (B2-M15)', async () => {
        const result = await dispatch_agent_command(command('capture.start', { config }), {
            ...handlers,
            start_capture: vi.fn(async () => {
                throw new Error('/usr/lib/somewhere/index.js:42: leaked internal detail');
            }),
        });

        expect(result.ok).toBe(false);
        const err = (result as { error?: { code?: string; message?: string } }).error;
        expect(err?.code).toBe('STORAGE_READ_FAILED');
        expect(err?.message).toBe('Unexpected error executing command');
        expect(err?.message).not.toContain('/usr/lib/somewhere');
        expect(err?.message).not.toContain('leaked');
    });

    // ── t151 AC-005: 结构化错误码映射补充（t161: dispatcher 走 pushdown 路径） ───
    test('maps SOURCE_NOT_FOUND from data.list', async () => {
        vi.mocked(list_entries_pushdown).mockImplementationOnce(() => {
            throw new Error('SOURCE_NOT_FOUND');
        });
        const result = await dispatch_agent_command(command('data.list', {
            capture_id: 's1',
            source: 'user_action_events',
            offset: 0,
            limit: 10,
        }), handlers);
        expect(result).toMatchObject({ ok: false, error: { code: 'SOURCE_NOT_FOUND' } });
    });

    test('maps RECORD_NOT_FOUND from data.get', async () => {
        vi.mocked(get_entry_pushdown).mockImplementationOnce(() => {
            throw new Error('RECORD_NOT_FOUND');
        });
        const result = await dispatch_agent_command(command('data.get', {
            capture_id: 's1',
            source: 'user_action_events',
            record_id: 'user_action_events:10:1010',
        }), handlers);
        expect(result).toMatchObject({ ok: false, error: { code: 'RECORD_NOT_FOUND' } });
    });

    test('maps EXPORT_FAILED from exporter', async () => {
        vi.mocked(export_json).mockRejectedValueOnce(new Error('EXPORT_FAILED'));
        const result = await dispatch_agent_command(command('capture.export', {
            capture_id: 's1',
            format: 'json',
        }), handlers);
        expect(result).toMatchObject({ ok: false, error: { code: 'EXPORT_FAILED' } });
    });

    test('rejects capture config with invalid values', async () => {
        const start_capture = vi.fn(async () => ({ success: true }));
        const result = await dispatch_agent_command(command('capture.start', {
            config: { sample_rate_ms: 'fast', capture_console: false },
        }), {
            ...handlers,
            start_capture,
        });
        expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_QUERY' } });
        expect(start_capture).not.toHaveBeenCalled();
    });

    // B2-M11: 合法但过大的 sample_rate_ms clamp 到合理区间，而非放行
    test('clamps oversized sample_rate_ms (B2-M11)', async () => {
        const start_capture = vi.fn(async () => ({ success: true }));
        const result = await dispatch_agent_command(command('capture.start', {
            config: { sample_rate_ms: 999999999 },
        }), {
            ...handlers,
            start_capture,
        });
        expect(result.ok).toBe(true);
        const passed = start_capture.mock.calls[0][1] as { sample_rate_ms: number };
        expect(passed.sample_rate_ms).toBe(10000);
    });

    test('rejects negative data.list limit (分页边界)', async () => {
        const result = await dispatch_agent_command(command('data.list', {
            capture_id: 's1',
            source: 'user_action_events',
            limit: -1,
        }), handlers);
        expect(result).toMatchObject({
            ok: false,
            error: { code: 'INVALID_QUERY', message: expect.stringContaining('limit') },
        });
    });

    test('rejects data.list limit exceeding max', async () => {
        const result = await dispatch_agent_command(command('data.list', {
            capture_id: 's1',
            source: 'user_action_events',
            limit: 200000,
        }), handlers);
        expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_QUERY' } });
    });
});
