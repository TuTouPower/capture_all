// tests/unit/app_log_trim_incremental.test.ts
// t153 AC-003: app_log trim 避免每次 flush 全表扫描（增量估算，越限才扫表+删除）。
// 调用路径断言：未越限 flush 不调用 get_total_size_bytes（全扫入口）；
// trim 语义不变：越限仍按时间戳最旧优先删除至限额内。
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppLogEntry } from '../../src/shared/types';

const load_user_config = vi.hoisted(() => vi.fn());
const get_db_mock = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/user_config', () => ({ load_user_config }));
vi.mock('../../src/extension/background/storage', () => ({ get_db: get_db_mock }));

import { IndexedDBLogTransport } from '../../src/extension/background/app_log_storage';

let db_counter = 0;
async function make_db(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(`t153_applog_${Date.now()}_${++db_counter}`, 1);
        req.onupgradeneeded = () => {
            const store = req.result.createObjectStore('app_logs', { keyPath: 'id' });
            store.createIndex('timestamp', 'timestamp');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function make_entry(overrides: Partial<AppLogEntry> = {}): AppLogEntry {
    return {
        id: overrides.id ?? `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: overrides.timestamp ?? Date.now(),
        level: overrides.level ?? 'info',
        module: overrides.module ?? 'test',
        message: overrides.message ?? 'x'.repeat(40),
        details: overrides.details,
        stack: overrides.stack,
    };
}

// 与生产 estimate_entry_bytes 同式：TextEncoder(JSON.stringify).length
function est_bytes(entry: AppLogEntry): number {
    return new TextEncoder().encode(JSON.stringify(entry)).length;
}

async function get_ids(db: IDBDatabase): Promise<string[]> {
    return new Promise((resolve) => {
        const tx = db.transaction(['app_logs'], 'readonly');
        const req = tx.objectStore('app_logs').getAll();
        req.onsuccess = () => resolve((req.result as AppLogEntry[]).map((e) => e.id).sort());
        req.onerror = () => resolve([]);
    });
}

async function count_app_logs(db: IDBDatabase): Promise<number> {
    return new Promise((resolve) => {
        const tx = db.transaction(['app_logs'], 'readonly');
        const req = tx.objectStore('app_logs').count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    get_db_mock.mockReset();
});

describe('app_log trim 增量估算（t153 AC-003）', () => {
    it('未越限的 flush 不调用 get_total_size_bytes（无全表扫描）', async () => {
        const db = await make_db();
        get_db_mock.mockResolvedValue(db);
        load_user_config.mockResolvedValue({ log_max_size_mb: 100 });
        const transport = new IndexedDBLogTransport();
        const size_spy = vi.spyOn(transport, 'get_total_size_bytes');
        transport.write(make_entry());
        transport.write(make_entry());
        await transport.flush();
        // 修前：每次 flush 都全扫（get_total_size_bytes 被调）；修后：估算未越限不扫
        expect(size_spy).not.toHaveBeenCalled();
        // 行为等价：数据仍落库
        expect(await count_app_logs(db)).toBe(2);
        size_spy.mockRestore();
    });

    it('越限时触发 get_total_size_bytes（全扫入口）并 trim', async () => {
        const db = await make_db();
        get_db_mock.mockResolvedValue(db);
        // 极小限额：任何条目都越限
        load_user_config.mockResolvedValue({ log_max_size_mb: 0.000001 });
        const transport = new IndexedDBLogTransport();
        const size_spy = vi.spyOn(transport, 'get_total_size_bytes');
        transport.write(make_entry());
        await transport.flush();
        expect(size_spy).toHaveBeenCalled();
        size_spy.mockRestore();
    });

    it('trim 语义不变——越限删除最旧，保留最新', async () => {
        const db = await make_db();
        get_db_mock.mockResolvedValue(db);
        const e1 = make_entry({ id: 'old1', timestamp: 1 });
        const e2 = make_entry({ id: 'old2', timestamp: 2 });
        const e3 = make_entry({ id: 'new3', timestamp: 3 });
        // 限额恰好容纳一条：3 条越限，trim 删最旧两条，留最新
        const single = est_bytes(e1);
        load_user_config.mockResolvedValue({ log_max_size_mb: single / (1024 * 1024) });
        const transport = new IndexedDBLogTransport();
        transport.write(e1);
        transport.write(e2);
        transport.write(e3);
        await transport.flush();
        const ids = await get_ids(db);
        expect(ids).toEqual(['new3']);
    });

    it('clear() 重置增量估算，此后未越限 flush 仍不扫表', async () => {
        const db = await make_db();
        get_db_mock.mockResolvedValue(db);
        load_user_config.mockResolvedValue({ log_max_size_mb: 100 });
        const transport = new IndexedDBLogTransport();
        transport.write(make_entry());
        await transport.flush();
        await transport.clear();
        const size_spy = vi.spyOn(transport, 'get_total_size_bytes');
        transport.write(make_entry());
        await transport.flush();
        expect(size_spy).not.toHaveBeenCalled();
        size_spy.mockRestore();
    });
});
