// background/network_webrequest.ts
// webRequest listeners + body decode/encode utilities + resource type resolution.

import type { BodyCaptureStatus, NetworkRequestData } from '../../shared/types';
import { truncate_request_body } from '../../shared/redaction';
import type { NetworkCaptureContext } from './network_context';

// ─── Pure utility functions (no context dependency) ───

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

export function extract_request_body(
    details: any,
    capture_enabled?: boolean,
    max_body_capture_bytes?: number
): { body: string | null; status: BodyCaptureStatus } {
    const enabled = capture_enabled;
    if (enabled === false) {
        return { body: null, status: 'not_enabled' };
    }
    if (enabled === undefined) {
        // Caller must pass config explicitly when needed
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

    if (max_body_capture_bytes !== undefined) {
        const byte_len = new TextEncoder().encode(body).length;
        if (byte_len > max_body_capture_bytes) {
            return { body: truncate_request_body(body, max_body_capture_bytes), status: 'too_large' };
        }
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

// ─── Resource type resolution ───

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

export function extract_mime_type(headers: Record<string, string>): string | null {
    const ct = headers['content-type'] || headers['Content-Type'] || null;
    if (!ct) return null;
    return ct.split(';')[0].trim() || null;
}

// ─── webRequest event handlers (need context) ───

export function create_webrequest_handlers(ctx: NetworkCaptureContext) {
    const { redact_headers } = require('../../shared/redaction');
    const { redact_url } = require('../../shared/redaction');
    const { is_self_origin_url } = require('./network_capture');

    function handle_before_request(details: any): void {
        if (!ctx.is_capturing) return;
        if (ctx.dbg_tab_id !== null && details.tabId === ctx.dbg_tab_id) return;
        if (is_self_origin_url(details.url)) return;

        const { body, status } = extract_request_body(details, ctx.config.capture_request_body, ctx.config.max_body_capture_bytes);

        const pending = {
            cdp_request_id: details.requestId,
            tab_id: details.tabId,
            method: details.method,
            url: redact_url(details.url, Boolean(ctx.config.redact_data) && ctx.config.redact_url_query).url,
            timestamp: details.timeStamp,
            request_headers: {},
            response_headers: {},
            request_body: body,
            request_body_status: status,
            resource_type: details.type || 'other',
            mime_type: null as string | null,
        };

        ctx.pending_requests.set(details.requestId, pending);
    }

    function handle_before_send_headers(details: any): void {
        if (!ctx.is_capturing) return;
        if (ctx.dbg_tab_id !== null && details.tabId === ctx.dbg_tab_id) return;
        const pending = ctx.pending_requests.get(details.requestId);
        if (!pending) return;

        const headers = headers_array_to_map(details.requestHeaders);
        pending.request_headers = (ctx.config.redact_data && ctx.config.redact_sensitive_headers)
            ? redact_headers(headers, true).headers : headers;
    }

    function handle_headers_received(details: any): void {
        if (!ctx.is_capturing) return;
        if (ctx.dbg_tab_id !== null && details.tabId === ctx.dbg_tab_id) return;
        const pending = ctx.pending_requests.get(details.requestId);
        if (!pending) return;

        const headers = headers_array_to_map(details.responseHeaders);
        pending.response_headers = (ctx.config.redact_data && ctx.config.redact_sensitive_headers)
            ? redact_headers(headers, true).headers : headers;
        pending.mime_type = extract_mime_type(pending.response_headers);
    }

    function handle_error(details: any): void {
        if (!ctx.is_capturing) return;
        if (ctx.dbg_tab_id !== null && details.tabId === ctx.dbg_tab_id) return;
        ctx.pending_requests.delete(details.requestId);
    }

    return {
        handle_before_request,
        handle_before_send_headers,
        handle_headers_received,
        handle_error,
    };
}
