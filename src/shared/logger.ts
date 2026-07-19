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

let _global_level: LogLevel = 'debug';

function truncate_bytes_safe(s: string, max_bytes: number): string {
    if (s.length * 3 <= max_bytes) return s; // 快速路径：UTF-8 上界每字符 3 字节
    const encoder = new TextEncoder();
    const bytes = encoder.encode(s);
    if (bytes.length <= max_bytes) return s;
    const decoder = new TextDecoder();
    const sliced = decoder.decode(bytes.subarray(0, max_bytes), { stream: false });
    return sliced + '...[TRUNCATED]';
}

// URL 子串模式：扫描字符串中嵌入的绝对 URL，便于在 message/details 文本中脱敏
const URL_SUBSTRING_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`)]+/gi;

function sanitize_string(s: string): string {
    let result = s.replace(URL_SUBSTRING_PATTERN, (m) => redact_url(m, true).url);
    return truncate_bytes_safe(result, MAX_LOG_ENTRY_BYTES);
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
            stack: typeof value.stack === 'string' ? truncate_bytes_safe(value.stack, MAX_LOG_ENTRY_BYTES) : value.stack,
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
            result[k] = sanitize_value(v, seen);
        }
        return result;
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
                ? new Error().stack?.split('\n').slice(2).join('\n')
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
        while (this.buffer.length > 0) {
            this.send_batch();
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
