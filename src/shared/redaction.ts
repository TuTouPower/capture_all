// shared/redaction.ts
import { MAX_REQUEST_BODY_BYTES, MAX_RESPONSE_BODY_BYTES, MAX_CONSOLE_ARG_BYTES, MAX_TARGET_TEXT_CHARS } from './constants';

const SENSITIVE_HEADER_KEYS = [
    'authorization', 'cookie', 'set-cookie', 'x-api-key',
    'x-csrf-token', 'proxy-authorization', 'www-authenticate'
];

const SENSITIVE_HEADER_PATTERNS = ['token', 'key', 'secret', 'bearer'];

const SENSITIVE_URL_PARAMS = ['token', 'key', 'secret', 'password', 'auth'];

export function redact_headers(headers: Record<string, string>, enabled: boolean = true): Record<string, string> {
    if (!enabled) return { ...headers };
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_HEADER_KEYS.includes(lowerKey)) {
            result[key] = '[REDACTED]';
        } else if (SENSITIVE_HEADER_PATTERNS.some(pattern => lowerKey.includes(pattern))) {
            result[key] = '[REDACTED]';
        } else {
            result[key] = value;
        }
    }
    return result;
}

export function redact_url(url: string, redact_query: boolean): string {
    if (!redact_query) return url;
    try {
        const parsed = new URL(url);
        for (const param of SENSITIVE_URL_PARAMS) {
            if (parsed.searchParams.has(param)) {
                parsed.searchParams.set(param, '[REDACTED]');
            }
        }
        return parsed.toString();
    } catch {
        return url;
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

export function truncate_request_body(body: string | null, enabled: boolean = true): string | null {
    if (!body) return null;
    return truncate(body, MAX_REQUEST_BODY_BYTES, enabled);
}

export function truncate_response_body(body: string | null, enabled: boolean = true): string | null {
    if (!body) return null;
    return truncate(body, MAX_RESPONSE_BODY_BYTES, enabled);
}

export function truncate_console_args(args: string[], enabled: boolean = true): string[] {
    return args.map(arg => truncate(arg, MAX_CONSOLE_ARG_BYTES, enabled));
}

export function truncate_target_text(text: string, enabled: boolean = true): string {
    if (!enabled) return text;
    if (text.length <= MAX_TARGET_TEXT_CHARS) return text;
    return text.slice(0, MAX_TARGET_TEXT_CHARS) + '...[TRUNCATED]';
}
