// background/network_context.ts
// Shared context object passed to sub-modules so they can access
// capture state without tight coupling to the main module.

import type { CaptureEvent, NetworkRequestData, BodyCaptureStatus } from '../../shared/types';
import { DEFAULT_CONFIG } from '../../shared/constants';

// ─── Config ───

export interface NetworkCaptureConfig {
    redact_sensitive_headers: boolean;
    redact_url_query: boolean;
    redact_data: boolean;
    capture_request_body: boolean;
    capture_response_body: boolean;
    max_body_capture_bytes: number;
    inline_text_max_bytes: number;
}

export interface NetworkEventPayload {
    event: CaptureEvent;
    data: NetworkRequestData | import('../../shared/types').WsFrameData;
}

// ─── State interfaces ───

export interface PendingRequest {
    cdp_request_id: string;
    tab_id: number;
    method: string;
    url: string;
    timestamp: number;
    request_headers: Record<string, string>;
    response_headers: Record<string, string>;
    request_body: string | null;
    request_body_status: BodyCaptureStatus;
    resource_type: string;
    mime_type: string | null;
}

export interface CdpRequestMeta {
    url: string;
    method: string;
    status_code: number;
    resource_type: string;
    response_headers: Record<string, string>;
    request_headers: Record<string, string>;
    timestamp: number;
    request_body: string | null;
    request_body_status: BodyCaptureStatus;
    request_body_mime: string | null;
    mime_type: string | null;
    response_body?: string | null;
    response_body_status?: BodyCaptureStatus;
    stream_mode?: 'none' | 'sse' | 'chunked';
}

export interface CdpBodyResult {
    body: string | null;
    status: BodyCaptureStatus;
    timestamp: number;
    preview: string | null;
    encoding: 'utf8' | 'base64' | null;
    byte_size: number | null;
}

export interface WsConnectionMeta {
    url: string;
    request_headers: Record<string, string>;
    response_headers: Record<string, string>;
    status_code: number;
    ws_status: 'connecting' | 'open' | 'closed' | 'error';
    created_ts: number;
}

export interface DeferredEntry {
    pending: PendingRequest;
    details: any;
    timer: ReturnType<typeof setTimeout>;
    pending_cdp_ids: Set<string>;
}

// ─── Context object ───

export class NetworkCaptureContext {
    is_capturing = false;
    capture_id = '';
    start_time = 0;
    current_tab_id = 0;
    send_to_background: (payload: NetworkEventPayload) => void = () => {};
    config: NetworkCaptureConfig = DEFAULT_CONFIG;

    // Debuggee state
    dbg_tab_id: number | null = null;
    dbg_attached_externally = false;

    // Maps
    pending_requests: Map<string, PendingRequest> = new Map();
    cdp_request_meta: Map<string, CdpRequestMeta> = new Map();
    cdp_body_results: Map<string, CdpBodyResult> = new Map();
    cdp_primary_emitted: Set<string> = new Set();
    ws_connections: Map<string, WsConnectionMeta> = new Map();
    streaming_requests: Set<string> = new Set();
    finished_before_stream: Set<string> = new Set();
    deferred_web_requests: Map<string, DeferredEntry> = new Map();
    deferred_cdp_index: Map<string, Set<string>> = new Map();

    // Stream buffer
    stream_buffer_instance: ReturnType<typeof import('./stream_buffer').create_stream_buffer> | null = null;

    // Callback for external consumers
    on_cdp_body_event: ((event: import('./network_correlator').CdpBodyEvent) => void) | null = null;

    reset(): void {
        // 先取消所有 deferred timer，避免 reset 后回调仍执行发送过期事件
        for (const entry of this.deferred_web_requests.values()) {
            clearTimeout(entry.timer);
        }
        this.pending_requests.clear();
        this.cdp_request_meta.clear();
        this.cdp_body_results.clear();
        this.cdp_primary_emitted.clear();
        this.ws_connections.clear();
        this.streaming_requests.clear();
        this.finished_before_stream.clear();
        this.deferred_web_requests.clear();
        this.deferred_cdp_index.clear();
        this.stream_buffer_instance?.flush_all();
        this.stream_buffer_instance = null;
        this.on_cdp_body_event = null;
    }
}
