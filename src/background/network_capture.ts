// background/network_capture.ts
// Network capture with CDP response body support.
// webRequest records headers/status/timing/request body.
// CDP (chrome.dbg) captures response bodies via Network.getResponseBody
// triggered on Network.loadingFinished.
//
// Phase 2: outputs CaptureEvent + NetworkRequestData (unified network_request type)

import type { CaptureEvent, NetworkRequestData, BodyCaptureStatus } from '../shared/types';
import { create_base_event } from '../shared/event_utils';
import { redact_headers, redact_url, truncate_request_body, truncate_response_body } from '../shared/redaction';
import { MAX_REQUEST_BODY_BYTES, MAX_RESPONSE_BODY_BYTES } from '../shared/constants';
import type { CdpBodyEvent } from './network_correlator';
import { Logger } from '../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/network', get_app_log_transport());

interface NetworkCaptureConfig {
    redact_sensitive_headers: boolean;
    redact_url_query: boolean;
    redact_data: boolean;
    capture_request_body: boolean;
    capture_response_body: boolean;
}

interface NetworkEventPayload {
    event: CaptureEvent;
    data: NetworkRequestData;
}

let is_capturing = false;
let capture_id: string;
let start_time: number;
let current_tab_id: number;
let send_to_background: (payload: NetworkEventPayload) => void;
let config: NetworkCaptureConfig;

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
}
const pending_requests: Map<string, PendingRequest> = new Map();

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
}
const cdp_request_meta: Map<string, CdpRequestMeta> = new Map();

// CDP requestId -> body result (after loadingFinished)
interface CdpBodyResult {
    body: string | null;
    status: BodyCaptureStatus;
    timestamp: number;
    preview: string | null;
}
const cdp_body_results: Map<string, CdpBodyResult> = new Map();

// Orphan CDP body events: entries that haven't been matched by webRequest within timeout
const ORPHAN_TIMEOUT_MS = 3000;

// Deferred webRequest writes: webRequest arrived but CDP body hasn't yet
const DEFERRED_TIMEOUT_MS = 1500;
interface DeferredEntry {
    pending: PendingRequest;
    details: any;
    timer: ReturnType<typeof setTimeout>;
}
const deferred_web_requests: Map<string, DeferredEntry> = new Map();

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
    if (dbg_tab_id !== null) return { success: true };

    try {
        if (!already_attached) {
            await chrome.dbg.attach({ tabId: tab_id }, '1.3');
        }
        await chrome.dbg.sendCommand({ tabId: tab_id }, 'Network.enable');
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

function handle_cdp_event(source: any, method: string, params: any): void {
    if (!is_capturing || dbg_tab_id === null) return;
    if (source?.tabId !== dbg_tab_id) return;

    const req_id: string = params?.requestId;
    if (!req_id) return;

    if (method === 'Network.requestWillBeSent') {
        const request = params?.request;
        if (request) {
            cdp_request_meta.set(req_id, {
                url: request.url || '',
                method: request.method || 'GET',
                status_code: 0,
                resource_type: params?.type || 'other',
                response_headers: {},
                request_headers: headers_map_from_cdp(request.headers || {}),
                timestamp: Date.now(),
                request_body: null,
                request_body_status: 'not_enabled'
            });
        }
    }

    if (method === 'Network.responseReceived') {
        const response = params?.response;
        const existing = cdp_request_meta.get(req_id);
        if (existing) {
            existing.status_code = response?.status || 0;
            existing.response_headers = headers_map_from_cdp(response?.headers || {});
        } else {
            // Response arrived before request event (unusual but possible)
            cdp_request_meta.set(req_id, {
                url: response?.url || '',
                method: '',
                status_code: response?.status || 0,
                resource_type: params?.type || 'other',
                response_headers: headers_map_from_cdp(response?.headers || {}),
                request_headers: {},
                timestamp: Date.now(),
                request_body: null,
                request_body_status: 'not_enabled'
            });
        }
    }

    if (method === 'Network.loadingFinished') {
        if (dbg_tab_id === null) return;
        chrome.dbg.sendCommand(
            { tabId: dbg_tab_id },
            'Network.getResponseBody',
            { requestId: req_id }
        ).then((result: any) => {
            if (!result || typeof result.body !== 'string') {
                cdp_body_results.set(req_id, { body: null, status: 'cdp_failed', timestamp: Date.now(), preview: null });
            } else if (result.base64Encoded) {
                cdp_body_results.set(req_id, { body: null, status: 'unsupported_binary', timestamp: Date.now(), preview: null });
            } else {
                let body: string = result.body;
                const byte_len = new TextEncoder().encode(body).length;
                if (byte_len > MAX_RESPONSE_BODY_BYTES) {
                    const trunc_result = truncate_response_body(body);
                    body = trunc_result.body!;
                    cdp_body_results.set(req_id, { body, status: 'too_large', timestamp: Date.now(), preview: trunc_result.response_preview });
                } else {
                    const preview = body.slice(0, 200);
                    cdp_body_results.set(req_id, { body, status: 'captured', timestamp: Date.now(), preview });
                }
            }
            try_resolve_deferred(req_id);
            schedule_orphan_check(req_id);
        }).catch(() => {
            cdp_body_results.set(req_id, { body: null, status: 'cdp_failed', timestamp: Date.now(), preview: null });
            try_resolve_deferred(req_id);
            schedule_orphan_check(req_id);
        });
    }

    if (method === 'Network.loadingFailed') {
        cdp_body_results.set(req_id, { body: null, status: 'cdp_failed', timestamp: Date.now(), preview: null });
        try_resolve_deferred(req_id);
        schedule_orphan_check(req_id);
    }
}

function try_resolve_deferred(cdp_req_id: string): void {
    const deferred_key = _deferred_cdp_index.get(cdp_req_id);
    if (!deferred_key) return;
    _deferred_cdp_index.delete(cdp_req_id);

    const entry = deferred_web_requests.get(deferred_key);
    if (!entry) return;

    const body_result = cdp_body_results.get(cdp_req_id);
    if (!body_result) return;

    // Resolve: emit merged, clean up both sides
    clearTimeout(entry.timer);
    deferred_web_requests.delete(deferred_key);
    cdp_body_results.delete(cdp_req_id);
    cdp_request_meta.delete(cdp_req_id);
    send_to_background(build_network_event(
        entry.pending, entry.details, body_result.body, body_result.status, body_result.preview
    ));
}

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
            resource_type: meta?.resource_type || 'other',
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
    }, ORPHAN_TIMEOUT_MS);
}

