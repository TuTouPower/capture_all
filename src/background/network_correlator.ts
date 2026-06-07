// background/network_correlator.ts
// Merges webRequest metadata and CDP body events into unified NetworkRequest.

import type { NetworkRequest, NetworkCorrelationStatus, BodyCaptureStatus } from '../shared/types';

export interface CdpBodyEvent {
    request_id: string;
    tab_id: number;
    url: string;
    method: string;
    status_code: number;
    timestamp: number;
    resource_type: string;
    request_body: string | null;
    request_body_status: BodyCaptureStatus;
    response_body: string | null;
    response_body_status: BodyCaptureStatus;
    request_headers: Record<string, string>;
    response_headers: Record<string, string>;
}

export interface WebRequestMeta {
    session_id: string;
    relative_time: number;
    absolute_time: number;
    tab_id: number;
    method: string;
    url: string;
    status_code: number;
    request_headers: Record<string, string>;
    response_headers: Record<string, string>;
    request_body: string | null;
    request_body_status: BodyCaptureStatus;
    duration_ms: number;
    resource_type: string;
}

const MATCH_WINDOW_MS = 2000;

export function correlate(
    web_meta: WebRequestMeta,
    cdp_event: CdpBodyEvent
): NetworkCorrelationStatus {
    if (web_meta.method !== cdp_event.method) return 'ambiguous';
    if (web_meta.status_code !== cdp_event.status_code) return 'ambiguous';
    if (Math.abs(web_meta.absolute_time - cdp_event.timestamp) > MATCH_WINDOW_MS) return 'ambiguous';
    if (web_meta.resource_type !== cdp_event.resource_type) return 'ambiguous';

    const url_match = web_meta.url === cdp_event.url
        || web_meta.url.split('?')[0] === cdp_event.url.split('?')[0];

    if (!url_match) return 'ambiguous';

    return 'matched';
}

export function merge_matched(
    web_meta: WebRequestMeta,
    cdp_event: CdpBodyEvent,
    correlation_status: NetworkCorrelationStatus
): NetworkRequest {
    const request: NetworkRequest = {
        session_id: web_meta.session_id,
        relative_time: web_meta.relative_time,
        absolute_time: web_meta.absolute_time,
        tab_id: web_meta.tab_id || cdp_event.tab_id,
        method: web_meta.method || cdp_event.method,
        url: web_meta.url || cdp_event.url,
        status_code: web_meta.status_code || cdp_event.status_code,
        request_headers: web_meta.request_headers || cdp_event.request_headers,
        response_headers: web_meta.response_headers || cdp_event.response_headers,
        request_body: web_meta.request_body ?? cdp_event.request_body,
        request_body_status: web_meta.request_body_status || cdp_event.request_body_status,
        response_body: cdp_event.response_body,
        response_body_status: cdp_event.response_body_status,
        duration_ms: web_meta.duration_ms,
        resource_type: web_meta.resource_type || cdp_event.resource_type,
        correlation_status,
        cdp_request_id: cdp_event.request_id
    };

    return request;
}

export function build_cdp_only_request(
    cdp_event: CdpBodyEvent,
    session_id: string,
    start_time: number
): NetworkRequest {
    return {
        session_id,
        relative_time: cdp_event.timestamp - start_time,
        absolute_time: cdp_event.timestamp,
        tab_id: cdp_event.tab_id,
        method: cdp_event.method,
        url: cdp_event.url,
        status_code: cdp_event.status_code,
        request_headers: cdp_event.request_headers,
        response_headers: cdp_event.response_headers,
        request_body: cdp_event.request_body,
        request_body_status: cdp_event.request_body_status,
        response_body: cdp_event.response_body,
        response_body_status: cdp_event.response_body_status,
        duration_ms: 0,
        resource_type: cdp_event.resource_type,
        correlation_status: 'cdp_only',
        cdp_request_id: cdp_event.request_id
    };
}

export function build_web_request_only_request(web_meta: WebRequestMeta): NetworkRequest {
    return {
        session_id: web_meta.session_id,
        relative_time: web_meta.relative_time,
        absolute_time: web_meta.absolute_time,
        tab_id: web_meta.tab_id,
        method: web_meta.method,
        url: web_meta.url,
        status_code: web_meta.status_code,
        request_headers: web_meta.request_headers,
        response_headers: web_meta.response_headers,
        request_body: web_meta.request_body,
        request_body_status: web_meta.request_body_status,
        response_body: null,
        response_body_status: 'not_enabled',
        duration_ms: web_meta.duration_ms,
        resource_type: web_meta.resource_type,
        correlation_status: 'web_request_only'
    };
}
