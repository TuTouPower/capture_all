# Task review t123（reviewer_focus: 代码）

- task：`t123_remove_webrequest_handler_legacy`
- spec：`docs/tasks/t123_remove_webrequest_handler_legacy/spec.md`
- diff_anchor：`b442162c637afca237439ad04171a3bf40681969`
- target：`git diff b442162c637afca237439ad04171a3bf40681969`
- round：1
- reviewed_at：2026-08-11 21:40 UTC+8

## Findings

### t123_code_f001 - AC-004「失败事件含 error_text 迁移」前提不成立，处置为改 spec（不计 FAIL）

- 严重度：important（归 spec 过时 carve-out，**不计 FAIL**）
- 锚点：AC-004
- 位置：`src/extension/background/network_capture.ts:1000`、`network_capture.ts:1069`；`tests/unit/loading_failed_events.test.ts` 删除的旧 describe
- 问题：AC-004 要求「loading_failed_events.test.ts 等迁移后测试仍验证原语义（handle_error 发失败网络事件含 error_text 等），断言目标为生产路径」。实现未迁移该 describe，而是整体删除。核实生产路径：
  - 生产 `handle_error`（`network_capture.ts:1248-1252`）只删 pending，从不发事件；legacy `webrequest_handler.handle_error` 生产 0 引用（`src`/`tests` grep `webrequest_handler` 均 NONE），其发失败事件行为是死代码，仅测试直驱。删除它不改变任何生产行为。
  - 生产失败信号经 CDP `Network.loadingFailed`（`network_capture.ts:691-700`）→ `try_resolve_deferred`（`780-823`）发出 `network_request` 事件，失败信息以 `response_body_status='cdp_failed'` 表达；`build_network_event` 与 `build_cdp_primary_network_event` 均硬编码 `error_text: null`（`1000`、`1069`）。**生产任何路径都不填充 error_text**，全测试套件中 error_text 断言仅存在于 `error_text: null` 数据形状校验，无生产路径断言失败串。
  - 故「迁移后仍验证失败事件含 error_text」在生产不可实现，而 spec 测试策略节又自禁「不得改变生产逻辑语义」——AC-004 前提内部矛盾。
  - 语义结论（本 task 提示的核心疑问）：旧 handle_error 发事件语义**未无声丢失**——它本是非生产死代码；生产失败事件由 CDP loadingFailed 路径取代并经 `cdp_failed` body status 表达。生产路径确有「失败→事件」覆盖：`bridge_cdp_events.test.ts:160`（CDP 错误响应终态 `cdp_failed`）。
- 建议：改 spec。AC-004 与「测试策略」节改写为「生产失败语义 = CDP loadingFailed → try_resolve_deferred 以 `response_body_status='cdp_failed'` 表达；error_text 生产从不填充」；并删除/修正测试策略中「失败事件含 error_text」迁移要求。可选（非阻断）：在 `loading_failed_events.test.ts` 补 start/stop 集成用例，断言 loadingFailed 后经 deferred 解析发出 `cdp_failed` 事件——当前该文件无任何「失败→事件」正向断言。

### t123_code_f002 - 残留注释引用已删除的 webRequest handle_error 通道（minor）

- 严重度：minor
- 锚点：行为缺陷（注释误导）— 非 AC
- 位置：`tests/unit/loading_failed_events.test.ts:88`
- 问题：注释「生产语义：不发立即失败主事件（失败事件由 webRequest handle_error 通道发出）」引用 `webRequest handle_error 通道` 作为失败事件发出方。该通道（legacy `webrequest_handler`）已被本 task 删除，且该说法在生产历来不成立——生产 `handle_error`（`network_capture.ts:1248`）只删 pending 从不发失败事件。注释是旧路径清理后的误导残留，与 task 目标直接相关。测试断言本身（`emitted.length).toBe(0)`）行为正确，仅注释理由失真。
- 建议：改为准确表述，如「loadingFailed 遇已有 meta 且无 deferred 条目时不立即发主事件；失败经 cdp_failed body status 表达」。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：2 条（1 important 归 spec 过时不计 FAIL，1 minor）
- 未进表的提示：
  - 文件过大：`network_capture.ts` 1252 行超 400/800 阈值，但本 task 净删 3 行，不满足「本 task 仍净增」出 finding 条件，按降级规则仅记录。
  - 复杂度：无本 task 新增分支。
  - 范围外观察（非 finding）：生产 `error_text` 字段从未填充（`network_capture.ts:1000/1069` 硬编码 null），失败信息仅经 `response_body_status='cdp_failed'` 表达——pre-existing 生产限制，非 t123 引入，见下方 follow-up。
