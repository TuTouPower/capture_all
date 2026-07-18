// background/cdp_handler.ts
// CDP (Chrome DevTools Protocol) event handling for network capture.
// Handles: requestWillBeSent, responseReceived, dataReceived, loadingFinished, loadingFailed
// Manages sub-target lifecycle (attachedToTarget, detachedFromTarget)

import type { CaptureEvent, NetworkRequestData, BodyCaptureStatus, WsFrameData } from '../../shared/types';
import { create_base_event } from '../../shared/event_utils';
import { redact_headers, redact_url, truncate_request_body, truncate_response_body } from '../../shared/redaction';
import type { CdpBodyEvent } from './network_correlator';
import { should_handle_event, register_session, unregister_session } from './cdp_event_router';
import { create_stream_buffer } from './stream_buffer';
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from './app_log_storage';
import { resolve_resource_type, extract_mime_type } from './network_webrequest';
import { build_network_event } from './webrequest_handler';

const logger = new Logger('background/cdp', get_app_log_transport());

export interface CdpHandlerState {
    is_capturing: boolean;
    capture_id: string;
    start_time: number;
    current_tab_id: number;
    config: NetworkCaptureConfig;
    dbg_tab_id: number | null;
    dbg_attached_externally: boolean;
    pending_requests: Map<string, PendingRequest>;
    cdp_request_meta: Map<string, CdpRequestMeta>;
    cdp_body_results: Map<string, CdpBodyResult>;
    cdp_primary_emitted: Set<string>;
    ws_connections: Map<string, WsConnectionMeta>;
    streaming_requests: Set<string>;
    finished_before_stream: Set<string>;
    stream_buffer_instance: ReturnType<typeof create_stream_buffer> | null;
    deferred_web_requests: Map<string, DeferredEntry>;
    _deferred_cdp_index: Map<string, Set<string>>;
    on_cdp_body_event: ((event: CdpBodyEvent) => void) | null;
    send_to_background: (payload: NetworkEventPayload) => void;
}

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
    data: NetworkRequestData | WsFrameData;
}

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

export function handle_cdp_event(source: { tabId?: number; sessionId?: string }, method: string, params: any, state: CdpHandlerState): void {
    if (!state.is_capturing || state.dbg_tab_id === null) return;
    if (!should_handle_event(source, state.dbg_tab_id)) return;

    // ── Sub-target lifecycle ──
    if (method === 'Target.attachedToTarget') {
        handle_sub_target_attached(params, state);
        return;
    }

    if (method === 'Target.detachedFromTarget') {
        handle_sub_target_detached(params);
        return;
    }

    const req_id: string = params?.requestId;
    if (!req_id) return;

    if (method === 'Network.requestWillBeSent') {
        handle_request_will_be_sent(req_id, params, state);
    }

    if (method === 'Network.responseReceived') {
        handle_response_received(req_id, params, state);
    }

    if (method === 'Network.dataReceived') {
        handle_data_received(req_id, params, state);
    }

    if (method === 'Network.loadingFinished') {
        handle_loading_finished(req_id, params, state);
    }

    if (method === 'Network.loadingFailed') {
        handle_loading_failed(req_id, params, state);
    }

    // ── WebSocket events ──
    if (method === 'Network.webSocketCreated') {
        handle_ws_created(req_id, params, state);
    }

    if (method === 'Network.webSocketWillSendHandshakeRequest') {
        handle_ws_handshake_request(req_id, params, state);
    }

    if (method === 'Network.webSocketHandshakeResponseReceived') {
        handle_ws_handshake_response(req_id, params, state);
    }

    if (method === 'Network.webSocketFrameSent') {
        send_ws_frame(req_id, 'sent', params, state);
    }

    if (method === 'Network.webSocketFrameReceived') {
        send_ws_frame(req_id, 'received', params, state);
    }

    if (method === 'Network.webSocketFrameError') {
        handle_ws_frame_error(req_id, params, state);
    }

    if (method === 'Network.webSocketClosed') {
        handle_ws_closed(req_id, state);
    }
}

