# Task review t102（reviewer_focus: 代码）

- task：`t102_agent_result_lifecycle_delivery`
- spec：`docs/tasks/t102_agent_result_lifecycle_delivery/spec.md`
- diff_anchor：`d9804d45fe0a82c58fd429189ef574a59c5805d2`
- target：`git diff d9804d45fe0a82c58fd429189ef574a59c5805d2`
- round：1
- reviewed_at：2026-08-11 05:55 UTC+8

reviewed_scope: 38415f204822e510

## Findings

### t102_code_f001 - T102 测试未模拟 lifecycle 失效，AC-001/002 判别条件未验证，spec 范围「单测覆盖执行后 generation 变化仍投递」未满足

- 严重度：important
- 锚点：契约区「范围」单测覆盖「执行后 generation 变化仍投递」；AC-001「即使 capture generation/lifecycle 已失效，仍调用结果投递 API 一次」；AC-002「投递路径在 lifecycle 失效场景不抛未捕获异常导致轮询循环中断」
- 位置：`tests/unit/agent_bridge_client.test.ts:804-828`（AC-001）、`tests/unit/agent_bridge_client.test.ts:830-867`（AC-002）
- 问题：两个 T102 测试均在 lifecycle 全程有效时同步完成 dispatch 与投递，从未在 dispatch 完成后、投递前使 lifecycle 失效。AC-001 测试主体注释自认「dispatch 与投递在同一 poll_cycle 同步完成（stop 前已投递）」（`tests/unit/agent_bridge_client.test.ts:822`）；AC-002 测试同样全程 active，投递 413 失败是在 active 态被捕获记录，未进入失效场景。用旧代码（dispatch 后保留 `if (!is_active_lifecycle(active_lifecycle_id)) return;`，见 diff 被删行）跑这两个测试，dispatch 时 lifecycle 仍 active，投递照常发生，测试同样全绿——即测试对本 task 修复是**非判别性的**，无法防「重新引入丢弃逻辑」的回归。spec 契约区范围显式要求单测覆盖「执行后 generation 变化仍投递」，当前无任何测试覆盖该判别场景。两个测试还分别与既有测试 `fetches command, dispatches, and posts result`（:197-228）和 `logs result delivery 413 once...`（:289-340）在 active 态路径上重复。
- 建议：AC-001 用 deferred handler 构造失效场景——让 `stop_capture` 返回 pending promise（`create_deferred` 已有，:116-126），`start_bridge_client` + `advanceTimersByTimeAsync(0)` 使 dispatch 挂起，随后调 `stop_bridge_client()` 使 lifecycle 失效（`running=false`、`lifecycle_id+1`），再 `deferred.resolve({ success: true })` 放行 dispatch 并 advance(0)，断言 `/extension/result` 仍被调用一次（旧代码此步会因失效而 `return`，测试可判别）。AC-002 同理在失效后投递返回 413，断言无未捕获异常、不再调度下一轮 poll（如 `is_bridge_client_running()` 为 false / 无后续 command fetch）。

## 结论

- 本轮新发现：1 条
- 未进表的提示：
  - 文件过大（降级规则，不进表）：`tests/unit/agent_bridge_client.test.ts` 868 行，超 minor 阈值 600，且本 task 净增约 70 行；未超 important 阈值 1200。`src/extension/background/agent_bridge_client.ts` 392 行，未超 400。
  - 复杂度：`poll_cycle` 手算 McCabe 约 9，未达阈值；本 task 未新增分支。
  - 范围外观察：无。diff 仅触及 `agent_bridge_client.ts`、测试文件与本 task 的 `task.md` front matter，无范围外改动。
- 总体判断：实现层正确——dispatch 后无条件投递一次（移除 `if (!is_active_lifecycle(...)) return` 符合 AC-001），`send_result_with_retry` 仍在 try/catch 内（AC-002），catch 内 stale lifecycle 静默 return 不抛未捕获，底部 `if (is_active_lifecycle(...))` 守卫保证 stop 后不再调度（循环停止正确）。但 spec 范围明确要求的「失效后仍投递」单测缺失，AC-001/002 测试非判别性，存在重要测试缺口，故 FAIL。
- AC 复验方式：
  - AC-001：`re_verified`（实现层代码推演：`agent_bridge_client.ts:157-160` dispatch 与 `send_result_with_retry` 之间无 lifecycle 守卫，投递无条件执行一次）；对应测试未覆盖失效场景（见 f001）。
  - AC-002：`re_verified`（实现层代码推演：`agent_bridge_client.ts:159-168` 投递在 try/catch 内，catch 首行 stale lifecycle 检查使其静默 return，不抛未捕获、不中断）；对应测试未覆盖失效场景（见 f001）。
  - coverage = 2 / 2
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-11 05:58 UTC+8)

reviewed_scope: 8324b9b9d6c37509

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
  - t102_code_f001（important，Round 1）——已消除。以当前 diff 为准，测试已重构：AC-001（`tests/unit/agent_bridge_client.test.ts:804-840`）与 AC-002（:842-884）均用 `create_deferred` 挂起 dispatch（`deps.stop_capture` 返回 pending promise，`dispatch_agent_command` 的 `capture.stop` 分支 await 之，poll_cycle 停在 `await dispatch_agent_command`），随后 `stop_bridge_client()` 使 lifecycle 失效（`running=false`、`lifecycle_id+1`），再 `resolve` 放行 dispatch、`advanceTimersByTimeAsync(0)`。旧代码在 dispatch 后保留 `if (!is_active_lifecycle(active_lifecycle_id)) return;`（anchor `d9804d4` 位于 dispatch 与 try 之间）时，dispatch 恢复后立即 return，`/extension/result` 零次调用；两个测试断言 `result_calls.length === 1` 均会失败——判别性成立。spec「单测覆盖执行后 generation 变化仍投递」现已满足。
- 本轮新发现：0 条
- 未进表的提示：
  - 文件过大（降级规则，不进表）：`src/extension/background/agent_bridge_client.ts` 393 行，未超 400 minor 阈值；本 task 净减 1 行（删守卫）。
  - 复杂度：`poll_cycle` 手算 McCabe 约 9，未达阈值；本 task 只删分支未增分支。
  - 范围外观察：无。diff 仍仅触及 `agent_bridge_client.ts`、测试文件与本 task 的 `task.md`，无范围外改动。
- 总体判断：实现层正确——dispatch 产出 result 后无条件投递一次（AC-001），投递在 try/catch 内、stale lifecycle 时静默 return（AC-002），底部 `is_active_lifecycle` 守卫保证 stop 后不再调度轮询；测试已判别性覆盖失效场景。无未解决 critical / important → PASS。
- AC 复验方式：
  - AC-001：`re_verified` —— 重跑 `npx vitest run tests/unit/agent_bridge_client.test.ts`（24/24 通过）；代码推演 `agent_bridge_client.ts:157-160` dispatch 与 `send_result_with_retry` 之间无 lifecycle 守卫；测试 :832-839 在失效后断言 `/extension/result` 恰一次。旧代码返回路径会令该断言失败（判别力已由分析确认）。
  - AC-002：`re_verified` —— 同上测试通过；代码推演 `agent_bridge_client.ts:159-168` 投递在 try/catch 内，catch 首行 stale lifecycle 静默 return 不抛未捕获、不中断循环；测试 :842-884 失效后 413 投递被尝试一次且 `is_bridge_client_running() === false`。旧代码返回路径会令 `result_calls` 断言失败（判别力已由分析确认）。
  - coverage = 2 / 2
- 系统性 follow-up：无

verdict: PASS
