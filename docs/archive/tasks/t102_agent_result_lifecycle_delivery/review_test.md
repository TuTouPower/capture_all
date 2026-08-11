# Task review t102（reviewer_focus: 测试）

- task：`t102_agent_result_lifecycle_delivery`
- spec：`docs/tasks/t102_agent_result_lifecycle_delivery/spec.md`
- diff_anchor：`d9804d45fe0a82c58fd429189ef574a59c5805d2`
- target：`git diff d9804d45fe0a82c58fd429189ef574a59c5805d2`
- round：1
- reviewed_at：2026-08-11 05:56 UTC+8
- reviewed_scope: 38415f204822e510

## Findings

### t102_test_f001 - AC-001 测试未模拟 lifecycle 失效，仅验证平凡 happy path（假覆盖）

- 严重度：critical
- 锚点：AC-001（契约区）；范围「单测覆盖『执行后 generation 变化仍投递』」；测试策略「强制 generation 失效」
- 位置：`tests/unit/agent_bridge_client.test.ts:804`（test「AC-001: dispatch 返回 result 后 lifecycle 失效，仍投递 result 一次」）
- 问题：测试体从未在投递前使 lifecycle 失效。流程为 `start_bridge_client` → `run_initial_poll()`（单个同步 poll_cycle：fetch command → dispatch → send_result 返回 200）→ 断言 `result_calls.length === 1` → 末尾 `stop_bridge_client()`（line 827）。测试内注释（line 822）自证「dispatch 与投递在同一 poll_cycle 同步完成（stop 前已投递）」。被移除的守卫 `if (!is_active_lifecycle(active_lifecycle_id)) return;`（旧代码 anchor commit `d9804d4` 位于 dispatch 与 send_result 之间）在 happy path 下 lifecycle 活跃、判定为 false，因此**该断言在有无本修复时都通过**——测试无法区分修复前后，对 AC-001 核心语义（dispatch 产出 result 后即使 lifecycle 失效仍投递）提供零证据。该测试与既有 `'fetches command, dispatches, and posts result'`（line 197）重复，仅为平凡路径覆盖，AC-001 实际无测试。
- 建议：在 dispatch 进行中使 lifecycle 失效，再断言 result POST 仍被调用一次。可测实现：令 `deps.stop_capture` handler 内调用 `stop_bridge_client()`（dispatch 执行 capture.stop 时 lifecycle 失效），dispatch resolve 后断言 `fetch('/extension/result')` 仍发起；或 mock `dispatch_agent_command` 在返回前停掉 lifecycle。同时删除测试中「stop 前已投递」的自证注释，确保场景与命名一致。

### t102_test_f002 - AC-002 测试覆盖活跃 lifecycle 的 413 投递失败，非「lifecycle 失效后不抛异常」场景

- 严重度：important
- 锚点：AC-002（契约区）；测试策略「强制 generation 失效」
- 位置：`tests/unit/agent_bridge_client.test.ts:830`（test「AC-002: 投递路径在 lifecycle 失效后不抛未捕获异常」）
- 问题：测试体未使 lifecycle 在投递前失效。首个 poll_cycle：dispatch → send_result 返回 413 → 此时 lifecycle 仍活跃（`running === true`），catch 分支 `is_active_lifecycle` 为真，记录 `'Bridge result delivery failed'`；`stop_bridge_client()`（line 857）在错误已记录之后才调用。被测的失效分支——catch 内 `if (!is_active_lifecycle(active_lifecycle_id)) return;`（`agent_bridge_client.ts:162`）——从未触达。断言在有/无修复时都通过，与既有 `'logs result delivery 413 once and continues polling without another result post'`（line 289）重复。末尾 `expect(fetch_spy).toHaveBeenCalled()`（line 866）是恒真存在性断言（mock 已配置 fetch，必然被调用），不提供证据。AC-002 的「lifecycle 失效场景投递路径不抛未捕获异常」仅由套件内**既有**测试 `'ignores stale result delivery failures after restart'`（line 531，非本 diff 新增）间接覆盖（deferred 挂起 result POST → stop → resolve 413 → 断言无 error entry），本 diff 对 AC-002 未贡献任何证据。
- 建议：让投递失败发生在 lifecycle 失效后。测法：result POST 返回 deferred，`stop_bridge_client()` 后再 resolve 为 413，flush 微任务后断言无 error entry、测试无未处理 rejection；或令 dispatch 中途失效 lifecycle 后使 send_result 抛错。删除恒真 `expect(fetch_spy).toHaveBeenCalled()`。

## 结论

- 前轮 finding 复核：不适用（Round 1）
- 改测方向复核：无（diff 仅新增 T102 describe 块，未修改任何既有测试；不存在「迁就实现」的改测）
- 本轮新发现：2 条
- 未进表的提示：
  - 生产实现（`agent_bridge_client.ts:157-168`）移除 dispatch 后 lifecycle 守卫、用内层 try/catch 包住投递，语义正确：无论 lifecycle 是否失效都投递一次，失效时静默返回、活跃时记录错误。实现本身无测试侧问题。
  - 失效场景可测路径存在：dispatch 执行中（handler 内）调用 `stop_bridge_client()` 即能在投递发起前使 lifecycle 失效，测试基础设施无缺口。