function handle_sub_target_attached(params: any, state: CdpHandlerState): void {
    const child_session = params?.sessionId;
    if (child_session) {
        register_session(child_session);
        const child_target = { tabId: state.dbg_tab_id!, sessionId: child_session };
        chrome.dbg.sendCommand(
            child_target,
            'Network.enable',
            {
                maxResourceBufferSize: 100 * 1024 * 1024,
                maxTotalBufferSize: 500 * 1024 * 1024,
                reportResourceContent: true,
            }
        ).catch((err: any) => {
            logger.debug('sub_target_network_enable_failed', { sessionId: child_session, error: String(err).slice(0, 80) });
        });
        chrome.dbg.sendCommand(
            child_target,
            'Runtime.runIfWaitingForDebugger'
        ).catch(() => { /* best-effort */ });
        logger.debug('sub_target_attached', { sessionId: child_session });
    }
}

function handle_sub_target_detached(params: any): void {
    const child_session = params?.sessionId;
    if (child_session) {
        unregister_session(child_session);
        logger.debug('sub_target_detached', { sessionId: child_session });
    }
}

function handle_request_will_be_sent(req_id: string, params: any, state: CdpHandlerState): void {
    const request = params?.request;
    if (request) {
        // BUG-005: 排除扩展自身 origin 与本地 Bridge URL，避免 /log 等端点
        // 进入 CDP body 采集后产生 cdp_failed。
        if (is_self_origin_url(request.url || '')) return;

        // CDP-first: extract request body from postData
        let req_body: string | null = null;
        let req_body_status: BodyCaptureStatus = 'not_enabled';
        if (state.config.capture_request_body && request.postData) {
            const byte_len = new TextEncoder().encode(request.postData).length;
            if (byte_len > state.config.max_body_capture_bytes) {
                req_body = truncate_request_body(request.postData, state.config.max_body_capture_bytes);
                req_body_status = 'too_large';
            } else {
                req_body = request.postData;
                req_body_status = 'captured';
            }
        }

        const req_headers = (request.headers || {}) as Record<string, string>;
        const request_body_mime = (req_headers['content-type'] || req_headers['Content-Type']) ?? null;

        state.cdp_request_meta.set(req_id, {
            url: request.url || '',
            method: request.method || 'GET',
            status_code: 0,
            resource_type: resolve_resource_type(params?.type || 'other'),
            response_headers: {},
            request_headers: headers_map_from_cdp(request.headers || {}),
            timestamp: Date.now(),
            request_body: req_body,
            request_body_status: req_body_status,
            request_body_mime,
            mime_type: null,
        });
    }
}

function handle_response_received(req_id: string, params: any, state: CdpHandlerState): void {
    const response = params?.response;
    const existing = state.cdp_request_meta.get(req_id);
    const resp_headers = headers_map_from_cdp(response?.headers || {});
    const mime = extract_mime_type(resp_headers);
    if (existing) {
        existing.status_code = response?.status || 0;
        existing.response_headers = resp_headers;
        existing.mime_type = mime;
    } else {
        state.cdp_request_meta.set(req_id, {
            url: response?.url || '',
            method: '',
            status_code: response?.status || 0,
            resource_type: resolve_resource_type(params?.type || 'other'),
            response_headers: resp_headers,
            request_headers: {},
            timestamp: Date.now(),
            request_body: null,
            request_body_status: 'not_enabled',
            request_body_mime: null,
            mime_type: mime,
        });
    }

    if (is_streaming_response(resp_headers) && state.dbg_tab_id !== null) {
        state.streaming_requests.add(req_id);
        if (existing) {
            existing.stream_mode = mime?.includes('event-stream') ? 'sse' : 'chunked';
        }
        if (state.finished_before_stream.delete(req_id)) {
            // loadingFinished already fired — skip streamResourceContent, mark partial
            logger.debug('stream_skipped_already_finished', { req_id });
            if (existing) {
                existing.response_body_status = 'partial';
            }
        } else {
            chrome.dbg.sendCommand(
                { tabId: state.dbg_tab_id },
                'Network.streamResourceContent',
                { requestId: req_id }
            ).then((result: any) => {
                if (result?.bufferedData) {
                    state.stream_buffer_instance?.append(req_id, result.bufferedData);
                }
                logger.debug('stream_started', { req_id, mime });
            }).catch((err: any) => {
                logger.debug('streamResourceContent_failed', { req_id, error: String(err).slice(0, 80) });
                const meta = state.cdp_request_meta.get(req_id);
                if (meta) {
                    meta.response_body_status = 'partial';
                }
            });
        }
    }
}

