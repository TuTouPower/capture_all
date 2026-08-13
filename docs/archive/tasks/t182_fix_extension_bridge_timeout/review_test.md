# Task review t182（reviewer_focus: 测试）

- task：`t182_fix_extension_bridge_timeout`
- spec：`docs/tasks/t182_fix_extension_bridge_timeout/spec.md`
- diff_anchor：`eac721d474ebbbfcc7463e6d27b82789d34f4678`
- target：`git diff eac721d474ebbbfcc7463e6d27b82789d34f4678`
- round：1
- reviewed_at：2026-08-13 22:20 UTC+8

## Findings

### t182_test_f001 - AC-002 的 command fetch 超时 abort 无测试覆盖

- 严重度：minor
- 锚点：AC-002（enroll/heartbeat/command fetch 超过各自 timeout 被 abort）
- 位置：`tests/unit/bridge_client_fetch_signal.test.ts:96-133`（AC-002 describe 仅含 heartbeat、enroll 两个 it）
- 问题：AC-002 列出三类请求，测试只覆盖 heartbeat 与 enroll。`fetch_command`（`src/extension/background/agent_bridge_client.ts:331-346`）的 `signal: lifecycle_signal(_command_fetch_timeout_ms)` 无任何测试断言其超时后 aborted。enroll/heartbeat 与 command fetch 走同一 `lifecycle_signal` 机制，故非假行为、非整体缺失，按 AC 级判据不构成 blocking；但 AC-002 的 command fetch 分支验收无自动证据。
- 建议：补一个同模式 case：注入 `command_fetch_ms` 短值（如 20），token 就绪走首个 cycle 的 `fetch_command`，真实 timers 下断言捕获信号超时后 `aborted === true`。

### t182_test_f002 - enroll 超时测试未锚定被测请求确为 enroll

- 严重度：minor
- 锚点：AC-002（enroll 超时分支的测试意图）
- 位置：`tests/unit/bridge_client_fetch_signal.test.ts:115-132`（it「enroll 请求超注入 timeout 被 abort」）
- 问题：测试靠 `set_bridge_session_for_tests(null)` + `storage_get.mockResolvedValue({})` 使 `resolve_token` 落入 enroll 路径，但断言前未验证 `captured[0]` 确为 `/extension/enroll` 请求（url/method）。若 session 清理 mock 失效（如 storage 意外返回 session），请求退化为 heartbeat，`aborted === true` 断言仍会通过——测试绿灯但测的并非声称的请求类型。行为验证本身真实（两类请求同机制），属意图锚定弱化，非假行为。
- 建议：断言超时前先核对 `captured[0]` 对应请求的 `init.method === 'POST'` 且 url 含 `/extension/enroll`，或在 mock 中按 url 记录请求类型。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（本轮为 Round 1）
- 改测方向复核：无。diff 仅新增测试文件，未修改任何既有测试（`git diff eac721d...` 测试侧仅 `tests/unit/bridge_client_fetch_signal.test.ts` 一个新增文件），无「迁就实现」的改测。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - AC-001 后半句「poll_cycle 不再等待 deferred resolve」无直接断言（如 stop 后 fake timers 下无新 poll timer 调度）。`signal.aborted === true` 已构成 AC-001 的可观察行为证据，fetch reject 后 `poll_cycle` 必然结束，属语言语义蕴含；如需更强证据可加「stop 后 advance 一段时间无新 fetch 发起」case。
  - result 投递 timeout（300s）无测试：范围描述提及「result 使用 command/full-data budget」，但 AC-002 未列 result，未按 AC 缺口处理；同机制下风险低。
  - enroll/heartbeat 超时测试用 20ms 注入 + 真实 timers，20ms 检查点断言 `aborted === false` 依赖 AbortSignal.timeout 定时器晚于测试定时器创建（ε 级差值）；实测 5 次稳定，未见 flaky。
  - `_set_bridge_client_timeouts_for_test` 暴露于生产模块导出：可接受测试钩子，finally 恢复默认值，未发现残留。
- 总体判断：4 条 AC 主体均有真实测试且实测通过，无 blocking finding，仅 2 条 minor 覆盖增强建议。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。测试 `bridge_client_fetch_signal.test.ts:84-93` 断言 stop 后捕获信号 `aborted === true`，实现 `agent_bridge_client.ts:111` 对 lifecycle controller 调 `abort()`；实测通过。
- AC-002：`re_verified`（heartbeat/enroll 分支）。`bridge_client_fetch_signal.test.ts:97-132` 注入 20ms 超时 + 真实 timers，实测 70ms 后 `aborted === true`；command fetch 分支无测试（见 f001）。
- AC-003：`re_verified`。`bridge_client_fetch_signal.test.ts:136-151` 断言旧 lifecycle 请求 stop 后 aborted、新 lifecycle 请求不被误 abort；实测通过。
- AC-004：`re_verified`。`npx vitest run tests/unit/bridge_client_fetch_signal.test.ts` 4/4 passed，重复 5 次均绿（v4.1.10）。

coverage = 4 / 4

reviewed_scope: 80926511a68e6edd

verdict: PASS

## Round 2 复核 (2026-08-13 22:22 UTC+8)

- 前轮 finding 复核（以 diff 为准）：
  - `t182_test_f001`：已消除。新增用例 `it('command fetch 超注入 timeout 被 abort（heartbeat 正常后）')`（`bridge_client_fetch_signal.test.ts:150-166`）：`mock_heartbeat_ok_command_pending` 让 heartbeat 返回 200、command fetch pending 捕获 signal，注入 `command_fetch_ms: 20` 后断言 `url` 含 `/extension/command` 且超时后 `aborted === true`。非弱化形式补回，AC-002 三类请求（enroll/heartbeat/command fetch）均有超时 abort 测试。
  - `t182_test_f002`：已消除。捕获结构改为 `{url, signal}`，enroll 用例在断言超时前 `expect(captured[0].url).toContain('/extension/enroll')`（`bridge_client_fetch_signal.test.ts:142`）；session mock 失效时请求退化为 heartbeat，url 断言失败 → 测试红，不再误测。AC-001（:102）、AC-002 heartbeat（:120）用例同步加 url 锚定，无弱化。
- 改测方向复核：无（diff 仍仅新增测试文件，未改既有测试）。
- 危险模式复扫：无新命中（无恒真断言、删/注释 expect、skip/only、ts-ignore、弱化断言、mock 误用、条件跳过）。
- 复验：`npx vitest run tests/unit/bridge_client_fetch_signal.test.ts` 5/5 passed（v4.1.10）；`npx tsc --noEmit` exit 0。
- 本轮新发现：0 条。
- 未进表的提示：`src/extension/manifest.json` 新增 `minimum_chrome_version: 116`，与实现注释中 `AbortSignal.any`（Chrome 116+）依赖一致，属实现配套，归 code reviewer 范围。
- 总体判断：两个 minor finding 均按要求处置且未弱化，无未解决 critical/important，PASS。

verdict: PASS

reviewed_scope: e7f81ba360455e27
