// shared/constants.ts
import type { RecordConfig } from './types';

export const DB_NAME = 'capture_all_db';
export const DB_VERSION = 3;

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
export const INLINE_TEXT_MAX_BYTES = 32 * 1024; // 32KB
export const MAX_CONSOLE_ARG_BYTES = 1024; // 1KB
export const MAX_TARGET_TEXT_CHARS = 100;
export const FLUSH_BATCH_SIZE = 100;
export const FLUSH_INTERVAL_MS = 1000;

export const DEFAULT_CONFIG: RecordConfig = {
    mouse_precision: 'clicks_scroll_drag',
    capture_console: true,
    capture_network: true,
    keyboard_capture_mode: 'shortcuts',
    capture_input_values: true,
    capture_request_body: true,
    capture_response_body: true,
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
    capture_request_body: true,
    capture_response_body: true,
    max_body_capture_bytes: MAX_BODY_CAPTURE_BYTES,
    inline_text_max_bytes: INLINE_TEXT_MAX_BYTES,
    redact_data: true,
    theme: 'follow-system' as const,
    locale: 'en' as const,
    system_time_timezone: 'browser' as const,
    detail_time_display_mode: 'system' as const,
    export_capture_directory: '',
    export_log_directory: '',
    export_filename_template: 'capture_all_{capture_id}_{date}.{ext}',
    export_save_as: true,
    agent_bridge_enabled: false,
    agent_bridge_url: 'http://127.0.0.1:17831',
    agent_bridge_token: '',
    agent_bridge_poll_interval_ms: 1000,
    log_level: 'debug' as const,
    log_max_entries: 10000,
};
