# Task review t119（reviewer_focus: 代码）

- task：`t119_cdp_handler_network_capture_unify`
- spec：`docs/tasks/t119_cdp_handler_network_capture_unify/spec.md`
- diff_anchor：`849b739e78b5509c1925838a98abfd2f22d7205c`
- target：`git diff 849b739e78b5509c1925838a98abfd2f22d7205c`
- round：1
- reviewed_at：2026-08-11 19:10 UTC+8

## Findings

### t119_code_f001 - t112 迁移遗漏：orphan 回调「事件已消费」早退的 marker 清理无生产等价覆盖

- 严重度：minor
- 锚点：AC-002（t112 回归语义）覆盖迁移不完整；无可观测行为缺陷（生产行为未变）
- 位置：`tests/unit/t112_finished_before_stream_lifecycle.test.ts:178-201`（对比已删 `describe('t112 cdp_handler 复制实现 marker 清理')` 用例 4）
- 问题：被删除的 cdp_handler 直驱 describe 共 7 用例，其中 6 个（capture_response_body=false 早退、SSE 无 meta orphan 兜底、loadingFailed 无 meta、SSE streaming 完成、deferred 完整解析、deferred 多候选兜底）在生产路径均有等价用例（t112:143-315）；唯「orphan 回调早退（事件已被消费）也清理 marker」无生产等价覆盖。该语义在生产路径确实存在——`network_capture.ts:829-832` schedule_orphan_check 回调顶部对 `finished_before_stream` 无条件 delete（注释「marker 生命周期与消费无关」），即 body_result/meta 已被 handle_completed 消费时 orphan 终态仍须清 marker。现有生产 orphan 用例（t112:190-201）走 getResponseBody error 路径，fail_result 已写入 `cdp_body_results`，orphan 触发时 body_result 存在，不触达「body_result 不存在」的早退分支。若该顶部 delete 回退（同 key 复用将受残留 marker 影响，AC-001/AC-002 语义），测试全绿。
- 建议：t112 新增一生产用例——`_finished_before_stream_for_test` 写入后，经 `_cdp_body_results_for_test`/`_cdp_request_meta_for_test` 清空（模拟已消费），`advanceTimersByTimeAsync(3000)` 断言 marker 已删。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：1 条（minor）
- 未进表的提示：
  - 文件过大：`src/extension/background/network_capture.ts` 1254 行（≥800 阈值），但本 task diff 零触碰该文件（净增 0 行），按「本 task 净增」条件不入表；`cdp_handler.ts` 由 897 行降至 117 行；测试文件 t112 316 行 / cdp_response_body_config 135 行均未超阈值。
  - 复杂度：本 task 以删除为主，未新增 ≥15 分支函数；network_capture `handle_cdp_event` 巨型分发为历史问题，本轮无实质分支增加。
  - 范围外观察（pre-existing，spec 未知契约清单已授权「差异处按生产路径为准」）：`loading_failed_events.test.ts` 被删 2 直驱用例验证的「loadingFailed 有 meta 立即发含 error_text 主条目」语义在生产 `network_capture.ts:685-694` 无对应实现（仅记 fail_result + orphan 3s 延迟发，`CdpBodyEvent` 无 error_text 字段），该分叉由 t112 review_code 已记录；生产路径 loadingFailed 语义现无任何测试，属历史缺口，非本 task 引入，建议后续补。
- 总体判断：废弃边界正确（保留 8 类导出全部有生产/测试引用，无遗漏无多余；删除符号无悬挂 import），测试迁移覆盖等价（f001 单点除外），AC-002 回归测试实测全绿；仅 1 条 minor，PASS。
- 系统性 follow-up：无（orphan 已消费覆盖缺口可在 t112 内补；loadingFailed 生产语义测试缺口如要做，建议标题 `t122_network_capture_loading_failed_semantics`，非阻断）

### AC 复验方式

