// background/network_capture.ts
// Network capture with CDP response body support.
// webRequest records headers/status/timing/request body.
// CDP (chrome.debugger) captures response bodies via Network.getResponseBody
// triggered on Network.loadingFinished.

import type { NetworkRequest, BodyCaptureStatus } from '../shared/types';
import { redact_headers, redact_url, truncate_request_body, truncate_response_body } from '../shared/redaction';
import { MAX_REQUEST_BODY_BYTES, MAX_RESPONSE_BODY_BYTES } from '../shared/constants';
import type { CdpBodyEvent } from './network_correlator';

interface NetworkCaptureConfig {
    redact_sensitive_headers: boolean;
    redact_url_query: boolean;
    redact_data: boolean;
    capture_request_body: boolean;
    capture_response_body: boolean;
}

let is_capturing = false;
let session_id: string;
let start_time: number;
let send_to_background: (request: NetworkRequest) => void;
let config: NetworkCaptureConfig;

// Debuggee state for response body capture
let dbg_tab_id: number | null = null;
let dbg_attached_externally = false;

// webRequest.requestId -> pending request metadata
const pending_requests: Map<string, Partial<NetworkRequest>> = new Map();

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
}
const cdp_body_results: Map<string, CdpBodyResult> = new Map();

// Orphan CDP body events: entries that haven't been matched by webRequest within timeout
const ORPHAN_TIMEOUT_MS = 3000;

// Callback for external consumers (only used for orphan CDP events)
let on_cdp_body_event: ((event: CdpBodyEvent) => void) | null = null;

export function set_cdp_body_event_handler(handler: ((event: CdpBodyEvent) => void) | null): void {
    on_cdp_body_event = handler;
}

export function start_network_capture(
    sid: string,
    startTime: number,
    cfg: NetworkCaptureConfig,
    sender: (request: NetworkRequest) => void
): void {
    if (is_capturing) return;

    session_id = sid;
    start_time = startTime;
    send_to_background = sender;
    config = cfg;
    is_capturing = true;

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
        return { success: true };
    } catch (error) {
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
                cdp_body_results.set(req_id, { body: null, status: 'cdp_failed', timestamp: Date.now() });
            } else if (result.base64Encoded) {
                cdp_body_results.set(req_id, { body: null, status: 'unsupported_binary', timestamp: Date.now() });
            } else {
                let body: string = result.body;
                const byte_len = new TextEncoder().encode(body).length;
                if (byte_len > MAX_RESPONSE_BODY_BYTES) {
                    body = truncate_response_body(body) as string;
                    cdp_body_results.set(req_id, { body, status: 'too_large', timestamp: Date.now() });
                } else {
                    cdp_body_results.set(req_id, { body, status: 'captured', timestamp: Date.now() });
                }
            }
            schedule_orphan_check(req_id);
        }).catch(() => {
            cdp_body_results.set(req_id, { body: null, status: 'cdp_failed', timestamp: Date.now() });
            schedule_orphan_check(req_id);
        });
    }

    if (method === 'Network.loadingFailed') {
        cdp_body_results.set(req_id, { body: null, status: 'cdp_failed', timestamp: Date.now() });
        schedule_orphan_check(req_id);
    }
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
            url: redact_url(meta?.url || '', redact_q),
            method: meta?.method || 'GET',
            status_code: meta?.status_code || 0,
            timestamp: body_result.timestamp,
            resource_type: meta?.resource_type || 'other',
            request_body: meta?.request_body ?? null,
            request_body_status: meta?.request_body_status || 'not_enabled',
            response_body: body_result.body,
            response_body_status: body_result.status,
            request_headers: redact_hdrs ? redact_headers(meta?.request_headers || {}, true) : (meta?.request_headers || {}),
            response_headers: redact_hdrs ? redact_headers(meta?.response_headers || {}, true) : (meta?.response_headers || {})
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

// ─── webRequest handlers (unchanged logic, preserved for headers/status/timing) ───

function decode_raw_body(raw: Array<{ bytes?: ArrayBuffer }>): string {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const parts: string[] = [];
    for (const part of raw) {
        if (part.bytes) {
            parts.push(decoder.decode(part.bytes));
        }
    }
    return parts.join('');
}

