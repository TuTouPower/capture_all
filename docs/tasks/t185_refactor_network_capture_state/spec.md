# Task spec

## 背景

`network_capture.handle_cdp_event` 约 421 行，在同一函数内处理 sub-target attach/detach、HTTP request/redirect、response/stream 检测、loadingFinished/body 异步生命周期、loadingFailed、WebSocket connection/frame 生命周期，直接读写至少 7 组模块级状态。文件头宣称「Delegates to specialized handlers」，已 import `cdp_event_router`/`stream_buffer`/`network_webrequest`/`cdp_handler`，但核心协议分派与状态转换仍集中在 orchestrator。

## 契约区

### 范围

- 引入显式 `NetworkCaptureContext` 包装当前 Map/Set 与 capture generation，不改行为。
- 按 method family 拆 `handle_target_event`、`handle_http_event`、`handle_websocket_event`。
- request lifecycle 收敛为单一 record/state transition API，集中 `finalize`/`cleanup`，避免每条异步分支手工删除多个集合。
- 增加 terminal-path table test，逐项断言相关 state 均清空。

### 非范围

- 不改变 CDP 事件处理的行为语义与数据采集结果。
- 不改动 `cdp_event_router`/`stream_buffer` 等已拆模块的对外接口（除非为 context 注入必要）。

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

- [ ] AC-001：重构后既有 network capture 生产接线测试全部通过，采集结果不变。
- [ ] AC-002：`handle_cdp_event` 不再直接读写散落的模块级 Map/Set，状态经 `NetworkCaptureContext` 访问。
- [ ] AC-003：request lifecycle 的 `finalize`/`cleanup` 收敛为单一 API，各 terminal path 不再手工删除多个集合。
- [ ] AC-004：新增 terminal-path table test，逐项断言各终态相关 state 均清空。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：既有生产接线测试 + 新增 terminal-path 表测试。

## 上下文区

- 来源：ARCH-005（2026-08-13 核实，主 dispatcher 自 2026-06 存在，`855a9c4` 抽 specialized modules 但核心函数保留）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 行为等价重构，以既有生产接线测试为 gate；新增 terminal-path table test 覆盖状态清理不变量。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：重构破坏 terminal path 清理不变量。
- 回退：小步拆分 + terminal-path 表测试兜底；每步全量回归。

### 依赖与约束

- 与 t157 CDP body 记账同域，注意合并顺序（先重构状态访问再改记账可降冲突）。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：如记录 `NetworkCaptureContext` 分层，同步。
