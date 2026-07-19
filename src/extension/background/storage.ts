// background/storage.ts
import type {
    CaptureRecord,
    CaptureEvent,
    CategoryKey,
    NetworkRequestData,
    ConsoleEventData,
    RuntimeExceptionData,
    StorageChangeData,
    CookieChangeData,
    CaptureStartedData,
    CaptureStoppedData,
    CaptureConfigChangedData,
    PermissionMissingData,
    DebuggerAttachStatusData,
    BodyCaptureStatusChangedData,
} from '../../shared/types';
import {
    DB_NAME,
    DB_VERSION,
    STORE_NAMES,
    MAX_SESSION_SIZE_BYTES,
    FLUSH_BATCH_SIZE,
    FLUSH_INTERVAL_MS,
} from '../../shared/constants';

let db: IDBDatabase | null = null;

export async function get_db(): Promise<IDBDatabase> {
    return init_db();
}

export async function init_db(): Promise<IDBDatabase> {
    if (db) return db;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result;

            // Old stores — keep if they exist (do NOT delete)
            if (!database.objectStoreNames.contains('sessions')) {
                const s = database.createObjectStore('sessions', { keyPath: 'id' });
                s.createIndex('start_time', 'start_time');
            }
            if (!database.objectStoreNames.contains('events')) {
                const s = database.createObjectStore('events', { keyPath: ['session_id', 'relative_time'] });
                s.createIndex('session_id', 'session_id');
                s.createIndex('type', 'type');
                s.createIndex('relative_time', 'relative_time');
            }
            if (!database.objectStoreNames.contains('console_logs')) {
                const s = database.createObjectStore('console_logs', { keyPath: ['session_id', 'relative_time'] });
                s.createIndex('session_id', 'session_id');
                s.createIndex('level', 'level');
                s.createIndex('relative_time', 'relative_time');
            }
            if (!database.objectStoreNames.contains('error_log')) {
                const s = database.createObjectStore('error_log', { keyPath: ['session_id', 'relative_time'] });
                s.createIndex('session_id', 'session_id');
                s.createIndex('relative_time', 'relative_time');
            }

            // New stores (v2)
            if (!database.objectStoreNames.contains(STORE_NAMES.CAPTURES)) {
                const s = database.createObjectStore(STORE_NAMES.CAPTURES, { keyPath: 'capture_id' });
                s.createIndex('started_at', 'started_at');
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.USER_ACTION_EVENTS)) {
                const s = database.createObjectStore(STORE_NAMES.USER_ACTION_EVENTS, { keyPath: 'event_id' });
                s.createIndex('capture_id', 'capture_id');
                s.createIndex('type', 'type');
                s.createIndex('relative_time_ms', 'relative_time_ms');
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.NAVIGATION_EVENTS)) {
                const s = database.createObjectStore(STORE_NAMES.NAVIGATION_EVENTS, { keyPath: 'event_id' });
                s.createIndex('capture_id', 'capture_id');
                s.createIndex('relative_time_ms', 'relative_time_ms');
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.NETWORK_REQUESTS)) {
                const s = database.createObjectStore(STORE_NAMES.NETWORK_REQUESTS, { keyPath: 'event_id' });
                s.createIndex('capture_id', 'capture_id');
                s.createIndex('url', 'url');
                s.createIndex('relative_time_ms', 'relative_time_ms');
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.CONSOLE_EVENTS)) {
                const s = database.createObjectStore(STORE_NAMES.CONSOLE_EVENTS, { keyPath: 'event_id' });
                s.createIndex('capture_id', 'capture_id');
                s.createIndex('level', 'level');
                s.createIndex('relative_time_ms', 'relative_time_ms');
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.ERROR_EVENTS)) {
                const s = database.createObjectStore(STORE_NAMES.ERROR_EVENTS, { keyPath: 'event_id' });
                s.createIndex('capture_id', 'capture_id');
                s.createIndex('relative_time_ms', 'relative_time_ms');
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.STORAGE_CHANGES)) {
                const s = database.createObjectStore(STORE_NAMES.STORAGE_CHANGES, { keyPath: 'event_id' });
                s.createIndex('capture_id', 'capture_id');
                s.createIndex('relative_time_ms', 'relative_time_ms');
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.COOKIE_CHANGES)) {
                const s = database.createObjectStore(STORE_NAMES.COOKIE_CHANGES, { keyPath: 'event_id' });
                s.createIndex('capture_id', 'capture_id');
                s.createIndex('relative_time_ms', 'relative_time_ms');
            }

            if (!database.objectStoreNames.contains(STORE_NAMES.CAPTURE_LIFECYCLE_EVENTS)) {
                const s = database.createObjectStore(STORE_NAMES.CAPTURE_LIFECYCLE_EVENTS, { keyPath: 'event_id' });
                s.createIndex('capture_id', 'capture_id');
                s.createIndex('relative_time_ms', 'relative_time_ms');
            }

            // v3 migration: app_logs store
            if (!database.objectStoreNames.contains(STORE_NAMES.APP_LOGS)) {
                const log_store = database.createObjectStore(STORE_NAMES.APP_LOGS, {
                    keyPath: 'id',
                });
                log_store.createIndex('timestamp', 'timestamp');
                log_store.createIndex('level', 'level');
                log_store.createIndex('module', 'module');
            }
        };
    });
}

