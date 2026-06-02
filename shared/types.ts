// shared/types.ts
export interface Session {
    id: string;
    start_time: number;           // epoch ms
    end_time: number | null;
    config: RecordConfig;
    stats: {
        event_count: number;
        request_count: number;
        log_count: number;
        dom_changes: number;
    };
}

export interface RecordConfig {
    capture_mode: 'basic' | 'advanced';
    mouse_precision: 'clicks' | 'clicks_scroll_drag' | 'full_trajectory';
    capture_console: boolean;
    capture_network: boolean;
    keyboard_capture_mode: 'none' | 'shortcuts' | 'all';
    capture_input_values: boolean;
    capture_request_body: boolean;
    capture_response_body: boolean;
    redact_sensitive_headers: boolean;
    redact_url_query: boolean;
    sample_rate_ms: number;
}

export interface RecordEvent {
    session_id: string;
    relative_time: number;       // ms from session start
    absolute_time: number;       // epoch ms
    type: 'mouse' | 'keyboard' | 'scroll' | 'dom_change' | 'navigation' | 'page_load' | 'tab_switch';
    data: MouseEventData | KeyboardEventData | ScrollEventData | DomChangeData | NavigationData | PageLoadData | TabSwitchData;
    tab_id: number;
    frame_id: number;            // 0 = main frame
    url: string;
}

export interface MouseEventData {
    action: 'click' | 'dblclick' | 'contextmenu' | 'mousemove' | 'mousedown' | 'mouseup' | 'wheel' | 'dragstart' | 'dragend';
    x: number;
    y: number;
    button: number;
    target_selector: string;
    target_tag: string;
    target_text: string;          // truncated to 100 chars
}

export interface KeyboardEventData {
    action: 'keydown' | 'keyup';
    key: string;
    code: string;
    target_selector: string;
    modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean };
}

export interface ScrollEventData {
    scroll_x: number;
    scroll_y: number;
    scroll_height: number;
    scroll_width: number;
}

export interface DomChangeData {
    action: 'input' | 'change' | 'focus' | 'blur';
    target_selector: string;
    target_tag: string;
    value: string;               // '[DISABLED]' when capture_input_values=false
}

export interface NavigationData {
    from: string;
    to: string;
}

export interface PageLoadData {
    load_time_ms: number;
    dom_content_loaded_ms: number;
}

export interface TabSwitchData {
    action: 'activate' | 'deactivate';
    tab_title: string;
}

export type BodyCaptureStatus = 'not_enabled' | 'captured' | 'failed' | 'too_large' | 'unsupported';

export interface NetworkRequest {
    session_id: string;
    relative_time: number;
    absolute_time: number;
    tab_id: number;
    method: string;
    url: string;                   // redacted
    status_code: number;
    request_headers: Record<string, string>;
    response_headers: Record<string, string>;
    request_body: string | null;               // max 10KB
    request_body_status: BodyCaptureStatus;
    response_body: string | null;              // max 50KB
    response_body_status: BodyCaptureStatus;
    duration_ms: number;
    resource_type: string;
}

export interface ConsoleLog {
    session_id: string;
    relative_time: number;
    absolute_time: number;
    tab_id: number;
    level: 'log' | 'warn' | 'error' | 'info' | 'debug';
    args: string[];               // each max 1KB
    stack_trace: string | null;
    url: string;
    line: number;
    column: number;
}

export interface ErrorLog {
    session_id: string;
    relative_time: number;
    absolute_time: number;
    message: string;
    stack_trace: string | null;
    source: 'service_worker' | 'content_script' | 'devtools_panel';
}