function handle_data_received(req_id: string, params: any, state: CdpHandlerState): void {
    if (state.streaming_requests.has(req_id)) {
        const chunk = params?.data;
        if (chunk && state.stream_buffer_instance) {
            state.stream_buffer_instance.append(req_id, chunk);
        }
    }
}

function handle_loading_finished(req_id: string, _params: any, state: CdpHandlerState): void {
    if (state.dbg_tab_id === null) return;
    state.finished_before_stream.add(req_id);
    const meta_for_method = state.cdp_request_meta.get(req_id);
    const http_method = meta_for_method?.method?.toUpperCase() || '';

    if (state.streaming_requests.has(req_id)) {
        state.stream_buffer_instance?.force_flush(req_id);
        state.streaming_requests.delete(req_id);
        const meta = state.cdp_request_meta.get(req_id);
        if (meta) {
            const body = meta.response_body || null;
            const byte_size = body ? new TextEncoder().encode(body).length : 0;
            const is_partial = meta.response_body_status === 'partial';
            const body_result: CdpBodyResult = {
                body,
                status: is_partial ? 'partial' : (byte_size > state.config.max_body_capture_bytes ? 'too_large' : 'captured'),
                timestamp: Date.now(),
                preview: body?.slice(0, 200) ?? null,
                encoding: 'utf8',
                byte_size,
            };
            state.cdp_primary_emitted.add(req_id);
            state.send_to_background(build_cdp_primary_network_event(meta, body_result, req_id, state));
            state.cdp_request_meta.delete(req_id);
        }
        return;
    }

    chrome.dbg.sendCommand(
        { tabId: state.dbg_tab_id },
        'Network.getResponseBody',
        { requestId: req_id }
    ).then((result: any) => {
        let body_status: BodyCaptureStatus = 'cdp_failed';
        let body: string | null = null;
        let preview: string | null = null;
        let encoding: 'utf8' | 'base64' | null = null;
        let byte_size: number | null = null;

        if (!result || typeof result.body !== 'string') {
            // OPTIONS/HEAD typically have no body — not an error
            body_status = (http_method === 'OPTIONS' || http_method === 'HEAD')
                ? 'not_enabled' : 'cdp_failed';
            logger.debug('get_body_failed', { req_id, reason: 'no_body_in_result', method: http_method });
        } else if (result.base64Encoded) {
            byte_size = base64_decoded_size(result.body);
            encoding = 'base64';
            if (byte_size > state.config.max_body_capture_bytes) {
                body_status = 'too_large';
            } else {
                body = result.body;
                body_status = 'captured';
            }
        } else {
            byte_size = new TextEncoder().encode(result.body).length;
            encoding = 'utf8';
            const body_result = build_cdp_body_result(result.body, state.config.max_body_capture_bytes);
            body = body_result.body;
            preview = body_result.preview;
            body_status = body_result.status;
        }

        const body_result: CdpBodyResult = { body, status: body_status, timestamp: Date.now(), preview, encoding, byte_size };
        state.cdp_body_results.set(req_id, body_result);

        // CDP-first: if we have metadata, build and emit the complete entry directly
        const meta = state.cdp_request_meta.get(req_id);
        if (meta) {
            state.cdp_primary_emitted.add(req_id);
            state.send_to_background(build_cdp_primary_network_event(meta, body_result, req_id, state));
            logger.debug('cdp_primary_emitted', {
                url: meta.url?.slice(0, 120),
                method: meta.method,
                body_status,
                body_len: body?.length ?? 0,
            });
            // Clean up — no need for orphan check since we already emitted
            state.cdp_request_meta.delete(req_id);
            state.cdp_body_results.delete(req_id);
            return;
        }

        // No metadata yet — fall back to deferred/orphan resolution
        try_resolve_deferred(req_id, state);
        schedule_orphan_check(req_id, state);
    }).catch((err: any) => {
        // -32000 = "No resource with given identifier" (resource already released)
        // OPTIONS/HEAD have no body by spec
        const err_msg = String(err?.message || err) || '';
        const is_resource_released = err_msg.includes('-32000') || err_msg.includes('No resource');
        const is_no_body_method = http_method === 'OPTIONS' || http_method === 'HEAD';
        const status: BodyCaptureStatus = (is_resource_released || is_no_body_method)
            ? 'not_enabled' : 'cdp_failed';
        const fail_result: CdpBodyResult = { body: null, status, timestamp: Date.now(), preview: null, encoding: null, byte_size: null };
        state.cdp_body_results.set(req_id, fail_result);
        logger.debug('get_body_error', { req_id, error: err_msg.slice(0, 100), status });

        // CDP-first: emit even on failure (status will be cdp_failed)
        const meta = state.cdp_request_meta.get(req_id);
        if (meta) {
            state.cdp_primary_emitted.add(req_id);
            state.send_to_background(build_cdp_primary_network_event(meta, fail_result, req_id, state));
            state.cdp_request_meta.delete(req_id);
            state.cdp_body_results.delete(req_id);
            return;
        }

        try_resolve_deferred(req_id, state);
        schedule_orphan_check(req_id, state);
    });
}

