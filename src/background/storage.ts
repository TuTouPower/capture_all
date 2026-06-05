// background/storage.ts
import type { Session, RecordEvent, NetworkRequest, ConsoleLog, ErrorLog } from '../shared/types';
import { DB_NAME, DB_VERSION, STORE_NAMES, MAX_SESSION_SIZE_BYTES, FLUSH_BATCH_SIZE } from '../shared/constants';

let db: IDBDatabase | null = null;

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

            // Sessions store
            if (!database.objectStoreNames.contains(STORE_NAMES.SESSIONS)) {
                const sessionStore = database.createObjectStore(STORE_NAMES.SESSIONS, { keyPath: 'id' });
                sessionStore.createIndex('start_time', 'start_time');
            }

            // Events store
            if (!database.objectStoreNames.contains(STORE_NAMES.EVENTS)) {
                const eventStore = database.createObjectStore(STORE_NAMES.EVENTS, { keyPath: ['session_id', 'relative_time'] });
                eventStore.createIndex('session_id', 'session_id');
                eventStore.createIndex('type', 'type');
                eventStore.createIndex('relative_time', 'relative_time');
            }

            // Network requests store
            if (!database.objectStoreNames.contains(STORE_NAMES.NETWORK_REQUESTS)) {
                const networkStore = database.createObjectStore(STORE_NAMES.NETWORK_REQUESTS, { keyPath: ['session_id', 'relative_time'] });
                networkStore.createIndex('session_id', 'session_id');
                networkStore.createIndex('url', 'url');
                networkStore.createIndex('relative_time', 'relative_time');
            }

            // Console logs store
            if (!database.objectStoreNames.contains(STORE_NAMES.CONSOLE_LOGS)) {
                const consoleStore = database.createObjectStore(STORE_NAMES.CONSOLE_LOGS, { keyPath: ['session_id', 'relative_time'] });
                consoleStore.createIndex('session_id', 'session_id');
                consoleStore.createIndex('level', 'level');
                consoleStore.createIndex('relative_time', 'relative_time');
            }

            // Error log store
            if (!database.objectStoreNames.contains(STORE_NAMES.ERROR_LOG)) {
                const errorStore = database.createObjectStore(STORE_NAMES.ERROR_LOG, { keyPath: ['session_id', 'relative_time'] });
                errorStore.createIndex('session_id', 'session_id');
                errorStore.createIndex('relative_time', 'relative_time');
            }
        };
    });
}

// Session CRUD
export async function create_session(session: Session): Promise<void> {
    const database = await init_db();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.SESSIONS, 'readwrite');
        const store = tx.objectStore(STORE_NAMES.SESSIONS);
        const request = store.add(session);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function update_session(session: Session): Promise<void> {
    const database = await init_db();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.SESSIONS, 'readwrite');
        const store = tx.objectStore(STORE_NAMES.SESSIONS);
        const request = store.put(session);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function get_session(id: string): Promise<Session | null> {
    const database = await init_db();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.SESSIONS, 'readonly');
        const store = tx.objectStore(STORE_NAMES.SESSIONS);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

