# Task review t112（reviewer_focus: 代码）

- task：`t112_finished_before_stream_lifecycle`
- spec：`docs/tasks/t112_finished_before_stream_lifecycle/spec.md`
- diff_anchor：`a424a8adaf63a5ca288f75ff5a72bb1ec9d65f6f`
- target：`git diff a424a8adaf63a5ca288f75ff5a72bb1ec9d65f6f`
- round：1
- reviewed_at：2026-08-11 11:36 CST

reviewed_scope: eb1cbed41f7b79d6

## Findings

### t112_code_f001 - orphan timer 的 `!body_result` 早退绕过新加 marker 清理，关联消费后标记残留至 stop

- 严重度：important
- 锚点：AC-001（"普通请求完成并产出事件后，其 request key 不再保留在 `finished_before_stream`；同一 session 后续同 key 请求不会因残留标记改变 SSE/body 行为"）+ AC-003（"最终输出、deferred 或 orphan 终态后均清理"）
- 位置：`src/extension/background/network_capture.ts:862`（本 task 新增的 `finished_before_stream.delete(req_key)`，被同函数 `:833` 的 `if (!body_result) return;` 早退绕过）；同构缺口存在于 `src/extension/background/cdp_handler.ts:881`（该处 delete 为既有行，被 `:852` 早退绕过，本次未引入但同源）
- 问题：`schedule_orphan_check` 的 timer 回调里，marker 清理位于 `body_result` 存在性检查之后；当 CDP body 已被 webRequest 关联路径消费时，timer 触发即早退，marker 不再删除。可构造时序：
  1. attached tab 请求 Y 逆序竞态（`loadingFinished` 先到、meta 尚未建立）→ `getResponseBody` resolve 时无 meta → `try_resolve_deferred` 早退（`network_capture.ts:782` 无 deferred 命中）→ 排 3s orphan timer，marker 此时仅由该 timer 负责删除；
  2. 随后 `responseReceived(Y)` 到达建 meta，同时另一 tab 的同 base URL/同 method/同 status 请求 X 在 2s 匹配窗口（`find_matching_cdp_request`，`network_capture.ts:1203-1219`）内 `handle_completed` 命中并消费 Y 的 `cdp_body_results` + `cdp_request_meta`（`:1102-1105`，该路径不删 marker）；
  3. 3s 后 orphan timer 触发：`cdp_body_results.get(Y)` 已空 → `:833` 早退 → `:862` 从未执行 → marker 残留至 `stop_network_capture` 的 `clear()`（`:162`）。
  残留期间同一 session 若复用同 requestId 且为 SSE，`responseReceived` 的 `:506` 会消费该陈旧标记、跳过 `streamResourceContent`（AC-001 明文失效模式）。实测 9/9 用例与邻近套件均不覆盖该路径（测试无 cross-tab 关联消费），全绿无法拦截。
- 建议：把 timer 内的清理块（`cdp_request_meta` / `cdp_body_results` / `_deferred_cdp_index` / `finished_before_stream` 四处 delete）移到 `body_result` 检查之前无条件执行；或让 `handle_completed` 消费路径（`:1102-1105`）同步删除被消费 key 的 marker，保证任何终态都清理。

### t112_code_f002 - capture_response_body=false 早退分支只覆盖 loadingFinished，responseReceived 对 SSE 仍发起 streamResourceContent，新注释断言过强

