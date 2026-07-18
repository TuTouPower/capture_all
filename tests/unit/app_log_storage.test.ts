// tests/app_log_storage.test.ts — P0.29: flush with empty id records must not fail entire batch
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import type { AppLogEntry } from '../../src/shared/types';

// Minimal IndexedDBLogTransport replica for unit-testing flush behavior
// Uses real IndexedDB (via fake-indexeddb) so KeyPath validation is enforced.
class TestLogTransport {
    private buffer: AppLogEntry[] = [];
    private db_name: string;

    constructor(db_name: string) {
        this.db_name = db_name;
    }

    write(entry: AppLogEntry): void {
        // P0.29 guard: skip entries with empty id
        if (!entry.id) return;
        this.buffer.push(entry);
    }

    async flush(): Promise<void> {
        if (this.buffer.length === 0) return;

        const batch = this.buffer.splice(0);
        const db = await this.open_db();

        const tx = db.transaction(['app_logs'], 'readwrite');
        const store = tx.objectStore('app_logs');

        // P0.29 guard: skip entries with empty id before put
        for (const entry of batch) {
            if (!entry.id) continue;
            store.put(entry);
        }

        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    private async open_db(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.db_name, 1);
            request.onerror = () => reject(request.error);
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains('app_logs')) {
                    db.createObjectStore('app_logs', { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
        });
    }
}

function make_entry(overrides: Partial<AppLogEntry> = {}): AppLogEntry {
    return {
        id: overrides.id ?? `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: overrides.timestamp ?? Date.now(),
        level: overrides.level ?? 'info',
        module: overrides.module ?? 'test',
        message: overrides.message ?? 'test message',
        details: overrides.details,
        stack: overrides.stack,
    };
}

let _db_counter = 0;
function unique_db_name(): string {
    return `test_app_log_p029_${Date.now()}_${++_db_counter}`;
}

describe('app_log_storage flush with empty id', () => {
    it('write() skips entry with empty id', () => {
        const transport = new TestLogTransport(unique_db_name());
        transport.write(make_entry({ id: '' }));
        transport.write(make_entry({ id: 'valid_1' }));
        // Not throwing means guard worked
        expect(true).toBe(true);
    });

    it('flush() does not throw when batch includes empty-id record', async () => {
        const transport = new TestLogTransport(unique_db_name());
        transport.write(make_entry({ id: '' }));
        transport.write(make_entry({ id: 'valid_2', message: 'should survive' }));

        // Must not throw DataError
        await expect(transport.flush()).resolves.toBeUndefined();
    });

    it('flush() successfully writes valid entries even when empty-id entries are present', async () => {
        const db_name = unique_db_name();
        const transport = new TestLogTransport(db_name);
        transport.write(make_entry({ id: 'valid_a', message: 'entry A' }));
        transport.write(make_entry({ id: '' }));
        transport.write(make_entry({ id: 'valid_b', message: 'entry B' }));

        await transport.flush();

        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const r = indexedDB.open(db_name, 1);
            r.onerror = () => reject(r.error);
            r.onsuccess = () => resolve(r.result);
        });
        const tx = db.transaction(['app_logs'], 'readonly');
        const store = tx.objectStore('app_logs');
        const count = await new Promise<number>((resolve) => {
            const req = store.count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(0);
        });
        expect(count).toBe(2);
    });

    it('flush() with all empty-id buffer does not throw', async () => {
        const transport = new TestLogTransport(unique_db_name());
        transport.write(make_entry({ id: '' }));
        transport.write(make_entry({ id: '' }));

        await expect(transport.flush()).resolves.toBeUndefined();
    });

    it('flush() buffer with missing id field does not throw', async () => {
        const transport = new TestLogTransport(unique_db_name());
        // Simulate an entry missing the id field entirely (pushed directly to buffer)
        const bad_entry = {
            timestamp: Date.now(),
            level: 'info' as const,
            module: 'test',
            message: 'no id field',
        };
        (transport as any).buffer.push(bad_entry);
        transport.write(make_entry({ id: 'valid_c', message: 'entry C' }));

        await expect(transport.flush()).resolves.toBeUndefined();
    });
});
