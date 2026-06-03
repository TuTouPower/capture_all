// shared/constants.ts
import type { RecordConfig } from './types';

export const DB_NAME = 'record_all_db';
export const DB_VERSION = 1;

export const STORE_NAMES = {
    SESSIONS: 'sessions',
    EVENTS: 'events',
    NETWORK_REQUESTS: 'network_requests',
    CONSOLE_LOGS: 'console_logs',
    ERROR_LOG: 'error_log'
} as const;

export const MAX_SESSION_SIZE_BYTES = 500 * 1024 * 1024; // 500MB
export const MAX_SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_REQUEST_BODY_BYTES = 10 * 1024; // 10KB
export const MAX_RESPONSE_BODY_BYTES = 50 * 1024; // 50KB
export const MAX_CONSOLE_ARG_BYTES = 1024; // 1KB
export const MAX_TARGET_TEXT_CHARS = 100;
export const FLUSH_BATCH_SIZE = 100;
export const FLUSH_INTERVAL_MS = 1000;

export const DEFAULT_CONFIG: RecordConfig = {
    capture_mode: 'basic',
    mouse_precision: 'clicks_scroll_drag',
    capture_console: false,
    capture_network: true,
    keyboard_capture_mode: 'shortcuts',
    capture_input_values: false,
    capture_request_body: false,
    capture_response_body: false,
    redact_sensitive_headers: true,
    redact_url_query: true,
    redact_data: true,
    sample_rate_ms: 50
};

export const DEFAULT_USER_CONFIG = {
    selected_mode: 'basic' as const,
    mouse_precision: 'clicks_scroll_drag' as const,
    keyboard_capture_mode: 'none' as const,
    capture_input_values: false,
    capture_request_body: false,
    capture_response_body: false,
    redact_data: true,
    theme: 'follow-system' as const,
    locale: 'en' as const
};
