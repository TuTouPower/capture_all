// shared/network_builder.ts
// NetworkRequestData 构造 helper：集中 request/response body 的字节与编码派生、
// null 默认字段填充，消除各构造点重复的 ~20 字段样板。

import type { NetworkRequestData, BodyCaptureStatus } from './types';

export interface NetworkDataInput {
    capture_id?: string;
    event_id?: string;
    request_id: string;
    method: string;
    url: string;
    url_status: 'captured' | 'redacted';
    status_code: number | null;
    resource_type: NetworkRequestData['resource_type'];
    duration_ms: number | null;
    start_time_ms?: number | null;
    end_time_ms?: number | null;
    request_headers: Record<string, string> | null;
    response_headers: Record<string, string> | null;
    headers_status: 'captured' | 'redacted';
    request_body?: string | null;
    request_body_status?: BodyCaptureStatus;
    request_body_mime?: string | null;
    // B1-L5: body 可能是 CDP base64 编码；显式传 encoding/bytes 时以实际为准，
    // 缺省才按 utf8 派生（避免把 base64 串误标 utf8、字节数算错）。
    request_body_encoding?: 'utf8' | 'base64' | null;
    request_body_bytes?: number | null;
    response_body?: string | null;
    response_preview?: string | null;
    response_body_status?: BodyCaptureStatus;
    response_body_encoding?: 'utf8' | 'base64' | null;
    response_body_bytes?: number | null;
    mime_type?: string | null;
    capture_method: NetworkRequestData['capture_method'];
    body_capture_mode: NetworkRequestData['body_capture_mode'];
    /** 不派生 body 字节/编码（hook 预览通道 body 已截断，派生失真）。默认派生。 */
    derive_body?: boolean;
    tab_id?: number;
    relative_time?: number;
    absolute_time?: number;
    correlation_status?: NetworkRequestData['correlation_status'];
    cdp_request_id?: string;
    ws_connection_id?: string;
    ws_status?: NetworkRequestData['ws_status'];
    stream_mode?: NetworkRequestData['stream_mode'];
    /** 显式覆盖额外字段（如 service_worker 构造点补充字段） */
    extra?: Partial<NetworkRequestData>;
}

function utf8_bytes(s: string | null | undefined): number | null {
    return s ? new TextEncoder().encode(s).length : null;
}

/** 构造 NetworkRequestData：派生 body 字节/编码，填 null 默认字段。 */
export function build_network_data(input: NetworkDataInput): NetworkRequestData {
    const request_body = input.request_body ?? null;
    const response_body = input.response_body ?? null;
    const derive = input.derive_body !== false;

    return {
        capture_id: input.capture_id,
        event_id: input.event_id,
        request_id: input.request_id,
        method: input.method,
        url: input.url,
        url_status: input.url_status,
        status_code: input.status_code,
        status_text: null,
        protocol: null,
        resource_type: input.resource_type,
        initiator: null,
        duration_ms: input.duration_ms,
        start_time_ms: input.start_time_ms ?? null,
        end_time_ms: input.end_time_ms ?? null,
        request_headers: input.request_headers,
        response_headers: input.response_headers,
        headers_status: input.headers_status,
        request_body,
        request_body_status: input.request_body_status ?? 'not_enabled',
        request_body_encoding: input.request_body_encoding !== undefined
            ? input.request_body_encoding
            : (derive && request_body ? 'utf8' : null),
        request_body_bytes: input.request_body_bytes !== undefined
            ? input.request_body_bytes
            : (derive ? utf8_bytes(request_body) : null),
        request_body_mime: input.request_body_mime ?? null,
        response_body,
        response_preview: input.response_preview ?? null,
        response_body_status: input.response_body_status ?? 'not_enabled',
        response_body_encoding: input.response_body_encoding !== undefined
            ? input.response_body_encoding
            : (derive && response_body ? 'utf8' : null),
        response_body_bytes: input.response_body_bytes !== undefined
            ? input.response_body_bytes
            : (derive ? utf8_bytes(response_body) : null),
        mime_type: input.mime_type ?? null,
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: null,
        cache_status: null,
        error_text: null,
        capture_method: input.capture_method,
        body_capture_mode: input.body_capture_mode,
        tab_id: input.tab_id,
        relative_time: input.relative_time,
        absolute_time: input.absolute_time,
        correlation_status: input.correlation_status,
        cdp_request_id: input.cdp_request_id,
        ws_connection_id: input.ws_connection_id,
        ws_status: input.ws_status,
        stream_mode: input.stream_mode,
        ...input.extra,
    };
}
