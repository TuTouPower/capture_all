// shared/capture_modes.ts
import type { RecordConfig } from './types';

export function get_basic_config(): RecordConfig {
    return {
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
        sample_rate_ms: 100
    };
}

export function get_advanced_config(): RecordConfig {
    return {
        capture_mode: 'advanced',
        mouse_precision: 'full_trajectory',
        capture_console: true,
        capture_network: true,
        keyboard_capture_mode: 'all',
        capture_input_values: true,
        capture_request_body: true,
        capture_response_body: true,
        redact_sensitive_headers: true,
        redact_url_query: true,
        sample_rate_ms: 50
    };
}