// ============================================================
// Capture CRUD (replaces Session CRUD)
// ============================================================

export async function create_capture(capture: CaptureRecord): Promise<void> {
    const database = await init_db();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.CAPTURES, 'readwrite');
        const store = tx.objectStore(STORE_NAMES.CAPTURES);
        store.add(capture);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

export async function get_capture(capture_id: string): Promise<CaptureRecord | null> {
    const database = await init_db();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.CAPTURES, 'readonly');
        const store = tx.objectStore(STORE_NAMES.CAPTURES);
        const request = store.get(capture_id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

export async function list_captures(): Promise<CaptureRecord[]> {
    const database = await init_db();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.CAPTURES, 'readonly');
        const store = tx.objectStore(STORE_NAMES.CAPTURES);
        const index = store.index('started_at');
        const request = index.openCursor(null, 'prev');
        const captures: CaptureRecord[] = [];

        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                captures.push(cursor.value);
                cursor.continue();
            } else {
                resolve(captures);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

export async function update_capture(capture: CaptureRecord): Promise<void> {
    const database = await init_db();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.CAPTURES, 'readwrite');
        const store = tx.objectStore(STORE_NAMES.CAPTURES);
        store.put(capture);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

export async function delete_capture(capture_id: string): Promise<void> {
    const database = await init_db();
    const store_names = [
        STORE_NAMES.CAPTURES,
        STORE_NAMES.USER_ACTION_EVENTS,
        STORE_NAMES.NAVIGATION_EVENTS,
        STORE_NAMES.NETWORK_REQUESTS,
        STORE_NAMES.CONSOLE_EVENTS,
        STORE_NAMES.ERROR_EVENTS,
        STORE_NAMES.STORAGE_CHANGES,
        STORE_NAMES.COOKIE_CHANGES,
        STORE_NAMES.CAPTURE_LIFECYCLE_EVENTS,
    ];

    for (const store_name of store_names) {
        await new Promise<void>((resolve, reject) => {
            const tx = database.transaction(store_name, 'readwrite');
            const store = tx.objectStore(store_name);

            if (store_name === STORE_NAMES.CAPTURES) {
                const request = store.delete(capture_id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } else {
                const index = store.index('capture_id');
                const request = index.openCursor(IDBKeyRange.only(capture_id));

                request.onsuccess = () => {
                    const cursor = request.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => reject(request.error);
            }
        });
    }
}

// ============================================================
// Category -> store name mapping
// ============================================================

const CATEGORY_STORE_MAP: Record<CategoryKey, string> = {
    user_action: STORE_NAMES.USER_ACTION_EVENTS,
    navigation: STORE_NAMES.NAVIGATION_EVENTS,
    network: STORE_NAMES.NETWORK_REQUESTS,
    console: STORE_NAMES.CONSOLE_EVENTS,
    error: STORE_NAMES.ERROR_EVENTS,
    storage: STORE_NAMES.STORAGE_CHANGES,
    cookie: STORE_NAMES.COOKIE_CHANGES,
    capture_lifecycle: STORE_NAMES.CAPTURE_LIFECYCLE_EVENTS,
    dom_data: STORE_NAMES.USER_ACTION_EVENTS, // fallback — dom_data events stored alongside user_action
};

// ============================================================
// Batch write with flush — per-category buffers
// ============================================================

const buffers: Map<string, CaptureEvent[]> = new Map();
let bytes_written: Map<string, number> = new Map();

function get_buffer(store_name: string): CaptureEvent[] {
    let buf = buffers.get(store_name);
    if (!buf) {
        buf = [];
        buffers.set(store_name, buf);
    }
    return buf;
}

/** Write events routed by category into per-store buffers */
export async function write_events(batch: CaptureEvent[]): Promise<void> {
    // Group by store name
    const grouped = new Map<string, CaptureEvent[]>();
    for (const event of batch) {
        const store_name = CATEGORY_STORE_MAP[event.category] ?? STORE_NAMES.USER_ACTION_EVENTS;
        let group = grouped.get(store_name);
        if (!group) {
            group = [];
            grouped.set(store_name, group);
        }
        group.push(event);
    }

    for (const [store_name, events] of grouped) {
        const buf = get_buffer(store_name);
        buf.push(...events);
        if (buf.length >= FLUSH_BATCH_SIZE) {
            await flush_store(store_name);
        }
    }
}

export async function write_network_requests(batch: NetworkRequestData[]): Promise<void> {
    const buf = get_buffer(STORE_NAMES.NETWORK_REQUESTS);
    buf.push(...(batch as unknown as CaptureEvent[]));
    if (buf.length >= FLUSH_BATCH_SIZE) {
        await flush_store(STORE_NAMES.NETWORK_REQUESTS);
    }
}

export async function write_console_events(batch: ConsoleEventData[]): Promise<void> {
    const buf = get_buffer(STORE_NAMES.CONSOLE_EVENTS);
    buf.push(...(batch as unknown as CaptureEvent[]));
    if (buf.length >= FLUSH_BATCH_SIZE) {
        await flush_store(STORE_NAMES.CONSOLE_EVENTS);
    }
}

export async function write_error_events(batch: RuntimeExceptionData[]): Promise<void> {
    const buf = get_buffer(STORE_NAMES.ERROR_EVENTS);
    buf.push(...(batch as unknown as CaptureEvent[]));
    await flush_store(STORE_NAMES.ERROR_EVENTS);
}

export async function write_storage_changes(batch: StorageChangeData[]): Promise<void> {
    const buf = get_buffer(STORE_NAMES.STORAGE_CHANGES);
    buf.push(...(batch as unknown as CaptureEvent[]));
    if (buf.length >= FLUSH_BATCH_SIZE) {
        await flush_store(STORE_NAMES.STORAGE_CHANGES);
    }
}

export async function write_cookie_changes(batch: CookieChangeData[]): Promise<void> {
    const buf = get_buffer(STORE_NAMES.COOKIE_CHANGES);
    buf.push(...(batch as unknown as CaptureEvent[]));
    if (buf.length >= FLUSH_BATCH_SIZE) {
        await flush_store(STORE_NAMES.COOKIE_CHANGES);
    }
}

export async function write_lifecycle_events(
    batch: (
        | CaptureStartedData
        | CaptureStoppedData
        | CaptureConfigChangedData
        | PermissionMissingData
        | DebuggerAttachStatusData
        | BodyCaptureStatusChangedData
    )[],
): Promise<void> {
    const buf = get_buffer(STORE_NAMES.CAPTURE_LIFECYCLE_EVENTS);
    buf.push(...(batch as unknown as CaptureEvent[]));
    if (buf.length >= FLUSH_BATCH_SIZE) {
        await flush_store(STORE_NAMES.CAPTURE_LIFECYCLE_EVENTS);
    }
}

// ============================================================
// Generic flush
// ============================================================

async function flush_store(store_name: string): Promise<void> {
    const buf = buffers.get(store_name);
    if (!buf || buf.length === 0) return;

    const database = await init_db();
    const batch = buf.splice(0);

    return new Promise((resolve, reject) => {
        const tx = database.transaction(store_name, 'readwrite');
        const store = tx.objectStore(store_name);

        for (const item of batch) {
            store.put(item);
        }

        tx.oncomplete = () => {
            // 仅在事务提交后累计字节（避免 abort 后虚高）
            for (const item of batch) {
                const capture_id = (item as unknown as Record<string, unknown>).capture_id as string;
                if (capture_id) {
                    update_bytes_written(capture_id, JSON.stringify(item).length);
                }
            }
            resolve();
        };
        tx.onerror = () => {
            // 失败：batch 按原顺序放回 buffer 头部供下次重试
            const existing = buffers.get(store_name) || [];
            buffers.set(store_name, [...batch, ...existing]);
            reject(tx.error);
        };
        tx.onabort = () => {
            const existing = buffers.get(store_name) || [];
            buffers.set(store_name, [...batch, ...existing]);
            reject(tx.error);
        };
    });
}

export async function flush_all(): Promise<void> {
    const store_names = [
        STORE_NAMES.USER_ACTION_EVENTS,
        STORE_NAMES.NAVIGATION_EVENTS,
        STORE_NAMES.NETWORK_REQUESTS,
        STORE_NAMES.CONSOLE_EVENTS,
        STORE_NAMES.ERROR_EVENTS,
        STORE_NAMES.STORAGE_CHANGES,
        STORE_NAMES.COOKIE_CHANGES,
        STORE_NAMES.CAPTURE_LIFECYCLE_EVENTS,
    ];
    await Promise.all(store_names.map((s) => flush_store(s)));
}

// ============================================================
// Periodic flush — prevents small captures from losing buffered events
// ============================================================

let flush_interval: ReturnType<typeof setInterval> | null = null;

export function start_periodic_flush(): void {
    if (flush_interval) return;
    flush_interval = setInterval(() => {
        const store_names = [
            STORE_NAMES.USER_ACTION_EVENTS,
            STORE_NAMES.NAVIGATION_EVENTS,
            STORE_NAMES.NETWORK_REQUESTS,
            STORE_NAMES.CONSOLE_EVENTS,
            STORE_NAMES.ERROR_EVENTS,
            STORE_NAMES.STORAGE_CHANGES,
            STORE_NAMES.COOKIE_CHANGES,
            STORE_NAMES.CAPTURE_LIFECYCLE_EVENTS,
        ];
        for (const name of store_names) {
            const buf = buffers.get(name);
            if (buf && buf.length > 0) {
                flush_store(name).catch((_err) => {
                    // flush_store 已在 tx.onerror/onabort 回填 buffer；周期 flush 静默避免刷屏
                });
            }
        }
    }, FLUSH_INTERVAL_MS);
}

export function stop_periodic_flush(): void {
    if (flush_interval) {
        clearInterval(flush_interval);
        flush_interval = null;
    }
}

// ============================================================
// Bytes tracking
// ============================================================

function update_bytes_written(capture_id: string, bytes: number): void {
    const current = bytes_written.get(capture_id) || 0;
    bytes_written.set(capture_id, current + bytes);
}

export function get_capture_size(capture_id: string): number {
    return bytes_written.get(capture_id) || 0;
}

export async function check_storage_limit(capture_id: string): Promise<boolean> {
    const size = get_capture_size(capture_id);
    return size >= MAX_SESSION_SIZE_BYTES;
}

// ============================================================
// Generic cursor pagination helper
// ============================================================

async function query_by_store<T>(
    store_name: string,
    capture_id: string,
    offset: number = 0,
    limit: number = 100,
): Promise<T[]> {
    const database = await init_db();
    const tx = database.transaction(store_name, 'readonly');
    const store = tx.objectStore(store_name);
    const index = store.index('capture_id');
    const all = await new Promise<T[]>((resolve, reject) => {
        const request = index.getAll(IDBKeyRange.only(capture_id));
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
    });
    return all.slice(offset, offset + limit);
}

// ============================================================
// Query with pagination
// ============================================================

export async function get_events_by_category(
    capture_id: string,
    category: CategoryKey,
    offset: number = 0,
    limit: number = 100,
): Promise<CaptureEvent[]> {
    const store_name = CATEGORY_STORE_MAP[category] ?? STORE_NAMES.USER_ACTION_EVENTS;
    return query_by_store<CaptureEvent>(store_name, capture_id, offset, limit);
}

export async function get_network_requests(
    capture_id: string,
    offset: number = 0,
    limit: number = 100,
): Promise<NetworkRequestData[]> {
    return query_by_store<NetworkRequestData>(STORE_NAMES.NETWORK_REQUESTS, capture_id, offset, limit);
}

export async function get_console_events(
    capture_id: string,
    offset: number = 0,
    limit: number = 100,
): Promise<ConsoleEventData[]> {
    return query_by_store<ConsoleEventData>(STORE_NAMES.CONSOLE_EVENTS, capture_id, offset, limit);
}

export async function get_error_events(
    capture_id: string,
    offset: number = 0,
    limit: number = 100,
): Promise<RuntimeExceptionData[]> {
    return query_by_store<RuntimeExceptionData>(STORE_NAMES.ERROR_EVENTS, capture_id, offset, limit);
}

export async function get_storage_changes(
    capture_id: string,
    offset: number = 0,
    limit: number = 100,
): Promise<StorageChangeData[]> {
    return query_by_store<StorageChangeData>(STORE_NAMES.STORAGE_CHANGES, capture_id, offset, limit);
}

export async function get_cookie_changes(
    capture_id: string,
    offset: number = 0,
    limit: number = 100,
): Promise<CookieChangeData[]> {
    return query_by_store<CookieChangeData>(STORE_NAMES.COOKIE_CHANGES, capture_id, offset, limit);
}

export async function get_lifecycle_events(
    capture_id: string,
    offset: number = 0,
    limit: number = 100,
): Promise<CaptureEvent[]> {
    return query_by_store<CaptureEvent>(STORE_NAMES.CAPTURE_LIFECYCLE_EVENTS, capture_id, offset, limit);
}

// ============================================================
// Deprecated aliases — backward compatibility
// ============================================================

/** @deprecated Use create_capture */
export const create_session = create_capture;
/** @deprecated Use get_capture */
export const get_session = get_capture as unknown as (id: string) => Promise<import('../../shared/types').Session | null>;
/** @deprecated Use list_captures */
export const list_sessions = list_captures as unknown as () => Promise<import('../../shared/types').Session[]>;
/** @deprecated Use update_capture */
export const update_session = update_capture as unknown as (session: import('../../shared/types').Session) => Promise<void>;
/** @deprecated Use delete_capture */
export const delete_session = delete_capture;
/** @deprecated Use write_network_requests */
export const write_requests = write_network_requests;
/** @deprecated Use write_console_events */
export const write_logs = write_console_events;
/** @deprecated Use write_error_events */
export const write_errors = write_error_events;
/** @deprecated Use get_capture_size */
export const get_session_size = get_capture_size;
/** @deprecated Use get_events_by_category */
export const get_events = get_events_by_category;
/** @deprecated Use get_console_events */
export const get_console_logs = get_console_events;
/** @deprecated Use get_error_events */
export const get_error_logs = get_error_events;
