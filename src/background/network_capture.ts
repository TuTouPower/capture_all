// background/network_capture.ts
// Network capture with CDP response body support.
// webRequest captures headers/status/timing/request body.
// CDP (chrome.dbg) captures response bodies via Network.getResponseBody
// triggered on Network.loadingFinished.
//
// Phase 2: outputs CaptureEvent + NetworkRequestData (unified network_request type)

import type { CaptureEvent, NetworkRequestData, BodyCaptureStatus, WsFrameData } from '../shared/types';
import { create_base_event } from '../shared/event_utils';
import { redact_headers, redact_url, truncate_request_body, truncate_response_body } from '../shared/redaction';
import { DEFAULT_CONFIG } from '../shared/constants';
import type { CdpBodyEvent } from './network_correlator';
import { should_handle_event, clear_sessions, register_session, unregister_session, get_attached_sessions } from './cdp_event_router';
import { create_stream_buffer } from './stream_buffer';
import { Logger } from '../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/network', get_app_log_transport());

function base64_decoded_size(b64: string): number {
    const trimmed = b64.replace(/\s/g, '');
    const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0;
    return Math.floor(trimmed.length * 3 / 4) - padding;
}

interface NetworkCaptureConfig {
    redact_sensitive_headers: boolean;
    redact_url_query: boolean;
    redact_data: boolean;
    capture_request_body: boolean;
    capture_response_body: boolean;
    max_body_capture_bytes: number;
    inline_text_max_bytes: number;
}

interface NetworkEventPayload {
    event: CaptureEvent;
    data: NetworkRequestData | WsFrameData;
}

let is_capturing = false;
let capture_id: string;
let start_time: number;
let current_tab_id: number;
let send_to_background: (payload: NetworkEventPayload) => void;
let config: NetworkCaptureConfig = DEFAULT_CONFIG;

// Debuggee state for response body capture
let dbg_tab_id: number | null = null;
let dbg_attached_externally = false;

// webRequest.requestId -> pending request metadata
interface PendingRequest {
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
const pending_requests: Map<string, PendingRequest> = new Map();
export const _pending_requests_for_test = pending_requests;

// CDP requestId -> metadata collected before loadingFinished
interface CdpRequestMeta {
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
const cdp_request_meta: Map<string, CdpRequestMeta> = new Map();
export const _cdp_request_meta_for_test = cdp_request_meta;

// CDP requestId -> body result (after loadingFinished)
interface CdpBodyResult {
    body: string | null;
    status: BodyCaptureStatus;
    timestamp: number;
    preview: string | null;
    encoding: 'utf8' | 'base64' | null;
    byte_size: number | null;
}
const cdp_body_results: Map<string, CdpBodyResult> = new Map();
export const _cdp_body_results_for_test = cdp_body_results;

// CDP-first: track request IDs that CDP has already emitted as primary entries.
// webRequest handlers skip these to avoid duplicates.
const cdp_primary_emitted: Set<string> = new Set();

// WebSocket connection tracking
interface WsConnectionMeta {
    url: string;
    request_headers: Record<string, string>;
    response_headers: Record<string, string>;
    status_code: number;
    ws_status: 'connecting' | 'open' | 'closed' | 'error';
    created_ts: number;
}
const ws_connections: Map<string, WsConnectionMeta> = new Map();
export const _ws_connections_for_test = ws_connections;

// Streaming request tracking
const streaming_requests: Set<string> = new Set();
export const _streaming_requests_for_test = streaming_requests;
let stream_buffer_instance: ReturnType<typeof create_stream_buffer> | null = null;

// Orphan CDP body events: entries that haven't been matched by webRequest within timeout
const ORPHAN_TIMEOUT_MS = 3000;

// Deferred webRequest writes: webRequest arrived but CDP body hasn't yet
const DEFERRED_TIMEOUT_MS = 1500;
interface DeferredEntry {
    pending: PendingRequest;
    details: any;
    timer: ReturnType<typeof setTimeout>;
    pending_cdp_ids: Set<string>;
}
const deferred_web_requests: Map<string, DeferredEntry> = new Map();
export const _deferred_web_requests_for_test = deferred_web_requests;

// Callback for external consumers (only used for orphan CDP events)
let on_cdp_body_event: ((event: CdpBodyEvent) => void) | null = null;

export function set_cdp_body_event_handler(handler: ((event: CdpBodyEvent) => void) | null): void {
    on_cdp_body_event = handler;
}

export function start_network_capture(
    cid: string,
    startTime: number,
    cfg: NetworkCaptureConfig,
    tabId: number,
    sender: (payload: NetworkEventPayload) => void
): void {
    if (is_capturing) return;

    capture_id = cid;
    start_time = startTime;
    current_tab_id = tabId;
    send_to_background = sender;
    config = cfg;
    is_capturing = true;
    logger.info('Network capture started', { tab_id: tabId });

    chrome.webRequest.onBeforeRequest.addListener(
        handle_before_request,
        { urls: ['<all_urls>'] },
        ['requestBody'] as any
    );

    chrome.webRequest.onBeforeSendHeaders.addListener(
        handle_before_send_headers,
        { urls: ['<all_urls>'] },
        ['requestHeaders', 'extraHeaders'] as any
    );

    chrome.webRequest.onHeadersReceived.addListener(
        handle_headers_received,
        { urls: ['<all_urls>'] },
        ['responseHeaders', 'extraHeaders'] as any
    );

    chrome.webRequest.onCompleted.addListener(
        handle_completed,
        { urls: ['<all_urls>'] }
    );

    chrome.webRequest.onErrorOccurred.addListener(
        handle_error,
        { urls: ['<all_urls>'] }
    );
}

export function stop_network_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;
    logger.info('Network capture stopped');

