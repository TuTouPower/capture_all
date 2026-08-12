// background/app_log_storage.ts — IndexedDBLogTransport + singleton
import type { AppLogEntry, LogQueryFilter } from '../../shared/types';
import { STORE_NAMES } from '../../shared/constants';
import { get_db } from './storage';
import { load_user_config } from '../../shared/user_config';
import type { LogTransport } from '../../shared/logger';

// T049: 准确估算 entry 字节（含 details/stack，按 UTF-8）
function estimate_entry_bytes(entry: AppLogEntry): number {
    try {
        return new TextEncoder().encode(JSON.stringify(entry)).length;
    } catch {
        return (entry.message?.length || 0) + (entry.module?.length || 0) + 40;
    }
}

export class IndexedDBLogTransport implements LogTransport {
    private buffer: AppLogEntry[] = [];
    private flush_timer: ReturnType<typeof setTimeout> | null = null;
    // t153 AC-003: 增量估算已写入字节（estimate_entry_bytes 之和）。仅当累计越过限额时
    // 才触发全表扫描 + trim，避免每次 flush 都全扫。trim/clear 后重置，避免陈旧累计。
    private _estimated_bytes = 0;

    write(entry: AppLogEntry): void {
        if (!entry.id) return;
        this.buffer.push(entry);
        this.schedule_flush();
    }

    private schedule_flush(): void {
        if (this.flush_timer) return;
        this.flush_timer = setTimeout(() => {
            this.flush_timer = null;
            // AC-007: fire-and-forget flush 补 .catch，DB 不可用等失败不产生未处理 rejection
            this.flush().catch(() => {
                // flush 内部已回填 buffer 供下次重试；此处仅防未处理 rejection
            });
        }, 100);
    }

