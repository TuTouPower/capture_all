// shared/logger.ts — unified logging system
import type { AppLogEntry, LogLevel, LogQueryFilter } from './types';
import { redact_url } from './redaction';
import { MAX_LOG_ENTRY_BYTES } from './constants';

export interface LogTransport {
    write(entry: AppLogEntry): void;
    flush(): Promise<void>;
    get_entries(limit: number, offset: number, filters?: LogQueryFilter): Promise<AppLogEntry[]>;
    count(filters?: LogQueryFilter): Promise<number>;
    clear(): Promise<void>;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
    debug: 0, info: 1, warn: 2, error: 3, silent: 4,
};

let _global_level: LogLevel = 'info';

function truncate_bytes_safe(s: string, max_bytes: number): string {
    if (s.length * 3 <= max_bytes) return s; // 快速路径：UTF-8 上界每字符 3 字节
    const encoder = new TextEncoder();
    const bytes = encoder.encode(s);
    if (bytes.length <= max_bytes) return s;
    const decoder = new TextDecoder();
    const sliced = decoder.decode(bytes.subarray(0, max_bytes), { stream: false });
    return sliced + '...[TRUNCATED]';
}

// URL 子串模式：扫描字符串中嵌入的 URL（绝对或相对含 query），便于脱敏
// T100: 相对 URL（path?token=x）与绝对 URL 均纳入；bare-query 要求 key=value 形态，
// 排除 JS 可选链（?.token）/ 三元（cond?x:y）误匹配。
// t113: 边界启发式 — bare-query 与 path-query 前加 lookbehind，仅认可明确 URL 上下文
// （行首/空白/左括号/逗号/引号/=）后的片段；无斜杠相对路径（file?token=x）退出任意文本扫描
// （用户确认的隐私覆盖收缩，见 docs/specs/privacy_logger_stack_redact_url.md）。
const URL_SUBSTRING_PATTERN = /(?:[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`)]+|(?<=^|[=\s([,<"'])\/[^\s"'<>`)]*\?[^\s"'<>`)]*=[^\s"'<>`)]*|(?<=^|[=\s([,<"'])\?[^\s"'<>`)]*=[^\s"'<>`)]+)/gi;

function sanitize_string(s: string): string {
    let result = s.replace(URL_SUBSTRING_PATTERN, (m) => redact_url(m, true).url);
    return truncate_bytes_safe(result, MAX_LOG_ENTRY_BYTES);
}

// H3: credential 形字段名一律脱敏，防止请求/响应头直接入日志时 token 落库。
const SENSITIVE_LOG_FIELDS = ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'token', 'secret', 'password'];

function is_sensitive_log_field(key: string): boolean {
    return SENSITIVE_LOG_FIELDS.some((f) => key.toLowerCase().includes(f));
}

function sanitize_value(value: unknown, seen: WeakSet<object>): unknown {
    if (typeof value === 'string') {
        return sanitize_string(value);
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (value instanceof Error) {
        return {
            name: value.name,
            message: sanitize_string(value.message),
            // T100: stack 与 message 同走 URL 脱敏，不 fail-open 泄露 query 敏感值
            stack: typeof value.stack === 'string' ? sanitize_string(value.stack) : value.stack,
        };
    }
    if (value instanceof Date || value instanceof RegExp || value instanceof ArrayBuffer ||
        (ArrayBuffer.isView(value) && !(value instanceof DataView)) ||
        value instanceof Map || value instanceof Set ||
        value instanceof WeakMap || value instanceof WeakSet) {
        return value;
    }
    if (seen.has(value as object)) {
        return '[Circular]';
    }
    seen.add(value as object);
    try {
        if (Array.isArray(value)) {
            return value.map((v) => sanitize_value(v, seen));
        }
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            // H3: 敏感字段名直接脱敏值，阻止 credential 明文进入 app_logs
            result[k] = is_sensitive_log_field(k) ? '[REDACTED]' : sanitize_value(v, seen);
        }
        return result;
    } catch {
        // B1-M7: getter/proxy 抛错时日志点不能成为崩溃源，返回占位符
        return '[Unserializable]';
    } finally {
        seen.delete(value as object);
    }
}

export function sanitize_log_value(value: unknown): unknown {
    return sanitize_value(value, new WeakSet());
}

export class Logger {
    constructor(
        private module: string,
        private transport: LogTransport,
    ) {}

    debug(message: string, details?: unknown): void {
        this.write('debug', message, details);
    }

    info(message: string, details?: unknown): void {
        this.write('info', message, details);
    }

    warn(message: string, details?: unknown): void {
        this.write('warn', message, details);
    }

    error(message: string, details?: unknown): void {
        this.write('error', message, details);
    }

    private write(level: LogLevel, message: string, details?: unknown): void {
        if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[_global_level]) return;

        const sanitized_message = sanitize_string(message);
        const sanitized_details = sanitize_log_value(details);

        const entry: AppLogEntry = {
            id: generate_log_id(),
            timestamp: Date.now(),
            level,
            module: this.module,
            message: sanitized_message,
            details: sanitized_details,
            stack: level === 'error'
                ? (() => {
                    const st = new Error().stack?.split('\n').slice(2).join('\n');
                    return st ? sanitize_string(st) : st;
                })()
                : undefined,
        };

        this.transport.write(entry);
    }

    static get_level(): LogLevel {
        return _global_level;
    }

    static set_level(level: LogLevel): void {
        _global_level = level;
    }
}

export function generate_log_id(): string {
    return `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// MessageLogTransport — for content script (relays via sendMessage)
// ============================================================

export class MessageLogTransport implements LogTransport {
    private buffer: AppLogEntry[] = [];
    private readonly batch_size = 20;
    // B2-M20: flush 50ms 循环加轮次上限，防 sendMessage 失败静默丢批时无限自旋
    private readonly max_flush_rounds = 5;

    write(entry: AppLogEntry): void {
        this.buffer.push(entry);
        if (this.buffer.length >= this.batch_size) {
            this.send_batch();
        }
    }

    private send_batch(): void {
        const batch = this.buffer.splice(0);
        chrome.runtime.sendMessage({
            action: 'app_log_batch',
            entries: batch,
        }).catch(() => {
            // SW may be dormant — silently drop
        });
    }

    async flush(): Promise<void> {
        let rounds = 0;
        while (this.buffer.length > 0 && rounds < this.max_flush_rounds) {
            this.send_batch();
            rounds += 1;
            await new Promise(r => setTimeout(r, 50));
        }
    }

    async get_entries(): Promise<AppLogEntry[]> {
        throw new Error('MessageLogTransport: get_entries not supported');
    }

    async count(): Promise<number> {
        throw new Error('MessageLogTransport: count not supported');
    }

    async clear(): Promise<void> {
        throw new Error('MessageLogTransport: clear not supported');
    }
}
