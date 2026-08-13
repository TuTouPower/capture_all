// tests/unit/storage_v4_migration.test.ts
// t161 f005: DB v3→v4 迁移——复合索引 capture_time + legacy 记录 backfill
// （web_request 路径 NetworkRequestData 只写 relative_time，迁移补 relative_time_ms 入索引）
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, DB_VERSION, STORE_NAMES } from '../../src/shared/constants';
import { init_db, query_by_store_keyset, _reset_storage_stats_for_test } from '../../src/extension/background/storage';

// 按 v3 结构手工建库（storage.init_db 为 v4 迁移入口）
async function build_v3_db_with_legacy(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 3);
        req.onupgradeneeded = () => {
            const db = req.result;
            // 仅建 legacy 相关 store（network 含旧形态记录；其余 store 可缺）
            if (!db.objectStoreNames.contains(STORE_NAMES.NETWORK_REQUESTS)) {
                const s = db.createObjectStore(STORE_NAMES.NETWORK_REQUESTS, { keyPath: 'event_id' });
                s.createIndex('capture_id', 'capture_id');
            }
            if (!db.objectStoreNames.contains(STORE_NAMES.CAPTURES)) {
                db.createObjectStore(STORE_NAMES.CAPTURES, { keyPath: 'capture_id' });
            }
        };
        req.onsuccess = () => {
            const db = req.result;
            // 写 legacy 网络记录（无 relative_time_ms，只有 relative_time）
            const tx = db.transaction(STORE_NAMES.NETWORK_REQUESTS, 'readwrite');
            tx.objectStore(STORE_NAMES.NETWORK_REQUESTS).put({
                event_id: 'legacy_net_1',
                capture_id: 'c1',
                request_id: 'req_1',
                method: 'GET',
                url: 'https://example.com',
                relative_time: 150,
                resource_type: 'fetch',
                status_code: 200,
                headers_status: 'captured',
                request_body: null,
                request_body_status: 'not_enabled',
                response_body: null,
                response_body_status: 'not_enabled',
                mime_type: null,
                capture_method: 'web_request',
                body_capture_mode: 'off',
            });
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
    });
}

beforeEach(async () => {
    // 清库：每次重建 v3
    await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
    });
    _reset_storage_stats_for_test();
});

describe('DB v3→v4 迁移', () => {
    it('f005: legacy 网络记录（无 relative_time_ms）迁移后入 keyset 索引', async () => {
        await build_v3_db_with_legacy();

        // 触发 v4 迁移（init_db 用 DB_VERSION=4，onupgradeneeded 补索引 + backfill）
        await init_db();

        const page = await query_by_store_keyset<{ event_id: string; relative_time_ms: number }>(
            STORE_NAMES.NETWORK_REQUESTS, 'c1', { limit: 10 },
        );
        expect(page.records.length).toBe(1);
        expect(page.records[0].event_id).toBe('legacy_net_1');
        // backfill 补 relative_time_ms = relative_time = 150
        expect(page.records[0].relative_time_ms).toBe(150);
    });
});
