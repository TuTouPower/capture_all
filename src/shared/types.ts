// shared/types.ts

// ============================================================
// Capture Record — replaces Session
// ============================================================

export interface CaptureRecord {
    capture_id: string;
    name: string;
    status: 'capturing' | 'completed';
    mode: 'standard';
    started_at: string;           // ISO string
    ended_at: string | null;
    duration_ms: number;
    start_url: string;
    end_url: string | null;
    tab_id: number;
    window_id: number | null;
    config_snapshot: object;
    stats: CaptureStats;
    tags: string[];
    url?: string;
    tab_title?: string;
    created_at: string;
    updated_at: string;

    body_capture_mode?: BodyCaptureMode;
    body_capture_status?: BodyCaptureRuntimeStatus;
    body_capture_failure_reason?: BodyCaptureFailureReason;
    body_capture_message?: string;
}

export interface CaptureStats {
    event_count: number;
    user_action_count: number;
    nav_count: number;
    request_count: number;
    log_count: number;
    error_count: number;
    storage_change_count: number;
    cookie_change_count: number;
}

// ============================================================
// Capture Event base — replaces RecordEvent
// ============================================================

export interface CaptureEvent {
    event_id: string;
    capture_id: string;
    category: CategoryKey;
    type: EventType;
    relative_time_ms: number;
    absolute_time: string;         // ISO string
    tab_id: number;
    frame_id: number;
    url: string;
    top_frame_url: string | null;
    page_title: string | null;
    source: 'content_script' | 'background';
    severity: 'info' | 'warning' | 'error' | 'fatal';
    related_event_ids: string[];
    redaction_status: 'none' | 'redacted';
    raw_available: boolean;
    created_at: string;
    data?: unknown;
}

// ============================================================
// Category + EventType
// ============================================================

export type CategoryKey =
    | 'user_action'
    | 'navigation'
    | 'network'
    | 'console'
    | 'error'
    | 'storage'
    | 'cookie'
    | 'dom_data'
    | 'capture_lifecycle';

export type EventType =
    // user_action
    | 'mouse_event'
    | 'keyboard_event'
    | 'scroll_event'
    | 'input_event'
    // navigation
    | 'page_navigation'
    | 'route_change'
    | 'page_load'
    | 'tab_switch'
    | 'tab_created'
    | 'tab_url_change'
    | 'dom_ready'
    // network
    | 'network_request'
    // console
    | 'console_event'
    // error
    | 'runtime_exception'
    | 'unhandled_rejection'
    | 'resource_error'
    | 'network_failed'
    | 'capture_error'
    // storage
    | 'storage_change'
    // cookie
    | 'cookie_change'
    // dom_data
    | 'dom_mutation'
    // capture_lifecycle
    | 'capture_started'
    | 'capture_stopped'
    | 'capture_config_changed'
    | 'permission_missing'
    | 'debugger_attach_status'
    | 'body_capture_status_changed';

export type EventSource = 'content_script' | 'background';
export type Severity = 'info' | 'warning' | 'error' | 'fatal';
export type RedactionStatus = 'none' | 'redacted';

// ============================================================
// user_action event data
// ============================================================

export interface MouseEventData {
    action: 'click' | 'dblclick' | 'contextmenu' | 'mousemove' | 'mousedown' | 'mouseup' | 'wheel' | 'dragstart' | 'dragend';
    x: number;
    y: number;
    button: number | null;
    target_selector: string | null;
    target_xpath: string | null;
    target_tag: string | null;
    target_text_preview: string | null;
    target_role: string | null;
    target_label: string | null;
    target_rect: { x: number; y: number; width: number; height: number } | null;
    is_trusted: boolean | null;
}

export interface KeyboardEventData {
    action: 'keydown' | 'keyup';
    key: string | null;
    code: string | null;
    key_status: 'captured' | 'masked';
    modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean };
    target_selector: string | null;
    target_xpath: string | null;
    target_tag: string | null;
    target_input_type: string | null;
}

