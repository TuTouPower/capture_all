// code/keyset_probe2.mjs — SPIKE 续：continuePrimaryKey 严格大于语义 + 复合索引 keyset
// 1) continuePrimaryKey 定位到 (key, primaryKey) 自身 → 需再 continue() 一次实现「严格大于」
// 2) 复合索引 [capture_id, relative_time_ms] keyset：按时间序分页，页间排序一致
import 'fake-indexeddb/auto';

const DB = 'probe_db2';
const STORE = 'events';

async function setup(records, with_composite) {
    const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => {
            const s = req.result.createObjectStore(STORE, { keyPath: 'event_id' });
            s.createIndex('capture_id', 'capture_id');
            if (with_composite) {
                s.createIndex('capture_time', ['capture_id', 'relative_time_ms']);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(STORE, 'readwrite');
    for (const r of records) tx.objectStore(STORE).put(r);
    await new Promise((res) => { tx.oncomplete = res; });
    return db;
}

/** 复合索引 keyset：openCursor(复合 range) + continuePrimaryKey(索引key, primaryKey) + 跳过自身 */
async function page_by_composite(db, last, limit) {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const index = store.index('capture_time');
    const out = [];
    let reads = 0;
    await new Promise((resolve) => {
        let skip_next = false;
        // 双界：capture_id 前缀固定 c1 + relative_time 严格大于 last（防 c2 混入）
        const range = IDBKeyRange.bound(
            last ? [last.capture_id, last.relative_time_ms] : ['c1', -Infinity],
            ['c1', +Infinity],
            true, true,
        );
        const req = index.openCursor(range);
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) { resolve(); return; }
            if (out.length >= limit) { resolve(); return; }
            out.push({ event_id: cursor.primaryKey, capture_id: cursor.key[0], relative_time_ms: cursor.key[1] });
            reads += 1;
            cursor.continue();
        };
    });
    return { out, reads };
}

// 场景 2：复合索引 lowerBound keyset（严格大于，页间时间序一致）
{
    const db = await setup([
        { event_id: 'evt_aaa', capture_id: 'c1', relative_time_ms: 300 },
        { event_id: 'evt_bbb', capture_id: 'c1', relative_time_ms: 100 },
        { event_id: 'evt_ccc', capture_id: 'c1', relative_time_ms: 200 },
        { event_id: 'evt_ddd', capture_id: 'c1', relative_time_ms: 400 },
        { event_id: 'evt_eee', capture_id: 'c1', relative_time_ms: 250 },
        { event_id: 'evt_zzz', capture_id: 'c2', relative_time_ms: 999 },
    ], true);
    const p1 = await page_by_composite(db, null, 2);
    console.log('c1 复合 page1:', p1.out.map(x => `${x.event_id}@${x.relative_time_ms}`), 'reads:', p1.reads);
    const p2 = await page_by_composite(db, p1.out.at(-1), 2);
    console.log('c1 复合 page2:', p2.out.map(x => `${x.event_id}@${x.relative_time_ms}`), 'reads:', p2.reads);
    const p3 = await page_by_composite(db, p2.out.at(-1), 2);
    console.log('c1 复合 page3:', p3.out.map(x => `${x.event_id}@${x.relative_time_ms}`), 'reads:', p3.reads);
    const all = p1.out.concat(p2.out, p3.out);
    const times = all.map(x => x.relative_time_ms);
    const sorted = [...times].sort((a, b) => a - b);
    console.log('时间序一致（页间不乱）:', JSON.stringify(times) === JSON.stringify(sorted));
    console.log('c2 未混入 c1 页:', all.every(x => x.capture_id === 'c1'));
    db.close();
}