- AC-001（CDP 事件路径显式废弃）：`re_verified`。grep 全仓：`handle_cdp_event`/`CdpHandlerState`（background/cdp_handler 版）零生产/测试 import 残留（命中均为注释、docs 历史与 `src/bridge/cdp_handler.ts` 的 `handle_cdp_events` 无关符号）；`clear_orphan_timers`/`headers_map_from_cdp`/`build_cdp_primary_network_event` 等已删符号无 import 引用；5 个直驱测试文件迁移或删除，`cdp_handler.ts` 897→117 行。
- AC-002（现有 CDP 生命周期行为无回归）：`re_verified`。实跑 `npx vitest run` 8 个相关文件 132 用例全绿（t112 12、network_capture 93、cdp_response_body_config 3、loading_failed_events 2、streaming_capture 12、network_capture_session_key 3、network_stop_deferred_timers 4、cdp_handler_redaction 3），且全量 `npm test` 129 文件 1363 用例全绿。被删除的 cdp_state_cleanup / cdp_request_key_session_isolation 语义由 t112:213-232（100 请求清零 + root/子 session 隔离）与 network_capture_session_key.test.ts 承接。
- AC-003（无悬挂引用）：`re_verified`。src/ 侧 4 文件 import background/cdp_handler 的符号（类型、cdp_request_key、base64_decoded_size、set_self_origin_excludes、is_self_origin_url、ORPHAN_TIMEOUT_MS、DEFERRED_TIMEOUT_MS）全部保留；tests/ 侧 3 处 import（set_self_origin_excludes、PendingRequest、DEFERRED_TIMEOUT_MS）全部保留；`npx tsc --noEmit` exit 0（type-only 引用亦验证）。

coverage = 3 / 3

reviewed_scope: e1c5a36dd2720118

verdict: PASS

## Round 2 (2026-08-11 19:22 UTC+8)

### Findings

本轮无新 finding。

### 前轮 finding 复核

- **t119_code_f001（minor，orphan 回调「事件已消费」早退的 marker 清理无生产等价覆盖）：实质已消除。**
  - 实现侧补测（非 f001 建议的精确形态，见下）：`tests/unit/loading_failed_events.test.ts:112-155`「loadingFailed 带 meta（生产 network_capture 路径）」+ `tests/unit/t112_finished_before_stream_lifecycle.test.ts:234-243`「loadingFailed 无 meta 后 marker 清理」。两用例均走 `start_network_capture` + `mock_chrome_debugger.emit_event` 生产接线，`_cdp_request_meta_for_test` / `_finished_before_stream_for_test` 指向生产模块级 state（`network_capture.ts:43,56`）。
  - f001 前提「若 orphan 回调顶部 delete 回退，测试全绿」经独立复核**不成立**：`t112:190-201`「AC-003 orphan 早退（无 consumer）」场景中，loadingFinished 无 meta（`network_capture.ts:540` 写 marker）→ getResponseBody error 路径（`network_capture.ts:675` 写 fail_result，不删 marker）→ orphan 3s 触发时 marker 仍在，`network_capture.ts:836` 顶部 delete 是唯一清理点；该行回退则 `t112:200` 断言变红。→ L836 已有生产锚定，f001 核心语义（orphan 终态无条件清理 marker，与消费无关）已满足。
  - 残留缺口（提示级，不进 finding）：`network_capture.ts:838-839`「body_result 不存在（事件已被消费）→ 早退不发重复事件」分支无用例直接触达；其 marker 清理由 L836 承担已锚定，且被删 cdp_handler 用例 4 亦只断言 marker 清理、未断言不发事件，迁移等价性成立。
  - 新用例断言**符合生产语义，非照搬废弃行为**：`emitted.length === 0`（loadingFailed 不发立即主事件）对应 `network_capture.ts:693-702` 仅记 body_results + 清 marker + deferred + orphan、无 `send_to_background`，且反向于废弃的「立即发含 error_text 主条目」行为；marker 立即清理锚定 `network_capture.ts:699`；orphan 3s 兜底不抛错且 marker 保持已清（handler 未设 → L837 早退、L836 幂等 delete），与测试注释「meta 残留等待消费路径，属生产语义」一致。t112 新用例「loadingFinished 无 meta → marker 写入（L540）→ loadingFailed → 清理（L699）」同样符合生产语义。

### 结论

