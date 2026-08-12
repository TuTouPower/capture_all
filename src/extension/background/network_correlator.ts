// background/network_correlator.ts
// Merges webRequest metadata and CDP body events into unified NetworkRequest.

import type { NetworkRequestData, NetworkCorrelationStatus, BodyCaptureStatus } from '../../shared/types';
import { resolve_resource_type, extract_mime_type } from './network_webrequest';
import { build_network_data } from '../../shared/network_builder';

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
    response_preview: string | null;
    // B1-L5: CDP getResponseBody 可能 base64 返回；携带实际编码/字节供 build_network_data 正确标注
    response_body_encoding?: 'utf8' | 'base64' | null;
    response_body_bytes?: number | null;
    request_headers: Record<string, string>;
    response_headers: Record<string, string>;
}

export interface WebRequestMeta {
    capture_id: string;
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
): NetworkRequestData {
    // T056: 空对象 {} 为 truthy 但无内容；用 keys 长度判断是否真正可用
    const has_headers = (h: Record<string, string> | null | undefined): boolean =>
        !!h && Object.keys(h).length > 0;
    const merged_body = web_meta.request_body ?? cdp_event.request_body;
    const request: NetworkRequestData = build_network_data({
        capture_id: web_meta.capture_id,
        relative_time: web_meta.relative_time,
        absolute_time: web_meta.absolute_time,
        tab_id: web_meta.tab_id || cdp_event.tab_id,
        request_id: cdp_event.request_id,
        method: web_meta.method || cdp_event.method,
        url: web_meta.url || cdp_event.url,
        url_status: 'captured',
        status_code: web_meta.status_code || cdp_event.status_code,
        resource_type: resolve_resource_type(web_meta.resource_type || cdp_event.resource_type),
        duration_ms: web_meta.duration_ms,
        // T056: 空对象 {} 为 truthy 但无内容；用 has_headers 判断是否真正可用
        request_headers: has_headers(web_meta.request_headers) ? web_meta.request_headers : (cdp_event.request_headers || {}),
        response_headers: has_headers(web_meta.response_headers) ? web_meta.response_headers : (cdp_event.response_headers || {}),
        headers_status: 'captured',
        request_body: merged_body,
        request_body_status: web_meta.request_body_status || cdp_event.request_body_status,
        response_body: cdp_event.response_body,
        response_preview: cdp_event.response_preview,
        response_body_status: cdp_event.response_body_status,
        mime_type: extract_mime_type(web_meta.response_headers || cdp_event.response_headers),
        capture_method: 'web_request',
        body_capture_mode: 'extension_cdp',
        correlation_status,
        cdp_request_id: cdp_event.request_id,
    });

    return request;
}

export function build_cdp_only_request(
    cdp_event: CdpBodyEvent,
    capture_id: string,
    start_time: number
): NetworkRequestData {
    return build_network_data({
        capture_id,
        request_id: cdp_event.request_id,
        method: cdp_event.method,
        url: cdp_event.url,
        url_status: 'captured',
        status_code: cdp_event.status_code,
        resource_type: resolve_resource_type(cdp_event.resource_type),
        duration_ms: 0,
        relative_time: cdp_event.timestamp - start_time,
        absolute_time: cdp_event.timestamp,
        tab_id: cdp_event.tab_id,
        request_headers: cdp_event.request_headers,
        response_headers: cdp_event.response_headers,
        headers_status: 'captured',
        request_body: cdp_event.request_body,
        request_body_status: cdp_event.request_body_status,
        response_body: cdp_event.response_body,
        response_preview: cdp_event.response_preview,
        response_body_status: cdp_event.response_body_status,
        response_body_encoding: cdp_event.response_body_encoding ?? null,
        response_body_bytes: cdp_event.response_body_bytes ?? null,
        mime_type: extract_mime_type(cdp_event.response_headers),
        capture_method: 'extension_cdp',
        body_capture_mode: 'extension_cdp',
        correlation_status: 'cdp_only',
        cdp_request_id: cdp_event.request_id,
    });
}

export function build_web_request_only_request(web_meta: WebRequestMeta): NetworkRequestData {
    return build_network_data({
        capture_id: web_meta.capture_id,
        relative_time: web_meta.relative_time,
        absolute_time: web_meta.absolute_time,
        tab_id: web_meta.tab_id,
        request_id: `wr_${Date.now().toString(36)}`,
        method: web_meta.method,
        url: web_meta.url,
        url_status: 'captured',
        status_code: web_meta.status_code,
        resource_type: resolve_resource_type(web_meta.resource_type),
        duration_ms: web_meta.duration_ms,
        request_headers: web_meta.request_headers,
        response_headers: web_meta.response_headers,
        headers_status: 'captured',
        request_body: web_meta.request_body,
        request_body_status: web_meta.request_body_status,
        response_body: null,
        response_body_status: 'not_enabled',
        mime_type: extract_mime_type(web_meta.response_headers),
        capture_method: 'web_request',
        body_capture_mode: 'none',
        correlation_status: 'web_request_only',
    });
}
