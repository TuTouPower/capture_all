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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：`data.get` 携带唯一 `record_id` 时，只访问对应 store 与对应记录，不调用其他六个数据源的读取。
- [ ] AC-002：`data.list` 或 `timeline.list` 使用 `limit=1` 时，storage 读取量受 limit 约束，不先加载七源全量。
- [ ] AC-003：`sources.list` 获取 count/range 不读取 body/value 内容。
- [ ] AC-004：keyset 分页读取 N 条记录为 O(N)，提供 continuation token，下一页从 last key 继续，不从头 skip offset。
- [ ] AC-005：对外返回结果（字段、排序、分页语义）与修改前等价，既有契约测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：mock IndexedDB 断言读取量、点查路径、keyset cursor advance 次数。

## 上下文区

- 来源：PERF-H001、PERF-H002、PERF-L009（CL-07；2026-08-13 核实，`51e0843c` 引入 offset cursor 退化，`42236c2f` 引入全量 offset 循环）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- instrument cursor success/advance 次数，断言 O(N) 而非只断言不调用 `getAll`；点查断言不触及其他 store。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- IndexedDB 复合索引与 keyset `lowerBound(last_key, true)` 在目标浏览器的行为：`UNVERIFIED-SPIKE`，执行期用最小 fixture 验证。

### 风险与回退

- 风险：谓词下推改变排序/边界语义，破坏既有契约。
- 回退：对外契约测试作为 gate；若某 store 无法索引下推，保留全量路径但显式标注并降级。

### 依赖与约束

- 与 t156 共享分页 helper；避免重复实现 keyset 游标。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：记录 keyset 分页契约与复合索引选择。