- 前轮 finding 复核：f001 实质已消除（前提经复核不成立 + 核心语义已有生产锚定）；实现侧补测断言符合生产语义，覆盖了 Round 1 结论「范围外观察」提及的 loadingFailed 生产语义历史缺口。
- 本轮新发现：0 条
- 未进表的提示：无（`network_capture.ts` 1254 行历史文件过大，本 task 零触碰；t112 316 行 / loading_failed_events 156 行未超测试 600 行阈值；孤儿 L838-839 早退分支未直接触达属提示级）
- 总体判断：f001 已修，断言按生产语义（未照搬废弃行为），无未解决 critical / important；PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001（CDP 事件路径显式废弃）：`re_verified`。grep 复核：`handle_cdp_event` / `CdpHandlerState`（background/cdp_handler 版）在 src/ 与 tests/ 零 import 残留（命中仅为注释、docs 与 `src/bridge/cdp_handler.ts` 的 `handle_cdp_events` 无关符号）；`cdp_handler.ts` 897→117 行，保留 import 全为辅助导出。
- AC-002（现有 CDP 生命周期行为无回归）：`re_verified`。实跑 `npx vitest run` 8 文件 133 用例全绿（network_capture 93、t112 12、loading_failed_events 3、streaming_capture 12、cdp_response_body_config 3、network_capture_session_key 3、network_stop_deferred_timers 4、cdp_handler_redaction 3）。
- AC-003（无悬挂引用）：`re_verified`。src/ 与 tests/ 对 background/cdp_handler 的 import 全部为保留辅助导出（类型、cdp_request_key、base64_decoded_size、set_self_origin_excludes、is_self_origin_url、ORPHAN_TIMEOUT_MS、DEFERRED_TIMEOUT_MS）；`npx tsc --noEmit` exit 0。

coverage = 3 / 3

reviewed_scope: 0cbea83a31d8a107

verdict: PASS

## Round 3 (2026-08-11 19:27 UTC+8)

### Findings

### t119_code_f003 - 测试名仍含「marker 清理」，与用例实际断言（及注释「不重复断言」）不一致

- 严重度：minor
- 锚点：f002 处置建议「同步简化测试名」未尽；AC-002 相关（无覆盖缺口）
- 位置：`tests/unit/loading_failed_events.test.ts:134`（用例名）
- 问题：f002 恒真断言（原 `:151/:154`）已删除后，用例名仍为「已有 meta 时 loadingFailed 不发立即主事件，marker 清理（t119 f001）」。用例内无任何 marker（`finished_before_stream`）断言，`:154` 注释明示「此处未建立 marker，不重复断言」——测试名声称验证的行为与用例实际断言自相矛盾。读者会误以为该用例锁定 marker 清理语义；实际该语义由 `t112_finished_before_stream_lifecycle.test.ts:234-243` 序列用例非恒真锁定，无失败被掩盖、无 AC 覆盖缺口，故 minor。
- 建议：简化测试名为「已有 meta 时 loadingFailed 不发立即主事件且 meta 保留（t119 f001）」，或删除「marker 清理」字样；行为断言保持现状。

## 结论

- 前轮 finding 复核（Round 3）：
  - `t119_code_f001`（minor，Round 1）：Round 2 已判实质消除（前提不成立 + L836 生产锚定），本轮 diff 未再触碰相关代码，维持已消除。
  - `t119_test_f002`（test 路 minor，恒真 marker 断言）：**已修**。独立复核当前 `git diff`：原恒真断言（loadingFailed 后 `expect(_finished_before_stream_for_test.has('root:LF1')).toBe(false)`，marker 从未建立）已整体删除。用例 `loading_failed_events.test.ts:134-155` 现存三条断言全部非恒真且有效：`:140` requestWillBeSent 后 meta 已写入（`_cdp_request_meta_for_test.has('root:LF1')` true，由 emit 驱动）；`:148` `emitted.length === 0` 锁定核心语义「loadingFailed 不发立即失败主事件」（生产 `network_capture.ts:693-702` 无 `send_to_background` 调用，废弃「立即发主条目」行为回归即红）；`:150` loadingFailed 后 meta 保留（生产分支不删 `cdp_request_meta`，仅 L699 清 `finished_before_stream`）。marker 清理语义由 `t112:234-243` 以非恒真序列用例锁定（先 loadingFinished 断言 marker 写入 L547 → loadingFailed 断言删除 L699）。f002 建议两动作完成其一（删断言），「同步简化测试名」未尽 → 新 finding f003（minor）。
