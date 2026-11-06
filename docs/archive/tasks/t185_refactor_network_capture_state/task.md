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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：重构后既有 network capture 生产接线测试全部通过，采集结果不变。
- [ ] AC-002：`handle_cdp_event` 不再直接读写散落的模块级 Map/Set，状态经 `NetworkCaptureContext` 访问。
- [ ] AC-003：request lifecycle 的 `finalize`/`cleanup` 收敛为单一 API，各 terminal path 不再手工删除多个集合。
- [ ] AC-004：新增 terminal-path table test，逐项断言各终态相关 state 均清空。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：既有生产接线测试 + 新增 terminal-path 表测试。

## 上下文区

- 来源：ARCH-005（2026-08-13 核实，主 dispatcher 自 2026-06 存在，`855a9c4` 抽 specialized modules 但核心函数保留）。

### 有意不测

- 无。

### 测试策略

- 行为等价重构，以既有生产接线测试为 gate；新增 terminal-path table test 覆盖状态清理不变量。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：重构破坏 terminal path 清理不变量。
- 回退：小步拆分 + terminal-path 表测试兜底；每步全量回归。

### 依赖与约束

- 与 t157 CDP body 记账同域，注意合并顺序（先重构状态访问再改记账可降冲突）。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：如记录 `NetworkCaptureContext` 分层，同步。
