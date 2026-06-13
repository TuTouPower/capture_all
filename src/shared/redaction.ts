// shared/redaction.ts
import { MAX_BODY_CAPTURE_BYTES, MAX_CONSOLE_ARG_BYTES, MAX_TARGET_TEXT_CHARS } from './constants';

const SENSITIVE_HEADER_KEYS = [
    'authorization', 'cookie', 'set-cookie', 'x-api-key',
    'x-csrf-token', 'proxy-authorization', 'www-authenticate'
];

const SENSITIVE_HEADER_PATTERNS = ['token', 'key', 'secret', 'bearer'];

const SENSITIVE_URL_PARAMS = ['token', 'key', 'secret', 'password', 'auth'];

const RESPONSE_PREVIEW_LENGTH = 200;

export interface RedactUrlResult {
    url: string;
    url_status: 'captured' | 'redacted';
}

export interface RedactHeadersResult {
    headers: Record<string, string>;
    headers_status: 'captured' | 'redacted';
}

export interface TruncateBodyResult {
    body: string | null;
    response_preview: string | null;
}

export function redact_headers(headers: Record<string, string>, enabled: boolean = true): RedactHeadersResult {
    if (!enabled) return { headers: { ...headers }, headers_status: 'captured' };
    const result: Record<string, string> = {};
    let redacted = false;
    for (const [key, value] of Object.entries(headers)) {
        const lower_key = key.toLowerCase();
        const lower_value = value.toLowerCase();
        if (SENSITIVE_HEADER_KEYS.includes(lower_key)) {
            result[key] = '[REDACTED]';
            redacted = true;
        } else if (SENSITIVE_HEADER_PATTERNS.some(pattern => lower_key.includes(pattern))) {
            result[key] = '[REDACTED]';
            redacted = true;
        } else if (SENSITIVE_HEADER_PATTERNS.some(pattern => lower_value.includes(pattern))) {
            result[key] = '[REDACTED]';
            redacted = true;
        } else {
            result[key] = value;
        }
    }
    return { headers: result, headers_status: redacted ? 'redacted' : 'captured' };
}

export function redact_url(url: string, redact_query: boolean): RedactUrlResult {
    if (!redact_query) return { url, url_status: 'captured' };
    try {
        const parsed = new URL(url);
        let redacted = false;
        for (const param of SENSITIVE_URL_PARAMS) {
            if (parsed.searchParams.has(param)) {
                parsed.searchParams.set(param, '[REDACTED]');
                redacted = true;
            }
        }
        return { url: parsed.toString(), url_status: redacted ? 'redacted' : 'captured' };
    } catch {
        return { url, url_status: 'captured' };
    }
}

export function truncate(str: string, max_bytes: number, enabled: boolean = true): string {
    if (!enabled) return str;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    if (bytes.length <= max_bytes) return str;
    const decoder = new TextDecoder();
    return decoder.decode(bytes.slice(0, max_bytes)) + '...[TRUNCATED]';
}

export function redact_password(value: string, input_type?: string, enabled: boolean = true): string {
    if (!enabled) return value;
    if (input_type === 'password') return '[REDACTED]';
    return value;
}

export function truncate_request_body(body: string | null, max_bytes = MAX_BODY_CAPTURE_BYTES): string | null {
    if (!body) return null;
    return truncate(body, max_bytes, true);
}

export function truncate_response_body(body: string | null, max_bytes = MAX_BODY_CAPTURE_BYTES): TruncateBodyResult {
    if (!body) return { body: null, response_preview: null };
    const preview = body.slice(0, RESPONSE_PREVIEW_LENGTH);
    return {
        body: truncate(body, max_bytes, true),
        response_preview: preview,
    };
}

export function truncate_console_args(args: string[], enabled: boolean = true): string[] {
    return args.map(arg => truncate(arg, MAX_CONSOLE_ARG_BYTES, enabled));
}

export function truncate_target_text(text: string, enabled: boolean = true): string {
    if (!enabled) return text;
    if (text.length <= MAX_TARGET_TEXT_CHARS) return text;
    return text.slice(0, MAX_TARGET_TEXT_CHARS) + '...[TRUNCATED]';
}