- 严重度：minor
- 锚点：行为缺陷（config 语义半实现）；新代码自身注释与代码不一致
- 位置：`src/extension/background/network_capture.ts:546-566`（本 task 新增分支）vs `:501`（`responseReceived` 无 `capture_response_body` guard）；注释 `:546`
- 问题：新增分支注释"capture_response_body=false: 不发起 getResponseBody/streamResourceContent"，但 `responseReceived`（`:501`）对 SSE 仍无条件 `streaming_requests.add` + 发起 `Network.streamResourceContent`（`network_capture` 侧缺 `cdp_handler.ts:290` 已有的 config guard，为 fork 遗留）。实际效果：capture_response_body=false 时 SSE 仍被 streamResourceContent 取回并 append 进 stream_buffer，`loadingFinished` 新分支随后 `streaming_requests.delete`（`:549`）但不 `force_flush`/`remove` buffer entry（`stream_buffer.remove` 存在未用），缓冲数据滞留至 stop 的 `flush_all`（期间 meta 已删、数据被 on_flush 丢弃）。无数据泄漏到输出、缓冲有界，但 config 意图（不发起 body 获取）只实现了一半，且注释与实际行为相悖。
- 建议：`responseReceived` 的流式分支同步加 `config.capture_response_body` guard（对齐 `cdp_handler.ts:290`）；新分支删除 `streaming_requests` 时顺带 `stream_buffer_instance?.remove(req_key)`；注释据实修正。

### t112_code_f003 - 两处复制实现继续双点维护，cdp_handler 的 state 驱动路径在扩展生产无调用方

- 严重度：minor
- 锚点：DRY（verbatim 重复默认 minor）；spec 范围明确给了"或消除两处重复实现并统一生命周期语义"选项
- 位置：`src/extension/background/cdp_handler.ts:333-466`（handle_loading_finished）与 `src/extension/background/network_capture.ts:540-689`（同逻辑内联版）
- 问题：本 task 选择继续给两端各打一次同形补丁（capture_response_body=false 早退、streaming 早退、loadingFailed、try_resolve_deferred 共 9 处 delete），marker 生命周期清理在两端各维护一份，未来修复须双点应用。两实现已出现行为分叉：`responseReceived` 的 config guard（`cdp_handler.ts:290` 有 / `network_capture.ts:501` 无）、T103 迟到回调 guard（`network_capture.ts:607,663` 有 / `cdp_handler` 无）、getResponseBody 的 sessionId 传参（`network_capture.ts:602-605` 有 / `cdp_handler.ts:385` 无）、loadingFailed 立即 emit 语义（`cdp_handler.ts:476-492` 有 / `network_capture.ts:691-700` 无）。另经全量 grep 确认：`cdp_handler.ts` 的 state 驱动 `handle_cdp_event` 在扩展生产路径无调用方（`network_capture` 仅 import 其工具函数与常量；`onEvent.addListener` 只注册 `network_capture` 自身版），本 task 修复的是测试专用复制实现——修复本身两端逻辑均正确，但该重复结构的长期成本未消。
- 建议：follow-up 按 spec 选项 B 消除两处重复（或明确 cdp_handler 的用途并接线/移除死路径），避免 marker 生命周期语义继续双点漂移。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（Round 1）
- 本轮新发现：3 条（f001 important；f002/f003 minor）
- 未进表的提示：
  - 文件过大（按规则不进 finding 表，仅列出）：`src/extension/background/network_capture.ts` 1247 行（实现源码阈值 800，本 task 净增 29）；`src/extension/background/cdp_handler.ts` 895 行（净增 3）。二者均为历史累积，本 task 改动幅度小。
  - 圈复杂度：`network_capture.ts` 的 `handle_cdp_event` 为巨型分发函数（~335 行、分支远超 15），本 task 增加 1 个早退分支；无由该复杂度直接产出的可观测缺陷，仅提示。
  - 范围外观察（测试层缺口已由测试 reviewer 覆盖，不重复）：`review_test.md` f001（AC-004 子 session 假覆盖：`should_handle_event` 未注册 session 丢弃 child 事件，`:209-222` 断言平凡成立）、f002（cdp_handler 修复 5 处新行零断言）、f003（deferred 终态未触达，`try_resolve_deferred` 新增 delete 未被任何用例执行）。本报告 .scratch 探针独立复现了 f001 前提（child 事件被路由门丢弃）且证实注册 session 后 child 路径清理正常。
