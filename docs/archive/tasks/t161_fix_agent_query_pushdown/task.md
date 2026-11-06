# Task spec

## 背景

Agent 查询路径存在两处性能退化：`query_by_store` 用 offset cursor 分页，每页重新打开 cursor 并从头 `continue()` 跳过 offset，全量聚合退化为 O(N²/PAGE_SIZE)；MCP `data.list`/`data.get`/`timeline.list`/`sources.list` 均先 `Promise.all` 加载七个 store 全量，再 filter/sort/slice/find，`limit=1` 或点查也支付全量读取成本。64MiB 结果保护在 materialize 之后才序列化检查，无法保护 MV3 service worker 内存。

## 契约区

### 范围

- storage 层提供 keyset 分页（`[capture_id, event_id]` 或 `[capture_id, relative_time_ms, event_id]` 复合索引），返回 opaque continuation token/last key。
- Agent 查询按 source 拆分 count/range/order/keyset page/get-by-id，谓词、时间范围、order、limit 推入 IndexedDB。
- `data.get`/`timeline.get` 用主键或复合索引点查；`sources.list` 用 `count()` 或维护计数，不读 body/value。
- 保留 `captures.list` 语义但避免全量读取后二次排序再 slice。

### 非范围

- 不改变 Agent 查询对外返回契约（字段、排序、limit 语义保持一致）。
- 不重构 `capture.get_all_data` / export 的全量遍历（允许保留全量，仅改内部游标效率）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：`data.get` 携带唯一 `record_id` 时，只访问对应 store 与对应记录，不调用其他六个数据源的读取。
- [ ] AC-002：`data.list` 或 `timeline.list` 使用 `limit=1` 时，storage 读取量受 limit 约束，不先加载七源全量。
- [ ] AC-003：`sources.list` 获取 count/range 不读取 body/value 内容。
- [ ] AC-004：keyset 分页读取 N 条记录为 O(N)，提供 continuation token，下一页从 last key 继续，不从头 skip offset。
- [ ] AC-005：对外返回结果（字段、排序、分页语义）与修改前等价，既有契约测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：mock IndexedDB 断言读取量、点查路径、keyset cursor advance 次数。

## 上下文区

- 来源：PERF-H001、PERF-H002、PERF-L009（CL-07；2026-08-13 核实，`51e0843c` 引入 offset cursor 退化，`42236c2f` 引入全量 offset 循环）。

### 有意不测

- 无。

### 测试策略

- instrument cursor success/advance 次数，断言 O(N) 而非只断言不调用 `getAll`；点查断言不触及其他 store。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- IndexedDB 复合索引与 keyset `lowerBound(last_key, true)` 在目标浏览器的行为：结论=复合索引 `[capture_id, relative_time_ms, event_id]` + 双界 `bound([c1,last_t,last_e],[c1,+Inf,+Inf],true,true)` 可行（s006 spike + d008 findings，2026-08-13 已实测）；单 lowerBound 会混入其他 capture，须双界；continuePrimaryKey 定位含自身且按 event_id 序破坏时间排序契约。

### 风险与回退

- 风险：谓词下推改变排序/边界语义，破坏既有契约。
- 回退：对外契约测试作为 gate；若某 store 无法索引下推，保留全量路径但显式标注并降级。

### 依赖与约束

- 与 t156 共享分页 helper；避免重复实现 keyset 游标。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：记录 keyset 分页契约与复合索引选择。
