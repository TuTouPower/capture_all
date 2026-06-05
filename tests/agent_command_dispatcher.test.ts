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
});