function handle_loading_failed(req_id: string, _params: any, state: CdpHandlerState): void {
    const fail_meta = state.cdp_request_meta.get(req_id);
    const fail_method = fail_meta?.method?.toUpperCase() || '';
    const fail_status: BodyCaptureStatus = (fail_method === 'OPTIONS' || fail_method === 'HEAD')
        ? 'not_enabled' : 'cdp_failed';
    state.cdp_body_results.set(req_id, { body: null, status: fail_status, timestamp: Date.now(), preview: null, encoding: null, byte_size: null });
    try_resolve_deferred(req_id, state);
    schedule_orphan_check(req_id, state);
}

function handle_ws_created(req_id: string, params: any, state: CdpHandlerState): void {
    const ws_url = params?.url || '';
    const conn: WsConnectionMeta = {
        url: ws_url,
        request_headers: {},
        response_headers: {},
        status_code: 0,
        ws_status: 'connecting',
        created_ts: Date.now(),
    };
    state.ws_connections.set(req_id, conn);
    send_ws_connection_event(req_id, conn, 'connecting', state);
}

function handle_ws_handshake_request(req_id: string, params: any, state: CdpHandlerState): void {
    const conn = state.ws_connections.get(req_id);
    if (conn) {
        conn.request_headers = headers_map_from_cdp(params?.request?.headers || {});
    }
}

function handle_ws_handshake_response(req_id: string, params: any, state: CdpHandlerState): void {
    const conn = state.ws_connections.get(req_id);
    if (conn) {
        conn.response_headers = headers_map_from_cdp(params?.response?.headers || {});
        conn.status_code = params?.response?.status || 101;
        conn.ws_status = 'open';
        send_ws_connection_event(req_id, conn, 'open', state);
    }
}