export interface ScrollEventData {
    scroll_x: number;
    scroll_y: number;
    scroll_height: number;
    scroll_width: number;
    viewport_height: number | null;
    viewport_width: number | null;
    target_selector: string | null;
    target_xpath: string | null;
    is_document_scroll: boolean;
}

export interface InputEventData {
    action: 'input' | 'change' | 'focus' | 'blur';
    target_selector: string | null;
    target_xpath: string | null;
    target_tag: string | null;
    target_input_type: string | null;
    field_name: string | null;
    field_label: string | null;
    value_status: 'not_captured' | 'captured' | 'redacted';
    value_preview: string | null;
    value_length: number | null;
    checked: boolean | null;
    selected_count: number | null;
}

// ============================================================
// navigation event data
// ============================================================

export interface PageNavigationData {
    from_url: string | null;
    to_url: string;
    navigation_type: 'link' | 'typed' | 'form_submit' | 'script' | 'meta' | 'other';
    transition_type: string | null;
    title: string | null;
    referrer: string | null;
    is_main_frame: boolean;
}

export interface RouteChangeData {
    from_url: string;
    to_url: string;
    route_action: 'push_state' | 'replace_state' | 'hash_change';
    from_path: string | null;
    to_path: string | null;
    title: string | null;
    is_spa: boolean;
}

export interface PageLoadData {
    url: string;
    title: string | null;
    load_event_time_ms: number | null;
    dom_content_loaded_time_ms: number | null;
    navigation_start_time: string | null;
}

export interface DomReadyData {
    url: string;
    title: string | null;
    ready_state: 'loading' | 'interactive' | 'complete';
}

export interface TabSwitchData {
    from_tab_id: number | null;
    to_tab_id: number;
    from_url: string | null;
    to_url: string | null;
}

export interface TabCreatedData {
    new_tab_id: number;
    opener_tab_id: number | null;
    url: string | null;
}

export interface TabUrlChangeData {
    from_url: string | null;
    to_url: string;
    change_reason: string | null;
}

// ============================================================
// network event data
// ============================================================

export interface NetworkRequestData {
    capture_id?: string;
    event_id?: string;
    request_id: string;
    method: string;
    url: string;
    url_status: 'captured' | 'redacted';
    status_code: number | null;
    status_text: string | null;
    protocol: string | null;
    resource_type: 'fetch' | 'xhr' | 'document' | 'script' | 'stylesheet' | 'image' | 'font' | 'media' | 'websocket' | 'ping' | 'other';
    initiator: string | null;
    duration_ms: number | null;
    start_time_ms: number | null;
    end_time_ms: number | null;
    request_headers: Record<string, string> | null;
    response_headers: Record<string, string> | null;
    headers_status: 'captured' | 'redacted';
    request_body: string | null;
    request_body_status: BodyCaptureStatus;
    response_body: string | null;
    response_preview: string | null;
    response_body_status: BodyCaptureStatus;
    mime_type: string | null;
    request_size_bytes: number | null;
    response_size_bytes: number | null;
    transfer_size_bytes: number | null;
    from_cache: boolean | null;
    cache_status: 'memory_cache' | 'disk_cache' | 'none' | null;
    error_text: string | null;
    capture_method: 'web_request' | 'cdp_primary' | 'extension_cdp' | 'external_cdp_bridge' | 'fallback_hook';
    body_capture_mode: BodyCaptureMode;
    session_id?: string;
    tab_id?: number;
    relative_time?: number;
    absolute_time?: number;
    correlation_status?: NetworkCorrelationStatus;
    cdp_request_id?: string;
}

// ============================================================
// console event data
// ============================================================

export interface ConsoleEventData {
    capture_id?: string;
    event_id?: string;
    level: 'log' | 'warn' | 'info' | 'debug' | 'error';
    args_preview: string[];
    args_status: 'captured' | 'redacted';
    stack_trace: string | null;
    source_url: string | null;
    line: number | null;
    column: number | null;
    repeat_count: number | null;
    related_network_request_id: string | null;
}

