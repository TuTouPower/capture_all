# Spike report

## 问题

IndexedDB 复合索引 + keyset 分页在目标环境（Chrome MV3，fake-indexeddb 模拟）的行为：能否用 `[capture_id, sort_key, event_id]` 复合索引做 O(N) 分页、页间排序一致、capture 隔离，替代 offset cursor 的 O(N²/PAGE_SIZE) 退化。

## 成功判据

- fake-indexeddb 实证：复合索引 keyset 分页 N 条读取量 O(limit)；页间相对时间序一致；跨 capture 不混入；同相对时间多条不遗漏。
- 结论给出 storage 层 keyset API 形态（range 构造、token 语义）。

## 尝试

- `docs/spikes/s006_idb_keyset_cursor_pushdown/code/keyset_probe.mjs`：capture_id 单索引 + `cursor.continuePrimaryKey` 验证——发现两条：
  1. `continuePrimaryKey` 定位到 (key, primaryKey) 自身，需再 `continue()` 才严格大于（可处理但绕）。
  2. 按 event_id（primary key）序推进，页间排序 ≠ relative_time 序，破坏对外排序契约。
- `keyset_probe2.mjs`：`[capture_id, relative_time_ms]` 复合索引 + `IDBKeyRange.bound` 双界 keyset 验证——修正 `lowerBound(['c1', -inf])` 会混入 c2（复合 key 前缀比较），双界 `bound(['c1', last_t], ['c1', +inf], true, true)` 严格隔离 capture。

## 证据

- 复合 keyset 页读取量 = limit（O(N)）；页间时间序一致；capture 隔离正确（probe2 输出）。
- 同 `relative_time_ms` 多条：bound 下界 `(c1, last_t)` 严格大于会跳过同刻兄弟记录 → 索引须含 event_id 第三键 `[capture_id, relative_time_ms, event_id]`，bound 下界用三元组 `(c1, last_t, last_e)`。
- 排序键 per-source 不统一：CaptureEvent 类 `relative_time_ms` 必填；network 写入含 `relative_time_ms`（`network_capture.ts:276/360/772`，`Date.now()-start_time`）；console 含 `relative_time_ms`（t144）。字段缺失记录 fallback 索引键（IDB 不索引 undefined → 须写入时规整或降级处理）。

## 结论

keyset 分页可行且推荐：各事件 store 加复合索引 `[capture_id, relative_time_ms, event_id]`（DB_VERSION 3→4 迁移），分页用 `IDBKeyRange.bound([c1, last_t, last_e], [c1, +Inf, +Inf], true, true)`，token = 末条 `(relative_time_ms, event_id)`。读取量 O(limit)，页间按相对时间序，capture 隔离正确，同刻按 event_id 继续不遗漏。**每 source 按其排序键建索引**（CaptureEvent 类 relative_time_ms；network/console 同字段或显式降级全量）。

## 是否采纳

- 决定：是
- 理由：复合索引 keyset 满足 AC-004（O(N)）+ AC-005（排序等价）+ capture 隔离；DB 迁移为一次性成本，7 store 各加一个复合索引。
- 后续 task：t161
