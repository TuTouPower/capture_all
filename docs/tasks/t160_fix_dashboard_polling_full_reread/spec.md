# Task spec

## 背景

Dashboard 打开进行中 capture 详情时，2 秒 interval 无条件调用 `load_detail()`，先清空状态、请求元数据，再 `Promise.all` 发起 8 路 IndexedDB 读取（每路上限 100000），随后 merge/copy/sort 全量列表。t144 的 signature 对比发生在完整重读之后，只避免 DOM 替换，不避免数据库扫描、对象分配、数组复制与排序。大 capture 下每次轮询都付出全量成本。

## 契约区

### 范围

- 轮询先只读轻量 metadata/counter，版本/计数推进才取数据。
- 数据增量：按 per-source cursor/offset 拉增量，append 到内存态，只排序新增边界。
- 页面 hidden 或离开详情时暂停轮询。

### 非范围

- 不引入完整 UI 虚拟化（见 t193）。
- 不改动 `read_capture_snapshot` 的 100000 截断修复（见 t156）。

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

- [ ] AC-001：连续两个轮询周期无新事件时，第二次只执行 metadata 查询，不调用 `read_capture_snapshot()`。
- [ ] AC-002：有新事件时，仅增量拉取新增记录并 append，不重新全量读取七类。
- [ ] AC-003：页面 `visibilitychange` 进入 hidden 后，轮询停止；恢复 visible 后按最新版本恢复。
- [ ] AC-004：详情页关闭或离开后，轮询 interval 被清理，不再触发读取。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：用 spy 断言 `read_capture_snapshot` 调用次数与 metadata 查询；`visibilitychange` 用 jsdom/事件模拟。

## 上下文区

- 来源：EXTUI-002、PERF-H003（CL-06；2026-08-13 核实，`17cde0df` t144 引入 signature 分支但 guard 在完整重读之后）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock IndexedDB 与 metadata 源；断言读取量与调用次数，而非 DOM 内部状态。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：增量状态与全量读取语义不一致导致详情漏数据。
- 回退：版本号变化时退回一次全量重建作为保底，仅降低而非完全移除成本。

### 依赖与约束

- 依赖 t156 分页读取能力（cursor 增量）。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：如采用 metadata 版本号机制，记录其契约。
