// shared/body_redaction.ts — t171 SEC-003: body MIME 敏感 key 脱敏 + 不可解析 fallback
// redact_data 开启时对采集的 request/response body 落库前调用：可解析的 form-urlencoded/JSON
// 按敏感 key 脱敏；multipart 与不可解析二进制降级为长度摘要（不落盘完整原始内容）。
// 纯字符串处理（无 node crypto 依赖，扩展/桥共用）。

export interface RedactedBody {
    content: string;
    /** 'redacted' = 按敏感 key 脱敏后的原文；'preview' = 无法安全解析，降级摘要 */
    mode: 'redacted' | 'preview';
}

const SENSITIVE_KEY_PATTERNS = [
    'password', 'passwd', 'token', 'secret', 'api_key', 'apikey',
    'auth', 'credential', 'jwt', 'authorization', 'cookie',
];

const REDACTED = '[REDACTED]';

// f004/f008: 词边界匹配——完整 key、-_. 分隔段或数字后缀（password2 类确认字段），
// 避免误伤 author/tokenizer 等含子串的非敏感 key
function is_sensitive_key(key: string): boolean {
    const lower = key.toLowerCase();
    return SENSITIVE_KEY_PATTERNS.some(p =>
        lower === p
        || lower.includes(`_${p}`) || lower.includes(`-${p}`) || lower.includes(`.${p}`)
        || lower.includes(`${p}_`) || lower.includes(`${p}-`) || lower.includes(`${p}.`)
        || new RegExp(`(^|[-_.])${p}\\d*$`).test(lower)
        || new RegExp(`^${p}\\d*([-_.]|$)`).test(lower),
    );
}

/** 不可解析/不支持 MIME：返回长度（f005: 不含 preview，防截断段残留完整敏感值） */
function preview_summary(body: string): RedactedBody {
    return {
        content: `[body_redacted:len=${body.length}]`,
        mode: 'preview',
    };
}

function redact_urlencoded(body: string): RedactedBody {
    try {
        const parts = body.split('&').map(pair => {
            const eq = pair.indexOf('=');
            if (eq < 0) return pair;
            const key = pair.slice(0, eq);
            return is_sensitive_key(decodeURIComponent(key).replace(/\+/g, ' '))
                ? `${key}=${REDACTED}`
                : pair;
        });
        return { content: parts.join('&'), mode: 'redacted' };
    } catch {
        // f005: 解析失败（编码异常等）→ 长度摘要，不返回可含敏感值的部分内容
        return preview_summary(body);
    }
}

function redact_json_value(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(item => redact_json_value(item));
    }
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            out[key] = is_sensitive_key(key) ? REDACTED : redact_json_value(val);
        }
        return out;
    }
    return value;
}

function redact_json(body: string): RedactedBody {
    try {
        const parsed = JSON.parse(body);
        return { content: JSON.stringify(redact_json_value(parsed)), mode: 'redacted' };
    } catch {
        // f005: 解析失败 → 长度摘要
        return preview_summary(body);
    }
}

/**
 * 统一入口：按 MIME 脱敏。mime_type 为空/未知时走 preview 降级（不猜解析，防误解析破坏结构）。
 * multipart 含敏感 part 或文件内容（filename）时整体降级 preview（password/file 内容默认跳过）。
 */
export function redact_body(body: string | null | undefined, mime_type: string | null | undefined, _max_preview_bytes: number): RedactedBody | null {
    if (body === null || body === undefined) return null;
    if (body === '') return { content: '', mode: 'redacted' };
    const mime = (mime_type || '').toLowerCase();
    if (mime.includes('x-www-form-urlencoded')) return redact_urlencoded(body);
    if (mime.includes('json')) return redact_json(body);
    if (mime.includes('multipart')) {
        // multipart：敏感 part（name 含敏感 key 或 file 内容）→ 整体降级 preview
        if (is_sensitive_multipart(body)) {
            return preview_summary(body);
        }
        return { content: body, mode: 'redacted' };
    }
    // 未知/二进制：不猜解析，降级预览（AC-003 不落盘完整原始内容）
    return preview_summary(body);
}

function is_sensitive_multipart(body: string): boolean {
    // f003: 任何 file part（filename 存在）或敏感 name 均视为含敏感内容 → 降级
    const name_matches = body.matchAll(/name="([^"]*)"/g);
    for (const m of name_matches) {
        if (is_sensitive_key(m[1])) return true;
    }
    return /filename="[^"]*"/.test(body);
}
