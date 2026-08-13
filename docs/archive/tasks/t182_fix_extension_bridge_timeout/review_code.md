# Task review t182（reviewer_focus: 代码）

- task：`t182_fix_extension_bridge_timeout`
- spec：`docs/tasks/t182_fix_extension_bridge_timeout/spec.md`
- diff_anchor：`eac721d474ebbbfcc7463e6d27b82789d34f4678`
- target：`git diff eac721d474ebbbfcc7463e6d27b82789d34f4678`
- round：1
- reviewed_at：2026-08-13 22:18 CST

## Findings

### t182_code_f001 - AC-002 timeout 测试只覆盖 heartbeat/enroll，command fetch 与 result 超时无测试

- 严重度：minor
- 锚点：AC-002（enroll/heartbeat/command fetch 超过各自 timeout 被 abort）测试覆盖不完整
- 位置：`tests/unit/bridge_client_fetch_signal.test.ts:96-133`
- 问题：AC-002 声明三条请求路径的超时 abort，测试只验证 heartbeat（`heartbeat_ms: 20`）与 enroll（`enroll_ms: 20`）两条；command fetch（`_command_fetch_timeout_ms`）与 result 投递（`_result_timeout_ms`）的超时 abort 无测试背书。实现侧四条路径共用同一 `lifecycle_signal` 组合、注入钩子已支持 `command_fetch_ms` / `result_ms`，静态审查看不出差异，但 command fetch 超时是 spec 显式列出的可观察行为，缺测试 = AC 部分未验证。
- 建议：补两条用例：command fetch 注入短 `command_fetch_ms` 断言 abort（可走 `set_bridge_session_for_tests` 提供 token 直接进 command fetch）；result 投递注入短 `result_ms` 断言 abort（mock `start_capture` 返回后投递 result）。

### t182_code_f002 - `AbortSignal.any` 首次引入，隐性抬升最低 Chrome 版本至 116+，未声明

- 严重度：minor
- 锚点：技术约束（非行为 AC，不 blocking）
- 位置：`src/extension/background/agent_bridge_client.ts:44`、`src/extension/manifest.json`
- 问题：`AbortSignal.any`（Chrome 116+，2023-08）是本仓首次引入；项目既有 fetch signal 惯例是 `AbortSignal.timeout`（Chrome 103+，`external_cdp_bridge_client.ts:93`、`service_worker.ts:443`、`mcp/client.ts:65`）。manifest 无 `minimum_chrome_version`，扩展隐性最低版本被抬到 116。旧 Chrome（103–115）上 `AbortSignal.any` 为 undefined，fetch 调用即抛 TypeError，bridge client 轮询整体失效——比改动前无限挂起更早暴露，但同为不可用。注释已自标「Chrome 116+」，说明 implementer 知情；按当前自动更新基线实际风险低，但契约未落文档。
- 建议：`manifest.json` 声明 `minimum_chrome_version: "116"`（或写入 `docs/blueprint/decisions.md` 记录浏览器基线），把隐性前提显式化。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - 文件过大：`src/extension/background/agent_bridge_client.ts` 454 行 ≥ 400（实现源码 minor 阈值）且本 task 净增 44 行，未达 800 important 阈值；无不可拆硬约束，建议后续 task 拆分（本轮按降级规则不进 finding 表）。
  - 圈复杂度：`poll_cycle` 多分支（try/catch + 多次 lifecycle 检查），本 task 未增加其分支（仅给 fetch 加 signal），不进 finding 表。
  - 边界观察：stop 后 T102 result 投递（dispatch 已产生结果时的补偿投递）不受 abort 控制——`send_result_with_retry` 在 stop 后新发起的 fetch 走 `lifecycle_signal` 的 null fallback（`new AbortController().signal`，永不 abort，仅受 300s timeout 约束），最坏 3×300s 网络活动。这是 T102 既有设计（「无论 lifecycle 是否失效都必须投递一次」）与 spec「不重构 poll 调度」范围的边界，非本 task 缺陷，记录备查。
  - 范围外观察：diff 仅触及 `agent_bridge_client.ts`、新测试、spec/task.md；无与本 task 无关的模块改动。spec「未知契约清单」由 `UNVERIFIED-SPIKE` 改为结论并注核实方式（`src/bridge/server.ts` EXTENSION_TTL_MS=5000、MCP client timeout 模式），门禁闭环正确。