- 总体判断：实现方向与覆盖度基本达标——两端所有 `finished_before_stream.add` 位点均配终态删除、no-meta 路径由 orphan 3s 兜底，9 个新用例与 101 个邻近用例全绿；但 f001 表明 orphan 终态存在一条 body 已消费时的 marker 残留路径，AC-001/003「终态后均清理」保证不完整，须修。
- 系统性 follow-up：无既有 tid；建议标题「消除 cdp_handler/network_capture 的 CDP 事件处理重复实现（接线或移除测试专用路径）」，slug `unify_cdp_event_handlers`，阻断性：enhancement。

### AC 复验方式

- AC-001：`re_verified` — 静态核对 `network_capture.ts:542` add 与 `:564/596/654/682/697/810/822/862` 全部终态 delete，跑 `t112` 用例（9/9）与 `network_capture`/`loading_failed_events`/`cdp_response_body_config`/`cdp_request_key_session_isolation`（101/101）；f001 的 cross-tab 消费路径除外，为该 AC 残留缺口。
- AC-002：`re_verified` — SSE flush 分支（`:596`）与 getResponseBody 失败分支（`:682`）删除存在，对应用例（AC-002 SSE / reject）全绿。
- AC-003：`re_verified`（f001 路径除外）— 逆序竞态、无 metadata、orphan、capture_response_body=false 四类早退路径删除位点逐一核对 + 用例绿；orphan `!body_result` 早退残留见 f001。capture_response_body=false 场景实测触达生产分支（用例 `:199-207` 配置 capture_response_body: false 且正常请求路径）。
- AC-004：`re_verified`（代码路径）— 每个终态删除保证标记有界（正常请求即时清理、no-meta 3s orphan 兜底、stop 全清）；root 与子 session key 清理逻辑同构（复合键 `sessionId:requestId`），.scratch 探针注册 session 后实证 child marker 写入与清理正常。测试文件对子 session 的"假覆盖"属测试层缺陷（review_test.md f001），不影响代码层结论。
- 覆盖率行：`coverage = 4 / 4`（AC-001/003 附 f001 残留路径说明，AC-004 子 session 以探针实证）

verdict: FAIL

## Round 2 (2026-08-11 11:48 UTC+8)

reviewed_scope: 168e6582c5784add

### Findings

本轮零 finding（f004 起无新增）。

### 前轮 finding 复核（以 diff 与代码为准，不采信处置表自述）

- t112_code_f001（important）— **已修**。`network_capture.ts:830-836` 与 `cdp_handler.ts:848-854` 的 orphan timer 回调顶部新增无条件 `finished_before_stream.delete(req_key)`，先于 `!on_cdp_body_event` / `!body_result` 早退执行；f001 泄漏时序（事件被 `handle_completed` 跨 tab 消费 → `cdp_body_results` 空 → 早退 → 标记残留至 stop）已消除。竞态窗口保护不受影响：3s orphan 兜底远大于逆序竞态窗口，responseReceived 对在途请求仍按原路径消费标记（`:506`/`:295`），同 key 复用（AC-001）语义正确。timer 尾段 `:865`/`:883` 保留同款 delete，幂等无害。
- t112_code_f002（minor）— **已修**。`network_capture.ts:501` 流式分支补 `config.capture_response_body` guard，与 `cdp_handler.ts:290` 对齐；`capture_response_body=false` 时 `streaming_requests` 不再被写入，无 streamResourceContent 发起、无 stream_buffer 滞留，f002 建议的 `stream_buffer_instance?.remove` 已无必要。`config` 在 `start_network_capture`（`:86`）一次性赋值，`enable_response_body_capture` 不翻转 `capture_response_body`，不存在 config 中途翻转的残留路径。`:546` 注释与实际行为一致。
- t112_code_f003（minor）— **已修**（按处置表口径：spec 选项 B 允许双点实现）。两端补丁对称——orphan timer 顶部清理与 responseReceived config guard 两端齐备，本轮未引入新分叉；既有分叉（T103 迟到回调 guard、getResponseBody sessionId 传参、loadingFailed 立即 emit、`not_enabled` else-if）与 f003 记录一致，未扩大。消除重复的 follow-up 保持打开。