    async flush(): Promise<void> {
        if (this.flush_timer) {
            clearTimeout(this.flush_timer);
            this.flush_timer = null;
        }
        if (this.buffer.length === 0) return;

        const batch = this.buffer.splice(0);
        const db = await get_db();

        const tx = db.transaction([STORE_NAMES.APP_LOGS], 'readwrite');
        const store = tx.objectStore(STORE_NAMES.APP_LOGS);
        for (const entry of batch) {
            if (!entry.id) continue;
            store.put(entry);
        }

        try {
            await new Promise<void>((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        } catch (_err) {
            // T049: 失败时把 batch 按原顺序放回 buffer 供下次重试
            this.buffer.unshift(...batch);
            throw _err;
        }

        // t153 AC-003: 成功落库后累加估算字节（跳过无 id 条目，与写入循环一致）
        for (const entry of batch) {
            if (entry.id) this._estimated_bytes += estimate_entry_bytes(entry);
        }

        await this.trim_if_needed();
    }

    async get_entries(
        limit: number,
        offset: number,
        filters?: LogQueryFilter,
    ): Promise<AppLogEntry[]> {
        const db = await get_db();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAMES.APP_LOGS], 'readonly');
            const store = tx.objectStore(STORE_NAMES.APP_LOGS);
            const index = store.index('timestamp');
            const request = index.openCursor(null, 'prev');
            const results: AppLogEntry[] = [];
            let skipped = 0;

            request.onsuccess = () => {
                const cursor = request.result;
                // T049: 用 results.length >= limit 终止，不再多返回 offset 条
                if (!cursor || results.length >= limit) {
                    resolve(results);
                    return;
                }
                const entry = cursor.value as AppLogEntry;
                if (filters) {
                    if (filters.level && entry.level !== filters.level) {
                        cursor.continue();
                        return;
                    }
                    if (filters.module && entry.module !== filters.module) {
                        cursor.continue();
                        return;
                    }
                    if (filters.since && entry.timestamp < filters.since) {
                        cursor.continue();
                        return;
                    }
                    if (filters.until && entry.timestamp > filters.until) {
                        cursor.continue();
                        return;
                    }
                }
                if (skipped < offset) {
                    skipped++;
                    cursor.continue();
                } else {
                    results.push(entry);
                    cursor.continue();
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async count(filters?: LogQueryFilter): Promise<number> {
        const has_filters = filters
            && (filters.level || filters.module || filters.since || filters.until);
        const db = await get_db();

        if (!has_filters) {
            return new Promise((resolve, reject) => {
                const tx = db.transaction([STORE_NAMES.APP_LOGS], 'readonly');
                const store = tx.objectStore(STORE_NAMES.APP_LOGS);
                const request = store.count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAMES.APP_LOGS], 'readonly');
            const store = tx.objectStore(STORE_NAMES.APP_LOGS);
            const index = store.index('timestamp');
            const cursor_req = index.openCursor(null, 'prev');
            let cnt = 0;
            cursor_req.onsuccess = () => {
                const cursor = cursor_req.result;
                if (!cursor) {
                    resolve(cnt);
                    return;
                }
                const entry = cursor.value as AppLogEntry;
                if (filters!.level && entry.level !== filters!.level) {
                    cursor.continue();
                    return;
                }
                if (filters!.module && entry.module !== filters!.module) {
                    cursor.continue();
                    return;
                }
                if (filters!.since && entry.timestamp < filters!.since) {
                    cursor.continue();
                    return;
                }
                if (filters!.until && entry.timestamp > filters!.until) {
                    cursor.continue();
                    return;
                }
                cnt++;
                cursor.continue();
            };
            cursor_req.onerror = () => reject(cursor_req.error);
        });
    }

    async clear(): Promise<void> {
        // t153 AC-003: 清库后重置增量估算，避免陈旧累计误导下次 trim 触发
        this._estimated_bytes = 0;
        const db = await get_db();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAMES.APP_LOGS], 'readwrite');
            const store = tx.objectStore(STORE_NAMES.APP_LOGS);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async get_total_size_bytes(): Promise<number> {
        const db = await get_db();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAMES.APP_LOGS], 'readonly');
            const store = tx.objectStore(STORE_NAMES.APP_LOGS);
            const cursor_req = store.openCursor();
            let total = 0;
            cursor_req.onsuccess = () => {
                const cursor = cursor_req.result;
                if (!cursor) {
                    resolve(total);
                    return;
                }
                total += estimate_entry_bytes(cursor.value as AppLogEntry);
                cursor.continue();
            };
            cursor_req.onerror = () => reject(cursor_req.error);
        });
    }

    private async trim_if_needed(): Promise<void> {
        let max_bytes: number;
        try {
            const config = await load_user_config();
            max_bytes = (config.log_max_size_mb || 100) * 1024 * 1024;
        } catch {
            max_bytes = 100 * 1024 * 1024;
        }
        // t153 AC-003: 增量估算未越限则跳过全表扫描；越限才走 get_total_size_bytes + 删除。
        // trim 语义不变（仍按时间戳最旧优先删除至限额内）。
        if (this._estimated_bytes <= max_bytes) return;

        const total_bytes = await this.get_total_size_bytes();
        // 以实际总量判定；无论是否删除都重置估算（此后按新写入重新累计）
        this._estimated_bytes = 0;
        if (total_bytes <= max_bytes) return;

        const db = await get_db();
        const tx = db.transaction([STORE_NAMES.APP_LOGS], 'readwrite');
        const store = tx.objectStore(STORE_NAMES.APP_LOGS);
        const index = store.index('timestamp');
        let freed = 0;
        const to_free = total_bytes - max_bytes;

        await new Promise<void>((resolve, reject) => {
            const cursor_req = index.openCursor(null, 'next');
            cursor_req.onsuccess = () => {
                const cursor = cursor_req.result;
                if (cursor && freed < to_free) {
                    freed += estimate_entry_bytes(cursor.value as AppLogEntry);
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            cursor_req.onerror = () => reject(cursor_req.error);
        });
    }
}

let _transport: IndexedDBLogTransport | null = null;

export function get_app_log_transport(): IndexedDBLogTransport {
    if (!_transport) _transport = new IndexedDBLogTransport();
    return _transport;
}
