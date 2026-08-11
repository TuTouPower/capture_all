// shared/redaction.ts
import { MAX_BODY_CAPTURE_BYTES, MAX_CONSOLE_ARG_BYTES, MAX_TARGET_TEXT_CHARS } from './constants';

const SENSITIVE_HEADER_KEYS = [
    'authorization', 'cookie', 'set-cookie', 'x-api-key',
    'x-csrf-token', 'proxy-authorization', 'www-authenticate'
];

const SENSITIVE_HEADER_PATTERNS = ['token', 'key', 'secret', 'bearer'];

const SENSITIVE_URL_PARAM_PATTERNS = ['token', 'key', 'secret', 'password', 'passwd', 'auth', 'credential', 'jwt'];

// t114: 嵌套 query 递归脱敏深度上限，防深层嵌套链无限递归
const NESTED_QUERY_MAX_DEPTH = 5;

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

// t114: 检测非敏感参数值中内嵌的 query 形态（plain 或单层解码后），
// 返回嵌套子串（自 `?` 起）与是否编码。单层解码避免重复解码误判（双编码 %253F 不触发）。
// allow_encoded=false 用于 absolute 分支（URLSearchParams 已解码一层，再 decode 会触发双编码误判）。
function find_nested_query(value: string, allow_encoded: boolean): { nested: string; encoded: boolean } | null {
    const q = value.indexOf('?');
    if (q !== -1 && /[?&][^#&]*=[^#&]+/.test(value.slice(q))) {
        return { nested: value.slice(q), encoded: false };
    }
    if (!allow_encoded) return null;
    let dec: string;
    try {
        dec = decodeURIComponent(value);
    } catch {
        return null;
    }
    if (dec === value) return null;
    const dq = dec.indexOf('?');
    if (dq !== -1 && /[?&][^#&]*=[^#&]+/.test(dec.slice(dq))) {
        return { nested: dec.slice(dq), encoded: true };
    }
    return null;
}

// t114: 对非敏感参数 value 做嵌套 query 递归脱敏；无嵌套或不触发返回 null（保持原值）。
// allow_encoded=false 时仅 plain 检测（absolute 分支 value 已被 URLSearchParams 解码）。
// 深度超限 fail-closed：嵌套过深无法安全递归时整体置 [REDACTED]，不泄露明文。
function redact_nested_value(value: string, depth: number, allow_encoded: boolean): string | null {
    if (depth >= NESTED_QUERY_MAX_DEPTH) {
        // 深度超限属异常嵌套，安全优先：整体脱敏而非保留可能含敏感值的原文
        return '[REDACTED]';
    }
    const found = find_nested_query(value, allow_encoded);
    if (!found) return null;
    // encoded 命中的嵌套子串已解码一层，递归时不得再允许解码（避免两层解码误判，f005）；
    // plain 命中的子串继承当前 allow_encoded 语义。
    const nested = redact_url(found.nested, true, depth + 1, found.encoded ? false : allow_encoded);
    if (nested.url_status !== 'redacted') return null;
    if (found.encoded) {
        // encoded 形态：解码重组后整体 encodeURIComponent 写回，保持 URL 编码合法性
        let dec: string;
        try {
            dec = decodeURIComponent(value);
        } catch {
            return null;
        }
        const new_val = dec.slice(0, dec.length - found.nested.length) + nested.url;
        return encodeURIComponent(new_val);
    }
    return value.slice(0, value.length - found.nested.length) + nested.url;
}

export function redact_url(url: string, redact_query: boolean, _depth = 0, _allow_encoded = true): RedactUrlResult {
    if (!redact_query) return { url, url_status: 'captured' };
    if (_depth >= NESTED_QUERY_MAX_DEPTH) {
        // f006: 深度超限 fail-closed — 无法安全递归时整体脱敏，不泄露明文也不谎报状态
        return { url: '[REDACTED]', url_status: 'redacted' };
    }

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
        // t114: 非敏感 key 的 value 内嵌 query 递归脱敏（absolute/base-resolved 外层）。
        // absolute 分支 value 已被 URLSearchParams 解码一层，只做 plain 检测避免双编码误判。
        const non_sensitive_keys = [...parsed.searchParams.keys()].filter(
            (k) => !sensitive_keys.includes(k)
        );
        for (const key of non_sensitive_keys) {
            const values = parsed.searchParams.getAll(key);
            let changed = false;
            const new_values = values.map((v) => {
                const nested = redact_nested_value(v, _depth, false);
                if (nested !== null) {
                    changed = true;
                    return nested;
                }
                return v;
            });
            if (changed) {
                parsed.searchParams.delete(key);
                for (const nv of new_values) {
                    parsed.searchParams.append(key, nv);
                }
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
            // t114: 非敏感 key 的 value 内嵌 query 递归（plain 与 %3F/%3D 编码均覆盖）。
            // allow_encoded 继承调用方语义：absolute 递归下来的嵌套已解码，不得再允许编码解码。
            const nested_value = redact_nested_value(value, _depth, _allow_encoded);
            if (nested_value !== null) {
                redacted = true;
                return `${raw_key}=${nested_value}`;
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
