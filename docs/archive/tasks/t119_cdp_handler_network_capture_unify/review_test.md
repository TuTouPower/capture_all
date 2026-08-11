# Task review t119（reviewer_focus: 测试）

- task：`t119_cdp_handler_network_capture_unify`
- spec：`docs/tasks/t119_cdp_handler_network_capture_unify/spec.md`
- diff_anchor：`849b739e78b5509c1925838a98abfd2f22d7205c`
- target：`git diff 849b739e78b5509c1925838a98abfd2f22d7205c`
- round：1
- reviewed_at：2026-08-11 19:08 UTC+8

## Findings

### t119_test_f001 - CDP loadingFailed 带 meta 的生产路径行为无直接断言

- 严重度：minor
- 锚点：AC-002 相关（被删 loading_failed_events.test.ts 直驱用例的语义区域）
- 位置：`tests/unit/t112_finished_before_stream_lifecycle.test.ts:234`（新迁移用例仅覆盖 marker 清理）
- 问题：被删的 `loading_failed_events.test.ts` 用例 1 断言「已有 meta 时 loadingFailed 立即发失败主条目并清理」；该行为是废弃复制实现独有（`git show 849b739e:src/extension/background/cdp_handler.ts` 的 `handle_loading_failed`），生产 `network_capture.ts:693-702` 的 loadingFailed 分支不立即发主条目、也不删除 meta（meta 残留至 orphan 3s 兜底）。删除该用例正确（断言行为在生产路径不存在，迁移即失败），但生产路径该分支的完整行为（不发失败事件 + meta 残留至 orphan 清理）目前无测试直接锁定。
- 建议：可选补一条生产路径用例：requestWillBeSent（带 meta）+ loadingFailed → 断言 `_cdp_request_meta_for_test` 保留至 orphan 超时后清理、无带 error_text 的主事件发出（失败事件由 webRequest `handle_error` 通道负责，已有 `loading_failed_events.test.ts:52` 覆盖）。

## 结论

- 前轮 finding 复核：首轮，无
- 改测方向复核：无「迁就实现」的改测。两处测试迁移均以生产 network_capture 路径驱动（`start_network_capture` + `mock_chrome_debugger.emit_event`），断言方向与旧用例一致或更强（见下）
- 本轮新发现：1 条（f001，minor）
- 未进表的提示：
  1. 删除合法性与等价覆盖核对（逐条）：
     - `cdp_state_cleanup.test.ts` 整体删除（3 用例）：①100 请求后 finished_before_stream 清空 → `t112_finished_before_stream_lifecycle.test.ts:213` AC-004（root+child 100 请求，断言更强，含 100 次 body 命令）；②「cdp_primary_emitted 字段已删除」断言对象是 `CdpHandlerState` 类型，该接口已整体废弃，断言无意义，删除合理；③orphan timer 跟踪/回调后清理 → `network_stop_deferred_timers.test.ts:194` AC-003（更强：登记→stop 清空→推进时钟无事件写入）
     - `cdp_request_key_session_isolation.test.ts` 整体删除（1 用例）→ `network_capture_session_key.test.ts` AC-001/002/003（更强：同 requestId 跨 session meta 隔离 + body 命令带 sessionId 断言，该文件在 diff anchor 已存在，非本次新增）
     - `loading_failed_events.test.ts` 删 2 用例：①有 meta 立即发失败主条目——生产路径无此行为（差异符合 spec 上下文「未知契约清单」批准：差异按生产路径为准；失败主事件由 webRequest onErrorOccurred 通道发出，保留用例 `:52` 覆盖 error_text 断言）；②无 meta orphan 兜底 → t112 迁移用例 `:234` + `network_stop_deferred_timers.test.ts:194` 覆盖
     - `t112_finished_before_stream_lifecycle.test.ts` 删直驱 describe（7 用例）→ 全部在保留的生产路径测试有一对一等价覆盖：capture_response_body=false 早退（`:203`）、SSE 无 metadata orphan 兜底（`:178`）、loadingFailed marker 清理（`:234` 新建）、orphan 早退清理（`:190`）、SSE streaming 完成清理（`:143`）、deferred 完整解析（`:262`）、deferred 多候选兜底（`:289`）
  2. `cdp_response_body_config.test.ts` 迁移等价核对：三用例断言均保留且更精确——用例 1 由「emitted.length>=1 + last.data」改为 find request_id='r1' 精确匹配 + `toBe('not_enabled')`/`toBeNull()`（弱化反方向）；用例 2 去掉内部状态断言 `streaming_requests.has()` 改为命令调用负断言（更接近用户可观察）；用例 3 保持 1 次 getResponseBody 断言。真实定时器 50ms/20ms 等待模式沿袭原用例，非新引入
  3. 生产代码回归面：`network_capture.ts` 本次未改（仅保留 import cdp_handler 辅助）；被删 5 个导出（`handle_cdp_event`/`CdpHandlerState`/`is_streaming_response`/`build_cdp_body_result`/`clear_orphan_timers`）在 HEAD 与当前均无生产引用（`is_streaming_response`/`build_cdp_body_result` 生产实现位于 network_capture.ts）；保留的 13 个辅助导出全部有生产引用（network_capture / ws_handler / webrequest_handler / service_worker）
