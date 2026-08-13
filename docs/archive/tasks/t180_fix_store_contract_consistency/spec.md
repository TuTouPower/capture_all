# Task spec

## 背景

文档宣称 IndexedDB v3 为 10 stores，但 fresh DB 实际创建 14 stores（含 4 个 legacy stores）；`capture_lifecycle_events` store 被真实写入但 `get_lifecycle_events()` 无生产消费者，页面快照、exporter、Agent 七源均不含 lifecycle，导致已持久化事件无法从公开查询/归档恢复。IndexedDB 长连接未处理 `versionchange`，未来 schema bump 可能被旧上下文阻塞（BC-008）。

## 契约区

### 范围

- 对齐 store 数量契约：修正文档（10 vs 14）或确认 legacy stores 保留/移除。
- 契约决策 lifecycle 可见性：若属完整采集证据，加入 `CaptureSnapshot`、export 合并与 Agent source；若只作内部细节，在 domain/export/MCP spec 明确排除并评估移除无消费者 store/query。
- IndexedDB 长连接处理 `versionchange`，旧上下文不阻塞 schema bump。

### 非范围

- 不改变 IndexedDB schema 版本号本身（除非版本变更必须）。
- 不改变 Agent 七源的既有公开语义（除非 lifecycle 决策明确要求）。

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

- [ ] AC-001：fresh install 实际创建的 store 数量与文档描述一致（文档修正或 store 收敛）。
- [ ] AC-002：start→stop→export/get_all_data 行为包含 `capture_lifecycle_events`，与文档/spec 一致。
- [ ] AC-003：`capture_lifecycle_events` 加入 `CaptureSnapshot`、export 事件合并与 Agent source；UI 标签仍不展示 lifecycle。
- [ ] AC-004：IndexedDB 长连接收到 `versionchange` 时关闭连接，不阻塞 schema bump。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-004 `[deploy]`：需真实多上下文浏览器环境验证；其余用 mock IndexedDB 与导出/查询单测。

## 上下文区

- 来源：ARCH-007、ARCH-008、BC-007、BC-008（CL-05；2026-08-13 核实，lifecycle store 由 `c88c556`/`40d3b22` 引入）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock IndexedDB store 创建与 versionchange 事件；断言 store 数量与 lifecycle 可见性。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- lifecycle 可见性已确认（2026-08-13 用户决策）：视为完整采集证据，加入 `CaptureSnapshot`、export 事件合并与 Agent source（`capture_lifecycle_events`），UI 标签仍可不展示。

### 风险与回退

- 风险：改动 schema 或 store 收敛破坏既有数据。
- 回退：仅文档对齐，不改 store 结构；versionchange 处理为纯增量。

### 依赖与约束

- 与 `docs/blueprint/domain.md:51-57`、`docs/archive/specs/data_model.md` 一致。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：同步 store 数量与 lifecycle 可见性。