function handle_ws_frame_error(req_id: string, params: any, state: CdpHandlerState): void {
    const frame_data: WsFrameData = {
        ws_connection_id: req_id,
        direction: 'error',
        opcode: null,
        payload: null,
        payload_encoding: null,
        payload_bytes: null,
        payload_status: 'captured',
        mask: null,
        error_message: params?.errorMessage || null,
        url: state.ws_connections.get(req_id)?.url || '',
        tab_id: state.dbg_tab_id ?? undefined,
    };
    const event = create_base_event({
        capture_id: state.capture_id,
        category: 'network',
        type: 'ws_frame',
        relative_time_ms: Date.now() - state.start_time,
        tab_id: state.dbg_tab_id ?? state.current_tab_id,
        url: frame_data.url,
        source: 'background',
        severity: 'warning',
    });
    state.send_to_background({ event, data: frame_data });
}

function handle_ws_closed(req_id: string, state: CdpHandlerState): void {
    const conn = state.ws_connections.get(req_id);
    if (conn) {
        conn.ws_status = 'closed';
        send_ws_connection_event(req_id, conn, 'closed', state);
        state.ws_connections.delete(req_id);
    }
}

function send_ws_connection_event(req_id: string, conn: WsConnectionMeta, ws_status: WsConnectionMeta['ws_status'], state: CdpHandlerState): void {
    const event = create_base_event({
        capture_id: state.capture_id,
        category: 'network',
        type: 'network_request',
        relative_time_ms: Date.now() - state.start_time,
        tab_id: state.dbg_tab_id ?? state.current_tab_id,
        url: conn.url,
        source: 'background',
        severity: 'info',
    });
    const data: NetworkRequestData = {
        capture_id: event.capture_id,
        event_id: event.event_id,
        request_id: req_id,
        method: '',
        url: conn.url,
        url_status: 'captured',
        status_code: conn.status_code || null,
        status_text: null,
        protocol: null,
        resource_type: 'websocket',
        initiator: null,
        duration_ms: null,
        start_time_ms: conn.created_ts,
        end_time_ms: ws_status === 'closed' ? Date.now() : null,
        request_headers: conn.request_headers,
        response_headers: conn.response_headers,
        headers_status: 'captured',
        request_body: null,
        request_body_status: 'not_enabled',
        request_body_encoding: null,
        request_body_bytes: null,
        request_body_mime: null,
        response_body: null,
        response_preview: null,
        response_body_status: 'not_enabled',
        response_body_encoding: null,
        response_body_bytes: null,
        mime_type: null,
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: null,
        cache_status: null,
        error_text: null,
        capture_method: 'cdp_websocket',
        body_capture_mode: 'none',
        ws_connection_id: req_id,
        ws_status,
    };
    state.send_to_background({ event, data });
}

function send_ws_frame(req_id: string, direction: 'sent' | 'received', params: any, state: CdpHandlerState): void {
    const resp = params?.response || {};
    // 仅拦截 undefined（CDP 控制帧不携带 payloadData），保留空字符串（合法 payload）
    const raw_payload = resp.payloadData === undefined ? null : resp.payloadData;
    const is_binary = resp.opcode === 2;
    let payload: string | null = null;
    let payload_encoding: 'utf8' | 'base64' | null = null;
    let payload_status: BodyCaptureStatus = 'captured';
    let payload_bytes: number | null = null;

    if (raw_payload !== null) {
        payload_bytes = is_binary
            ? base64_decoded_size(raw_payload)
            : new TextEncoder().encode(raw_payload).length;
        if (payload_bytes > state.config.max_body_capture_bytes) {
            const max_chars = is_binary
                ? Math.floor(state.config.max_body_capture_bytes * 4 / 3)
                : state.config.max_body_capture_bytes;
            payload = raw_payload.slice(0, max_chars);
            payload_status = 'too_large';
        } else {
            payload = raw_payload;
        }
        payload_encoding = is_binary ? 'base64' : 'utf8';
    }

    const conn = state.ws_connections.get(req_id);
    const frame_data: WsFrameData = {
        ws_connection_id: req_id,
        direction,
        opcode: resp.opcode ?? null,
        payload,
        payload_encoding,
        payload_bytes,
        payload_status,
        mask: resp.mask ?? null,
        error_message: null,
        url: conn?.url || '',
        tab_id: state.dbg_tab_id ?? undefined,
    };
    const event = create_base_event({
        capture_id: state.capture_id,
        category: 'network',
        type: 'ws_frame',
        relative_time_ms: (params?.timestamp ? params.timestamp * 1000 : Date.now()) - state.start_time,
        tab_id: state.dbg_tab_id ?? state.current_tab_id,
        url: frame_data.url,
        source: 'background',
        severity: 'info',
    });
    state.send_to_background({ event, data: frame_data });
}

