# Task review t125（reviewer_focus: 测试）

- task：`t125_remove_protocol_compat_layer`
- spec：`docs/tasks/t125_remove_protocol_compat_layer/spec.md`
- diff_anchor：`ddab3729e8e2df2041740b9b73dc1cca1b2bf8b9`
- target：`git diff ddab3729e8e2df2041740b9b73dc1cca1b2bf8b9`
- round：1
- reviewed_at：2026-08-11 21:05 UTC+8

reviewed_scope: e7ca8894fcca411a

## Findings

本轮无 finding（0 条）。测试改动均为错误码字符串重命名迁移，断言强度未变，与生产改名同向，全量套件与 tsc 重跑通过。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（首轮）
- 改测方向复核：无迁就实现的改测。4 处改测（`agent_command_dispatcher.test.ts` 3 处 `error.code` mock、`agent_data_queries.test.ts` 1 处 `rejects.toThrow`）均为旧错误码→新错误码的字符串重命名，与生产代码（`agent_command_dispatcher.ts` 4 处、`agent_data_queries.ts` 1 处）同向改名，且 `is_agent_error_code` 白名单数组同步由 `SESSION_NOT_FOUND` 改为 `CAPTURE_NOT_FOUND`。spec 契约区明确要求「迁移本仓全部引用（生产 + 测试）到新码」，新码语义在 非范围 中声明不改。断言强度与迁移前一致（`toMatchObject({ok:false,error:{code}})` / `rejects.toThrow('CAPTURE_NOT_FOUND')`），非由「让断言迁就实现」驱动。
- 危险模式扫描：全部条目未命中。无删/反转/注释断言、无弱化断言、无 `.skip/.only`、无静默错误指令、无 mock 被测逻辑、无阈值掩盖。dispatcher 测试 mock 的 `AgentRuntimeHandlers` 属于系统边界接口（handler 返回失败态由生产 `start_capture`/`stop_capture`/`get_capture_metadata` 映射为新码），断言触达真实生产逻辑而非 mock 自身。
- 断言触达真实行为确认：
  - `agent_command_dispatcher.test.ts:110` `maps capture already running errors`：mock `start_capture` 返回 `{success:false, error:'Already recording'}`，生产 `start_capture` 命中 `includes('already recording')` 分支，抛 `AgentCommandError('CAPTURE_ALREADY_RUNNING')`，`to_agent_error` 透传 `code`。断言 `CAPTURE_ALREADY_RUNNING` 与生产一致。
  - `agent_command_dispatcher.test.ts:122` `stops capture and maps inactive state`：mock `stop_capture` 返回 `{success:false}`，生产 `stop_capture` 抛 `AgentCommandError('NO_ACTIVE_CAPTURE')`。断言一致。
  - `agent_command_dispatcher.test.ts:134` `maps capture not found`：`captures.get` 命中 `get_capture_metadata` 空捕获分支，生产抛 `AgentCommandError('CAPTURE_NOT_FOUND')`。断言一致。
  - `agent_data_queries.test.ts:322` `throws CAPTURE_NOT_FOUND when capture is missing`：生产 `load_agent_capture_data` 抛 `new Error('CAPTURE_NOT_FOUND')`，`rejects.toThrow('CAPTURE_NOT_FOUND')` 字符串匹配 message。断言一致。
- 本轮新发现：0 条
- 未进表的提示：
  1. `docs/blueprint/domain.md:145` 仍描述「旧码兼容至 v2.0」并指引映射表位于 `src/shared/protocol.ts` `ERROR_CODE_ALIASES`，该符号已删除。属 finalization 阶段文档同步范围（spec 未列出 domain.md，仅列 decisions.md），非测试轴缺陷，建议 finalization 或 repo-hygiene 顺手更新。
  2. `schemas/` 目录仅含 `.gitkeep`（空），AC-003 无实际契约文件可核对，判 trivially 满足。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — `grep -rn "SESSION_NOT_FOUND\|RECORDING_ALREADY_RUNNING\|NO_ACTIVE_RECORDING\|ERROR_CODE_ALIASES" src tests schemas` 零命中；`protocol.ts` diff 显示旧码 union 成员与 `ERROR_CODE_ALIASES` 整体删除。
