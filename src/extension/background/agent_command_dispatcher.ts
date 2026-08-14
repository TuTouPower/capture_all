import type { AgentCommand, AgentCommandResult, AgentError, AgentErrorCode } from '../../shared/protocol';
import { list_captures as storage_list_captures, count_captures, get_capture } from './storage';
import { export_har, export_html, export_json, export_jsonl } from './exporter';
import {
    load_agent_capture_data,
    get_entry_pushdown,
    list_entries_pushdown,
    list_sources_pushdown,
    get_timeline_pushdown,
    type AgentDataSource
} from './agent_data_queries';
import { DEFAULT_CONFIG, MAX_BODY_CAPTURE_BYTES, INLINE_TEXT_MAX_BYTES } from '../../shared/constants';
import { generate_capture_id } from '../../shared/id';
import type { CaptureConfig } from '../../shared/types';
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/agent_dispatch', get_app_log_transport());

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
        case 'capture.start':
            return start_capture(payload, handlers);
        case 'capture.stop':
            return stop_capture(handlers);
        case 'captures.list':
            return list_captures(payload);
        case 'captures.get':
            return get_capture_metadata(get_required_capture_id(payload));
        case 'sources.list':
            // t161 AC-003: 下推——count/range 用索引，不读记录体
            return list_sources_pushdown(get_required_capture_id(payload));
        case 'data.list':
            // t161 AC-002/004: 下推——读取量受 limit 约束，返回 next_token
            return list_entries_pushdown(get_required_capture_id(payload), {
                source: get_required_string(payload, 'source') as AgentDataSource,
                offset: get_optional_non_negative_int(payload, 'offset'),
                limit: get_optional_non_negative_int(payload, 'limit', 100000),
                start_time: get_optional_number(payload, 'start_time'),
                end_time: get_optional_number(payload, 'end_time'),
                order: get_order(payload),
                after: payload.after as { relative_time_ms: number; event_id: string } | undefined | null,
            });
        case 'data.get':
            // t161 AC-001: 点查——主键直查对应 store
            return get_entry_pushdown(
                get_required_capture_id(payload),
                get_required_string(payload, 'source') as AgentDataSource,
                get_required_string(payload, 'record_id')
            );
        case 'timeline.list':
            // t161 AC-002: 下推——per-source keyset 有界读取后合并
            return get_timeline_pushdown(get_required_capture_id(payload), {
                sources: get_optional_sources(payload),
                offset: get_optional_non_negative_int(payload, 'offset'),
                limit: get_optional_non_negative_int(payload, 'limit', 100000),
                start_time: get_optional_number(payload, 'start_time'),
                end_time: get_optional_number(payload, 'end_time'),
                order: get_order(payload)
            });
        case 'timeline.get':
            // t161 AC-001: 点查（item_id 带 source 前缀）
            return get_entry_pushdown(
                get_required_capture_id(payload),
                get_required_string(payload, 'item_id').split(':')[0] as AgentDataSource,
                get_required_string(payload, 'item_id')
            );
        case 'capture.get_all_data':
            return load_agent_capture_data(get_required_capture_id(payload));
        case 'capture.export':
            return export_capture(get_required_capture_id(payload), get_required_string(payload, 'format'), {
                include_response_body: get_optional_boolean(payload, 'include_response_body'),
                include_request_body: get_optional_boolean(payload, 'include_request_body'),
                include_preview: get_optional_boolean(payload, 'include_preview'),
            });
        default:
            // T048: 未知命令类型显式拒绝，避免返回 ok:true data:undefined
            throw new AgentCommandError('INVALID_QUERY', `Unsupported command type: ${command.type}`);
    }
}