- 总体判断：废弃边界正确、测试迁移等价覆盖完整、无悬挂引用，全量 1363 测试通过；仅有 1 条 minor 可选扩展建议
- 系统性 follow-up：无

### AC 复验方式

- AC-001（废弃路径无生产调用 + 无测试直驱）：`re_verified`。grep 全仓 `handle_cdp_event`/`CdpHandlerState`/`clear_orphan_timers` 无 cdp_handler 指向引用（bridge 侧 `handle_cdp_events` 为独立模块）；`is_streaming_response`/`build_cdp_body_result` 生产定义在 `network_capture.ts` 且测试均从其导入
- AC-002（无回归）：`re_verified`。`npm test` 全量 129 文件 1363 用例通过；相关 7 个测试文件 129 用例独立通过
- AC-003（无悬挂引用）：`re_verified`。所有 `import ... from './cdp_handler'`（4 个 src 文件 + 3 个测试文件）引用的符号均在保留导出集内；保留的 13 个导出逐一验证有生产引用；5 个被删导出零引用

coverage = 3 / 3

reviewed_scope: e1c5a36dd2720118

verdict: PASS

## Round 2 (2026-08-11 19:20 UTC+8)

## Findings

### t119_test_f002 - marker 清理断言恒真（marker 从未建立，测试名与断言不匹配）

- 严重度：minor
- 锚点：f001 修复用例的「marker 清理」声明部分；AC-002 相关
- 位置：`tests/unit/loading_failed_events.test.ts:151,154`（用例 `:134`「已有 meta 时 loadingFailed 不发立即主事件，marker 清理（t119 f001）」）
- 问题：用例仅 emit `Network.requestWillBeSent` 与 `Network.loadingFailed`，未 emit `Network.loadingFinished`。`finished_before_stream.add` 全生产代码唯一写入点在 `network_capture.ts:547`（loadingFinished 分支），故本用例中 marker 从未建立，`expect(_finished_before_stream_for_test.has('root:LF1')).toBe(false)` 恒真——无论 loadingFailed 是否执行 699 行 delete 都通过。该断言无法验证其声称锁定的行为。
- 调查说明（为何不标 important）：该行为（loadingFailed 清理 marker）已被 `tests/unit/t112_finished_before_stream_lifecycle.test.ts:234-243` 用非恒真方式锁定（先 emit loadingFinished 断言 marker 存在，再 emit loadingFailed 断言删除），总行为覆盖未降低、无失败被掩盖，故不满足 blocking 硬阈值，降 minor。若按字面套用「恒真断言最低 important」则应说明：伪断言残留但不构成 AC 覆盖缺口。
- 建议：删除 `:151` 与 `:154` 两条断言并同步简化测试名（行为已由 t112:234 覆盖）；或改为有验证力的断言——orphan 3s 后 `expect(_cdp_request_meta_for_test.has('root:LF1')).toBe(true)`（锁定「loadingFailed 不删 meta + 无 handler 时 orphan 不清 meta」的生产语义，network_capture.ts:837 return 早退）。