// ============================================================
// error event data
// ============================================================

export interface RuntimeExceptionData {
    capture_id?: string;
    event_id?: string;
    message: string;
    error_name: string | null;
    stack_trace: string | null;
    source_url: string | null;
    line: number | null;
    column: number | null;
    exception_id: string | null;
    severity: 'error' | 'fatal';
    related_event_ids: string[];
}

export interface UnhandledRejectionData {
    message: string;
    reason_preview: string | null;
    stack_trace: string | null;
    source_url: string | null;
    line: number | null;
    column: number | null;
    severity: 'warning' | 'error';
}

export interface ResourceErrorData {
    resource_url: string;
    resource_type: 'script' | 'stylesheet' | 'image' | 'font' | 'media' | 'other';
    message: string | null;
    element_selector: string | null;
    status_code: number | null;
}

export interface NetworkFailedData {
    request_id: string;
    method: string;
    url: string;
    status_code: number | null;
    error_text: string | null;
    duration_ms: number | null;
    failure_type: 'http_error' | 'network_error';
}

export interface CaptureErrorData {
    module: string;
    message: string;
    reason: string | null;
    recoverable: boolean;
    fallback_used: boolean;
}

// ============================================================
// storage event data
// ============================================================

export interface StorageChangeData {
    capture_id?: string;
    event_id?: string;
    storage_type: 'local' | 'session';
    action: 'set' | 'remove' | 'clear';
    key: string | null;
    old_value_length: number | null;
    new_value_length: number | null;
    value_status: 'not_captured' | 'captured';
    value_preview: string | null;
    origin: string | null;
    source_stack: string | null;
}

// ============================================================
// cookie event data
// ============================================================

export interface CookieChangeData {
    capture_id?: string;
    event_id?: string;
    name: string;
    domain: string;
    path: string;
    cause: 'explicit' | 'expired' | 'evicted' | 'expired_overwrite' | 'overwrite' | 'unknown';
    removed: boolean;
    secure: boolean | null;
    http_only: boolean | null;
    same_site: 'unspecified' | 'no_restriction' | 'lax' | 'strict' | null;
    expiration_date: number | null;
    store_id: string | null;
    value_status: 'not_captured' | 'captured';
    value_length: number | null;
    value_preview: string | null;
}

// ============================================================
// capture_lifecycle event data
// ============================================================

export interface CaptureStartedData {
    capture_id: string;
    mode: 'standard';
    config_snapshot: object;
    start_url: string;
    trigger: 'popup' | 'main_panel' | 'shortcut';
}

export interface CaptureStoppedData {
    capture_id: string;
    reason: 'user_stop' | 'max_duration' | 'error';
    duration_ms: number;
    stats: object;
}

export interface CaptureConfigChangedData {
    changed_by: 'user' | 'system';
    field: string;
    old_value: unknown;
    new_value: unknown;
}

export interface PermissionMissingData {
    permission: string;
    module: string;
    impact: string;
    recoverable: boolean;
}

export interface DebuggerAttachStatusData {
    status: 'attached' | 'detached';
    reason: string | null;
    fallback_used: boolean;
    affected_modules: string[];
}

export interface BodyCaptureStatusChangedData {
    body_capture_mode: BodyCaptureMode;
    status: 'enabled' | 'disabled';
    reason: string | null;
}

// ============================================================
// Body capture types (preserved, slightly adjusted)
// ============================================================

export type BodyCaptureStatus =
    | 'not_enabled'
    | 'captured'
    | 'failed'
    | 'too_large'
    | 'unsupported'
    | 'unsupported_binary'
    | 'opaque_response'
    | 'cdp_failed'
    | 'fallback_unavailable'
    | 'target_not_matched'
    | 'permission_denied'
    | 'partial'
    | 'redacted';