function headers_map_from_cdp(headers: Record<string, string>): Record<string, string> {
    return { ...headers };
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

export function extract_request_body(details: any, capture_enabled?: boolean): { body: string | null; status: BodyCaptureStatus } {
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
    if (byte_len > MAX_REQUEST_BODY_BYTES) {
        return { body: truncate_request_body(body), status: 'too_large' };
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

function resolve_resource_type(raw: string): NetworkRequestData['resource_type'] {
    const valid: NetworkRequestData['resource_type'][] = [
        'fetch', 'xhr', 'document', 'script', 'stylesheet',
        'image', 'font', 'media', 'websocket', 'other'
    ];
    if (valid.includes(raw as NetworkRequestData['resource_type'])) {
        return raw as NetworkRequestData['resource_type'];
    }
    return 'other';
}

function handle_before_request(details: any): void {
    if (!is_capturing) return;

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
        resource_type: details.type || 'other'
    };

    pending_requests.set(details.requestId, pending);
}

function handle_before_send_headers(details: any): void {
    if (!is_capturing) return;
    const pending = pending_requests.get(details.requestId);
    if (!pending) return;

    const headers = headers_array_to_map(details.requestHeaders);
    pending.request_headers = (config.redact_data && config.redact_sensitive_headers)
        ? redact_headers(headers, true).headers : headers;
}

function handle_headers_received(details: any): void {
    if (!is_capturing) return;
    const pending = pending_requests.get(details.requestId);
    if (!pending) return;

    const headers = headers_array_to_map(details.responseHeaders);
    pending.response_headers = (config.redact_data && config.redact_sensitive_headers)
        ? redact_headers(headers, true).headers : headers;
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
        response_body,
        response_preview,
        response_body_status,
        mime_type: null,
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

function handle_completed(details: any): void {
    if (!is_capturing) return;

    const pending = pending_requests.get(details.requestId);
    if (!pending) return;
    pending_requests.delete(details.requestId);

    // If CDP body capture is not active, emit webRequest-only
    if (!config.capture_response_body || dbg_tab_id === null) {
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
            send_to_background(build_network_event(
                pending, details, body_result.body, body_result.status, body_result.preview
            ));
            return;
        }
    }

    // No CDP match found — defer write, wait for CDP body to arrive
    // This avoids the race where webRequest completes before CDP body is resolved
    const deferred_key = `deferred_${details.requestId}`;
    const timer = setTimeout(() => {
        deferred_web_requests.delete(deferred_key);
        send_to_background(build_network_event(pending, details, null, 'not_enabled'));
    }, DEFERRED_TIMEOUT_MS);
    deferred_web_requests.set(deferred_key, { pending, details, timer });

    // Store a reverse-lookup from CDP request candidates to deferred entries
    // for fast resolution when CDP body arrives
    const candidates = find_cdp_candidates(
        pending.url || '',
        pending.method || 'GET',
        details.statusCode
    );
    for (const cdp_id of candidates) {
        _deferred_cdp_index.set(cdp_id, deferred_key);
    }
}

// Reverse index: CDP request_id -> deferred entry key, for fast resolution
const _deferred_cdp_index: Map<string, string> = new Map();

function find_cdp_candidates(
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

function find_matching_cdp_request(
    url: string,
    method: string,
    status_code: number,
    timestamp: number
): string | null {
    const MATCH_WINDOW_MS = 2000;
    let best_candidate: string | null = null;
    let best_time_diff = Infinity;

    for (const [cdp_id, meta] of cdp_request_meta) {
        if (meta.method !== method) continue;
        // Relaxed status match: allow status_code=0
        if (meta.status_code !== 0 && meta.status_code !== status_code) continue;
        const time_diff = Math.abs(meta.timestamp - timestamp);
        if (time_diff > MATCH_WINDOW_MS) continue;

        const cdp_base = meta.url.split('?')[0];
        const web_base = url.split('?')[0];
        if (cdp_base !== web_base) continue;

        // Return best match (closest timestamp) rather than rejecting multi-candidate
        if (time_diff < best_time_diff) {
            best_time_diff = time_diff;
            best_candidate = cdp_id;
        }
    }

    return best_candidate;
}

function handle_error(details: any): void {
    if (!is_capturing) return;
    pending_requests.delete(details.requestId);
}
