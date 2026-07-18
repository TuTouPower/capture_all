// background/app_log_storage.ts — IndexedDBLogTransport + singleton
import type { AppLogEntry, LogQueryFilter } from '../../shared/types';
import { STORE_NAMES } from '../../shared/constants';
import { get_db } from './storage';
import { load_user_config } from '../../shared/user_config';
import type { LogTransport } from '../../shared/logger';

function estimate_entry_bytes(entry: AppLogEntry): number {
    return (entry.message?.length || 0) + (entry.module?.length || 0) + 40;
}

export class IndexedDBLogTransport implements LogTransport {
    private buffer: AppLogEntry[] = [];
    private flush_timer: ReturnType<typeof setTimeout> | null = null;

    write(entry: AppLogEntry): void {
        if (!entry.id) return;
        this.buffer.push(entry);
        this.schedule_flush();
    }

    private schedule_flush(): void {
        if (this.flush_timer) return;
        this.flush_timer = setTimeout(() => {
            this.flush();
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

        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

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
            let counted = 0;

            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor || counted >= limit + offset) {
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
                    counted++;
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
        const total_bytes = await this.get_total_size_bytes();
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