function build_cdp_primary_network_event(
    meta: CdpRequestMeta,
    body_result: CdpBodyResult,
    cdp_request_id: string,
    state: CdpHandlerState
): NetworkEventPayload {
    const relative_time_ms = meta.timestamp - state.start_time;

    const redact_q = Boolean(state.config.redact_data && state.config.redact_url_query);
    const redact_hdrs = Boolean(state.config.redact_data && state.config.redact_sensitive_headers);
    const { url } = redact_url(meta.url, redact_q);

    const event = create_base_event({
        capture_id: state.capture_id,
        category: 'network',
        type: 'network_request',
        relative_time_ms,
        tab_id: state.dbg_tab_id || state.current_tab_id,
        url,
        source: 'background',
        severity: 'info',
    });

    const req_headers = redact_hdrs ? redact_headers(meta.request_headers, true).headers : meta.request_headers;
    const res_headers = redact_hdrs ? redact_headers(meta.response_headers, true).headers : meta.response_headers;

    const data: NetworkRequestData = {
        capture_id: event.capture_id,
        event_id: event.event_id,
        request_id: cdp_request_id,
        method: meta.method || 'GET',
        url,
        url_status: redact_q ? 'redacted' : 'captured',
        status_code: meta.status_code || null,
        status_text: null,
        protocol: null,
        resource_type: resolve_resource_type(meta.resource_type),
        initiator: null,
        duration_ms: null,
        start_time_ms: null,
        end_time_ms: null,
        request_headers: req_headers,
        response_headers: res_headers,
        headers_status: redact_hdrs ? 'redacted' : 'captured',
        request_body: meta.request_body,
        request_body_status: meta.request_body_status,
        request_body_encoding: meta.request_body ? 'utf8' : null,
        request_body_bytes: meta.request_body ? new TextEncoder().encode(meta.request_body).length : null,
        request_body_mime: meta.request_body_mime ?? null,
        response_body: body_result.body,
        response_preview: body_result.preview,
        response_body_status: body_result.status,
        response_body_encoding: body_result.encoding ?? null,
        response_body_bytes: body_result.byte_size ?? null,
        mime_type: meta.mime_type,
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: null,
        cache_status: null,
        error_text: null,
        capture_method: 'cdp_primary',
        body_capture_mode: 'extension_cdp',
    };

    return { event, data };
}

export function is_streaming_response(headers: Record<string, string>): boolean {
    const ct = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
    if (ct.includes('text/event-stream')) return true;
    return false;
}

export function build_cdp_body_result(body_text: string, max_body_capture_bytes: number): { body: string; status: BodyCaptureStatus; preview: string | null } {
    const byte_len = new TextEncoder().encode(body_text).length;
    if (byte_len > max_body_capture_bytes) {
        const trunc_result = truncate_response_body(body_text, max_body_capture_bytes);
        return { body: trunc_result.body!, status: 'too_large', preview: trunc_result.response_preview };
    }
    return { body: body_text, status: 'captured', preview: body_text.slice(0, 200) };
}

export function base64_decoded_size(b64: string | undefined | null): number {
    if (typeof b64 !== 'string' || b64.length === 0) return 0;
    const trimmed = b64.replace(/\s/g, '');
    const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0;
    return Math.floor(trimmed.length * 3 / 4) - padding;
}

