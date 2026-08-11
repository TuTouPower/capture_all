# Task spec

## 背景

`NetworkRequestData` 约 40 字段的构造在多处手工逐字段写死：`body_capture_coordinator.ts:300-317`（external_cdp_bridge 路径）、`network_capture.ts:273-312`（WebSocket 连接事件）等 3+ 处。字段集大体一致（request/response body 状态、headers 状态、尺寸字段、null 默认值），差异在少数字段（capture_method / body_capture_mode / ws 相关 / correlation_status）。审阅确认重复构造点可统一。

## 契约区

### 范围

- 抽取 `NetworkRequestData` 构造 builder：默认字段工厂 + 按调用点覆盖差异字段。
- 落点优先 `src/shared/types.ts` 旁或 `src/shared/` 工具文件，执行期定。
- 迁移 `body_capture_coordinator.ts`、`network_capture.ts` 及其余构造点使用 builder。

### 非范围

- 不改任何调用点实际输出的数据语义（字段值与事件行为不变）。
- 不改 `NetworkRequestData` 类型定义本身。

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

- [ ] AC-001：已知构造点（body_capture_coordinator、network_capture 等）不再内联 ~40 字段样板，统一经 builder（代码结构断言）。
- [ ] AC-002：网络捕获事件数据不变：网络相关测试全绿，断言覆盖字段值（含 body 状态、headers 状态、ws 字段、correlation 字段）。
- [ ] AC-003：`npm test` 全绿，`npx tsc --noEmit` 通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：AC-001 结构断言，AC-002/003 测试套件。

## 上下文区

- 来源：无（审阅发现，2026-08-11 核实 3+ 构造点）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 现有网络捕获测试（network_capture / body_capture_coordinator / external_cdp_bridge）覆盖字段语义；builder 本身补轻量单测（默认字段与覆盖行为）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：中。构造点字段差异（如 correlation_status 仅部分路径有）迁移时可能漏字段。以全量网络测试 + 逐构造点 diff 覆盖。
- 回退：git 恢复原构造点。

### 依赖与约束

- 依赖 t123（webrequest_handler 删除后构造点集合确定）。建议在 t123 后执行。

### Finalization 时更新的 blueprint

- 无
