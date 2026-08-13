# d008 IDB 复合索引 keyset 分页

- 来源：s006 spike
- 结论：IndexedDB 复合索引 `[capture_id, relative_time_ms, event_id]` + `IDBKeyRange.bound([c1, last_t, last_e], [c1, +Inf, +Inf], true, true)` 可做 O(limit) keyset 分页：页间相对时间序一致、capture 严格隔离、同刻按 event_id 继续不遗漏；token = 末条 (relative_time_ms, event_id)。
- 证据：fake-indexeddb 实证（`docs/spikes/s006/code/keyset_probe2.mjs`）：页读取量 = limit；单 `lowerBound(['c1', -inf])` 会混入 c2（复合 key 前缀比较），双界才隔离；`continuePrimaryKey` 定位含自身（需再 continue），且按 event_id 序推进破坏时间排序契约。
- 影响：t161 Agent 查询下推——storage 层 keyset API + DB_VERSION 3→4 迁移（各事件 store 加复合索引）；排序键 per-source（CaptureEvent 类 relative_time_ms 必填，network/console 写入含该字段）。
- 现状：有效