## 结论

- 前轮 finding 复核（f001，minor）：
  - 核心建议「生产路径 loadingFailed 带 meta 不发立即主事件有直接断言」——**已修**。新用例走真实生产路径（`start_network_capture` + `enable_response_body_capture(1, false)` + `mock_chrome_debugger.emit_event` 同步分发 → `handle_cdp_event`），`:148` 断言 `emitted.length === 0` 有效非恒真（生产 loadingFailed 分支 693-702 无 `send_to_background` 调用；若废弃行为「立即发失败主条目」回归即红）。
  - 建议中的「meta 保留至 orphan 超时后清理」——**按生产语义修正而非照搬**。核实 `network_capture.ts:837` `if (!on_cdp_body_event) return;`：测试环境未设 handler（`set_cdp_body_event_handler` 仅 service_worker.ts:534 真实接线），orphan 兜底不清理 meta（865 行 cleanup 被 return 跳过），meta 残留至 stop。f001 原表述在生产语义下不成立，实现者以注释 `:152` 说明「meta 残留等待消费路径，属生产语义」并不断言，处置合理。
  - 新增副作用：伪断言（f002，见上）。
- 改测方向复核：本轮无「迁就实现」的改测。round 1 后 diff 仅新增 loading_failed_events.test.ts 新 describe（既有断言未改）；删除的废弃直驱用例已在上轮核过等价覆盖。
- 本轮新发现：1 条（f002，minor）
- 未进表的提示：
  1. f001 残余可选项：用例可补 `:153` 后断言 meta 残留（`_cdp_request_meta_for_test.has('root:LF1') === true`），与废弃行为「立即删 meta」形成对照，属覆盖增强非必须。
  2. `mock_chrome_debugger.emit_event` 为同步分发（`chrome_debugger.ts:89-93`），`emitted.length` 断言无 race，无异步时序问题。
- 总体判断：f001 核心（不发立即主事件）已有效锁定，残余伪断言为 minor 且行为已有 t112:234 等价覆盖；生产代码零改动，相关 18 用例全绿；无未解决 critical / important
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001（废弃路径无生产调用 + 无测试直驱）：`trust_prior`。依赖 round 1 re_verified 证据与实施侧「生产代码自 round 1 零改动」声明；本轮 diff 无法从 git 分层独立复核生产文件（改动未 commit）。
- AC-002（无回归）：`re_verified`。本轮重跑 loading_failed_events / t112_finished_before_stream_lifecycle / cdp_response_body_config 三文件 18 用例全绿；新增用例通过即证明生产 loadingFailed 分支不发立即主事件、orphan 兜底不抛错。
- AC-003（无悬挂引用）：`trust_prior`。同 AC-001，依赖 round 1 证据（grep 全仓无废弃路径引用、保留导出逐一验证有生产引用）。

coverage = 1 / 3

建议合并前人工抽查 trust_prior 项（AC-001/AC-003，占比 66% > 30%）：抽查 `cdp_handler.ts` 当前状态与 round 1 报告描述一致。

reviewed_scope: 0cbea83a31d8a107

verdict: PASS

