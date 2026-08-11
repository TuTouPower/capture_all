# Task review t123（reviewer_focus: 测试）

- task：`t123_remove_webrequest_handler_legacy`
- spec：`docs/tasks/t123_remove_webrequest_handler_legacy/spec.md`
- diff_anchor：`b442162c637afca237439ad04171a3bf40681969`
- target：`git diff b442162c637afca237439ad04171a3bf40681969`
- round：1
- reviewed_at：2026-08-11 21:40 UTC+8

reviewed_scope: a63f620a7d34eb92

## Findings

### t123_test_f001 - AC-004 未按字面满足：error_text 失败事件测试整体删除而非迁移；该语义本为非生产死代码，处置改 spec

- 严重度：important（处置为改 spec，不计 FAIL）
- 锚点：AC-004
- 位置：`tests/unit/loading_failed_events.test.ts`（删除第一个 describe「webRequest handle_error 发失败事件」与 `import { handle_error, type WebRequestHandlerState } from '.../webrequest_handler'`）
- 问题：AC-004 要求「迁移后测试仍验证原语义（handle_error 发失败网络事件含 error_text 等），断言目标为生产路径」。实现未迁移，直接删除。独立核实：
  - 被删用例测的是旧 `webrequest_handler.handle_error`（锚点 `webrequest_handler.ts:189-200`）：发失败事件含 `error_text=details.error`、`status_code=null`、并从 pending 移除。但该模块在锚点生产 0 引用——`network_capture.ts` 对它是空导入 `import {} from './webrequest_handler'`，src/tests grep `webrequest_handler` 均无匹配。该发事件行为只被测试直驱，是非生产死代码。删除它不损失任何生产行为覆盖。
  - 生产等价路径 `network_capture.ts:1248-1252` `handle_error`（webRequest onErrorOccurred）只删 `pending_requests`，从不发事件；该实现锚点即如此，本 task 未改。生产「失败→事件」由 CDP `Network.loadingFailed`（`network_capture.ts:691-700`）→ `try_resolve_deferred` 以 `response_body_status='cdp_failed'` 表达；`build_network_event` / `build_cdp_primary_network_event` 均硬编码 `error_text: null`（`network_capture.ts:1000/1069`），生产任何路径不填充 error_text。
  - 第三个 describe「loadingFailed 带 meta」**不构成**该语义覆盖——它断言的是反向行为 `emitted.length === 0`（不发立即主事件）。故「被等价/更高层测试替代」不成立；但「确已过时删除」成立（语义仅存在于死代码）。
  - 生产失败路径另有覆盖：`bridge_cdp_events.test.ts:160-172`（CDP `getResponseBody` 返回 error → 终态事件 `response_body_status='cdp_failed'`），`loading_failed_events.test.ts` 内第三个 describe 覆盖 loadingFailed 不发立即主事件 + meta 保留 + orphan 兜底不抛错。
  - 测试可信角度：被删用例本身是「import 内部函数 + 手造 WebRequestHandlerState」的低可信直驱测试，验证的是生产从不调用的函数；删除提升测试卫生。
- 结论：删除合法（语义过时/死代码），AC-004 括号「handle_error 发失败网络事件含 error_text」基于错误前提，且与范围「不改 network_capture 生产实现逻辑」、测试策略「不得改变生产逻辑语义」互相矛盾，本 task 范围内不可满足。
- 建议：改 spec。将 AC-004 与「测试策略」节改写为「生产失败语义 = CDP loadingFailed → deferred 解析以 `response_body_status='cdp_failed'` 表达；error_text 生产从不填充」；删除「失败事件含 error_text」迁移要求。可选（非阻断）：在 `loading_failed_events.test.ts` 补 start/stop 集成用例，断言 loadingFailed 后经 deferred 解析发出 `cdp_failed` 事件。

### t123_test_f002 - 残留注释引用已删除的 webRequest handle_error 通道（minor）

