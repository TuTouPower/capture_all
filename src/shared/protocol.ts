export const AGENT_COMMAND_TYPES = [
    'capture.start',
    'capture.stop',
    'captures.list',
    'captures.get',
    'sources.list',
    'data.list',
    'data.get',
    'timeline.list',
    'timeline.get',
    'capture.get_all_data',
    'capture.export',
] as const;

export type AgentCommandType = (typeof AGENT_COMMAND_TYPES)[number];

export type AgentErrorCode =
    | 'BRIDGE_UNAVAILABLE'
    | 'EXTENSION_OFFLINE'
    | 'COMMAND_TIMEOUT'
    | 'TOKEN_INVALID'
    | 'COMMAND_CANCELLED'
    // capture 术语（新码，推荐使用）
    | 'CAPTURE_NOT_FOUND'
    | 'CAPTURE_ALREADY_RUNNING'
    | 'NO_ACTIVE_CAPTURE'
    // 旧码（兼容别名，废弃期限：v2.0 移除；新客户端请使用 capture 系列新码）
    | 'SESSION_NOT_FOUND'      // 兼容别名 → CAPTURE_NOT_FOUND
    | 'SOURCE_NOT_FOUND'
    | 'RECORD_NOT_FOUND'
    | 'INVALID_QUERY'
    | 'RECORDING_ALREADY_RUNNING' // 兼容别名 → CAPTURE_ALREADY_RUNNING
    | 'NO_ACTIVE_RECORDING'       // 兼容别名 → NO_ACTIVE_CAPTURE
    | 'EXPORT_FAILED'
    | 'STORAGE_READ_FAILED'
    | 'PAYLOAD_TOO_LARGE'
    | 'ORIGIN_NOT_ALLOWED'
    | 'TARGET_REQUIRED'
    | 'TARGET_NOT_FOUND'
    | 'TARGET_AMBIGUOUS'
    | 'LABEL_DUPLICATE'
    | 'PAIRING_REQUIRED';

// T057: 新旧错误码映射，供 dispatcher 与客户端渐进迁移
export const ERROR_CODE_ALIASES: Record<string, AgentErrorCode> = {
    'SESSION_NOT_FOUND': 'CAPTURE_NOT_FOUND',
    'RECORDING_ALREADY_RUNNING': 'CAPTURE_ALREADY_RUNNING',
    'NO_ACTIVE_RECORDING': 'NO_ACTIVE_CAPTURE',
};

export interface AgentError {
    code: AgentErrorCode;
    message: string;
    details?: unknown;
}

export interface AgentCommand<TPayload = unknown> {
    command_id: string;
    type: AgentCommandType;
    payload: TPayload;
    created_at: number;
}

export interface AgentCommandResult<TData = unknown> {
    command_id: string;
    ok: boolean;
    data?: TData;
    error?: AgentError;
}

export interface AgentBridgeConfig {
    host: '127.0.0.1';
    port: number;
    token: string;
    command_timeout_ms: number;
    full_data_timeout_ms: number;
    dev_mode?: boolean;
}

export interface ExtensionBridgeConfig {
    bridge_url: string;
    bridge_token: string;
    poll_interval_ms: number;
}

export interface AgentQueryRange {
    offset?: number;
    limit?: number;
    start_time?: number;
    end_time?: number;
    order?: 'asc' | 'desc';
}

export interface AgentDataSourceSummary {
    source: string;
    count: number;
    time_range: {
        start: number | null;
        end: number | null;
    };
    types: string[];
    description?: string;
}

export interface AgentRecordPreview {
    record_id: string;
    source: string;
    index: number;
    time: number;
    absolute_time: number | null;
    type: string;
    summary: string;
    preview: Record<string, unknown>;
}

export interface AgentRecordDetail<TData = unknown> {
    record_id: string;
    source: string;
    data: TData;
}

export interface AgentExtensionStatus {
    instance_id: string;
    browser_label: string | null;
    online: boolean;
    extension_version: string | null;
    active_capture_id: string | null;
    pending_commands: number;
}

export interface AgentStatus {
    bridge_version: string;
    bridge_url: string;
    /** @deprecated use extensions; true if any instance online */
    extension_online: boolean;
    /** @deprecated use extensions */
    extension_version: string | null;
    /** @deprecated use extensions */
    active_capture_id: string | null;
    pending_commands: number;
    extensions: AgentExtensionStatus[];
    online_count: number;
}

export function build_record_id(source: string, native_id: string): string {
    return `${source}:${native_id}`;
}

export function parse_record_id(record_id: string): { source: string; native_id: string } {
    const separator_index = record_id.indexOf(':');
    const source = record_id.slice(0, separator_index);
    const native_id = record_id.slice(separator_index + 1);

    if (separator_index <= 0 || native_id.length === 0) {
        throw new Error(`Invalid record_id: ${record_id}`);
    }

    return { source, native_id };
}
