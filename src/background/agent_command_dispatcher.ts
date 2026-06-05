import type { AgentCommand, AgentCommandResult, AgentError, AgentErrorCode } from '../agent/shared/protocol';
import { list_sessions as storage_list_sessions, get_session } from './storage';
import { export_har, export_html, export_json, export_jsonl } from './exporter';
import {
    get_record_from_session_data,
    get_timeline_from_session_data,
    get_timeline_item_from_session_data,
    list_data_sources_from_session_data,
    list_records_from_session_data,
    load_agent_session_data,
    type AgentDataSource
} from './agent_data_queries';
import { DEFAULT_CONFIG } from '../shared/constants';
import type { RecordConfig } from '../shared/types';

export interface AgentRuntimeHandlers {
    start_recording: (session_id: string, config: RecordConfig) => Promise<{ success: boolean; error?: string }>;
    stop_recording: () => Promise<{ success: boolean }>;
    get_status: () => { active_session_id: string | null };
}

export async function dispatch_agent_command(command: AgentCommand, handlers: AgentRuntimeHandlers): Promise<AgentCommandResult> {
    try {
        return {
            command_id: command.command_id,
            ok: true,
            data: await execute_agent_command(command, handlers)
        };
    } catch (error) {
        return {
            command_id: command.command_id,
            ok: false,
            error: to_agent_error(error)
        };
    }
}

async function execute_agent_command(command: AgentCommand, handlers: AgentRuntimeHandlers): Promise<unknown> {
    const payload = command.payload as Record<string, unknown>;

    switch (command.type) {
        case 'recording.start':
            return start_recording(payload, handlers);
        case 'recording.stop':
            return stop_recording(handlers);
        case 'sessions.list':
            return list_sessions(payload);
        case 'sessions.get':
            return get_session_metadata(get_required_string(payload, 'session_id'));
        case 'sources.list':
            return list_data_sources_from_session_data(await load_agent_session_data(get_required_string(payload, 'session_id')));
        case 'records.list':
            return list_records_from_session_data(await load_agent_session_data(get_required_string(payload, 'session_id')), {
                source: get_required_string(payload, 'source') as AgentDataSource,
                offset: get_optional_number(payload, 'offset'),
                limit: get_optional_number(payload, 'limit'),
                start_time: get_optional_number(payload, 'start_time'),
                end_time: get_optional_number(payload, 'end_time'),
                order: get_order(payload)
            });
        case 'records.get':
            return get_record_from_session_data(
                await load_agent_session_data(get_required_string(payload, 'session_id')),
                get_required_string(payload, 'source') as AgentDataSource,
                get_required_string(payload, 'record_id')
            );
        case 'timeline.list':
            return get_timeline_from_session_data(await load_agent_session_data(get_required_string(payload, 'session_id')), {
                sources: get_optional_sources(payload),
                offset: get_optional_number(payload, 'offset'),
                limit: get_optional_number(payload, 'limit'),
                start_time: get_optional_number(payload, 'start_time'),
                end_time: get_optional_number(payload, 'end_time'),
                order: get_order(payload)
            });
        case 'timeline.get':
            return get_timeline_item_from_session_data(
                await load_agent_session_data(get_required_string(payload, 'session_id')),
                get_required_string(payload, 'item_id')
            );
        case 'session.get_all_data':
            return load_agent_session_data(get_required_string(payload, 'session_id'));
        case 'session.export':
            return export_session(get_required_string(payload, 'session_id'), get_required_string(payload, 'format'));
    }
}