- 严重度：minor
- 锚点：无 AC 违反（断言行为正确，仅注释理由失真）
- 位置：`tests/unit/loading_failed_events.test.ts:88`
- 问题：注释「生产语义：不发立即失败主事件（失败事件由 webRequest handle_error 通道发出）」把失败事件发出方指向 webRequest handle_error 通道。该通道（legacy `webrequest_handler`）已被本 task 删除，且其生产 `handle_error`（`network_capture.ts:1248`）历来只删 pending 从不发失败事件——注释理由在生产一直不成立，删除后更成误导残留，与本 task 目标直接相关。测试断言 `expect(emitted.length).toBe(0)` 行为正确，仅注释失真。
- 建议：改为「生产失败语义 = CDP loadingFailed → deferred 解析以 `response_body_status='cdp_failed'` 表达」或直接删除该句。

## 结论

- 前轮 finding 复核：Round 1，无。
- 改测方向复核：无「迁就实现」的改测。唯一测试改动是删除整个 describe + import（详见 f001：删除的是死代码测试，非改断言迁就实现）。
- 本轮新发现：2 条（f001 important / f002 minor）。
- 未进表的提示：
  - 生产 `onErrorOccurred → pending_requests` 清理行为（`network_capture.ts:1248`，start_network_capture 注册）当前无任何测试触达（测试 chrome mock 的 `onErrorOccurred.addListener` 是 vi.fn，回调从不被调用）。属 pre-existing（被删用例测的是另一模块函数，非本实现），非本 task 回归；可选覆盖扩展。
  - 第三个 describe 断言 `emitted.length === 0` 已对照生产 loadingFailed 路径（`network_capture.ts:691-700` 不发立即主事件）核实，非恒真；meta 保留断言对应该路径不删 meta，真实有效。
  - 第二个 describe（`NetworkCaptureContext.reset` 取消 deferred timer）保留且有效：spy `globalThis.clearTimeout` 属系统边界 mock，断言 reset 实际清理两个 deferred 条目并清空 map，触达真实生产方法。
  - `network_cdp.test.ts` / `network_stop_deferred_timers.test.ts` 不引用已删符号（grep `webrequest_handler|WebRequestHandlerState|handle_error|ws_handler` 均无匹配；onErrorOccurred 仅作 addListener mock 注册）。
- 总体判断：测试迁移/删除处理正确（被删为死代码测试，保留两 describe 有效，测试套件全绿）；唯一重要级偏差为 spec AC-004 前提不成立，按 carve-out 处置改 spec 不计 FAIL。无未解决 critical/important。

### AC 复验方式

- AC-001：re_verified — `git status` 显示 webrequest_handler.ts 已 staged 删除，`ls src/extension/background/webrequest_handler.ts` 不存在。
- AC-002：re_verified — diff 删除 `import {} from './webrequest_handler'` 空导入；src grep `webrequest_handler` 无匹配。
- AC-003：re_verified — `grep -rln "webrequest_handler\|ws_handler" src tests` 无匹配（exit 1）。
- AC-004：re_verified（结论 = 未按原文满足，处置改 spec）— 独立核实：被删 describe 断言的是死代码行为；生产两 builder 硬编码 `error_text: null`；第三个 describe 断言 `emitted.length === 0`（反向，不构成该语义覆盖）；生产失败路径由 `bridge_cdp_events.test.ts` 的 `cdp_failed` 用例覆盖。findings f001。
- AC-005：re_verified — `npx vitest run`：130 files / 1372 tests 全绿（含 loading_failed_events / network_cdp / network_stop_deferred_timers 三文件 26 tests 通过）；`npx tsc --noEmit` exit 0。

coverage = 5 / 5（均 re_verified）

- 系统性 follow-up：建议 task「生产 network_request error_text 失败语义落地」slug `network_request_error_text`——生产 `error_text` 字段从不填充（`network_capture.ts:1000/1069` 硬编码 null），失败仅经 `cdp_failed` body status 表达；属 t123 范围外 pre-existing 缺口。阻断性：非阻断。

verdict: PASS

## Round 2 (2026-08-11 21:46 UTC+8)

- round：2
- reviewed_at：2026-08-11 21:46 UTC+8

reviewed_scope: ac8a513bafe9fe15

## 前轮 finding 复核

