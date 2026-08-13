// code/keyset_probe.mjs — SPIKE: IDB capture_id 索引 cursor keyset 分页验证
// 验证：cursor.continuePrimaryKey(capture_id, last_event_id) 从 last 继续（O(1) 跳转，
// 非从头 skip offset）；token 语义（last primary key 推进）；与相对时间排序的差异。
import 'fake-indexeddb/auto';

const DB = 'probe_db';
const STORE = 'events';

async function setup(records) {
    const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => {
            const s = req.result.createObjectStore(STORE, { keyPath: 'event_id' });
            s.createIndex('capture_id', 'capture_id');
            s.createIndex('relative_time_ms', 'relative_time_ms');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(STORE, 'readwrite');
    for (const r of records) tx.objectStore(STORE).put(r);
    await new Promise((res) => { tx.oncomplete = res; });
    return db;
}

/** keyset 分页：openCursor(only(capture_id)) + continuePrimaryKey 跳 last */
async function page_by_keyset(db, capture_id, last_event_id, limit) {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const index = store.index('capture_id');
    const out = [];
    let advance_calls = 0;
    await new Promise((resolve) => {
        const req = index.openCursor(IDBKeyRange.only(capture_id));
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) { resolve(); return; }
            if (last_event_id != null) {
                // keyset：从 last 之后继续（O(1) 定位）
                cursor.continuePrimaryKey(capture_id, last_event_id);
                // 注意：continue 后当前 cursor 已无 value，需等待下一次 onsuccess
                last_event_id = null; // 只跳一次
                return;
            }
            if (out.length >= limit) { resolve(); return; }
            out.push({ event_id: cursor.primaryKey, relative_time_ms: cursor.value.relative_time_ms });
            advance_calls += 1;
            cursor.continue();
        };
    });
    return { out, advance_calls };
}

const db = await setup([
    { event_id: 'evt_aaa', capture_id: 'c1', relative_time_ms: 300 },
    { event_id: 'evt_bbb', capture_id: 'c1', relative_time_ms: 100 },
    { event_id: 'evt_ccc', capture_id: 'c1', relative_time_ms: 200 },
    { event_id: 'evt_ddd', capture_id: 'c1', relative_time_ms: 400 },
    { event_id: 'evt_zzz', capture_id: 'c2', relative_time_ms: 999 },
]);

const p1 = await page_by_keyset(db, 'c1', null, 2);
console.log('page1:', p1.out.map(x => x.event_id), 'advance:', p1.advance_calls);
const last = p1.out.at(-1).event_id;
const p2 = await page_by_keyset(db, 'c1', last, 2);
console.log('page2 (continuePrimaryKey from', last + '):', p2.out.map(x => x.event_id), 'advance:', p2.advance_calls);
const p3 = await page_by_keyset(db, 'c1', p2.out.at(-1).event_id, 2);
console.log('page3:', p3.out.map(x => x.event_id), 'advance:', p3.advance_calls);

// 结论验证
const order_ok = ['evt_aaa', 'evt_bbb', 'evt_ccc', 'evt_ddd'].join(',') === p1.out.concat(p2.out, p3.out).map(x => x.event_id).join(',');
console.log('keyset 全量顺序（primary key 字典序）:', order_ok, '— 注意非 relative_time 序');
db.close();