export type BodyCaptureMode = 'none' | 'extension_cdp' | 'external_cdp_bridge' | 'fallback_hook';

export type BodyCaptureRuntimeStatus = 'not_enabled' | 'active' | 'partial' | 'failed';

export type BodyCaptureFailureReason =
    | 'another_debugger_attached'
    | 'bridge_unavailable'
    | 'cdp_port_not_found'
    | 'cdp_target_not_found'
    | 'cdp_attach_failed'
    | 'cdp_body_failed'
    | 'permission_denied'
    | 'restricted_url'
    | 'unknown';

export type NetworkCorrelationStatus = 'matched' | 'ambiguous' | 'cdp_only' | 'web_request_only' | 'fallback_hook';

export interface BodyCaptureStartResult {
    mode: BodyCaptureMode;
    status: BodyCaptureRuntimeStatus;
    failure_reason?: BodyCaptureFailureReason;
    message?: string;
}

// ============================================================
// Config types (preserved, not renamed)
// ============================================================

export interface RecordConfig {
    mouse_precision: 'clicks' | 'clicks_scroll_drag' | 'full_trajectory';
    capture_console: boolean;
    capture_network: boolean;
    keyboard_capture_mode: 'none' | 'shortcuts' | 'all';
    capture_input_values: boolean;
    capture_request_body: boolean;
    capture_response_body: boolean;
    redact_sensitive_headers: boolean;
    redact_url_query: boolean;
    redact_data: boolean;
    sample_rate_ms: number;
}

export type ThemeMode = 'follow-system' | 'light' | 'dark';
export type SystemTimeTimezone = 'browser' | 'UTC' | 'UTC+1' | 'UTC+2' | 'UTC+3' | 'UTC+4' | 'UTC+5' | 'UTC+6' | 'UTC+7' | 'UTC+8' | 'UTC+9' | 'UTC+10' | 'UTC+11' | 'UTC+12' | 'UTC-1' | 'UTC-2' | 'UTC-3' | 'UTC-4' | 'UTC-5' | 'UTC-6' | 'UTC-7' | 'UTC-8' | 'UTC-9' | 'UTC-10' | 'UTC-11' | 'UTC-12';
export type DetailTimeDisplayMode = 'relative' | 'system';

export interface UserConfig {
    mouse_precision: 'clicks' | 'clicks_scroll_drag' | 'full_trajectory';
    keyboard_capture_mode: 'none' | 'shortcuts' | 'all';
    capture_input_values: boolean;
    capture_request_body: boolean;
    capture_response_body: boolean;
    redact_data: boolean;
    theme: ThemeMode;
    locale: string;
    system_time_timezone: SystemTimeTimezone;
    detail_time_display_mode: DetailTimeDisplayMode;
    export_capture_directory: string;
    export_log_directory: string;
    export_filename_template: string;
    export_save_as: boolean;
    agent_bridge_enabled: boolean;
    agent_bridge_url: string;
    agent_bridge_token: string;
    agent_bridge_poll_interval_ms: number;
    log_level: LogLevel;
    log_max_entries: number;
}

// ============================================================
// Logging system types
// ============================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface AppLogEntry {
    id: string;
    timestamp: number;
    level: LogLevel;
    module: string;
    message: string;
    details?: unknown;
    stack?: string;
}

export interface LogQueryFilter {
    level?: LogLevel;
    module?: string;
    since?: number;
    until?: number;
}

// ============================================================
// Backward-compatible aliases (temporary, remove after Phase 2)
// ============================================================

/** @deprecated Use CaptureRecord */
export type Session = CaptureRecord;
/** @deprecated Use CaptureEvent */
export type RecordEvent = CaptureEvent;
/** @deprecated Use ConsoleEventData */
export type ConsoleLog = ConsoleEventData;
/** @deprecated Use NetworkRequestData */
export type NetworkRequest = NetworkRequestData;
/** @deprecated Use RuntimeExceptionData */
export type ErrorLog = RuntimeExceptionData;
