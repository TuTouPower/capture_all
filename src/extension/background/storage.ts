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
} from '../../shared/types';
import {
    DB_NAME,
    DB_VERSION,
    STORE_NAMES,
    MAX_SESSION_SIZE_BYTES,
    FLUSH_INTERVAL_MS,
} from '../../shared/constants';

export { STORE_NAMES };

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

            // v4 migration (t161): 事件类 store 加复合索引 [capture_id, relative_time_ms, event_id]，
            // 支撑 keyset 分页（O(limit)，页间相对时间序、capture 隔离，见 d008）。旧库升级时补建。
            // 注意：onupgradeneeded 期间只能使用 versionchange 事务，不能 database.transaction()。
            const upgrade_tx = (event.target as IDBOpenDBRequest).transaction;
            const EVENT_STORE_NAMES = [
                STORE_NAMES.USER_ACTION_EVENTS,
                STORE_NAMES.NAVIGATION_EVENTS,
                STORE_NAMES.NETWORK_REQUESTS,
                STORE_NAMES.CONSOLE_EVENTS,
                STORE_NAMES.ERROR_EVENTS,
                STORE_NAMES.STORAGE_CHANGES,
                STORE_NAMES.COOKIE_CHANGES,
                STORE_NAMES.CAPTURE_LIFECYCLE_EVENTS,
            ];
            for (const name of EVENT_STORE_NAMES) {
                if (!database.objectStoreNames.contains(name)) continue;
                const event_store = upgrade_tx!.objectStore(name);
                if (!event_store.indexNames.contains('capture_time')) {
                    event_store.createIndex('capture_time', ['capture_id', 'relative_time_ms', 'event_id']);
                }
                // t161 f001: 补 legacy 排序键——web_request 路径的 NetworkRequestData 只写
                // relative_time（无 relative_time_ms），索引会排除这些记录导致 network 源丢失。
                // 迁移时对缺失 relative_time_ms 的记录补 relative_time ?? start_time_ms ?? 0。
                const backfill = event_store.openCursor();
                backfill.onsuccess = () => {
                    const cursor = backfill.result;
                    if (!cursor) return;
                    const record = cursor.value as Record<string, unknown>;
                    if (record.relative_time_ms === undefined) {
                        const rt = (record.relative_time ?? record.start_time_ms ?? 0) as number;
                        cursor.update({ ...record, relative_time_ms: rt });
                    }
                    cursor.continue();
                };
                backfill.onerror = () => {
                    // backfill 失败（如记录损坏）会 abort 迁移事务 → init_db 拒绝升级；
                    // 宁可失败也不静默丢 legacy 数据入索引。onerror 后 transaction 自动 abort。
                };
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

export async function list_captures(limit?: number, direction: 'next' | 'prev' = 'prev'): Promise<CaptureRecord[]> {
    const database = await init_db();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.CAPTURES, 'readonly');
        const store = tx.objectStore(STORE_NAMES.CAPTURES);
        const index = store.index('started_at');
        const request = index.openCursor(null, direction);
        const captures: CaptureRecord[] = [];

        request.onsuccess = () => {
            const cursor = request.result;
            // t153 AC-007: limit 截断（最旧优先倒序的前 N 条）；undefined = 全量
            // t161: direction 支持 asc/desc，避免调用方全量读取后二次排序
            if (cursor && captures.length < (limit ?? Infinity)) {
                captures.push(cursor.value);
                cursor.continue();
            } else {
                resolve(captures);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

/** captures 总数（count() 轻量，list_captures total 用） */
export async function count_captures(): Promise<number> {
    const database = await init_db();
    const tx = database.transaction(STORE_NAMES.CAPTURES, 'readonly');
    return await new Promise<number>((resolve, reject) => {
        const request = tx.objectStore(STORE_NAMES.CAPTURES).count();
        request.onsuccess = () => resolve(request.result);
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

    // 单一 readwrite 事务覆盖全部 store，保证原子性
    return new Promise((resolve, reject) => {
        const tx = database.transaction(store_names, 'readwrite');

        for (const store_name of store_names) {
            const store = tx.objectStore(store_name);
            if (store_name === STORE_NAMES.CAPTURES) {
                store.delete(capture_id);
            } else {
                const index = store.index('capture_id');
                const request = index.openCursor(IDBKeyRange.only(capture_id));
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    }
                };
            }
        }

        tx.oncomplete = () => {
            clear_size_state(capture_id);
            resolve();
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

// t148: 删除采集后清理内存限额状态（防长活 SW 内存随采集数增长）
function clear_size_state(capture_id: string): void {
    size_base.delete(capture_id);
    size_delta.delete(capture_id);
    size_base_loaded.delete(capture_id);
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
    // B2-L7: dom_data 类别无专属 store，且 dom_mutation 目前无生产者（dormant 类别）。
    // 显式映射到 USER_ACTION_EVENTS 作为 fallback——有 dom_mutation 事件时按 user_action 存储，
    // 读取经 user_action_events source 返回；新增 dom_mutation 生产者时再评估独立 store。
    dom_data: STORE_NAMES.USER_ACTION_EVENTS,
};

// ============================================================
// Batch write with flush — per-category buffers
// ============================================================

const buffers: Map<string, CaptureEvent[]> = new Map();
// t148: 限额字节跟踪 = 持久化基数（CaptureRecord.storage_bytes_written）+ 内存增量。
// SW 重启后基数从 IndexedDB 重建（ensure_size_base），增量从 0 开始。
let size_base: Map<string, number> = new Map();
let size_base_loaded: Set<string> = new Set();
let size_delta: Map<string, number> = new Map();

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
        // T038: 每次写入立即 flush，保证调用方返回前数据已落 IndexedDB
        // （MV3 SW 回收不再丢内存 buffer 批次）。代价：失去 batch 合并优化。
        await flush_store(store_name);
    }
}

export async function write_network_requests(batch: NetworkRequestData[]): Promise<void> {
    const buf = get_buffer(STORE_NAMES.NETWORK_REQUESTS);
    buf.push(...(batch as unknown as CaptureEvent[]));
    await flush_store(STORE_NAMES.NETWORK_REQUESTS);
}

export async function write_console_events(batch: ConsoleEventData[]): Promise<void> {
    const buf = get_buffer(STORE_NAMES.CONSOLE_EVENTS);
    buf.push(...(batch as unknown as CaptureEvent[]));
    await flush_store(STORE_NAMES.CONSOLE_EVENTS);
}

export async function write_error_events(batch: RuntimeExceptionData[]): Promise<void> {
    const buf = get_buffer(STORE_NAMES.ERROR_EVENTS);
    buf.push(...(batch as unknown as CaptureEvent[]));
    await flush_store(STORE_NAMES.ERROR_EVENTS);
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
                    update_bytes_written(capture_id, json_byte_length(item));
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
    size_delta.set(capture_id, (size_delta.get(capture_id) || 0) + bytes);
}

// UTF-8 字节长度（替代 JSON.stringify().length 的字符数口径）
function json_byte_length(item: unknown): number {
    try {
        return new TextEncoder().encode(JSON.stringify(item)).length;
    } catch {
        return 0;
    }
}

/** 从 CaptureRecord.storage_bytes_written 重建持久化基数（每个 capture 只读一次）。 */
export async function ensure_size_base(capture_id: string): Promise<void> {
    if (size_base_loaded.has(capture_id)) return;
    let base = 0;
    try {
        const rec = await get_capture(capture_id);
        base = rec?.storage_bytes_written ?? 0;
    } catch {
        // storage 损坏/不可读：回退 0，限额检查按内存增量执行，不卡死
        base = 0;
    }
    size_base.set(capture_id, base);
    size_base_loaded.add(capture_id);
}

export function get_capture_size(capture_id: string): number {
    return (size_base.get(capture_id) ?? 0) + (size_delta.get(capture_id) ?? 0);
}

// T110 测试钩子：jsdom 下直接设本实例内存增量（模拟重启后继续写入累计）
export function set_capture_size_for_test(capture_id: string, size: number): void {
    size_delta.set(capture_id, size);
}

export async function check_storage_limit(capture_id: string): Promise<boolean> {
    await ensure_size_base(capture_id);
    return get_capture_size(capture_id) >= MAX_SESSION_SIZE_BYTES;
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
    // t140: 用 cursor 直接分页，避免 index.getAll 全量取后再 slice（每页 O(n)，分页即 O(n²)）
    const out: T[] = [];
    let skipped = 0;
    await new Promise<void>((resolve, reject) => {
        const request = index.openCursor(IDBKeyRange.only(capture_id));
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || out.length >= limit) { resolve(); return; }
            if (skipped < offset) {
                skipped += 1;
                cursor.continue();
                return;
            }
            out.push(cursor.value as T);
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
    return out;
}

// t161: keyset 分页（d008）——复合索引 [capture_id, relative_time_ms, event_id]，
// 双界 bound([c1,last_t,last_e],[c1,+Inf,+Inf],true,true)：读取量 O(limit)、页间相对时间序、
// capture 隔离、同刻按 event_id 继续不遗漏。token = 末条 (relative_time_ms, event_id)。
// t161: 读取量统计钩子（测试用，验证 keyset O(N) 与点查/全量区分）。
// 生产零开销（仅整数自增）；`_for_test` 命名遵循项目约定。
export const _storage_stats_for_test = {
    keyset_cursor_reads: 0,
    point_reads: 0,
    count_reads: 0,
};
export function _reset_storage_stats_for_test(): void {
    _storage_stats_for_test.keyset_cursor_reads = 0;
    _storage_stats_for_test.point_reads = 0;
    _storage_stats_for_test.count_reads = 0;
}

export interface KeysetToken {
    relative_time_ms: number;
    event_id: string;
}

export interface KeysetPage<T> {
    records: T[];
    next_token: KeysetToken | null;
}

export interface KeysetQueryOptions {
    limit: number;
    after?: KeysetToken | null;
    start_time?: number;
    end_time?: number;
    /** 'next' = 升序（默认）；'prev' = 降序（openCursor prev） */
    direction?: 'next' | 'prev';
}

export async function query_by_store_keyset<T>(
    store_name: string,
    capture_id: string,
    opts: KeysetQueryOptions,
): Promise<KeysetPage<T>> {
    const database = await init_db();
    const tx = database.transaction(store_name, 'readonly');
    const store = tx.objectStore(store_name);
    const index = store.index('capture_time');
    const direction: IDBCursorDirection = opts.direction === 'prev' ? 'prev' : 'next';

    // 谓词下推：lower = (capture_id, max(after.t, start_time), after.e 或 -inf)，upper = (capture_id, end_time, +inf)
    // token 语义：cursor 停在「下一条起点」（第 limit+1 条），下界闭（含）即从该条继续
    const after_t = opts.after?.relative_time_ms;
    const lower_t = Math.max(after_t ?? -Infinity, opts.start_time ?? -Infinity);
    const lower: [string, number, string] = [
        capture_id,
        lower_t,
        opts.after ? opts.after.event_id : -Infinity as unknown as string,
    ];
    const upper: [string, number, string] = [capture_id, opts.end_time ?? +Infinity, +Infinity as unknown as string];
    const range = IDBKeyRange.bound(lower, upper, false, true);

    const out: T[] = [];
    let next_token: KeysetToken | null = null;
    await new Promise<void>((resolve, reject) => {
        const request = index.openCursor(range, direction);
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) { resolve(); return; }
            if (out.length >= opts.limit) {
                const key = cursor.key as [string, number, string];
                next_token = { relative_time_ms: key[1], event_id: key[2] };
                resolve();
                return;
            }
            _storage_stats_for_test.keyset_cursor_reads += 1;
            out.push(cursor.value as T);
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
    return { records: out, next_token };
}

/** 索引 count（谓词下推后的范围计数，不读记录——sources.list 用） */
export async function count_by_store_keyset(
    store_name: string,
    capture_id: string,
    opts: { start_time?: number; end_time?: number } = {},
): Promise<number> {
    const database = await init_db();
    const tx = database.transaction(store_name, 'readonly');
    const index = tx.objectStore(store_name).index('capture_time');
    const lower: [string, number, string] = [capture_id, opts.start_time ?? -Infinity, -Infinity as unknown as string];
    const upper: [string, number, string] = [capture_id, opts.end_time ?? +Infinity, +Infinity as unknown as string];
    const range = IDBKeyRange.bound(lower, upper, true, true);
    return await new Promise<number>((resolve, reject) => {
        _storage_stats_for_test.count_reads += 1;
        const request = index.count(range);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** 索引 first/last 键（各读一条，sources.list time_range 用） */
export async function first_last_keys_by_store(
    store_name: string,
    capture_id: string,
): Promise<{ first: number | null; last: number | null }> {
    const database = await init_db();
    const tx = database.transaction(store_name, 'readonly');
    const index = tx.objectStore(store_name).index('capture_time');
    const range = IDBKeyRange.bound(
        [capture_id, -Infinity, -Infinity as unknown as string],
        [capture_id, +Infinity, +Infinity as unknown as string],
        true, true,
    );
    const get_key = (direction: IDBCursorDirection): Promise<number | null> => new Promise((resolve, reject) => {
        const request = index.openCursor(range, direction);
        request.onsuccess = () => {
            const cursor = request.result;
            resolve(cursor ? (cursor.key as [string, number, string])[1] : null);
        };
        request.onerror = () => reject(request.error);
    });
    const [first, last] = await Promise.all([get_key('next'), get_key('prev')]);
    return { first, last };
}

/** 主键点查（t161 AC-001 data.get 用——只访问对应 store 对应记录） */
export async function get_store_record_by_id<T>(store_name: string, id: string): Promise<T | null> {
    const database = await init_db();
    const tx = database.transaction(store_name, 'readonly');
    return await new Promise<T | null>((resolve, reject) => {
        _storage_stats_for_test.point_reads += 1;
        const request = tx.objectStore(store_name).get(id);
        request.onsuccess = () => resolve((request.result as T) ?? null);
        request.onerror = () => reject(request.error);
    });
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