- AC-002：`re_verified` — `types.ts` diff 显示 6 个 `@deprecated` 别名整体删除；全仓 grep 命中 `Session`/`NetworkRequest` 等均为无关接口（`BridgeSession`/`CdpSession`/`AgentSessionData`）或纯注释，无旧别名引用；`popup.ts` 由 `Session` 迁移为 `CaptureRecord`。
- AC-003：`re_verified` — `schemas/` 仅 `.gitkeep`（空），无旧码/旧类型名残留。
- AC-004：`re_verified` — 重跑 `npx tsc --noEmit` 退出码 0；`npm test`（vitest run）129 files / 1368 tests 全绿。

coverage = 4 / 4

verdict: PASS

## Round 2 (2026-08-11 21:12 UTC+8)

reviewed_scope: 7d712a69bd8cc045

- 复审触发：implementer 同步 blueprint 文档（domain.md 删「错误码别名」段、decisions.md 决策 013 标记已移除），指纹由 Round 1 的 e7ca8894fcca411a 变为本轮 7d712a69bd8cc045，review_scope=stale，按新指纹重审。
- 前轮 finding 复核：Round 1 为 0 finding，无 blocker 需逐条复核。Round 1 未进表提示 #1（`docs/blueprint/domain.md:145` 过时的「错误码别名」段指向已删 `ERROR_CODE_ALIASES`）已由本 diff 消除——domain.md 删除该段；提示 #2（`schemas/` 仅 `.gitkeep` 空目录）不变，AC-003 仍 trivially 满足。
- 测试改动核对：`git diff ddab3729` 测试改动与 Round 1 审阅时完全一致，无新增/删除/弱化。4 处改测仍为 `agent_command_dispatcher.test.ts` 3 处 `error.code`（RECORDING_ALREADY_RUNNING→CAPTURE_ALREADY_RUNNING、NO_ACTIVE_RECORDING→NO_ACTIVE_CAPTURE、SESSION_NOT_FOUND→CAPTURE_NOT_FOUND）+ `agent_data_queries.test.ts` 1 处 `rejects.toThrow`（SESSION_NOT_FOUND→CAPTURE_NOT_FOUND），与生产 `agent_command_dispatcher.ts` 4 处、`agent_data_queries.ts` 1 处同向改名，断言强度未变（`toMatchObject({ok:false,error:{code}})` / `rejects.toThrow('CAPTURE_NOT_FOUND')`）。
- blueprint 同步测试面评估：domain.md / decisions.md 改动纯文档，不涉 src 与 tests，不改变任何测试行为或 AC 覆盖。spec 契约区 finalization 仅要求 decisions.md，implementer 连 domain.md 过时段一并同步，无测试面问题。
- 危险模式扫描：全未命中（同 Round 1）。无删/反转/注释/弱化断言、无 `.skip/.only`、无静默错误指令、无 mock 被测逻辑、无阈值掩盖。
- 本轮新发现：0 条
- 未进表的提示：
  1. `grep @deprecated src tests schemas` 命中 4 处均为范围外既有旧字段：`types.ts:378` 的 `session_id` 字段注释、`protocol.ts:122/124/126` AgentStatus 三字段（`use extensions`）。均非 t125 范围（6 个类型别名已删），不属本 task。
  2. Round 1 提示 #2（`schemas/` 空目录）维持原判。
- 改测方向复核：本轮无改测，无迁就实现的改测。
- AC 复验方式（重跑确认）：
  - AC-001：`re_verified` — `grep -rn "SESSION_NOT_FOUND\|RECORDING_ALREADY_RUNNING\|NO_ACTIVE_RECORDING\|ERROR_CODE_ALIASES" src tests schemas` 零命中；`protocol.ts` diff 显示 3 个旧码 union 成员与 `ERROR_CODE_ALIASES` 删除。
  - AC-002：`re_verified` — `types.ts` diff 显示 6 个 `@deprecated` 别名整体删除；`popup.ts` 由 `Session` 迁移为 `CaptureRecord`；残留 `@deprecated` 仅范围外旧字段。
  - AC-003：`re_verified` — `schemas/` 仅 `.gitkeep`（空），无旧码/旧类型名残留。
  - AC-004：`re_verified` — 重跑 `npx tsc --noEmit` 退出码 0；`npm test`（vitest run）129 files / 1368 tests 全绿。
- 系统性 follow-up：无
- 总体判断：blueprint 文档同步不引入测试面问题，测试改动与 Round 1 一致且仍触达新码，全量套件与 tsc 重跑通过。

coverage = 4 / 4

verdict: PASS