async function start_capture(payload: Record<string, unknown>, handlers: AgentRuntimeHandlers): Promise<unknown> {
    const capture_id = typeof payload.capture_id === 'string'
        ? payload.capture_id
        : generate_capture_id();
    const config = get_capture_config(payload.config);
    const result = await handlers.start_capture(capture_id, config);

    if (!result.success) {
        // T048: 区分"已有活跃采集"与"存储失败"。错误信息含 'already capturing'/'already recording'/'not idle' 用 CAPTURE_ALREADY_RUNNING，
        // 其他失败（如 create_capture 抛错）用 STORAGE_READ_FAILED，不再一律覆盖。
        const err_msg = (result.error || '').toLowerCase();
        const is_busy = err_msg.includes('already capturing')
            || err_msg.includes('already recording')
            || err_msg.includes('already_capturing')
            || err_msg.includes('not idle');
        if (is_busy) {
            throw new AgentCommandError('CAPTURE_ALREADY_RUNNING', result.error || 'Recording already running');
        }
        throw new AgentCommandError('STORAGE_READ_FAILED', result.error || 'Start capture failed');
    }

    return { capture_id, status: 'recording' };
}

async function stop_capture(handlers: AgentRuntimeHandlers): Promise<unknown> {
    // t177: stop 幂等——空闲态 stop_capture 返回 success:true，capture_id 允许 null；
    // NO_ACTIVE_CAPTURE 错误码契约已删除（协议与文档同步）。
    // p049: success:false 分支保留为防御——service_worker stop_capture 恒 success:true
    // （空闲态直接返回，异常 rethrow 经 to_agent_error 转错误响应），该分支实际不可达；
    // 保留以承受未来 handler 语义变化，行为已有 dispatcher 测试覆盖（success:false → idle）。
    const active_capture_id = handlers.get_status().active_capture_id;
    const result = await handlers.stop_capture();

    return { capture_id: result.success ? active_capture_id : null, status: result.success ? 'stopped' : 'idle' };
}

async function list_captures(payload: Record<string, unknown>): Promise<unknown> {
    const offset = get_optional_non_negative_int(payload, 'offset') ?? 0;
    const limit = get_optional_non_negative_int(payload, 'limit', 100000) ?? 100;
    const order = get_order(payload) ?? 'desc';
    // t161: 索引方向直接给出排序序（started_at prev=desc/next=asc），limit 截断读取量，
    // 不再全量读取后二次排序再 slice；total 用 count() 轻量查询。
    // t193 AC-002: offset 下推（cursor.advance），不读取被跳过的记录（PERF-L009）
    const direction = order === 'asc' ? 'next' : 'prev';
    const captures = await storage_list_captures(limit, direction, offset);

    return {
        total: await count_captures(),
        // t193 AC-002: storage 已下推 offset/limit（cursor advance + 截断），无需再 slice
        captures,
    };
}

async function get_capture_metadata(capture_id: string): Promise<unknown> {
    const capture = await get_capture(capture_id);
    if (!capture) {
        throw new AgentCommandError('CAPTURE_NOT_FOUND', 'Capture not found');
    }
    return capture;
}