export async function list_sessions(): Promise<Session[]> {
    const database = await init_db();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.SESSIONS, 'readonly');
        const store = tx.objectStore(STORE_NAMES.SESSIONS);
        const index = store.index('start_time');
        const request = index.openCursor(null, 'prev');
        const sessions: Session[] = [];

        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                sessions.push(cursor.value);
                cursor.continue();
            } else {
                resolve(sessions);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

export async function delete_session(id: string): Promise<void> {
    const database = await init_db();
    const store_names = [STORE_NAMES.SESSIONS, STORE_NAMES.EVENTS, STORE_NAMES.NETWORK_REQUESTS, STORE_NAMES.CONSOLE_LOGS, STORE_NAMES.ERROR_LOG];

    for (const store_name of store_names) {
        await new Promise<void>((resolve, reject) => {
            const tx = database.transaction(store_name, 'readwrite');
            const store = tx.objectStore(store_name);

            if (store_name === STORE_NAMES.SESSIONS) {
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } else {
                const index = store.index('session_id');
                const request = index.openCursor(IDBKeyRange.only(id));

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

// Batch write with flush
let event_buffer: RecordEvent[] = [];
let network_buffer: NetworkRequest[] = [];
let console_buffer: ConsoleLog[] = [];
let error_buffer: ErrorLog[] = [];
let bytes_written: Map<string, number> = new Map();

export async function write_events(batch: RecordEvent[]): Promise<void> {
    event_buffer.push(...batch);
    if (event_buffer.length >= FLUSH_BATCH_SIZE) {
        await flush_events();
    }
}

export async function write_requests(batch: NetworkRequest[]): Promise<void> {
    network_buffer.push(...batch);
    if (network_buffer.length >= FLUSH_BATCH_SIZE) {
        await flush_network();
    }
}

export async function write_logs(batch: ConsoleLog[]): Promise<void> {
    console_buffer.push(...batch);
    if (console_buffer.length >= FLUSH_BATCH_SIZE) {
        await flush_console();
    }
}

export async function write_errors(batch: ErrorLog[]): Promise<void> {
    error_buffer.push(...batch);
    await flush_errors();
}

async function flush_events(): Promise<void> {
    if (event_buffer.length === 0) return;
    const database = await init_db();
    const batch = event_buffer.splice(0);

    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.EVENTS, 'readwrite');
        const store = tx.objectStore(STORE_NAMES.EVENTS);

        for (const event of batch) {
            store.put(event);
            update_bytes_written(event.session_id, JSON.stringify(event).length);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function flush_network(): Promise<void> {
    if (network_buffer.length === 0) return;
    const database = await init_db();
    const batch = network_buffer.splice(0);

    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.NETWORK_REQUESTS, 'readwrite');
        const store = tx.objectStore(STORE_NAMES.NETWORK_REQUESTS);

        for (const req of batch) {
            store.put(req);
            update_bytes_written(req.session_id, JSON.stringify(req).length);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function flush_console(): Promise<void> {
    if (console_buffer.length === 0) return;
    const database = await init_db();
    const batch = console_buffer.splice(0);

    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.CONSOLE_LOGS, 'readwrite');
        const store = tx.objectStore(STORE_NAMES.CONSOLE_LOGS);

        for (const log of batch) {
            store.put(log);
            update_bytes_written(log.session_id, JSON.stringify(log).length);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function flush_errors(): Promise<void> {
    if (error_buffer.length === 0) return;
    const database = await init_db();
    const batch = error_buffer.splice(0);

    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.ERROR_LOG, 'readwrite');
        const store = tx.objectStore(STORE_NAMES.ERROR_LOG);

        for (const error of batch) {
            store.put(error);
            update_bytes_written(error.session_id, JSON.stringify(error).length);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function flush_all(): Promise<void> {
    await Promise.all([flush_events(), flush_network(), flush_console(), flush_errors()]);
}

function update_bytes_written(session_id: string, bytes: number): void {
    const current = bytes_written.get(session_id) || 0;
    bytes_written.set(session_id, current + bytes);
}

export function get_session_size(session_id: string): number {
    return bytes_written.get(session_id) || 0;
}

export async function check_storage_limit(session_id: string): Promise<boolean> {
    const size = get_session_size(session_id);
    return size >= MAX_SESSION_SIZE_BYTES;
}

// Query with pagination
export async function get_events(session_id: string, offset: number = 0, limit: number = 100): Promise<RecordEvent[]> {
    const database = await init_db();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.EVENTS, 'readonly');
        const store = tx.objectStore(STORE_NAMES.EVENTS);
        const index = store.index('session_id');
        const request = index.openCursor(IDBKeyRange.only(session_id));
        const events: RecordEvent[] = [];
        let skipped = 0;

        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || events.length >= limit) {
                resolve(events);
                return;
            }

            if (skipped < offset) {
                skipped++;
                cursor.continue();
            } else {
                events.push(cursor.value);
                cursor.continue();
            }
        };
        request.onerror = () => reject(request.error);
    });
}

export async function get_network_requests(session_id: string, offset: number = 0, limit: number = 100): Promise<NetworkRequest[]> {
    const database = await init_db();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.NETWORK_REQUESTS, 'readonly');
        const store = tx.objectStore(STORE_NAMES.NETWORK_REQUESTS);
        const index = store.index('session_id');
        const request = index.openCursor(IDBKeyRange.only(session_id));
        const requests: NetworkRequest[] = [];
        let skipped = 0;

        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || requests.length >= limit) {
                resolve(requests);
                return;
            }

            if (skipped < offset) {
                skipped++;
                cursor.continue();
            } else {
                requests.push(cursor.value);
                cursor.continue();
            }
        };
        request.onerror = () => reject(request.error);
    });
}

export async function get_console_logs(session_id: string, offset: number = 0, limit: number = 100): Promise<ConsoleLog[]> {
    const database = await init_db();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAMES.CONSOLE_LOGS, 'readonly');
        const store = tx.objectStore(STORE_NAMES.CONSOLE_LOGS);
        const index = store.index('session_id');
        const request = index.openCursor(IDBKeyRange.only(session_id));
        const logs: ConsoleLog[] = [];
        let skipped = 0;

        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || logs.length >= limit) {
                resolve(logs);
                return;
            }

            if (skipped < offset) {
                skipped++;
                cursor.continue();
            } else {
                logs.push(cursor.value);
                cursor.continue();
            }
        };
        request.onerror = () => reject(request.error);
    });
}