- 本轮新发现：1 条（f003，minor）
- 未进表的提示：文件过大——`network_capture.ts` 1254 行（历史，本 task 零触碰）、`cdp_handler.ts` 117 行（废弃残壳）；测试 t112 316 行 / loading_failed_events 156 行未超 600 阈值。复杂度——本轮纯测试断言调整，无新增分支。范围外——无。
- 总体判断：f002 恒真断言已消除，核心语义（emitted 0 + meta 保留）保留且断言有效；生产代码自 Round 2 起零改动；相关测试实测全绿；仅 1 条 minor（测试名残留），PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-001（CDP 事件路径显式废弃）：`re_verified`。grep src/ + tests/：`handle_cdp_event` / `CdpHandlerState`（background/cdp_handler 版）零 import 残留，命中仅为 `network_capture.ts` 自身生产函数（L370 定义、L154/187/236 自身接线）、bridge 侧独立模块 `handle_cdp_events` 与注释；`cdp_handler.ts` 现 117 行（与 Round 2 一致，本轮生产代码零改动，network_capture.ts 不在 diff）。
- AC-002（现有 CDP 生命周期行为无回归）：`re_verified`。实跑 `npx vitest run` 5 文件 25 用例全绿（loading_failed_events 3、t112 12、cdp_response_body_config 3、network_capture_session_key 3、network_stop_deferred_timers 4）。
- AC-003（无悬挂引用）：`re_verified`。cdp_handler import 残留 3 处（tests 侧 set_self_origin_excludes / DEFERRED_TIMEOUT_MS / `PendingRequest` type）全部为保留辅助导出；`npx tsc --noEmit` exit 0。

coverage = 3 / 3

reviewed_scope: eee0bd3ffb7f5fbb

verdict: PASS

## Round 4 (2026-08-11 19:34 UTC+8)

### Findings

本轮无新 finding。

### 前轮 finding 复核

- **t119_code_f003（minor，测试名「marker 清理」与断言/注释矛盾）：已修。**
  - 独立复核当前 `git diff` 与文件全文：`tests/unit/loading_failed_events.test.ts:134` 用例名已改为「已有 meta 时 loadingFailed 不发立即主事件（t119 f001）」，`marker 清理` 字样删除；用例内三条断言（`:140` meta 已写入、`:148` `emitted.length === 0`、`:150` meta 保留）与测试名完全对应，`marker` 相关断言确实不存在。
  - 注释同步：`:154` 原「此处未建立 marker，不重复断言」改为「marker 清理由 t112 loadingFinished→loadingFailed 序列用例锁定（此处未建立 marker）」，与测试名不再矛盾，且与 Round 2/3 结论（marker 清理语义由 t112:234-243 序列用例非恒真锁定）一致。
  - 改动范围核验：本 diff 相对 Round 3（指纹 eee0bd3ffb7f5fbb → 1daaee88b405a917）仅此文件内测试名 + 注释两行文本变化，生产代码（network_capture.ts / cdp_handler.ts）零改动。`npx tsc --noEmit` exit 0。
- **t119_code_f001（minor，Round 1）：维持已消除。** 生产锚定（network_capture.ts:836 顶部 delete）与 t112 序列用例均未触碰。
- **t119_test_f002（test 路 minor，恒真断言）：维持已修。** 恒真断言未回退，本 diff 未涉及。

### 结论

- 前轮 finding 复核：f003 已修（命名与断言一致，注释同步），f001/f002 维持已消除/已修；以 diff 为准，非采信处置表。
- 本轮新发现：0 条
- 未进表的提示：无新增（文件过大/复杂度结论同 Round 3，本 diff 无净增）。
- 总体判断：f003 纯命名+注释修复，与断言一致；生产代码零改动；相关测试 25 用例全绿、tsc exit 0；无未解决 critical / important；PASS。

### AC 复验方式（Round 4）

- AC-001（CDP 事件路径显式废弃）：`re_verified`。grep src/ + tests/：`handle_cdp_event` / `CdpHandlerState`（background/cdp_handler 版）零 import 残留（命中仅为 network_capture.ts 自身生产函数与 bridge 侧无关符号）；cdp_handler.ts 117 行废弃残壳，本 diff 未改。
- AC-002（现有 CDP 生命周期行为无回归）：`re_verified`。实跑 `npx vitest run` 5 文件 25 用例全绿（loading_failed_events 3、t112 12、cdp_response_body_config 3、network_capture_session_key 3、network_stop_deferred_timers 4）。
- AC-003（无悬挂引用）：`re_verified`。cdp_handler import 残留 3 处（tests 侧 set_self_origin_excludes / DEFERRED_TIMEOUT_MS / `PendingRequest` type）均为保留辅助导出；`npx tsc --noEmit` exit 0。

coverage = 3 / 3

reviewed_scope: 1daaee88b405a917

verdict: PASS
