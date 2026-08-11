// background/network_webrequest.ts
// webRequest listeners + body decode/encode utilities + resource type resolution.

import type { BodyCaptureStatus, NetworkRequestData } from '../../shared/types';
import { truncate_request_body } from '../../shared/redaction';

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
        const value = h.value || '';
        if (h.name in out) {
            // T055: 重复 header（如 Set-Cookie/Warning/Link）用逗号合并保留所有值
            out[h.name] = `${out[h.name]}, ${value}`;
        } else {
            out[h.name] = value;
        }
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
