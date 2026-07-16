import { z } from 'zod';

// Shared schemas
const capture_id_schema = z.string().min(1, 'capture_id is required');
const timeout_ms_schema = z.number().int().positive().optional();
const offset_schema = z.number().int().min(0).optional();
const limit_schema = z.number().int().positive().optional();
const order_schema = z.enum(['asc', 'desc']).optional();
const start_time_schema = z.number().optional();
const end_time_schema = z.number().optional();

const query_range_schema = {
    offset: offset_schema,
    limit: limit_schema,
    start_time: start_time_schema,
    end_time: end_time_schema,
    order: order_schema,
};

// CaptureConfig fields are optional; the dispatcher merges missing fields with
// DEFAULT_CONFIG before starting a capture.
const capture_config_schema = z.object({
    mouse_precision: z.enum(['clicks', 'clicks_scroll_drag', 'full_trajectory']).optional(),
    capture_console: z.boolean().optional(),
    capture_network: z.boolean().optional(),
    keyboard_capture_mode: z.enum(['none', 'shortcuts', 'all']).optional(),
    capture_input_values: z.boolean().optional(),
    capture_request_body: z.boolean().optional(),
    capture_response_body: z.boolean().optional(),
    max_body_capture_bytes: z.number().int().min(0).optional(),
    inline_text_max_bytes: z.number().int().min(0).optional(),
    redact_sensitive_headers: z.boolean().optional(),
    redact_url_query: z.boolean().optional(),
    redact_data: z.boolean().optional(),
    sample_rate_ms: z.number().int().min(0).optional(),
}).strict();

// Per-tool schemas
const get_status_schema = z.object({
    timeout_ms: timeout_ms_schema,
});

const start_recording_schema = z.object({
    capture_id: z.string().min(1).optional(),
    config: capture_config_schema.optional(),
    timeout_ms: timeout_ms_schema,
});

const stop_recording_schema = z.object({
    timeout_ms: timeout_ms_schema,
});

const list_captures_schema = z.object({
    ...query_range_schema,
    timeout_ms: timeout_ms_schema,
});

const get_capture_schema = z.object({
    capture_id: capture_id_schema,
    timeout_ms: timeout_ms_schema,
});

const list_data_sources_schema = z.object({
    capture_id: capture_id_schema,
    timeout_ms: timeout_ms_schema,
});

const list_records_schema = z.object({
    capture_id: capture_id_schema,
    source: z.string().min(1, 'source is required'),
    ...query_range_schema,
    timeout_ms: timeout_ms_schema,
});

const get_record_schema = z.object({
    capture_id: capture_id_schema,
    source: z.string().min(1, 'source is required'),
    record_id: z.string().min(1, 'record_id is required'),
    timeout_ms: timeout_ms_schema,
});

const get_timeline_schema = z.object({
    capture_id: capture_id_schema,
    sources: z.array(z.string()).optional(),
    ...query_range_schema,
    timeout_ms: timeout_ms_schema,
});

const get_timeline_item_schema = z.object({
    capture_id: capture_id_schema,
    item_id: z.string().min(1, 'item_id is required'),
    timeout_ms: timeout_ms_schema,
});

const get_all_capture_data_schema = z.object({
    capture_id: capture_id_schema,
    output_path: z.string().min(1).optional(),
    timeout_ms: timeout_ms_schema,
});

const export_capture_schema = z.object({
    capture_id: capture_id_schema,
    format: z.enum(['json', 'jsonl', 'html', 'har']),
    output_path: z.string().min(1).optional(),
    include_response_body: z.boolean().optional(),
    timeout_ms: timeout_ms_schema,
});

// Map tool name -> schema
// Alias tools (list_sessions, get_session, etc.) share schemas with their primary
export const MCP_TOOL_SCHEMAS: Record<string, z.ZodTypeAny> = {
    get_status: get_status_schema,
    start_recording: start_recording_schema,
    stop_recording: stop_recording_schema,
    list_captures: list_captures_schema,
    get_capture: get_capture_schema,
    list_sessions: list_captures_schema,
    get_session: get_capture_schema,
    list_data_sources: list_data_sources_schema,
    list_records: list_records_schema,
    get_record: get_record_schema,
    get_timeline: get_timeline_schema,
    get_timeline_item: get_timeline_item_schema,
    get_all_capture_data: get_all_capture_data_schema,
    get_all_session_data: get_all_capture_data_schema,
    export_capture: export_capture_schema,
    export_session: export_capture_schema,
};