export function is_self_origin_url(raw_url: string): boolean {
    if (!raw_url || typeof raw_url !== 'string') return false;
    // 扩展自身 origin（MV3 content/background 内部跳转）
    if (raw_url.startsWith('chrome-extension://')) return true;
    // 本地 Bridge / 开发服务器：覆盖所有端口，不硬编码
    try {
        const parsed = new URL(raw_url);
        return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    } catch {
        return false;
    }
}

function headers_map_from_cdp(headers: Record<string, string>): Record<string, string> {
    return { ...headers };
}

function try_resolve_deferred(cdp_req_id: string, state: CdpHandlerState): void {
    const deferred_keys = state._deferred_cdp_index.get(cdp_req_id);
    if (!deferred_keys || deferred_keys.size === 0) return;

    const body_result = state.cdp_body_results.get(cdp_req_id);
    if (!body_result) {
        state._deferred_cdp_index.delete(cdp_req_id);
        return;
    }

    logger.debug('deferred_resolving', {
        cdp_req_id,
        body_status: body_result.status,
        deferred_count: deferred_keys.size,
    });

    // Remove this cdp_id from all deferred entries' pending sets.
    // The first entry whose pending set becomes empty wins the body.
    for (const dk of deferred_keys) {
        const entry = state.deferred_web_requests.get(dk);
        if (!entry) continue;
        entry.pending_cdp_ids.delete(cdp_req_id);

        if (entry.pending_cdp_ids.size === 0) {
            // All CDP candidates for this deferred entry have resolved
            clearTimeout(entry.timer);
            state.deferred_web_requests.delete(dk);
            state.cdp_body_results.delete(cdp_req_id);
            state.cdp_request_meta.delete(cdp_req_id);
            state._deferred_cdp_index.delete(cdp_req_id);
            state.send_to_background(build_network_event(
                entry.pending, entry.details, body_result.body, body_result.status, state, body_result.preview
            ));
            return;
        }
    }

    // No deferred entry fully resolved — just clean up this CDP body
    state.cdp_body_results.delete(cdp_req_id);
    state.cdp_request_meta.delete(cdp_req_id);
    state._deferred_cdp_index.delete(cdp_req_id);
}

function schedule_orphan_check(req_id: string, state: CdpHandlerState): void {
    // After a timeout, if the CDP body was not matched by a webRequest,
    // emit it as cdp_only via the callback.
    setTimeout(() => {
        if (!state.on_cdp_body_event) return;
        const body_result = state.cdp_body_results.get(req_id);
        if (!body_result) return; // already matched and consumed by handle_completed
        const meta = state.cdp_request_meta.get(req_id);

        const redact_hdrs = Boolean(state.config.redact_data && state.config.redact_sensitive_headers);
        const redact_q = Boolean(state.config.redact_data && state.config.redact_url_query);

        const event: CdpBodyEvent = {
            request_id: req_id,
            tab_id: state.dbg_tab_id || 0,
            url: redact_url(meta?.url || '', redact_q).url,
            method: meta?.method || 'GET',
            status_code: meta?.status_code || 0,
            timestamp: body_result.timestamp,
            resource_type: resolve_resource_type(meta?.resource_type || 'other'),
            request_body: meta?.request_body ?? null,
            request_body_status: meta?.request_body_status || 'not_enabled',
            response_body: body_result.body,
            response_body_status: body_result.status,
            response_preview: body_result.preview,
            request_headers: redact_hdrs ? redact_headers(meta?.request_headers || {}, true).headers : (meta?.request_headers || {}),
            response_headers: redact_hdrs ? redact_headers(meta?.response_headers || {}, true).headers : (meta?.response_headers || {})
        };

        state.on_cdp_body_event(event);

        // Cleanup orphan entries
        state.cdp_request_meta.delete(req_id);
        state.cdp_body_results.delete(req_id);
        state._deferred_cdp_index.delete(req_id);
    }, 3000); // ORPHAN_TIMEOUT_MS
}

export const ORPHAN_TIMEOUT_MS = 3000;
export const DEFERRED_TIMEOUT_MS = 1500;