- 总体判断：实现符合 spec 范围与 AC（lifecycle AbortController + 每请求 timeout 组合），4 条 AC 有测试且全绿；仅 2 条 minor（测试覆盖缺口、浏览器基线未声明），无未解决 critical/important。
- 系统性 follow-up：无

### AC 复验披露

- AC-001（stop 后 in-flight abort、poll_cycle 不再等待）：`re_verified` —— 跑 `tests/unit/bridge_client_fetch_signal.test.ts` AC-001 用例通过；代码 `agent_bridge_client.ts:111` `active_abort?.abort()` 同步传播。
- AC-002（enroll/heartbeat/command fetch 超各自 timeout abort）：部分 `re_verified` —— heartbeat/enroll 两条 timeout 用例实跑通过；command fetch 与 result 超时路径为静态审查确认（与已测路径同构共用 `lifecycle_signal`），无测试复验（见 f001）。
- AC-003（restart 后无 stale in-flight 残留）：`re_verified` —— AC-003 用例断言新 lifecycle fetch 不被误 abort，实跑通过；代码 `start_bridge_client` 每 lifecycle 新建 controller（`agent_bridge_client.ts:97`）。
- AC-004（新增 timeout/stop-abort/restart 测试通过）：`re_verified` —— 完整 unit 套件 187 文件 1782 测试全过；新测试文件 4 用例连续 5 次运行全过（真实 timers + 20ms 注入边界无 flaky）。
- coverage = 3.5 / 4（AC-002 半静态审查）

reviewed_scope: 80926511a68e6edd

verdict: PASS

## Round 2 复核（2026-08-13 22:22 CST）

### 前轮 finding 处置复核（以 diff 与实测为准）

- **t182_code_f001（minor，测试覆盖缺口）**：已消除。新增 command fetch 超时用例（`tests/unit/bridge_client_fetch_signal.test.ts:150-166`）：`mock_heartbeat_ok_command_pending` 使 heartbeat 正常 200 响应后 command fetch 保持 pending，注入 `command_fetch_ms: 20`，URL 锚定 `/extension/command`（顺带为 enroll 用例补了 `/extension/enroll` 锚定，防误测）。`_command_fetch_timeout_ms` 超时分支现已有测试背书，AC-002 三条请求路径全部有测试。测试文件 5 用例实跑通过，连续 3 次重复运行无 flaky；完整 unit 套件 187 文件 / 1783 测试全过；`npx tsc --noEmit` 退出码 0。
- **t182_code_f002（minor，浏览器基线未声明）**：已消除。`src/extension/manifest.json:6` 已加 `minimum_chrome_version: "116"`，机器可执行约束，比 decisions.md 文档记录更强，f002 的实质问题（隐性基线未声明）解决。说明：处置描述称「decisions.md 追加 ADR 011」，实际 decisions.md 无改动；且既有 ADR 011（write_events flush）已占用该编号，若补 ADR 需续号（当前最新为 024）。按 f002 建议的「manifest 或 decisions.md」或语义，manifest 项落实即满足处置，decisions.md 未追加不构成处置不充分。

### 本轮新发现

- 0 条。处置未引入新问题：新用例断言具体（aborted false→true + URL 锚定），无 mock 误用 / 恒真断言；diff 文件集仅新增 manifest.json 与测试扩充，无范围外改动。

### AC 复验补充（Round 2）

- AC-002 现为全量 `re_verified`：heartbeat / enroll / command fetch 三条 timeout 用例实跑通过（result 投递超时仍为静态审查确认，同构路径，非 spec 显式列出的测试缺口）。

reviewed_scope: e7f81ba360455e27

verdict: PASS