### 本轮新发现

0 条。

### 未进表的提示

- 文件过大（不入表）：`network_capture.ts` 1250 行、`cdp_handler.ts` 897 行，均为历史累积，本 task 净增幅度小。
- 圈复杂度：`handle_cdp_event` 巨型分发函数为历史问题，本轮无实质分支增加。
- 范围外观察（非本轮引入，建议后续处理）：`network_capture.ts` 的 orphan timer 未在 stop 时跟踪/清理——`stop_network_capture` 的 T103 注释（`:132`）声称「清理 deferred/orphan timer」，实际只清 deferred entry 的 `entry.timer`，orphan 的 `setTimeout` 回调未注册可清（`on_cdp_body_event` 在 `:166` 置空）。stop→restart 后旧 timer 迟到触发可能向新 capture 发射陈旧 orphan 事件（`body_result` 存在时），该隐患与 Round 2 之前同源；本轮新增的「timer 顶部无条件 delete」在此场景会提前删新 capture 同 key 的 marker，分析结论：需 stop→restart 3s 内 + 同 key 复用 + 逆序窗口叠加才可达，且可观测影响可忽略（SSE 侧 marker 有无均落 `partial`，非流式侧 marker 由 loadingFinished 自身终态路径删除）。不进 finding 表；建议后续对齐 `cdp_handler.ts` 的 `orphan_timers` + `clear_orphan_timers` 跟踪清理。

### 总体判断

f001~f003 均按处置表修复并经代码逐点位核实，无新引入问题；t112 用例 14/14、邻近套件 101/101 全绿，`tsc --noEmit` 干净。PASS。

### 系统性 follow-up

沿用 Round 1 建议（无既有 tid）：「消除 cdp_handler/network_capture 的 CDP 事件处理重复实现（接线或移除测试专用路径）」，slug `unify_cdp_event_handlers`；另建议为 `network_capture` 增加 orphan timer 跟踪清理（对齐 cdp_handler 的 `orphan_timers`）。

### AC 复验方式

- AC-001：`re_verified` — 静态核对 `network_capture.ts:542` add 与 `:564/:596/:654/:682/:697/:810/:822/:833/:865` 全终态 delete；用例「同 session 后续同 key 请求不受残留标记影响」两轮请求后 size=0 且流式命令未被跳过，绿。
- AC-002：`re_verified` — SSE flush 分支（`:596`）与 getResponseBody reject 分支（`:682`）delete 在位；AC-002 SSE / reject 两用例绿。
- AC-003：`re_verified` — 逆序竞态、无 metadata、orphan、capture_response_body=false 四类路径 delete 位点逐一核对 + 用例绿；f001 的「body 已消费」早退路径由 timer 顶部 delete（`:833`/`:851`）消除，cdp_handler 直驱用例（测试 `:363-374` 构造 body/meta 已删后触发 timer）实证空 body_result 下仍清理。
- AC-004：`re_verified` — 每终态 delete 保证标记有界，stop 全清（`:162`）；用例 100 请求（`register_session` 后 root/子 session 各 50 条 body 命令）断言 size=0。
- 覆盖率行：`coverage = 4 / 4`

verdict: PASS

## Round 3 (2026-08-11 12:11 UTC+8)

reviewed_scope: 13b80fcc3619633f

### 复核背景（本轮为何重开）

Round 2 verdict PASS 后生产代码零改动，仅测试文件新增用例（`tests/unit/t112_finished_before_stream_lifecycle.test.ts`：14 → 18 例）。指纹计算纳入测试文件，新增用例使指纹由 `168e6582c5784add` 变为 `13b80fcc3619633f`，code 报告指纹过期 → PASS 失效，须本轮重审。

