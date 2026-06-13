import type { AgentCommand, AgentCommandResult, AgentError, AgentErrorCode } from '../agent/shared/protocol';
import { list_captures as storage_list_captures, get_capture } from './storage';
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
import type { CaptureConfig } from '../shared/types';

export interface AgentRuntimeHandlers {
    start_capture: (capture_id: string, config: CaptureConfig) => Promise<{ success: boolean; error?: string }>;
    stop_capture: () => Promise<{ success: boolean }>;
    get_status: () => { active_capture_id: string | null };
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
            return start_capture(payload, handlers);
        case 'recording.stop':
            return stop_capture(handlers);
        case 'sessions.list':
            return list_captures(payload);
        case 'sessions.get':
            return get_capture_metadata(get_required_capture_id(payload));
        case 'sources.list':
            return list_data_sources_from_session_data(await load_agent_session_data(get_required_capture_id(payload)));
        case 'records.list':
            return list_records_from_session_data(await load_agent_session_data(get_required_capture_id(payload)), {
                source: get_required_string(payload, 'source') as AgentDataSource,
                offset: get_optional_number(payload, 'offset'),
                limit: get_optional_number(payload, 'limit'),
                start_time: get_optional_number(payload, 'start_time'),
                end_time: get_optional_number(payload, 'end_time'),
                order: get_order(payload)
            });
        case 'records.get':
            return get_record_from_session_data(
                await load_agent_session_data(get_required_capture_id(payload)),
                get_required_string(payload, 'source') as AgentDataSource,
                get_required_string(payload, 'record_id')
            );
        case 'timeline.list':
            return get_timeline_from_session_data(await load_agent_session_data(get_required_capture_id(payload)), {
                sources: get_optional_sources(payload),
                offset: get_optional_number(payload, 'offset'),
                limit: get_optional_number(payload, 'limit'),
                start_time: get_optional_number(payload, 'start_time'),
                end_time: get_optional_number(payload, 'end_time'),
                order: get_order(payload)
            });
        case 'timeline.get':
            return get_timeline_item_from_session_data(
                await load_agent_session_data(get_required_capture_id(payload)),
                get_required_string(payload, 'item_id')
            );
        case 'session.get_all_data':
            return load_agent_session_data(get_required_capture_id(payload));
        case 'session.export':
            return export_capture(get_required_capture_id(payload), get_required_string(payload, 'format'));
    }
}

async function start_capture(payload: Record<string, unknown>, handlers: AgentRuntimeHandlers): Promise<unknown> {
    const capture_id = typeof payload.capture_id === 'string'
        ? payload.capture_id
        : typeof payload.capture_id === 'string'
            ? payload.capture_id
            : `capture_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const config = is_capture_config(payload.config) ? payload.config : DEFAULT_CONFIG;
    const result = await handlers.start_capture(capture_id, config);

    if (!result.success) {
        throw new AgentCommandError('RECORDING_ALREADY_RUNNING', result.error || 'Recording already running');
    }

    return { capture_id, status: 'recording' };
}

async function stop_capture(handlers: AgentRuntimeHandlers): Promise<unknown> {
    const active_capture_id = handlers.get_status().active_capture_id;
    const result = await handlers.stop_capture();

    if (!result.success) {
        throw new AgentCommandError('NO_ACTIVE_RECORDING', 'No active recording');
    }

    return { capture_id: active_capture_id, status: 'stopped' };
}

async function list_captures(payload: Record<string, unknown>): Promise<unknown> {
    const offset = get_optional_number(payload, 'offset') ?? 0;
    const limit = get_optional_number(payload, 'limit') ?? 100;
    const order = get_order(payload) ?? 'desc';
    const captures = await storage_list_captures();
    const sorted = [...captures].sort((a, b) => order === 'asc'
        ? new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
        : new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

    return {
        total: sorted.length,
        captures: sorted.slice(offset, offset + limit)
    };
}

async function get_capture_metadata(capture_id: string): Promise<unknown> {
    const capture = await get_capture(capture_id);
    if (!capture) {
        throw new AgentCommandError('SESSION_NOT_FOUND', 'Capture not found');
    }
    return capture;
}

async function export_capture(capture_id: string, format: string): Promise<unknown> {
    switch (format) {
        case 'json':
            return { format, content: await export_json(capture_id) };
        case 'jsonl':
            return { format, content: await export_jsonl(capture_id) };
        case 'html':
            return { format, content: await export_html(capture_id) };
        case 'har':
            return { format, content: await export_har(capture_id) };
        default:
            throw new AgentCommandError('INVALID_QUERY', 'Unsupported export format');
    }
}

function get_required_capture_id(payload: Record<string, unknown>): string {
    if (typeof payload.capture_id === 'string' && payload.capture_id.length > 0) {
        return payload.capture_id;
    }
    return get_required_string(payload, 'capture_id');
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

function is_capture_config(value: unknown): value is CaptureConfig {
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