- 总体判断：AC-001、AC-002 各有的命名测试均未模拟 lifecycle 失效，断言在修复前后均通过，AC 核心语义未被验证；存在未解决 critical/important → FAIL
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` —— 重读测试体（line 804-828）与生产代码，确认 lifecycle 仅在投递完成后失效；移除旧守卫在 happy path 下不改变行为，测试无法区分修复前后。
- AC-002：`re_verified` —— 重读测试体（line 830-867），413 失败发生在 lifecycle 活跃期，失效分支（`agent_bridge_client.ts:162`）未触达；恒真尾断言不提供证据。

coverage = 2 / 2

verdict: FAIL

## Round 2 (2026-08-11 05:58 UTC+8)

reviewed_scope: 8324b9b9d6c37509

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核（以当前 diff 为准）：
  - t102_test_f001（critical，Round 1）——已消除。AC-001 测试（`tests/unit/agent_bridge_client.test.ts:804-840`）现通过 `deps.stop_capture = vi.fn(() => stop_deferred.promise)` 挂起 dispatch（`capture.stop` 分支 `await handlers.stop_capture()`），`stop_bridge_client()` 使 lifecycle 失效后 `resolve` 放行，断言 `/extension/result` 恰一次。旧代码（dispatch 后 `if (!is_active_lifecycle(...)) return;`）在此场景 dispatch 恢复即 return、result 零次调用，`expect(result_calls.length).toBe(1)` 失败——判别力成立。测试同时删除了 Round 1 指出的「stop 前已投递」自证注释，场景与命名一致。与既有 `'fetches command, dispatches, and posts result'`（:197）不再重复：本测试在 dispatch 挂起中失效 lifecycle，走的是失效路径。
  - t102_test_f002（important，Round 1）——已消除。AC-002 测试（:842-884）现于 dispatch 挂起中 `stop_bridge_client()` 失效 lifecycle，resolve 后投递仍被尝试（`result_calls.length === 1`），`/extension/result` 返回 413 → `send_result_with_retry` 因 4xx 非 429 立即抛 `BridgeHttpError(413)`（无重试定时器残留）→ poll_cycle 内层 catch（`agent_bridge_client.ts:162`）命中 stale lifecycle 静默 return，不抛未捕获异常。末尾恒真 `expect(fetch_spy).toHaveBeenCalled()` 已删除，改为行为断言 `result_calls` 与 `is_bridge_client_running()`。被测的失效分支被真实触达；与既有 413 测试（:289）不再重复（后者走 active 态错误记录）。
- 改测方向复核：无。diff 仅新增 T102 describe 块，未修改任何既有测试；无「迁就实现」的改测。
- 本轮新发现：0 条
- 未进表的提示：
  - 文件过大（降级规则，不进表）：`tests/unit/agent_bridge_client.test.ts` 885 行，超 minor 阈值 600 且本 task 净增约 85 行；未超 important 阈值 1200。
  - AC-002 的 `expect(is_bridge_client_running()).toBe(false)` 是状态断言（running 由 stop 置 false），「stop 后不继续轮询」另有套件既有测试（`'does not poll again after stop'` :589、`'does not continue an in-flight poll after stop'` :473）兜底；本测试的重点断言（失效后仍投递一次 + 不抛未捕获）已充分判别。可选扩展：advance 更久后断言 command fetch 仍为 1，非必须。
  - 测试经公共 API（`start_bridge_client` / `stop_bridge_client`）触达真实 `poll_cycle` 与 `dispatch_agent_command`，mock 仅限 fetch 边界与 DI 的 `stop_capture` 桩，无 mock 被测逻辑。
- 总体判断：AC-001/AC-002 现均真实模拟 lifecycle 失效场景，断言判别力成立（旧代码返回路径会让 result 计数断言失败），投递仍发生与 stop 后不继续轮询均有断言；无未解决 critical / important → PASS。

### AC 复验方式

- AC-001：`re_verified` —— 重跑 `npx vitest run tests/unit/agent_bridge_client.test.ts`（24/24 通过）；逐行核对测试体 :820-839：dispatch 挂起 → lifecycle 失效 → resolve → `/extension/result` 恰一次；分析确认旧守卫会让 `result_calls` 归零使断言失败。
- AC-002：`re_verified` —— 同上测试通过；逐行核对 :866-883：失效后投递被尝试（413），内层 catch 命中 stale lifecycle 静默 return，无未处理 rejection，`is_bridge_client_running()` false；分析确认旧守卫会让 `result_calls` 归零使断言失败。

coverage = 2 / 2

verdict: PASS