- 总体判断：删除安全（legacy 全导出生产 0 引用，均被 network_capture 本地实现或 cdp_handler 取代），network_capture 空导入与过时注释删除正确，测试删除合理；唯一重要级偏差为 spec 过时（AC-004 前提不成立），按 carve-out 处置为改 spec 不计 FAIL。无未解决 critical/important。
- AC 复验方式：
  - AC-001：re_verified — 文件在盘不存在（`ls` No such file），git diff 显示整文件删除。
  - AC-002：re_verified — grep `src`/`tests` 无 `webrequest_handler` 引用；diff 显示删除 `import {} from './webrequest_handler'` 并将头部注释改为 `Delegates to specialized handlers: cdp_handler`。
  - AC-003：re_verified — grep `tests` 无 `webrequest_handler` / `ws_handler` import。
  - AC-004：re_verified（结论=未按原文满足，处置改 spec）— 独立核实：删除的 describe 断言的是死代码行为；生产两 builder 硬编码 `error_text: null`；剩余测试断言 `emitted.length).toBe(0)`。findings f001。
  - AC-005：re_verified — `npm test` 130 文件 / 1372 用例全绿；`npx tsc --noEmit` exit 0。
  - coverage = 5 / 5（均 re_verified；AC-004 复验结论为 spec 过时需修订，非实现缺失）
- 系统性 follow-up：建议 task 标题「生产 network_request error_text 失败语义落地」slug `network_request_error_text`——生产 `error_text` 字段从不填充（`network_capture.ts:1000/1069`），失败仅经 `cdp_failed` body status 表达；属 t123 范围外 pre-existing 缺口。阻断性：非阻断。

reviewed_scope: a63f620a7d34eb92

verdict: PASS

## Round 2 (2026-08-11 21:45 UTC+8)

reviewed_scope: ac8a513bafe9fe15

### 前轮 finding 复核

- t123_code_f001（important，处置改 spec，不计 FAIL）：**已消除**。spec.md AC-004 已改写为「不再 import 旧 webrequest_handler；旧 handle_error 发失败事件用例删除（该语义生产从未接线，生产失败状态经 CDP loadingFailed→cdp_body_results 表达）；保留的 describe（NetworkCaptureContext.reset、loadingFailed 带 meta）仍验证生产路径」，测试策略段同步删去「失败事件含 error_text」迁移要求，改述为「旧 handle_error 发含 error_text 的事件是生产 0 接线的死代码行为，生产实际以 cdp_body_results 的 cdp_failed 状态表达失败，故不迁移该 error_text 语义」。与代码核对无内部矛盾：import 已删、死用例 describe 已删、两 describe 保留并走生产 start/stop 路径；生产失败语义（loadingFailed→try_resolve_deferred→`response_body_status='cdp_failed'`、error_text 硬编码 null）与修订后文本一致。AC-004 声明「生产失败状态经 loadingFailed→cdp_body_results 表达」与保留的「loadingFailed 带 meta」用例断言 `emitted.length).toBe(0)` 不冲突——该用例验证的是「已有 meta 时不立即发主事件」，失败终态覆盖另有 `bridge_cdp_events.test.ts:160` 承载，AC 未声称本用例断言 cdp_failed。
- t123_code_f002（minor）：**已消除**。`tests/unit/loading_failed_events.test.ts:88` 注释由「失败事件由 webRequest handle_error 通道发出」改为「生产语义：不发立即失败主事件（失败状态经 CDP loadingFailed→cdp_body_results 消费路径表达）」，不再引用已删除的 webRequest handle_error 通道，表述与核实过的生产行为一致。

### 本轮新发现

- 0 条。

### 结论

- 前轮 finding 复核：f001、f002 均以 diff/代码核实已消除；无修不彻底或需撤回项。
- 本轮新发现：0
- 未进表的提示：
  - 文件过大：`network_capture.ts` 1252 行超阈值但本 task 净删 3 行，降级仅记录（同 Round 1）。
  - 复杂度：无本 task 新增分支。
  - 范围外观察：无（`error_text` 生产从不填充仍为 pre-existing 限制，follow-up 见 Round 1）。
- 总体判断：前轮两 finding 均已按要求处置且复核一致，本轮无新发现，无未解决 critical/important。
- AC 复验方式（Round 2）：
  - AC-001：re_verified — `ls` 确认文件不存在；git diff 整文件删除。
  - AC-002：re_verified — diff 显示删除 `import {} from './webrequest_handler'`，头部注释改 `cdp_handler`；grep `src`/`tests` 无残留引用。
  - AC-003：re_verified — grep `tests` 无 `webrequest_handler` / `ws_handler` import。
  - AC-004：re_verified — 修订后 AC 与代码逐句核对一致（import 删除、死用例删除、保留 describe 走生产路径、失败语义表述与实现吻合）。
  - AC-005：re_verified — `npm test` 130 文件 / 1372 用例全绿；`npx tsc --noEmit` exit 0。
  - coverage = 5 / 5（均 re_verified）
- 系统性 follow-up：无新增；Round 1 所提 `network_request_error_text` 建议保留待独立 task。

verdict: PASS
