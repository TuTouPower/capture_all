// shared/logger.ts — unified logging system
import type { AppLogEntry, LogLevel, LogQueryFilter } from './types';

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

let _global_level: LogLevel = 'warn';

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

        const entry: AppLogEntry = {
            id: generate_log_id(),
            timestamp: Date.now(),
            level,
            module: this.module,
            message,
            details,
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