证据链：

- mtime：`network_capture.ts` / `cdp_handler.ts` 均 2026-08-11 11:38（早于 Round 2 verdict 11:48）；测试文件 12:04（晚于）。
- `git diff a424a8adaf63a5ca288f75ff5a72bb1ec9d65f6f` 的 src 改动与 Round 2 报告逐点位一致，无新增/删除/移位（位点明细见下方 AC 复验）。
- 测试：18/18 全绿（`npx vitest run tests/unit/t112_finished_before_stream_lifecycle.test.ts`，12:10 实跑）。

### Findings

本轮零 finding（f004 起无新增）。

### 前轮 finding 复核（以 diff 与代码为准）

- t112_code_f001（important）— Round 2 已修状态保持：orphan timer 回调顶部无条件 `finished_before_stream.delete(req_key)` 在位（`network_capture.ts:833` / `cdp_handler.ts:851`），先于 `!on_cdp_body_event` / `!body_result` 早退执行；src diff 与 Round 2 一致，无回退。
- t112_code_f002（minor）— Round 2 已修状态保持：`network_capture.ts:501` 流式分支 `config.capture_response_body` guard 与 `:546` 注释在位；capture_response_body=false 早退块（`:543-566`）含 `:564` delete，`streaming_requests` 不写入、无 stream_buffer 滞留。
- t112_code_f003（minor）— Round 2 已修状态保持：两端补丁对称，本轮未引入新分叉；消除重复的 follow-up 保持打开。

### 本轮新发现

0 条。

### 未进表的提示

- 生产代码自 Round 2 后零改动；文件过大（`network_capture.ts` 1250 行 / `cdp_handler.ts` 897 行，历史累积）与 `handle_cdp_event` 圈复杂度观察与 Round 2 记录一致，不入表。
- 新增测试用例属测试层（test reviewer 已审，`review_test.md` 末指纹同为本轮值），代码轴不评。

### 总体判断

生产代码与 Round 2 PASS 时逐字节一致（mtime + diff 双重证据），无新改动即无新代码问题；测试 18/18 全绿，新增用例未暴露生产路径缺陷。PASS。

### 系统性 follow-up

沿用 Round 1/2 建议（无既有 tid）：「消除 cdp_handler/network_capture 的 CDP 事件处理重复实现（接线或移除测试专用路径）」，slug `unify_cdp_event_handlers`；另建议为 `network_capture` 增加 orphan timer 跟踪清理（对齐 cdp_handler 的 `orphan_timers`）。

### AC 复验方式

- AC-001：`re_verified` — src diff 与 Round 2 完全一致（`network_capture.ts:542` add + `:564/:596/:654/:682/:697/:810/:822/:833/:865` 全终态 delete）；「AC-001 普通请求成功产出事件后 key 不再保留」「AC-001 同 session 后续同 key 请求不受残留标记影响（复用 requestId）」两用例绿。
- AC-002：`re_verified` — SSE flush 分支（`:596`）与 getResponseBody reject 分支（`:682`）delete 在位；「AC-002 SSE 完成 emit 后 key 不再保留」「AC-002 getResponseBody 失败路径同样清理」两用例绿。
- AC-003：`re_verified` — 逆序竞态、无 metadata、orphan、capture_response_body=false 四类早退路径 delete 位点与 Round 2 一致；「orphan 回调早退（事件已被消费）也清理 marker」用例直驱 `cdp_handler` 构造 body/meta 已删场景，实证空 body_result 下 timer 顶部（`:851`）仍清理。
- AC-004：`re_verified` — 「AC-004 root + 子 session 连续 100 请求后集合为空」断言 size=0 且 body 命令 100/50（root/子 session 各 50），绿。
- 覆盖率行：`coverage = 4 / 4`

verdict: PASS