## Round 3 (2026-08-11 19:30 UTC+8)

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核（f002，minor）：
  - **已修**。恒真 marker 断言（旧 `:151` `_finished_before_stream_for_test.has('root:LF1')` 恒 false——marker 未建立）已删除，改为 `:154` 注释说明「marker 清理由 t112 loadingFinished→loadingFailed 序列用例锁定」。核心语义保留且有效：
    - `:148` `expect(emitted.length).toBe(0)`：锁定「loadingFailed 不发立即失败主事件」。非恒真——生产 `network_capture.ts:693-702` loadingFailed 分支无 `send_to_background` 调用，若废弃行为（立即发失败主条目）回归即红。
    - `:150` `expect(_cdp_request_meta_for_test.has('root:LF1')).toBe(true)`：锁定「loadingFailed 不删 meta」。非恒真——`network_capture.ts:693-702` 对 `cdp_request_meta` 零操作（仅写 body_results / 删 finished_before_stream），若未来参照废弃实现「立即清理 meta」（旧用例 `expect(state.cdp_request_meta.has('root:FAIL_1')).toBe(false)`）回归即红。
    - 未按 f002「又一种弱化形式」换型：断言方向与建议一致（f002 建议二选一，实现者选「改有验证力断言」而非「删除+简化名」），marker 清理行为由 `t112_finished_before_stream_lifecycle.test.ts:233-243` 非恒真锁定（先 emit loadingFinished 断言 marker 建立 `:237`，再 emit loadingFailed 断言删除 `:240`），无覆盖缺口。
  - f002 建议中「orphan 3s 后 meta 保留」断言未照搬：`:152-153` 仅 advance 3s 验证 orphan 兜底不抛错（`network_capture.ts:837` `if (!on_cdp_body_event) return;` 早退，测试未设 handler 故 meta 不清），`:150` 在 3s 前断言 meta 保留。行为语义与 round 2 结论一致，处置合理。
- 改测方向复核：本轮 f002 修复为「删除恒真伪断言 + 换有验证力断言」，属修正测试自身缺陷，非「迁就实现」的改测；无。
- 本轮新发现：0 条
- 未进表的提示：
  1. 测试名「已有 meta 时 loadingFailed 不发立即主事件，marker 清理（t119 f001）」仍含「marker 清理」字样，与本用例实际断言（emitted 0 + meta 保留）不完全对应（marker 清理断言已迁至 t112）；f002 建议「同步简化测试名」未执行。纯命名瑕疵，不改变行为验证，可选简化。
  2. `:140` 建立 meta 断言 + `:148`/`:150` 行为断言构成「先建后验」链，无「存在即通过」问题；`mock_chrome_debugger.emit_event` 同步分发，无异步时序风险（round 2 已核）。
- 总体判断：f002 恒真断言已消除且未换型弱化，核心语义（不发立即主事件 + meta 保留）有验证力保留，marker 清理由 t112 非恒真用例锁定；生产代码与 round 1/2 状态一致，相关 18 用例全绿；无未解决 critical / important
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-001（废弃路径无生产调用，生产接线与唯一实现一致）：`re_verified`。本轮重扫 `src/`：`handle_cdp_event`/`CdpHandlerState` 仅存于 `network_capture.ts:370`（生产唯一 handler，自注册 `:236`/注销 `:154,:187`）与 `src/bridge/cdp_handler.ts` 的 `handle_cdp_events`（独立模块，plural 命名，非废弃路径）；`cdp_handler.ts:3` 头注释显式声明「事件路径自 t092 起无生产调用方（仅测试直驱）」。
- AC-002（无回归）：`re_verified`。本轮重跑 loading_failed_events / t112_finished_before_stream_lifecycle / cdp_response_body_config 三文件 18 用例全绿；f002 修复后新用例通过即证明生产 loadingFailed 分支不发立即主事件、不删 meta、orphan 兜底早退不抛错。
- AC-003（无悬挂引用）：`re_verified`。本轮 grep `src/` 无指向 `cdp_handler.ts` 废弃事件路径的引用；残留导出为类型 / 常量 / 辅助函数（NetworkCaptureConfig / PendingRequest / CdpRequestMeta / ORPHAN_TIMEOUT_MS 等），与 round 1 清单一致。

coverage = 3 / 3

reviewed_scope: eee0bd3ffb7f5fbb

verdict: PASS

