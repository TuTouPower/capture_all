# Task spec

## 背景

页面侧快照读取器 `read_capture_snapshot()` 对 7 类数据各查询一次 `offset=0, limit=100000`，无续页、无 `truncated` 标记。Popup 与 Dashboard 的 ZIP 导出、Dashboard 详情页均直接把该截断数组交给 `build_archive()` 或渲染。同一 capture 经 background JSON/HAR/MCP 查询可得到更多数据，经 UI/ZIP 得到更少，形成入口相关数据完整性差异。ADR-012 已否决固定上限，要求分页读取至耗尽；T043 只在 `exporter.ts` 与 `agent_data_queries.ts` 落地，漏掉页面 reader。

## 契约区

### 范围

- 抽取 extension 内统一的全量分页读取能力（`PAGE_SIZE=5000`），供 `capture_data_reader.ts`、`exporter.ts`、`agent_data_queries.ts` 共用。
- `read_capture_snapshot()` 改为按类别循环分页直到耗尽，不再固定 `limit=100000`。
- Popup ZIP、Dashboard ZIP 与 Dashboard 详情使用不截断的读取结果。
- 若必须保留内存预算上限，返回显式 `truncated` / 失败，禁止静默裁切。

### 非范围

- 不改变 background exporter 与 agent 查询的既有正确行为（它们已分页），只统一共享实现。
- 不处理 Dashboard 全量 DOM 渲染与 ZIP 流式组装（见 t193 / 独立性能 task）。
- 不引入 UI 分页展示。

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

- [ ] AC-001：构造单类别记录数 > 100000 的 capture fixture，`read_capture_snapshot()` 返回该类别全部记录，且数量等于持久化统计值。
- [ ] AC-002：跨页读取行为遵循 `PAGE_SIZE=5000` 契约，第二页及以后数据被正确追加，offset 单调递增。
- [ ] AC-003：Popup ZIP 与 Dashboard ZIP 对 > 100000 条 capture 产出的归档 manifest 计数与持久化统计一致（不因截断而偏小）。
- [ ] AC-004：Dashboard 详情对 > 100000 条 capture 展示的数据条数与持久化统计一致。
- [ ] AC-005：若任何读取路径保留上限，必须显式返回 `truncated` 标记或失败错误，调用方不可观察到「看似完整」的截断归档。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：AC-001/002 用 mock IndexedDB 分页 fixture 单测；AC-003/004/005 用 mock `read_capture_snapshot` 与 archive builder 单测。

## 上下文区

- 来源：EXTUI-001、ARCH-001、PERF-H004（CL-01）；`docs/blueprint/decisions.md:95-100` ADR-012（2026-08-13 核实，当前仍生效）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock 边界：IndexedDB cursor 分页用 fake cursor 驱动，不 mock 被测 `read_capture_snapshot` 自身。
- 断言目标：跨页不丢不重、总数一致、截断标记显式。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：统一共享 reader 影响 background exporter / agent 查询既有行为；内存预算缺失导致超大数据量读取峰值升高。
- 回退：共享 reader 保持与原 `exporter.ts` / `agent_data_queries.ts` 等价语义；若内存预算必须限制，改为显式 `truncated` 而非静默裁切。

### 依赖与约束

- 遵循 `docs/blueprint/decisions.md` ADR-012 `PAGE_SIZE=5000`。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：如引入统一 `fetch_all` helper，记录其位置与分页契约。
