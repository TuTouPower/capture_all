# Task review t125（reviewer_focus: 代码）

- task：`t125_remove_protocol_compat_layer`
- spec：`docs/tasks/t125_remove_protocol_compat_layer/spec.md`
- diff_anchor：`ddab3729e8e2df2041740b9b73dc1cca1b2bf8b9`
- target：`git diff ddab3729e8e2df2041740b9b73dc1cca1b2bf8b9`
- round：1
- reviewed_at：2026-08-11 21:07 UTC+8

reviewed_scope: e7ca8894fcca411a

## Findings

本轮 0 条。

（clean review 为有效输出。逐项核对结论见下。）

## 结论

- 前轮 finding 复核：首轮，无。
- 本轮新发现：0 条。
- 未进表的提示：

  1. **蓝图文档残留旧码描述（finalization 范围，非代码 AC）**：`docs/blueprint/domain.md:145` 仍写「旧码兼容至 v2.0」并指引 `src/shared/protocol.ts` 的 `ERROR_CODE_ALIASES` 映射表（该符号本次已删除）；`docs/blueprint/decisions.md:102`（决策 013）仍记录「v2.0 移除旧码…详见 T057」。spec「Finalization 时更新的 blueprint」节已约定收尾更新 decisions.md，非代码轴验收项，故不进 finding 表；请在 finalization 阶段同步修订两处，避免长期真相文档指向已删除符号。
  2. **文件过大/复杂度**：无。本次触及源码行数均远低于阈值（protocol.ts 147、agent_command_dispatcher.ts 318、agent_data_queries.ts 314、popup.ts 495 但本次净增 0 行）；types.ts 711 行为净删 17 行，不触发。
  3. **范围外观察（非本 task 引入）**：`is_agent_error_code`（agent_command_dispatcher.ts:303）只枚举 6 个码而 `AgentErrorCode` 联合含 20+ 成员，属改动前既有形态，本次仅将数组内 `SESSION_NOT_FOUND` 项改为 `CAPTURE_NOT_FOUND`，未扩大范围。
  4. **schemas/ 为空**：目录仅含 `.gitkeep`，无契约文件，AC-003 的残留检查为空集，无跨服务契约需同步。

- 系统性 follow-up：无（蓝图修订随 finalization 执行，无需新建 task）。

### AC 复验方式

- AC-001（`ERROR_CODE_ALIASES` 与旧码兼容别名不存在，src/tests 无引用）：`re_verified`。全仓 grep `ERROR_CODE_ALIASES`/`SESSION_NOT_FOUND`/`RECORDING_ALREADY_RUNNING`/`NO_ACTIVE_RECORDING` 于 `src/`、`tests/`、`schemas/` 零命中；`src/shared/protocol.ts` 联合类型已无三个旧码成员与别名表。
- AC-002（types.ts 6 个 `@deprecated` 类型别名不存在，全用新类型名）：`re_verified`。grep `\bSession\b`/`\bRecordEvent\b`/`\bRecordConfig\b`/`\bConsoleLog\b`/`\bNetworkRequest\b`/`\bErrorLog\b` 于 src/tests/schemas 仅命中注释文本（`cdp_event_router.ts:2`「Session routing」、`storage.ts:136`「replaces Session CRUD」、`network_correlator.ts:2`「unified NetworkRequest」），非类型引用；`popup.ts` 已改 `CaptureRecord[]`，`types.ts` 尾部 6 别名整块删除。
- AC-003（schemas/ 契约与迁移后代码一致，无残留）：`re_verified`。schemas/ 仅 `.gitkeep`，对旧码/旧类型名 grep 空集。
- AC-004（`npm test` 全绿、`npx tsc --noEmit` 通过）：`re_verified`。`npx tsc --noEmit` 退出码 0；`npm test` 129 文件 / 1368 用例全通过。

coverage = 4 / 4

- 总体判断：3 个旧码迁移（SESSION_NOT_FOUND→CAPTURE_NOT_FOUND、RECORDING_ALREADY_RUNNING→CAPTURE_ALREADY_RUNNING、NO_ACTIVE_RECORDING→NO_ACTIVE_CAPTURE）在 dispatcher/queries/is_agent_error_code/T048 注释与两处测试中完整一致；6 个类型别名删除后 popup.ts 引用同步；SOURCE_NOT_FOUND/RECORD_NOT_FOUND/INVALID_QUERY/TARGET_* 等保留码为独立实义错误码（无 capture 新码对应），保留合理。无未解决 critical / important。

verdict: PASS

## Round 2 (2026-08-11 21:11 UTC+8)

reviewed_scope: 7d712a69bd8cc045

### 前轮 finding 复核

- 首轮 0 finding，无 finding 需复核。
- 首轮「未进表的提示」第 1 条（blueprint 残留，属 finalization 范围）：本轮已由 implementer 同步，复核正确，无矛盾残留：
  - `docs/blueprint/domain.md`：原「错误码别名」段（旧码兼容至 v2.0、指引 `ERROR_CODE_ALIASES`）已整段删除；扩展层错误码列表为 capture 新码（`CAPTURE_NOT_FOUND`/`CAPTURE_ALREADY_RUNNING`/`NO_ACTIVE_CAPTURE`），无旧码残留。
  - `docs/blueprint/decisions.md:102`（决策 013）：标题已标记「2026-08-11 已移除」；结论更新为破坏性升级移除旧码与 `ERROR_CODE_ALIASES`（t125），明确「旧码 … 不再存在于 AgentErrorCode」。背景/选项保留为历史决策记录上下文，表述正确，无「详见 T057」等过时指引残留。
  - `docs/blueprint/domain.md:49` 的「兼容别名」指向命令别名（`list_sessions`/`get_session`/`get_all_session_data`/`export_session`），经核仍在 `src/mcp/schemas.ts:139-149`、`src/mcp/tools.ts:14-24` 有效，非错误码别名、不在本 task 删除范围，描述准确，不构成残留。

### 本轮新发现

- 0 条。

### 其余代码改动

- 相对 diff_anchor，本轮新增改动仅 blueprint 文档（domain.md / decisions.md）与 `task.md`（流程文件，指纹排除）；`src/`、`tests/` 代码 diff 与 Round 1 完全一致，逐处复核无出入（dispatcher 3 旧码→capture 新码 + is_agent_error_code 数组项、queries `SESSION_NOT_FOUND`→`CAPTURE_NOT_FOUND`、popup 类型引用、两测试断言同步）。

### AC 复验（Round 2）

- AC-001/002/003：`re_verified`。本轮重跑 grep：`ERROR_CODE_ALIASES`、`SESSION_NOT_FOUND`、`RECORDING_ALREADY_RUNNING`、`NO_ACTIVE_RECORDING` 及 6 个 deprecated 类型别名在 `src/`、`tests/`、`schemas/` 全零命中；schemas/ 仅 `.gitkeep`。
- AC-004：`re_verified`（tsc）/ `trust_prior`（npm test）。本轮 `npx tsc --noEmit` 退出码 0；`npm test` 因代码相对 Round 1 未变，沿用 Round 1 全绿证据（129 文件 / 1368 用例）。

### 未进表的提示

- 无（本轮仅文档变更，未触及源码体积/复杂度）。

### 总体判断

Round 1 PASS 基础上，implementer 已按 spec「Finalization 时更新的 blueprint」同步 domain.md 与 decisions.md，删除旧码别名段并标记决策 013 移除，无矛盾残留；代码相对 Round 1 未变、grep 残留零命中、tsc 通过。无未解决 critical / important。

verdict: PASS