### t123_test_f001 - important（处置为改 spec，不计 FAIL）→ 已消除（spec 已修订为与测试实际一致）

- 独立核实（以 diff 为准，不采信处置表自称）：
  - `git diff b442162c... -- docs/tasks/.../spec.md`：AC-004 已改写为「不再 import 旧 webrequest_handler；已过时的旧 handle_error 发失败事件用例删除（该语义生产从未接线，生产失败状态经 CDP loadingFailed→cdp_body_results 表达），保留的 describe（NetworkCaptureContext.reset、loadingFailed 带 meta）仍验证生产路径」。与当前 `loading_failed_events.test.ts` 实际完全一致：文件仅剩两个 describe（reset / loadingFailed 带 meta），旧 `handle_error` describe 与 `webrequest_handler` import 均已删。
  - 「测试策略」段同步修订：明确「旧 handle_error 发 error_text 事件是生产 0 接线的死代码行为，生产以 cdp_body_results 的 cdp_failed 状态表达失败，故不迁移 error_text 语义」，消解了原 AC-004 与「不改生产逻辑」的矛盾。
  - 修订后与生产路径一致：`network_capture.ts:691-695` `Network.loadingFailed` → body status 置 `cdp_failed`；`network_capture.ts:676` 注释「CDP-first: emit even on failure (status will be cdp_failed)」。新 AC 描述与代码吻合。
- 结论：f001 前置前提（error_text 语义迁移）已通过改 spec 撤回，修订内容准确，不再构成 blocker。

### t123_test_f002 - minor（残留注释引用已删 webRequest handle_error 通道）→ 已修复

- 独立核实：`loading_failed_events.test.ts:88` 注释现为「生产语义：不发立即失败主事件（失败状态经 CDP loadingFailed→cdp_body_results 消费路径表达）」。已不再引用 webRequest handle_error 通道，表述与生产路径（network_capture.ts:691-695 cdp_failed）一致。断言 `expect(emitted.length).toBe(0)` 未变。

## 本轮新发现

- 0 条。

## 结论

- 改测方向复核：无「迁就实现」的改测。测试文件 diff 仅三处——删除 `webrequest_handler` import、删除过时 describe（现为修订后 AC-004 明确要求）、注释文案修正；保留断言原样未动。
- 测试可信复核：剩余两 describe 仍触达真实生产逻辑。`NetworkCaptureContext.reset`（`loading_failed_events.test.ts:26-51`）直调真实方法，`clearTimeout` spy 属系统边界 mock，断言清理两个 deferred 条目并清空 map，非恒真；`loadingFailed 带 meta`（:53-97）经 `start_network_capture` 真实入口 + chrome_debugger 发 CDP 事件，断言不发立即主事件 + meta 保留，对生产 loadingFailed 路径有效。危险模式逐条扫描未命中（无恒真/skip/only/静默错误/mock 误用/阈值掩盖/条件跳过）。
- AC 复验方式（本轮）：
  - AC-001：re_verified — `ls src/extension/background/webrequest_handler.ts` 不存在；git status 显示 staged 删除。
  - AC-002：re_verified — network_capture.ts diff 删除 `import {} from './webrequest_handler'`，注释移除该名；grep 无残留。
  - AC-003：re_verified — `grep -rn "webrequest_handler\|ws_handler\|WebRequestHandlerState" src tests` exit 1 无匹配。
  - AC-004：re_verified — 修订后 AC 与测试文件逐字核对一致（仅剩 reset / loadingFailed 带 meta 两 describe，无旧 import），production 路径 cdp_failed 证据如上。
  - AC-005：re_verified — `npm test`：130 files / 1372 tests 全绿；`npx tsc --noEmit` exit 0。
  - coverage = 5 / 5（均 re_verified）
- 未进表的提示：无新增；Round 1 的 follow-up 建议（生产 error_text 字段落地，t123 范围外 pre-existing）维持。
- 总体判断：f002 注释已修准，f001 经 spec 修订撤回（不计 FAIL）；无未解决 critical / important，无本轮新 blocker。
- 系统性 follow-up：无新增（沿用 Round 1 建议）。

verdict: PASS