async function export_capture(capture_id: string, format: string, options?: { include_response_body?: boolean; include_request_body?: boolean; include_preview?: boolean }): Promise<unknown> {
    switch (format) {
        case 'json':
            return { format, content: await export_json(capture_id, options) };
        case 'jsonl':
            return { format, content: await export_jsonl(capture_id, options) };
        case 'html':
            return { format, content: await export_html(capture_id, options) };
        case 'har':
            return { format, content: await export_har(capture_id, options) };
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

// T048: offset/limit 必须是非负整数（slice 语义要求）
function get_optional_non_negative_int(payload: Record<string, unknown>, key: string, max?: number): number | undefined {
    const value = payload[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new AgentCommandError('INVALID_QUERY', `${key} must be a non-negative integer`);
    }
    if (max !== undefined && value > max) {
        throw new AgentCommandError('INVALID_QUERY', `${key} exceeds maximum ${max}`);
    }
    return value;
}

function get_optional_boolean(payload: Record<string, unknown>, key: string): boolean | undefined {
    const value = payload[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') {
        throw new AgentCommandError('INVALID_QUERY', `${key} must be a boolean`);
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

// B2-M11: sample_rate_ms 合理区间上限——鼠标 mousemove 节流间隔（默认 50ms），
// 10s 已远超任何实际用途；超大值会让采集形同虚设，clamp 而非放行。
const MAX_SAMPLE_RATE_MS = 10000;

const capture_config_keys = new Set<keyof CaptureConfig>([
    'mouse_precision',
    'capture_console',
    'capture_network',
    'keyboard_capture_mode',
    'capture_input_values',
    'capture_request_body',
    'capture_response_body',
    'max_body_capture_bytes',
    'inline_text_max_bytes',
    'redact_sensitive_headers',
    'redact_url_query',
    'redact_data',
    'sample_rate_ms'
]);

function get_capture_config(value: unknown): CaptureConfig {
    if (value === undefined) {
        return { ...DEFAULT_CONFIG };
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new AgentCommandError('INVALID_QUERY', 'config must be an object');
    }

    const config = value as Record<string, unknown>;
    if (Object.keys(config).some(key => !capture_config_keys.has(key as keyof CaptureConfig))) {
        throw new AgentCommandError('INVALID_QUERY', 'config contains unsupported fields');
    }

    const merged = { ...DEFAULT_CONFIG, ...config };
    if (!has_valid_capture_config_values(merged)) {
        throw new AgentCommandError('INVALID_QUERY', 'config contains invalid values');
    }
    // B2-M11: sample_rate_ms clamp 到合理区间（合法但过大的取值会禁用 mouse 采样）
    merged.sample_rate_ms = Math.min(MAX_SAMPLE_RATE_MS, merged.sample_rate_ms);
    return merged as CaptureConfig;
}

function is_within_body_cap(v: unknown): boolean {
    return is_non_negative_integer(v) && Number(v) <= MAX_BODY_CAPTURE_BYTES;
}

function is_within_inline_cap(v: unknown): boolean {
    return is_non_negative_integer(v) && Number(v) <= INLINE_TEXT_MAX_BYTES;
}

function has_valid_capture_config_values(value: Record<string, unknown>): boolean {
    return (
        ['clicks', 'clicks_scroll_drag', 'full_trajectory'].includes(String(value.mouse_precision))
        && typeof value.capture_console === 'boolean'
        && typeof value.capture_network === 'boolean'
        && ['none', 'shortcuts', 'all'].includes(String(value.keyboard_capture_mode))
        && typeof value.capture_input_values === 'boolean'
        && typeof value.capture_request_body === 'boolean'
        && typeof value.capture_response_body === 'boolean'
        // t178: body/inline 硬上限（spike s008 结论，复用既有常量）
        && is_within_body_cap(value.max_body_capture_bytes)
        && is_within_inline_cap(value.inline_text_max_bytes)
        && typeof value.redact_sensitive_headers === 'boolean'
        && typeof value.redact_url_query === 'boolean'
        && typeof value.redact_data === 'boolean'
        && is_non_negative_integer(value.sample_rate_ms)
    );
}

function is_non_negative_integer(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function to_agent_error(error: unknown): AgentError {
    if (error instanceof AgentCommandError) {
        return { code: error.code, message: error.message };
    }

    if (error instanceof Error && is_agent_error_code(error.message)) {
        return { code: error.message, message: error.message };
    }

    // B2-M15: 未知错误不回传内部路径/库错误串；结构化错误码 + 通用脱敏 message，
    // 原始细节仅入本地 app_logs 供诊断。
    logger.error('Agent command failed with unexpected error', {
        name: error instanceof Error ? error.name : typeof error,
        detail: error instanceof Error ? error.message : String(error),
    });
    return {
        code: 'STORAGE_READ_FAILED',
        message: 'Unexpected error executing command'
    };
}

function is_agent_error_code(value: string): value is AgentErrorCode {
    return [
        'CAPTURE_NOT_FOUND',
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
