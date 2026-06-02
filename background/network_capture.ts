// background/network_capture.ts
import type { NetworkRequest } from '../shared/types';

let is_capturing = false;
let session_id: string;
let start_time: number;
let send_to_background: (request: NetworkRequest) => void;

export function start_network_capture(
    sid: string,
    startTime: number,
    _config: { redact_sensitive_headers: boolean; redact_url_query: boolean; capture_request_body: boolean },
    sender: (request: NetworkRequest) => void
): void {
    if (is_capturing) return;

    session_id = sid;
    start_time = startTime;
    send_to_background = sender;
    is_capturing = true;

    chrome.webRequest.onBeforeRequest.addListener(
        handle_before_request,
        { urls: ['<all_urls>'] }
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
    chrome.webRequest.onCompleted.removeListener(handle_completed);
    chrome.webRequest.onErrorOccurred.removeListener(handle_error);
}

// Store pending requests by requestId
const pending_requests: Map<string, Partial<NetworkRequest>> = new Map();

function handle_before_request(details: any): void {
    if (!is_capturing) return;

    const request: Partial<NetworkRequest> = {
        session_id,
        relative_time: details.timeStamp - start_time,
        absolute_time: details.timeStamp,
        tab_id: details.tabId,
        method: details.method,
        url: details.url,
        request_body_status: 'not_enabled',
        resource_type: details.type || 'other'
    };

    pending_requests.set(details.requestId, request);
}

function handle_completed(details: any): void {
    if (!is_capturing) return;

    const pending = pending_requests.get(details.requestId);
    if (!pending) return;

    pending_requests.delete(details.requestId);

    const request: NetworkRequest = {
        session_id: pending.session_id || '',
        relative_time: pending.relative_time || 0,
        absolute_time: pending.absolute_time || Date.now(),
        tab_id: pending.tab_id || 0,
        method: pending.method || 'GET',
        url: pending.url || '',
        status_code: details.statusCode,
        request_headers: {},
        response_headers: {},
        request_body: null,
        request_body_status: pending.request_body_status || 'not_enabled',
        response_body: null,
        response_body_status: 'not_enabled',
        duration_ms: details.timeStamp - (pending.absolute_time || Date.now()),
        resource_type: pending.resource_type || 'other'
    };

    send_to_background(request);
}

function handle_error(details: any): void {
    if (!is_capturing) return;

    pending_requests.delete(details.requestId);
}
