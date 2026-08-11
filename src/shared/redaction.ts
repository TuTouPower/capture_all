// shared/redaction.ts
import { MAX_BODY_CAPTURE_BYTES, MAX_CONSOLE_ARG_BYTES, MAX_TARGET_TEXT_CHARS } from './constants';

const SENSITIVE_HEADER_KEYS = [
    'authorization', 'cookie', 'set-cookie', 'x-api-key',
    'x-csrf-token', 'proxy-authorization', 'www-authenticate'
];

const SENSITIVE_HEADER_PATTERNS = ['token', 'key', 'secret', 'bearer'];

const SENSITIVE_URL_PARAM_PATTERNS = ['token', 'key', 'secret', 'password', 'passwd', 'auth', 'credential', 'jwt'];

// 绝对 URL 子串（T100: 用于检测 param 值内嵌 URL 需递归脱敏）
const URL_SUBSTRING_RE = /[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`)]+/i;

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
        const lower_key = (key || '').toLowerCase();
        const lower_value = (value || '').toLowerCase();
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

    // T100: 相对 URL / 无法 new URL 解析的串（path?token=x）也按 query 脱敏，不 fail-open。
    // 统一拆 query 再重组，保留原始串形态（相对路径/绝对 URL 均适用）。
    try {
        const parsed = new URL(url);
        let redacted = false;
        const sensitive_keys: string[] = [];
        for (const key of parsed.searchParams.keys()) {
            const lower_key = key.toLowerCase();
            if (SENSITIVE_URL_PARAM_PATTERNS.some(pattern => lower_key.includes(pattern))) {
                sensitive_keys.push(key);
            }
        }
        for (const key of sensitive_keys) {
            const values = parsed.searchParams.getAll(key);
            parsed.searchParams.delete(key);
            for (const _ of values) {
                parsed.searchParams.append(key, '[REDACTED]');
                redacted = true;
            }
        }
        return { url: parsed.toString(), url_status: redacted ? 'redacted' : 'captured' };
    } catch {
        // 相对 URL 或无法 parse：拆分 path、query、fragment 手动脱敏
        const hash_marker = url.indexOf('#');
        const without_hash = hash_marker === -1 ? url : url.slice(0, hash_marker);
        const hash_part = hash_marker === -1 ? '' : url.slice(hash_marker);
        const query_marker = without_hash.indexOf('?');
        if (query_marker === -1) return { url, url_status: 'captured' };
        const path_part = without_hash.slice(0, query_marker);
        const query_part = without_hash.slice(query_marker + 1);
        const params = query_part.split('&');
        let redacted = false;
        const out_params = params.map((param) => {
            const eq = param.indexOf('=');
            const raw_key = eq === -1 ? param : param.slice(0, eq);
            const value = eq === -1 ? '' : param.slice(eq + 1);
            // T100: key 先 decode 再匹配（编码 key 场景）；param 值内嵌绝对 URL 时递归脱敏
            let key: string;
            try {
                key = decodeURIComponent(raw_key);
            } catch {
                key = raw_key;
            }
            const lower_key = key.toLowerCase();
            if (SENSITIVE_URL_PARAM_PATTERNS.some(pattern => lower_key.includes(pattern))) {
                redacted = true;
                return `${raw_key}=[REDACTED]`;
            }
            if (value && URL_SUBSTRING_RE.test(value)) {
                // T100: 仅当递归实际脱敏才置 redacted，避免 url_status 语义失真
                const nested = redact_url(value, true);
                if (nested.url_status === 'redacted') redacted = true;
                return `${raw_key}=${nested.url}`;
            }
            return param;
        });
        return { url: `${path_part}?${out_params.join('&')}${hash_part}`, url_status: redacted ? 'redacted' : 'captured' };
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
    // type=password 永远不采集，优先于 redact_data 开关
    if (input_type === 'password') return '[REDACTED]';
    if (!enabled) return value;
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