    chrome.webRequest.onBeforeRequest.removeListener(handle_before_request);
    chrome.webRequest.onBeforeSendHeaders.removeListener(handle_before_send_headers);
    chrome.webRequest.onHeadersReceived.removeListener(handle_headers_received);
    chrome.webRequest.onCompleted.removeListener(handle_completed);
    chrome.webRequest.onErrorOccurred.removeListener(handle_error);

    pending_requests.clear();

    if (dbg_tab_id !== null) {
        const tab = dbg_tab_id;
        // M3 safety valve: release all sub-targets before detaching
        for (const session_id of get_attached_sessions()) {
            chrome.dbg.sendCommand(
                { tabId: tab, sessionId: session_id } as any,
                'Runtime.runIfWaitingForDebugger'
            ).catch(() => { /* best-effort */ });
        }
        chrome.dbg.onEvent.removeListener(handle_cdp_event);
        chrome.dbg.sendCommand({ tabId: tab }, 'Network.disable').catch(() => { /* best-effort */ });
        if (!dbg_attached_externally) {
            chrome.dbg.detach({ tabId: tab }).catch(() => { /* best-effort */ });
        }
        dbg_tab_id = null;
        dbg_attached_externally = false;
    }

    cdp_request_meta.clear();
    cdp_body_results.clear();
    cdp_primary_emitted.clear();
    ws_connections.clear();
    streaming_requests.clear();
    stream_buffer_instance?.flush_all();
    stream_buffer_instance = null;
    clear_sessions();
    on_cdp_body_event = null;
}

/**
 * Enable response body capture via the Chrome DevTools Protocol.
 */
export async function enable_response_body_capture(
    tab_id: number,
    already_attached: boolean
): Promise<{ success: boolean; error?: string }> {
    if (!is_capturing) return { success: false, error: 'not_capturing' };
    if (dbg_tab_id === tab_id) return { success: true };

    // CDP attached to a different tab — detach old tab first, then re-attach
    if (dbg_tab_id !== null) {
        try {
            chrome.dbg.onEvent.removeListener(handle_cdp_event);
            await chrome.dbg.detach({ tabId: dbg_tab_id });
        } catch { /* ignore if already detached */ }
        dbg_tab_id = null;
    }

    try {
        if (!already_attached) {
            await chrome.dbg.attach({ tabId: tab_id }, '1.3');
        }
        await chrome.dbg.sendCommand({ tabId: tab_id }, 'Network.enable', {
            maxResourceBufferSize: 100 * 1024 * 1024,
            maxTotalBufferSize: 500 * 1024 * 1024,
            reportResourceContent: true,
        });
        stream_buffer_instance = create_stream_buffer({
            on_flush: (request_id, accumulated) => {
                const meta = cdp_request_meta.get(request_id);
                if (meta) {
                    meta.response_body = (meta.response_body || '') + accumulated;
                    meta.response_body_status = 'streaming';
                }
            },
        });
        // P1: auto-attach to sub-targets (worker/iframe/OOPIF)
        try {
            await chrome.dbg.sendCommand({ tabId: tab_id }, 'Target.setAutoAttach', {
                autoAttach: true,
                waitForDebuggerOnStart: true,
                flatten: true,
            });
        } catch (err) {
            logger.debug('setAutoAttach_failed', { error: String(err).slice(0, 80) });
        }
        chrome.dbg.onEvent.addListener(handle_cdp_event);
        dbg_tab_id = tab_id;
        dbg_attached_externally = already_attached;
        logger.info('CDP body capture enabled', { tab_id, already_attached });
        return { success: true };
    } catch (error) {
        logger.warn('CDP body capture failed', error);
        return { success: false, error: `Network.enable failed: ${error}` };
    }
}

export function build_cdp_body_result(body_text: string, max_body_capture_bytes = config.max_body_capture_bytes): { body: string; status: BodyCaptureStatus; preview: string | null } {
    const byte_len = new TextEncoder().encode(body_text).length;
    if (byte_len > max_body_capture_bytes) {
        const trunc_result = truncate_response_body(body_text, max_body_capture_bytes);
        return { body: trunc_result.body!, status: 'too_large', preview: trunc_result.response_preview };
    }
    return { body: body_text, status: 'captured', preview: body_text.slice(0, 200) };
}

function send_ws_connection_event(req_id: string, conn: WsConnectionMeta, ws_status: WsConnectionMeta['ws_status']): void {
    const event = create_base_event({
        capture_id,
        category: 'network',
        type: 'network_request',
        relative_time_ms: Date.now() - start_time,
        tab_id: dbg_tab_id ?? current_tab_id,
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
    send_to_background({ event, data });
}

function send_ws_frame(req_id: string, direction: 'sent' | 'received', params: any): void {
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
        if (payload_bytes > config.max_body_capture_bytes) {
            const max_chars = is_binary
                ? Math.floor(config.max_body_capture_bytes * 4 / 3)
                : config.max_body_capture_bytes;
            payload = raw_payload.slice(0, max_chars);
            payload_status = 'too_large';
        } else {
            payload = raw_payload;
        }
        payload_encoding = is_binary ? 'base64' : 'utf8';
    }

    const conn = ws_connections.get(req_id);
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
        tab_id: dbg_tab_id ?? undefined,
    };
    const event = create_base_event({
        capture_id,
        category: 'network',
        type: 'ws_frame',
        relative_time_ms: (params?.timestamp ? params.timestamp * 1000 : Date.now()) - start_time,
        tab_id: dbg_tab_id ?? current_tab_id,
        url: frame_data.url,
        source: 'background',
        severity: 'info',
    });
    send_to_background({ event, data: frame_data });
}

function handle_cdp_event(source: any, method: string, params: any): void {
    if (!is_capturing || dbg_tab_id === null) return;
    if (!should_handle_event(source, dbg_tab_id)) return;

    // ── Sub-target lifecycle ──
    if (method === 'Target.attachedToTarget') {
        const child_session = params?.sessionId;
        if (child_session) {
            register_session(child_session);
            const child_target = { tabId: dbg_tab_id!, sessionId: child_session } as any;
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
        return;
    }

    if (method === 'Target.detachedFromTarget') {
        const child_session = params?.sessionId;
        if (child_session) {
            unregister_session(child_session);
            logger.debug('sub_target_detached', { sessionId: child_session });
        }
        return;
    }

    const req_id: string = params?.requestId;
    if (!req_id) return;

    if (method === 'Network.requestWillBeSent') {
        const request = params?.request;
        if (request) {
            // CDP-first: extract request body from postData
            let req_body: string | null = null;
            let req_body_status: BodyCaptureStatus = 'not_enabled';
            if (config.capture_request_body && request.postData) {
                const byte_len = new TextEncoder().encode(request.postData).length;
                if (byte_len > config.max_body_capture_bytes) {
                    req_body = truncate_request_body(request.postData, config.max_body_capture_bytes);
                    req_body_status = 'too_large';
                } else {
                    req_body = request.postData;
                    req_body_status = 'captured';
                }
            }

            const req_headers = (request.headers || {}) as Record<string, string>;
            const request_body_mime = (req_headers['content-type'] || req_headers['Content-Type']) ?? null;

            cdp_request_meta.set(req_id, {
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

    if (method === 'Network.responseReceived') {
        const response = params?.response;
        const existing = cdp_request_meta.get(req_id);
        const resp_headers = headers_map_from_cdp(response?.headers || {});
        const mime = extract_mime_type(resp_headers);
        if (existing) {
            existing.status_code = response?.status || 0;
            existing.response_headers = resp_headers;
            existing.mime_type = mime;
        } else {
            cdp_request_meta.set(req_id, {
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

        if (is_streaming_response(resp_headers) && dbg_tab_id !== null) {
            streaming_requests.add(req_id);
            if (existing) {
                existing.stream_mode = mime?.includes('event-stream') ? 'sse' : 'chunked';
            }
            chrome.dbg.sendCommand(
                { tabId: dbg_tab_id },
                'Network.streamResourceContent',
                { requestId: req_id }
            ).then((result: any) => {
                if (result?.bufferedData) {
                    stream_buffer_instance?.append(req_id, result.bufferedData);
                }
                logger.debug('stream_started', { req_id, mime });
            }).catch((err: any) => {
                logger.debug('streamResourceContent_failed', { req_id, error: String(err).slice(0, 80) });
                const meta = cdp_request_meta.get(req_id);
                if (meta) {
                    meta.response_body_status = 'partial';
                }
            });
        }
    }

    if (method === 'Network.dataReceived' && streaming_requests.has(req_id)) {
        const chunk = (params as any)?.data;
        if (chunk && stream_buffer_instance) {
            stream_buffer_instance.append(req_id, chunk);
        }
    }

    if (method === 'Network.loadingFinished') {
        if (dbg_tab_id === null) return;
        const meta_for_method = cdp_request_meta.get(req_id);
        const http_method = meta_for_method?.method?.toUpperCase() || '';

        if (streaming_requests.has(req_id)) {
            stream_buffer_instance?.force_flush(req_id);
            streaming_requests.delete(req_id);
            const meta = cdp_request_meta.get(req_id);
            if (meta) {
                const body = meta.response_body || null;
                const byte_size = body ? new TextEncoder().encode(body).length : 0;
                const is_partial = meta.response_body_status === 'partial';
                const body_result: CdpBodyResult = {
                    body,
                    status: is_partial ? 'partial' : (byte_size > config.max_body_capture_bytes ? 'too_large' : 'captured'),
                    timestamp: Date.now(),
                    preview: body?.slice(0, 200) ?? null,
                    encoding: 'utf8',
                    byte_size,
                };
                cdp_primary_emitted.add(req_id);
                send_to_background(build_cdp_primary_network_event(meta, body_result, req_id));
                cdp_request_meta.delete(req_id);
            }
            return;
        }

        chrome.dbg.sendCommand(
            { tabId: dbg_tab_id },
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
                if (byte_size > config.max_body_capture_bytes) {
                    body_status = 'too_large';
                } else {
                    body = result.body;
                    body_status = 'captured';
                }
            } else {
                byte_size = new TextEncoder().encode(result.body).length;
                encoding = 'utf8';
                const body_result = build_cdp_body_result(result.body, config.max_body_capture_bytes);
                body = body_result.body;
                preview = body_result.preview;
                body_status = body_result.status;
            }

            const body_result: CdpBodyResult = { body, status: body_status, timestamp: Date.now(), preview, encoding, byte_size };
            cdp_body_results.set(req_id, body_result);

            // CDP-first: if we have metadata, build and emit the complete entry directly
            const meta = cdp_request_meta.get(req_id);
            if (meta) {
                cdp_primary_emitted.add(req_id);
                send_to_background(build_cdp_primary_network_event(meta, body_result, req_id));
                logger.debug('cdp_primary_emitted', {
                    url: meta.url?.slice(0, 120),
                    method: meta.method,
                    body_status,
                    body_len: body?.length ?? 0,
                });
                // Clean up — no need for orphan check since we already emitted
                cdp_request_meta.delete(req_id);
                cdp_body_results.delete(req_id);
                return;
            }

            // No metadata yet — fall back to deferred/orphan resolution
            try_resolve_deferred(req_id);
            schedule_orphan_check(req_id);
        }).catch((err: any) => {
            // -32000 = "No resource with given identifier" (resource already released)
            // OPTIONS/HEAD have no body by spec
            const err_msg = String(err?.message || err) || '';
            const is_resource_released = err_msg.includes('-32000') || err_msg.includes('No resource');
            const is_no_body_method = http_method === 'OPTIONS' || http_method === 'HEAD';
            const status: BodyCaptureStatus = (is_resource_released || is_no_body_method)
                ? 'not_enabled' : 'cdp_failed';
            const fail_result: CdpBodyResult = { body: null, status, timestamp: Date.now(), preview: null, encoding: null, byte_size: null };
            cdp_body_results.set(req_id, fail_result);
            logger.debug('get_body_error', { req_id, error: err_msg.slice(0, 100), status });

            // CDP-first: emit even on failure (status will be cdp_failed)
            const meta = cdp_request_meta.get(req_id);
            if (meta) {
                cdp_primary_emitted.add(req_id);
                send_to_background(build_cdp_primary_network_event(meta, fail_result, req_id));
                cdp_request_meta.delete(req_id);
                cdp_body_results.delete(req_id);
                return;
            }

            try_resolve_deferred(req_id);
            schedule_orphan_check(req_id);
        });
    }

    if (method === 'Network.loadingFailed') {
        const fail_meta = cdp_request_meta.get(req_id);
        const fail_method = fail_meta?.method?.toUpperCase() || '';
        const fail_status: BodyCaptureStatus = (fail_method === 'OPTIONS' || fail_method === 'HEAD')
            ? 'not_enabled' : 'cdp_failed';
        cdp_body_results.set(req_id, { body: null, status: fail_status, timestamp: Date.now(), preview: null, encoding: null, byte_size: null });
        try_resolve_deferred(req_id);
        schedule_orphan_check(req_id);
    }

    // ── WebSocket events ──
    if (method === 'Network.webSocketCreated') {
        const ws_url = params?.url || '';
        const conn: WsConnectionMeta = {
            url: ws_url,
            request_headers: {},
            response_headers: {},
            status_code: 0,
            ws_status: 'connecting',
            created_ts: Date.now(),
        };
        ws_connections.set(req_id, conn);
        send_ws_connection_event(req_id, conn, 'connecting');
    }

    if (method === 'Network.webSocketWillSendHandshakeRequest') {
        const conn = ws_connections.get(req_id);
        if (conn) {
            conn.request_headers = headers_map_from_cdp(params?.request?.headers || {});
        }
    }

    if (method === 'Network.webSocketHandshakeResponseReceived') {
        const conn = ws_connections.get(req_id);
        if (conn) {
            conn.response_headers = headers_map_from_cdp(params?.response?.headers || {});
            conn.status_code = params?.response?.status || 101;
            conn.ws_status = 'open';
            send_ws_connection_event(req_id, conn, 'open');
        }
    }

    if (method === 'Network.webSocketFrameSent') {
        send_ws_frame(req_id, 'sent', params);
    }

    if (method === 'Network.webSocketFrameReceived') {
        send_ws_frame(req_id, 'received', params);
    }

    if (method === 'Network.webSocketFrameError') {
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
            url: ws_connections.get(req_id)?.url || '',
            tab_id: dbg_tab_id ?? undefined,
        };
        const event = create_base_event({
            capture_id,
            category: 'network',
            type: 'ws_frame',
            relative_time_ms: Date.now() - start_time,
            tab_id: dbg_tab_id ?? current_tab_id,
            url: frame_data.url,
            source: 'background',
            severity: 'warning',
        });
        send_to_background({ event, data: frame_data });
    }

    if (method === 'Network.webSocketClosed') {
        const conn = ws_connections.get(req_id);
        if (conn) {
            conn.ws_status = 'closed';
            send_ws_connection_event(req_id, conn, 'closed');
            ws_connections.delete(req_id);
        }
    }
}

function try_resolve_deferred(cdp_req_id: string): void {
    const deferred_keys = _deferred_cdp_index.get(cdp_req_id);
    if (!deferred_keys || deferred_keys.size === 0) return;

    const body_result = cdp_body_results.get(cdp_req_id);
    if (!body_result) {
        _deferred_cdp_index.delete(cdp_req_id);
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
        const entry = deferred_web_requests.get(dk);
        if (!entry) continue;
        entry.pending_cdp_ids.delete(cdp_req_id);

        if (entry.pending_cdp_ids.size === 0) {
            // All CDP candidates for this deferred entry have resolved
            clearTimeout(entry.timer);
            deferred_web_requests.delete(dk);
            cdp_body_results.delete(cdp_req_id);
            cdp_request_meta.delete(cdp_req_id);
            _deferred_cdp_index.delete(cdp_req_id);
            send_to_background(build_network_event(
                entry.pending, entry.details, body_result.body, body_result.status, body_result.preview
            ));
            return;
        }
    }

    // No deferred entry fully resolved — just clean up this CDP body
    cdp_body_results.delete(cdp_req_id);
    cdp_request_meta.delete(cdp_req_id);
    _deferred_cdp_index.delete(cdp_req_id);
}

export const _try_resolve_deferred_for_test = try_resolve_deferred;

function schedule_orphan_check(req_id: string): void {
    // After a timeout, if the CDP body was not matched by a webRequest,
    // emit it as cdp_only via the callback.
    setTimeout(() => {
        if (!on_cdp_body_event) return;
        const body_result = cdp_body_results.get(req_id);
        if (!body_result) return; // already matched and consumed by handle_completed
        const meta = cdp_request_meta.get(req_id);

        const redact_hdrs = Boolean(config.redact_data && config.redact_sensitive_headers);
        const redact_q = Boolean(config.redact_data && config.redact_url_query);

        const event: CdpBodyEvent = {
            request_id: req_id,
            tab_id: dbg_tab_id || 0,
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

        on_cdp_body_event(event);

        // Cleanup orphan entries
        cdp_request_meta.delete(req_id);
        cdp_body_results.delete(req_id);
        _deferred_cdp_index.delete(req_id);
    }, ORPHAN_TIMEOUT_MS);
}

function headers_map_from_cdp(headers: Record<string, string>): Record<string, string> {
    return { ...headers };
}

function extract_mime_type(headers: Record<string, string>): string | null {
    const ct = headers['content-type'] || headers['Content-Type'] || null;
    if (!ct) return null;
    return ct.split(';')[0].trim() || null;
}

export function is_streaming_response(headers: Record<string, string>): boolean {
    const ct = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
    if (ct.includes('text/event-stream')) return true;
    return false;
}

// ─── webRequest handlers ───

export function decode_raw_body(raw: Array<{ bytes?: ArrayBuffer }>): string {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const parts: string[] = [];
    for (const part of raw) {
        if (part.bytes) {
            parts.push(decoder.decode(part.bytes));
        }
    }
    return parts.join('');
}

export function encode_form_data(form: Record<string, string | string[]>): string {
    const parts: string[] = [];
    for (const [key, values] of Object.entries(form)) {
        const vals = Array.isArray(values) ? values : [values];
        for (const v of vals) {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
        }
    }
    return parts.join('&');
}

export function extract_request_body(details: any, capture_enabled?: boolean, max_body_capture_bytes = config.max_body_capture_bytes): { body: string | null; status: BodyCaptureStatus } {
    const enabled = capture_enabled ?? config.capture_request_body;
    if (!enabled) {
        return { body: null, status: 'not_enabled' };
    }
    const rb = details.requestBody;
    if (!rb) {
        return { body: null, status: 'unsupported' };
    }
    if (rb.error) {
        return { body: null, status: 'failed' };
    }

    let body: string | null = null;
    if (rb.formData) {
        body = encode_form_data(rb.formData);
    } else if (rb.raw && Array.isArray(rb.raw) && rb.raw.length > 0) {
        try {
            body = decode_raw_body(rb.raw);
        } catch {
            return { body: null, status: 'failed' };
        }
    } else {
        return { body: null, status: 'unsupported' };
    }

    if (body === null || body.length === 0) {
        return { body, status: 'captured' };
    }

    const byte_len = new TextEncoder().encode(body).length;
    if (byte_len > max_body_capture_bytes) {
        return { body: truncate_request_body(body, max_body_capture_bytes), status: 'too_large' };
    }
    return { body, status: 'captured' };
}

export function headers_array_to_map(arr: Array<{ name: string; value?: string }> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!arr) return out;
    for (const h of arr) {
        out[h.name] = h.value || '';
    }
    return out;
}

const RESOURCE_TYPE_MAP: Record<string, NetworkRequestData['resource_type']> = {
    'xmlhttprequest': 'xhr',
    'main_frame': 'document',
    'sub_frame': 'document',
    'script': 'script',
    'stylesheet': 'stylesheet',
    'image': 'image',
    'font': 'font',
    'media': 'media',
    'ping': 'ping',
    'websocket': 'websocket',
    'xhr': 'xhr',
    'fetch': 'fetch',
    'document': 'document',
    'other': 'other',
};

export function resolve_resource_type(raw: string): NetworkRequestData['resource_type'] {
    if (!raw) return 'other';
    const lower = raw.toLowerCase();
    return RESOURCE_TYPE_MAP[lower] || 'other';
}

function handle_before_request(details: any): void {
    if (!is_capturing) return;
    // CDP-first: skip requests on the attached tab — CDP handles them directly
    if (dbg_tab_id !== null && details.tabId === dbg_tab_id) return;

    const { body, status } = extract_request_body(details);

    const pending: PendingRequest = {
        cdp_request_id: details.requestId,
        tab_id: details.tabId,
        method: details.method,
        url: redact_url(details.url, Boolean(config.redact_data) && config.redact_url_query).url,
        timestamp: details.timeStamp,
        request_headers: {},
        response_headers: {},
        request_body: body,
        request_body_status: status,
        resource_type: details.type || 'other',
        mime_type: null,
    };

    pending_requests.set(details.requestId, pending);
}

function handle_before_send_headers(details: any): void {
    if (!is_capturing) return;
    if (dbg_tab_id !== null && details.tabId === dbg_tab_id) return;
    const pending = pending_requests.get(details.requestId);
    if (!pending) return;

    const headers = headers_array_to_map(details.requestHeaders);
    pending.request_headers = (config.redact_data && config.redact_sensitive_headers)
        ? redact_headers(headers, true).headers : headers;
}

function handle_headers_received(details: any): void {
    if (!is_capturing) return;
    if (dbg_tab_id !== null && details.tabId === dbg_tab_id) return;
    const pending = pending_requests.get(details.requestId);
    if (!pending) return;

    const headers = headers_array_to_map(details.responseHeaders);
    pending.response_headers = (config.redact_data && config.redact_sensitive_headers)
        ? redact_headers(headers, true).headers : headers;
    pending.mime_type = extract_mime_type(pending.response_headers);
}

function build_network_event(
    pending: PendingRequest,
    details: any,
    response_body: string | null,
    response_body_status: BodyCaptureStatus,
    response_preview: string | null = null
): NetworkEventPayload {
    const relative_time_ms = pending.timestamp - start_time;

    const event = create_base_event({
        capture_id,
        category: 'network',
        type: 'network_request',
        relative_time_ms,
        tab_id: pending.tab_id || current_tab_id,
        url: pending.url,
        source: 'background',
        severity: 'info',
    });

    const redacted_headers = config.redact_data && config.redact_sensitive_headers;

    const data: NetworkRequestData = {
        capture_id: event.capture_id,
        event_id: event.event_id,
        request_id: pending.cdp_request_id || crypto.randomUUID(),
        method: pending.method || 'GET',
        url: pending.url || '',
        url_status: config.redact_data && config.redact_url_query ? 'redacted' : 'captured',
        status_code: details.statusCode ?? null,
        status_text: null,
        protocol: null,
        resource_type: resolve_resource_type(pending.resource_type),
        initiator: null,
        duration_ms: details.timeStamp != null && pending.timestamp != null
            ? details.timeStamp - pending.timestamp
            : null,
        start_time_ms: null,
        end_time_ms: null,
        request_headers: pending.request_headers || {},
        response_headers: pending.response_headers || {},
        headers_status: redacted_headers ? 'redacted' : 'captured',
        request_body: pending.request_body ?? null,
        request_body_status: pending.request_body_status || 'not_enabled',
        request_body_encoding: pending.request_body ? 'utf8' : null,
        request_body_bytes: pending.request_body ? new TextEncoder().encode(pending.request_body).length : null,
        request_body_mime: null,
        response_body,
        response_preview,
        response_body_status,
        response_body_encoding: null,
        response_body_bytes: null,
        mime_type: pending.mime_type,
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: null,
        cache_status: null,
        error_text: null,
        capture_method: 'web_request',
        body_capture_mode: config.capture_response_body ? 'extension_cdp' : 'none',
    };

    return { event, data };
}

// CDP-first: build complete NetworkRequestData directly from CDP metadata + body.
// Used for the attached tab where CDP is the primary data source.
function build_cdp_primary_network_event(
    meta: CdpRequestMeta,
    body_result: CdpBodyResult,
    cdp_request_id: string
): NetworkEventPayload {
    const relative_time_ms = meta.timestamp - start_time;

    const redact_q = Boolean(config.redact_data && config.redact_url_query);
    const redact_hdrs = Boolean(config.redact_data && config.redact_sensitive_headers);
    const { url } = redact_url(meta.url, redact_q);

    const event = create_base_event({
        capture_id,
        category: 'network',
        type: 'network_request',
        relative_time_ms,
        tab_id: dbg_tab_id || current_tab_id,
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

function handle_completed(details: any): void {
    if (!is_capturing) return;
    // CDP-first: skip requests on the attached tab — CDP already emitted them
    if (dbg_tab_id !== null && details.tabId === dbg_tab_id) return;

    const pending = pending_requests.get(details.requestId);
    if (!pending) return;
    pending_requests.delete(details.requestId);

    // If CDP body capture is not active, emit webRequest-only
    if (!config.capture_response_body || dbg_tab_id === null) {
        logger.debug('body_not_enabled_immediate', {
            reason: !config.capture_response_body ? 'config_disabled' : 'no_dbg_tab',
            url: pending.url?.slice(0, 120),
            method: pending.method,
            capture_response_body: config.capture_response_body,
            dbg_tab_id,
        });
        send_to_background(build_network_event(pending, details, null, 'not_enabled'));
        return;
    }

    // Try to find a matching CDP body result by correlating URL + method + status + timestamp
    const matched_cdp_id = find_matching_cdp_request(
        pending.url || '',
        pending.method || 'GET',
        details.statusCode,
        details.timeStamp
    );

    if (matched_cdp_id) {
        const body_result = cdp_body_results.get(matched_cdp_id);
        cdp_body_results.delete(matched_cdp_id);
        cdp_request_meta.delete(matched_cdp_id);
        if (body_result) {
            logger.debug('body_captured', {
                url: pending.url?.slice(0, 120),
                method: pending.method,
                body_status: body_result.status,
                body_len: body_result.body?.length ?? 0,
            });
            send_to_background(build_network_event(
                pending, details, body_result.body, body_result.status, body_result.preview
            ));
            return;
        }
        logger.debug('cdp_match_found_but_no_result', {
            url: pending.url?.slice(0, 120),
            cdp_id: matched_cdp_id,
        });
    }

    // No CDP match found — defer write, wait for CDP body to arrive
    // This avoids the race where webRequest completes before CDP body is resolved
    const deferred_key = `deferred_${details.requestId}`;
    const candidates = find_cdp_candidates(
        pending.url || '',
        pending.method || 'GET',
        details.statusCode
    );
    const pending_cdp_ids = new Set(candidates);
    logger.debug('body_deferred', {
        url: pending.url?.slice(0, 120),
        method: pending.method,
        status: details.statusCode,
        candidate_count: candidates.length,
        cdp_meta_count: cdp_request_meta.size,
        dbg_tab_id,
    });
    const timer = setTimeout(() => {
        deferred_web_requests.delete(deferred_key);
        // Clean up reverse index for all pending CDP candidates
        for (const cdp_id of pending_cdp_ids) {
            const keys = _deferred_cdp_index.get(cdp_id);
            if (keys) {
                keys.delete(deferred_key);
                if (keys.size === 0) _deferred_cdp_index.delete(cdp_id);
            }
        }
        logger.debug('body_not_enabled_deferred_timeout', {
            url: pending.url?.slice(0, 120),
            method: pending.method,
            status: details.statusCode,
            candidate_count: pending_cdp_ids.size,
            deferred_timeout_ms: DEFERRED_TIMEOUT_MS,
            cdp_meta_at_timeout: cdp_request_meta.size,
            dbg_tab_id,
        });
        send_to_background(build_network_event(pending, details, null, 'not_enabled'));
    }, DEFERRED_TIMEOUT_MS);
    deferred_web_requests.set(deferred_key, { pending, details, timer, pending_cdp_ids });

    // Store a reverse-lookup from CDP request candidates to deferred entries
    // for fast resolution when CDP body arrives
    for (const cdp_id of candidates) {
        let keys = _deferred_cdp_index.get(cdp_id);
        if (!keys) {
            keys = new Set();
            _deferred_cdp_index.set(cdp_id, keys);
        }
        keys.add(deferred_key);
    }
}

// Reverse index: CDP request_id -> Set of deferred entry keys, for fast resolution
// Set allows multiple deferred entries to share the same CDP candidate (concurrent requests)
const _deferred_cdp_index: Map<string, Set<string>> = new Map();
export const _deferred_cdp_index_for_test = _deferred_cdp_index;

export function find_cdp_candidates(
    url: string,
    method: string,
    status_code: number
): string[] {
    const candidates: string[] = [];
    const base_url = url.split('?')[0];

    for (const [cdp_id, meta] of cdp_request_meta) {
        if (meta.method !== method) continue;
        // Relaxed status match: allow status_code=0 (CDP response not yet received)
        if (meta.status_code !== 0 && meta.status_code !== status_code) continue;

        const cdp_base = meta.url.split('?')[0];
        if (base_url !== cdp_base) continue;

        candidates.push(cdp_id);
    }

    return candidates;
}

export function find_matching_cdp_request(
    url: string,
    method: string,
    status_code: number,
    timestamp: number
): string | null {
    const MATCH_WINDOW_MS = 2000;
    let best_candidate: string | null = null;
    let best_time_diff = Infinity;
    let reject_reasons = { method_miss: 0, status_miss: 0, time_miss: 0, url_miss: 0 };

    for (const [cdp_id, meta] of cdp_request_meta) {
        if (meta.method !== method) { reject_reasons.method_miss++; continue; }
        if (meta.status_code !== 0 && meta.status_code !== status_code) { reject_reasons.status_miss++; continue; }
        const time_diff = Math.abs(meta.timestamp - timestamp);
        if (time_diff > MATCH_WINDOW_MS) { reject_reasons.time_miss++; continue; }

        const cdp_base = meta.url.split('?')[0];
        const web_base = url.split('?')[0];
        if (cdp_base !== web_base) { reject_reasons.url_miss++; continue; }

        if (time_diff < best_time_diff) {
            best_time_diff = time_diff;
            best_candidate = cdp_id;
        }
    }

    if (!best_candidate && cdp_request_meta.size > 0) {
        logger.debug('cdp_match_miss', {
            url: url.slice(0, 120),
            method,
            status_code,
            cdp_meta_count: cdp_request_meta.size,
            ...reject_reasons,
        });
    }

    return best_candidate;
}

function handle_error(details: any): void {
    if (!is_capturing) return;
    if (dbg_tab_id !== null && details.tabId === dbg_tab_id) return;
    pending_requests.delete(details.requestId);
}
