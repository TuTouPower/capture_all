// shared/constants.ts
import type { CaptureConfig } from './types';

export const DB_NAME = 'capture_all_db';
export const DB_VERSION = 4;

// t175: MCP/Bridge 命令超时共享上限（Bridge 强制校验，MCP Zod 同步 max）
export const MAX_COMMAND_TIMEOUT_MS = 300000;

export const STORE_NAMES = {
    CAPTURES: 'captures',
    USER_ACTION_EVENTS: 'user_action_events',
    NAVIGATION_EVENTS: 'navigation_events',
    NETWORK_REQUESTS: 'network_requests',
    CONSOLE_EVENTS: 'console_events',
    ERROR_EVENTS: 'error_events',
    STORAGE_CHANGES: 'storage_changes',
    COOKIE_CHANGES: 'cookie_changes',
    CAPTURE_LIFECYCLE_EVENTS: 'capture_lifecycle_events',
    APP_LOGS: 'app_logs',
} as const;

export const MAX_SESSION_SIZE_BYTES = 500 * 1024 * 1024; // 500MB
export const MAX_SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_BODY_CAPTURE_BYTES = 100 * 1024 * 1024; // 100MB
export const MAX_EXTENSION_RESULT_BODY_BYTES = 64 * 1024 * 1024; // 64MiB，扩展结果回传上限（与 bridge server 一致）
export const INLINE_TEXT_MAX_BYTES = 32 * 1024; // 32KB
export const MAX_CONSOLE_ARG_BYTES = 1024; // 1KB
export const MAX_LOG_ENTRY_BYTES = 64 * 1024; // 64KB，单条日志 details/message 字符串上限
export const MAX_TARGET_TEXT_CHARS = 100;
export const FLUSH_INTERVAL_MS = 1000;

export const DEFAULT_CONFIG: CaptureConfig = {
    mouse_precision: 'clicks_scroll_drag',
    capture_console: true,
    capture_network: true,
    keyboard_capture_mode: 'shortcuts',
    capture_input_values: true,
    // t171 SEC-003: body 采集默认关闭（隐私），UI/MCP 显式 opt-in 开启
    capture_request_body: false,
    capture_response_body: false,
    max_body_capture_bytes: MAX_BODY_CAPTURE_BYTES,
    inline_text_max_bytes: INLINE_TEXT_MAX_BYTES,
    redact_sensitive_headers: true,
    redact_url_query: true,
    redact_data: true,
    sample_rate_ms: 50
};

export const DEFAULT_USER_CONFIG = {
    mouse_precision: 'clicks_scroll_drag' as const,
    keyboard_capture_mode: 'none' as const,
    capture_input_values: true,
    // t171 SEC-003: body 采集默认关闭（隐私），UI/MCP 显式 opt-in 开启
    capture_request_body: false,
    capture_response_body: false,
    max_body_capture_bytes: MAX_BODY_CAPTURE_BYTES,
    inline_text_max_bytes: INLINE_TEXT_MAX_BYTES,
    redact_data: true,
    theme: 'follow-system' as const,
    locale: 'en' as const,
    system_time_timezone: 'browser' as const,
    detail_time_display_mode: 'system' as const,
    export_capture_directory: '',
    export_log_directory: '',
    export_filename_template: 'capture_{date}.{ext}',
    export_save_as: true,
    agent_bridge_enabled: true,
    agent_bridge_url: 'http://127.0.0.1:17831',
    agent_bridge_token: '',
    agent_bridge_poll_interval_ms: 1000,
    browser_label: '',
    log_level: 'info' as const,
    log_max_size_mb: 100,
};

// t179: Agent 数据源与导出格式公开枚举——Bridge/dispatcher 实际接受的唯一来源，
// MCP Zod schema 由共享常量派生避免漂移（BC-005 / BM-L002）。
// 数据源值引用 STORE_NAMES（单一事实来源），新增 store 不更新枚举即编译/运行时双暴露。
export const AGENT_DATA_SOURCES = [
    STORE_NAMES.USER_ACTION_EVENTS,
    STORE_NAMES.NAVIGATION_EVENTS,
    STORE_NAMES.NETWORK_REQUESTS,
    STORE_NAMES.CONSOLE_EVENTS,
    STORE_NAMES.ERROR_EVENTS,
    STORE_NAMES.STORAGE_CHANGES,
    STORE_NAMES.COOKIE_CHANGES,
] as const;

export const EXPORT_FORMATS = ['json', 'jsonl', 'html', 'har'] as const;