## Round 4 (2026-08-11 19:36 UTC+8)

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
  - **f003（Round 3 未进表提示 1 / code f003，测试名含「marker 清理」与断言矛盾，minor）——已修**。测试名由「已有 meta 时 loadingFailed 不发立即主事件，marker 清理（t119 f001）」改为「已有 meta 时 loadingFailed 不发立即主事件（t119 f001）」（`tests/unit/loading_failed_events.test.ts:134`），「marker 清理」字样已移除。命名与断言一一对应：`:140` 先 emit requestWillBeSent 并断言 meta 建立（对应「已有 meta 时」）、`:148` `expect(emitted.length).toBe(0)`（对应「不发立即主事件」，非恒真——生产 `network_capture.ts:693` loadingFailed 分支无 `send_to_background` 调用）、`:150` meta 保留断言；`:154` 注释「marker 清理由 t112 loadingFinished→loadingFailed 序列用例锁定（此处未建立 marker）」与用例实际内容一致（未 emit loadingFinished，marker 从未建立，用例不对 marker 清理下断言）。纯命名 + 注释同步，断言零改动，无换型弱化。
  - **f002（Round 2，minor，恒真 marker 断言）——Round 3 已修，本轮维持**。`:148`/`:150` 断言与 Round 3 报告逐行一致（`tests/unit/loading_failed_events.test.ts:148,150`），无回退；marker 清理由 `t112_finished_before_stream_lifecycle.test.ts:233-243` 非恒真序列锁定。
  - **f001（Round 1，minor）——此前已闭环，本轮无变化**。
- 改测方向复核：本轮唯一测试改动为测试名简化 + 注释尾注同步，未改任何断言预期，无「迁就实现」的改测。
- 本轮新发现：0 条
- 未进表的提示：
  1. 改动范围核实（git 工作区未 commit，无法分层 diff）：Round 3 报告逐行描述（`:148`/`:150`/`:152-154` 断言与注释）与当前文件逐行一致，唯一差异即测试名（`:134`）与 `:154` 注释尾注「（此处未建立 marker）」；生产代码抽查与 Round 3 状态一致（`cdp_handler.ts:1-4` 显式废弃头注释、`network_capture.ts:370` 生产唯一 handler、`:693` loadingFailed 分支），佐证「纯命名改动、生产代码零改动」声明。
  2. 新增用例走真实生产路径（`start_network_capture` + `mock_chrome_debugger.emit_event` 同步分发），`:148`/`:150` 断言无 race、非恒真（Round 2/3 已核，本轮无变化）。
- 总体判断：f003 命名与断言、注释三者现已一致；生产代码零改动；三相关文件 18 用例全绿（本轮重跑）；无未解决 critical / important
- 系统性 follow-up：无

### AC 复验方式（Round 4）

- AC-001（废弃路径无生产调用，生产接线与唯一实现一致）：`re_verified`。本轮抽查 `cdp_handler.ts:1-4` 显式废弃头注释与 `network_capture.ts:370`（`handle_cdp_event` 生产唯一 handler 定义，与 `:236` 注册/`:154,:187` 注销配套），状态与 Round 3 一致。
- AC-002（无回归）：`re_verified`。本轮重跑 loading_failed_events / t112_finished_before_stream_lifecycle / cdp_response_body_config 三文件 18 用例全绿；改名后用例通过即证明生产 loadingFailed 分支不发立即主事件、不删 meta、orphan 兜底早退不抛错。
- AC-003（无悬挂引用）：`re_verified`。本轮 grep `src/`：指向 `cdp_handler.ts` 的 4 个生产 import 全部引用保留辅助导出（base64_decoded_size / is_self_origin_url / ORPHAN_TIMEOUT_MS / DEFERRED_TIMEOUT_MS / cdp_request_key / set_self_origin_excludes / 类型）；废弃符号 `handle_cdp_event`/`CdpHandlerState`/`clear_orphan_timers` 零生产引用（bridge 侧 `handle_cdp_events` 为 `src/bridge/cdp_handler.ts` 独立模块，非废弃路径）。

coverage = 3 / 3

reviewed_scope: 1daaee88b405a917

verdict: PASS