async function start_recording(payload: Record<string, unknown>, handlers: AgentRuntimeHandlers): Promise<unknown> {
    const session_id = typeof payload.session_id === 'string' ? payload.session_id : `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const config = is_record_config(payload.config) ? payload.config : DEFAULT_CONFIG;
    const result = await handlers.start_recording(session_id, config);

    if (!result.success) {
        throw new AgentCommandError('RECORDING_ALREADY_RUNNING', result.error || 'Recording already running');
    }

    return { session_id, status: 'recording' };
}

async function stop_recording(handlers: AgentRuntimeHandlers): Promise<unknown> {
    const active_session_id = handlers.get_status().active_session_id;
    const result = await handlers.stop_recording();

    if (!result.success) {
        throw new AgentCommandError('NO_ACTIVE_RECORDING', 'No active recording');
    }

    return { session_id: active_session_id, status: 'stopped' };
}

async function list_sessions(payload: Record<string, unknown>): Promise<unknown> {
    const offset = get_optional_number(payload, 'offset') ?? 0;
    const limit = get_optional_number(payload, 'limit') ?? 100;
    const order = get_order(payload) ?? 'desc';
    const sessions = await storage_list_sessions();
    const sorted = [...sessions].sort((a, b) => order === 'asc' ? a.start_time - b.start_time : b.start_time - a.start_time);

    return {
        total: sorted.length,
        sessions: sorted.slice(offset, offset + limit)
    };
}

async function get_session_metadata(session_id: string): Promise<unknown> {
    const session = await get_session(session_id);
    if (!session) {
        throw new AgentCommandError('SESSION_NOT_FOUND', 'Session not found');
    }
    return session;
}

async function export_session(session_id: string, format: string): Promise<unknown> {
    switch (format) {
        case 'json':
            return { format, content: await export_json(session_id) };
        case 'jsonl':
            return { format, content: await export_jsonl(session_id) };
        case 'html':
            return { format, content: await export_html(session_id) };
        case 'har':
            return { format, content: await export_har(session_id) };
        default:
            throw new AgentCommandError('INVALID_QUERY', 'Unsupported export format');
    }
}

function get_required_string(payload: Record<string, unknown>, key: string): string {
    const value = payload[key];
    if (typeof value !== 'string' || value.length === 0) {
        throw new AgentCommandError('INVALID_QUERY', `${key} is required`);
    }
    return value;
}

function get_optional_number(payload: Record<string, unknown>, key: string): number | undefined {
    const value = payload[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new AgentCommandError('INVALID_QUERY', `${key} must be a number`);
    }
    return value;
}

function get_order(payload: Record<string, unknown>): 'asc' | 'desc' | undefined {
    const value = payload.order;
    if (value === undefined) return undefined;
    if (value !== 'asc' && value !== 'desc') {
        throw new AgentCommandError('INVALID_QUERY', 'order must be asc or desc');
    }
    return value;
}

function get_optional_sources(payload: Record<string, unknown>): AgentDataSource[] | undefined {
    if (payload.sources === undefined) return undefined;
    if (!Array.isArray(payload.sources) || !payload.sources.every(source => typeof source === 'string')) {
        throw new AgentCommandError('INVALID_QUERY', 'sources must be strings');
    }
    return payload.sources as AgentDataSource[];
}

function is_record_config(value: unknown): value is RecordConfig {
    return typeof value === 'object' && value !== null;
}

function to_agent_error(error: unknown): AgentError {
    if (error instanceof AgentCommandError) {
        return { code: error.code, message: error.message };
    }

    if (error instanceof Error && is_agent_error_code(error.message)) {
        return { code: error.message, message: error.message };
    }

    return {
        code: 'STORAGE_READ_FAILED',
        message: error instanceof Error ? error.message : String(error)
    };
}

function is_agent_error_code(value: string): value is AgentErrorCode {
    return [
        'SESSION_NOT_FOUND',
        'SOURCE_NOT_FOUND',
        'RECORD_NOT_FOUND',
        'INVALID_QUERY',
        'EXPORT_FAILED',
        'STORAGE_READ_FAILED'
    ].includes(value);
}

class AgentCommandError extends Error {
    constructor(readonly code: AgentErrorCode, message: string) {
        super(message);
    }
}