function encode_form_data(form: Record<string, string[]>): string {
    const parts: string[] = [];
    for (const [key, values] of Object.entries(form)) {
        const vals = Array.isArray(values) ? values : [values];
        for (const v of vals) {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
        }
    }
    return parts.join('&');
}

function extract_request_body(details: any): { body: string | null; status: BodyCaptureStatus } {
    if (!config.capture_request_body) {
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

function headers_array_to_map(arr: Array<{ name: string; value?: string }> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!arr) return out;
    for (const h of arr) {
        out[h.name] = h.value || '';
    }
    return out;
}

function handle_before_request(details: any): void {
    if (!is_capturing) return;

    const { body, status } = extract_request_body(details);

    const request: Partial<NetworkRequest> = {
        session_id,
        relative_time: details.timeStamp - start_time,
        absolute_time: details.timeStamp,
        tab_id: details.tabId,
        method: details.method,
        url: redact_url(details.url, Boolean(config.redact_data) && config.redact_url_query),
        request_headers: {},
        response_headers: {},
        request_body: body,
        request_body_status: status,
        resource_type: details.type || 'other'
    };

    pending_requests.set(details.requestId, request);
}

function handle_before_send_headers(details: any): void {
    if (!is_capturing) return;
    const pending = pending_requests.get(details.requestId);
    if (!pending) return;

    const headers = headers_array_to_map(details.requestHeaders);
    pending.request_headers = (config.redact_data && config.redact_sensitive_headers)
        ? redact_headers(headers, true) : headers;
}

function handle_headers_received(details: any): void {
    if (!is_capturing) return;
    const pending = pending_requests.get(details.requestId);
    if (!pending) return;

    const headers = headers_array_to_map(details.responseHeaders);
    pending.response_headers = (config.redact_data && config.redact_sensitive_headers)
        ? redact_headers(headers, true) : headers;
}

function build_final_request(
    pending: Partial<NetworkRequest>,
    details: any,
    response_body: string | null,
    response_body_status: BodyCaptureStatus
): NetworkRequest {
    return {
        session_id: pending.session_id || '',
        relative_time: pending.relative_time || 0,
        absolute_time: pending.absolute_time || Date.now(),
        tab_id: pending.tab_id || 0,
        method: pending.method || 'GET',
        url: pending.url || '',
        status_code: details.statusCode,
        request_headers: pending.request_headers || {},
        response_headers: pending.response_headers || {},
        request_body: pending.request_body ?? null,
        request_body_status: pending.request_body_status || 'not_enabled',
        response_body,
        response_body_status,
        duration_ms: details.timeStamp - (pending.absolute_time || Date.now()),
        resource_type: pending.resource_type || 'other'
    };
}

function handle_completed(details: any): void {
    if (!is_capturing) return;

    const pending = pending_requests.get(details.requestId);
    if (!pending) return;
    pending_requests.delete(details.requestId);

    // If CDP body capture is not active, emit webRequest-only
    if (!config.capture_response_body || dbg_tab_id === null) {
        send_to_background(build_final_request(pending, details, null, 'not_enabled'));
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
            send_to_background(build_final_request(
                pending, details, body_result.body, body_result.status
            ));
            return;
        }
    }

    // No CDP match found — emit with not_enabled (CDP body may arrive later via event path)
    send_to_background(build_final_request(pending, details, null, 'not_enabled'));
}

function find_matching_cdp_request(
    url: string,
    method: string,
    status_code: number,
    timestamp: number
): string | null {
    const MATCH_WINDOW_MS = 2000;
    const candidates: string[] = [];

    for (const [cdp_id, meta] of cdp_request_meta) {
        if (meta.method !== method) continue;
        if (meta.status_code !== status_code) continue;
        if (Math.abs(meta.timestamp - timestamp) > MATCH_WINDOW_MS) continue;

        const cdp_url = meta.url;
        const url_match = url === cdp_url || url.split('?')[0] === cdp_url.split('?')[0];
        if (!url_match) continue;

        candidates.push(cdp_id);
    }

    if (candidates.length === 1) return candidates[0];
    return null;
}

function handle_error(details: any): void {
    if (!is_capturing) return;
    pending_requests.delete(details.requestId);
}
