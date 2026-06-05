// background/network_capture.ts
import type { NetworkRequest, BodyCaptureStatus } from '../shared/types';
import { redact_headers, redact_url, truncate_request_body, truncate_response_body } from '../shared/redaction';
import { MAX_REQUEST_BODY_BYTES, MAX_RESPONSE_BODY_BYTES } from '../shared/constants';

interface NetworkCaptureConfig {
    redact_sensitive_headers: boolean;
    redact_url_query: boolean;
    redact_data?: boolean;
    capture_request_body: boolean;
    capture_response_body?: boolean;
}

let is_capturing = false;
let session_id: string;
let start_time: number;
let send_to_background: (request: NetworkRequest) => void;
let config: NetworkCaptureConfig;

// Debuggee state for response body capture (advanced mode)
let dbg_tab_id: number | null = null;
let dbg_attached_externally = false;

// webRequest.requestId -> pending request
const pending_requests: Map<string, Partial<NetworkRequest>> = new Map();

// url -> CDP requestId. Used to bridge webRequest <-> CDP for getResponseBody.
const cdp_request_ids: Map<string, string> = new Map();

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
    config = { capture_response_body: false, ...cfg };
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
        cdp_request_ids.clear();
    }
}

/**
 * Enable response body capture via the Chrome DevTools Protocol.
 * Call after start_network_capture() in advanced mode.
 * If the caller has already attached the debugger (e.g. console_capture),
 * pass already_attached=true so we don't try to re-attach or detach it.
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

    if (method === 'Network.responseReceived') {
        const url = params?.response?.url;
        const req_id = params?.requestId;
        if (url && req_id) {
            cdp_request_ids.set(url, req_id);
        }
    }
}

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
        return { body: truncate_request_body(body, config.redact_data), status: 'too_large' };
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
    pending.request_headers = (config.redact_data && config.redact_sensitive_headers) ? redact_headers(headers, true) : headers;
}

function handle_headers_received(details: any): void {
    if (!is_capturing) return;
    const pending = pending_requests.get(details.requestId);
    if (!pending) return;

    const headers = headers_array_to_map(details.responseHeaders);
    pending.response_headers = (config.redact_data && config.redact_sensitive_headers) ? redact_headers(headers, true) : headers;
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

    if (!config.capture_response_body || dbg_tab_id === null) {
        send_to_background(build_final_request(pending, details, null, 'not_enabled'));
        return;
    }

    const cdp_id = cdp_request_ids.get(details.url);
    if (cdp_id) cdp_request_ids.delete(details.url);

    if (!cdp_id) {
        send_to_background(build_final_request(pending, details, null, 'failed'));
        return;
    }

    chrome.dbg.sendCommand({ tabId: dbg_tab_id }, 'Network.getResponseBody', { requestId: cdp_id })
        .then((result: any) => {
            if (!result || typeof result.body !== 'string') {
                send_to_background(build_final_request(pending, details, null, 'failed'));
                return;
            }
            if (result.base64Encoded) {
                send_to_background(build_final_request(pending, details, null, 'unsupported'));
                return;
            }
            let body: string = result.body;
            const byte_len = new TextEncoder().encode(body).length;
            if (byte_len > MAX_RESPONSE_BODY_BYTES) {
                body = truncate_response_body(body, config.redact_data) as string;
                send_to_background(build_final_request(pending, details, body, 'too_large'));
            } else {
                send_to_background(build_final_request(pending, details, body, 'captured'));
            }
        })
        .catch(() => {
            send_to_background(build_final_request(pending, details, null, 'failed'));
        });
}

function handle_error(details: any): void {
    if (!is_capturing) return;
    pending_requests.delete(details.requestId);
    if (details.url) cdp_request_ids.delete(details.url);
}
