# Task review t103（reviewer_focus: 代码）

- task：`t103_network_stop_deferred_timers`
- spec：`docs/tasks/t103_network_stop_deferred_timers/spec.md`
- diff_anchor：`bc6207db0c640c1465bcc7f7dea40f572d013e1d`
- target：`git diff bc6207db0c640c1465bcc7f7dea40f572d013e1d`
- round：1
- reviewed_at：2026-08-11 06:20 UTC+8

reviewed_scope: 0097200313c5e74f

## Findings

### t103_code_f001 - stop 未取消 orphan timer，跨采集迟到串写残留（AC-002 未闭环）

- 严重度：important
- 锚点：AC-002「stop 后再 start 新 capture_id，旧 timer 不得写入新 capture_id」；范围「网络采集 stop 时清理所有 deferred/orphan/相关 timer 与可取消的延迟任务」
- 位置：`src/extension/background/network_capture.ts:797`（`schedule_orphan_check`，timer 句柄未存储）；`stop_network_capture`（`network_capture.ts:119-167`，仅清 deferred 未清 orphan）
- 问题：本次修复只清 deferred timer，orphan timer 仅靠 `on_cdp_body_event = null`（`network_capture.ts:166`）挡迟到回调。该守卫对「stop 后无新采集」场景成立，但对「stop 后立刻 start 新 capture」场景不成立，存在可复现的跨采集串写路径：
  1. 旧采集有 in-flight 的 `Network.getResponseBody` promise（`loadingFinished` 触发，`network_capture.ts:577-658`）。stop 时 `chrome.dbg.detach`（`network_capture.ts:151`）使该 promise reject，`.catch`（`network_capture.ts:634-658`）在 stop 之后异步执行：`cdp_body_results.set(req_key, fail_result)` 把陈旧条目重新插回已清空的 map，并 `schedule_orphan_check(req_key, req_id)`（`network_capture.ts:657`）排出**新** orphan timer。
  2. 若新采集在 `ORPHAN_TIMEOUT_MS`（3000ms）内 start 并 `set_cdp_body_event_handler(new_handler)`（`service_worker.ts:516`）重新武装 `on_cdp_body_event`，该 orphan timer 触发时守卫 `if (!on_cdp_body_event) return`（`network_capture.ts:798`）通过，`cdp_body_results.get(req_key)` 命中陈旧 `fail_result`（无人清理，新采集不触碰旧 key），构造 url 为空、status_code=0、response_body_status='cdp_failed' 的 `CdpBodyEvent` 经新 handler（`service_worker.ts` 的 `handle_cdp_body_event`）写入新 capture，并连带删除新 capture 对应 entry。
  3. 结果：旧采集的迟到孤儿数据写入新 capture，违反 AC-002；且污染条目为退化数据（空 url）。
- 建议：最小修复二选一——(a) 在 `schedule_orphan_check` 记录 timer 句柄（`Set<ReturnType<typeof setTimeout>>` 或 Map），`stop_network_capture` 中 `clearTimeout` 全部并清空（同仓 `cdp_handler.ts:884` 已有 `clear_orphan_timers` 可参考模式）；(b) 在 `getResponseBody` 的 `.then/.catch` 回调入口加 `if (!is_capturing) return;`，丢弃 stop 后的迟到 body，从源头阻止 re-insert + 重新排 orphan。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（首轮）
- 本轮新发现：1 条（f001，important）
- 未进表的提示：
  - 文件过大：`src/extension/background/network_capture.ts` 1213 行（src 阈值 400/800）。本 task 仅净增 9 行，过大为既有存量，未直接导致可观测缺陷，按降级规则不进 finding 表。
  - 复杂度：改动函数 `stop_network_capture` 分支未显著增加，无 ≥15 函数。
  - 范围外观察（供 test reviewer）：新增测试只覆盖 deferred timer 注入路径，`AC-001`「deferred/orphan」中的 orphan 场景与 `schedule_orphan_check` 迟到回调路径未在测试中制造/断言；`tests/unit/network_stop_deferred_timers.test.ts:62` `emit_request` 实际不产生模块状态（`handle_cdp_event` 未注册、`dbg_tab_id` 为 null），为无效调用，且 `find_cdp_candidates` 导入未使用。
- 总体判断：deferred timer 清理实现正确（clearTimeout + map clear + reverse index clear，测试验证通过），但 spec 范围明确含 orphan timer，当前实现未取消 orphan timer 句柄、未挡 in-flight promise 迟到回调，跨采集串写残留一条重要缺陷未闭环。
- 系统性 follow-up：无（孤儿 timer 清理建议并入本 task 修复，不另立 task）

### AC 复验方式

- AC-001：`re_verified` — 阅读 `network_capture.ts:132-137` 清理逻辑 + 重跑 `npx vitest run tests/unit/network_stop_deferred_timers.test.ts`（2 passed）；deferred timer 经 clearTimeout 后推进时钟无写入。注：orphan 半路径（`on_cdp_body_event` 守卫）未被测试覆盖，仅代码路径推演。
- AC-002：`re_verified` — 重跑测试通过（旧 deferred timer 清理后新 capture 无写入）；但 orphan timer 跨采集残留未闭环（见 f001），故该 AC 在 orphan 维度上不成立。

coverage = 2 / 2

verdict: FAIL

## Round 2 (2026-08-11 06:25 UTC+8)

- task：`t103_network_stop_deferred_timers`
- spec：`docs/tasks/t103_network_stop_deferred_timers/spec.md`
- diff_anchor：`bc6207db0c640c1465bcc7f7dea40f572d013e1d`
- target：`git diff bc6207db0c640c1465bcc7f7dea40f572d013e1d`
- round：2
- reviewed_at：2026-08-11 06:25 UTC+8

reviewed_scope: e98db8ab474edcc4

## Findings

### t103_code_f002 - f001 修不彻底：布尔 `is_capturing` 守卫无法区分采集身份，stop→restart 跨写仍可复现（AC-002 未闭环）

- 严重度：important
- 锚点：AC-002「stop 后再 start 新 capture_id，旧 timer 不得写入新 capture_id」；范围「stop 后迟到 timer 回调不写入任何 capture」
- 位置：`src/extension/background/network_capture.ts:578`（`capturing_at_send` 快照）、`:584`（then 守卫）、`:639`（catch 守卫）、`:799-835`（`schedule_orphan_check`）
- 问题：修复在 `getResponseBody` then/catch 回调入口加 `if (!capturing_at_send || !is_capturing) return;`，只挡「stop 后无新采集」场景（`is_capturing=false` 早退）。对「stop 后立刻 start 新 capture_id」场景失效：新采集把 `is_capturing` 重新置 true，`capturing_at_send` 快照又恒为 true（sendCommand 必在采集态发出），守卫整体放行迟到回调。残留串写路径可复现：
  1. 旧采集 in-flight getResponseBody，stop（`:151` detach）后迟到回调触发（then/catch），守卫通过 → `cdp_body_results.set(req_key, ...)` 重新插回已清空 map，`schedule_orphan_check(req_key, req_id)`（`:636`/`:662`）排**新** orphan timer（`ORPHAN_TIMEOUT_MS=3000`，`:834`）。
  2. 新采集 start 时 `set_cdp_body_event_handler`（`service_worker.ts:516`）武装 `on_cdp_body_event`；orphan timer 触发时 `if (!on_cdp_body_event) return`（`:803`）通过，`cdp_body_results.get(req_key)` 命中陈旧 body_result（新采集不触碰旧 key），meta 已清 → 构造 url 为空、status_code=0 的 `CdpBodyEvent` 经新 handler 写入新 capture（`service_worker.ts:774` `handle_cdp_body_event` 以 `current_capture.capture_id` 落库）。
  3. 结果：旧请求退化数据（空 url）被打上新 capture_id 写入，违反 AC-002。
- 复现证据：`git diff` 当前源码下，用测试同构 harness（临时 `.scratch/t103_round2_repro.test.ts`，已跑后删除）——start cap1 → enable body capture → 挂起 getResponseBody → stop → `set_cdp_body_event_handler(spy)` + start cap2 → resolve `{body:'late-body'}` → 推进 `ORPHAN_TIMEOUT_MS+10`，orphan handler 收到 `{ request_id:'req_late', url:'', status_code:0, response_body:'late-body', tab_id:0 }`，`expect(spy).not.toHaveBeenCalled()` 失败。即守卫存在时跨写仍发生，f001 未闭合。
- 建议：把布尔 `is_capturing` 快照改为采集身份快照——sendCommand 前记 `capture_id_at_send`，then/catch 入口 `if (capture_id !== capture_id_at_send) return;`，区分旧/新采集；仅靠 stop 时 clearTimeout（f001 方案 a）仍不足，因迟到回调在 stop 之后排的新 timer 无法被本次 stop 清除，需身份守卫兜底。

## 结论

- 前轮 finding 复核（Round 2）：
  - `t103_code_f001`（important）：**修不彻底**。针对「stop 无新采集」的迟到回调已挡（is_capturing=false 早退），deferred timer 清理保留；但「stop→restart」跨写路径实测仍可复现（见 f002），AC-002 在 orphan 维度仍未闭环。
- 本轮新发现：1 条（f002，important）
- 未进表的提示：
  - 文件过大：`src/extension/background/network_capture.ts` 1213 行（src 阈值 400/800）。本 task 净增 12 行，过大为既有存量，未直接导致新缺陷，按降级规则不进 finding 表。
  - 复杂度：改动函数 `handle_cdp_event` 分支未显著增加，无 ≥15 函数。
- 总体判断：修复只覆盖 stop 后无新采集，未覆盖 spec 明确要求的 stop→restart 场景，AC-002 仍违反，存在未解决 important。
- 系统性 follow-up：无（残留串写并入本 task 修复）

### AC 复验方式

- AC-001：`re_verified` —— 重跑 `npx vitest run tests/unit/network_stop_deferred_timers.test.ts`（3 passed）+ 全量 1215 tests passed + `tsc --noEmit` exit 0；deferred timer 清理循环（`:132-137`）clearTimeout 后推进时钟无写入。
- AC-002：`re_verified`（deferred 维度）/ 未闭环（orphan 维度）——deferred timer 清理测试通过；但 f002 实证 stop→restart 后迟到 getResponseBody 回调经 orphan timer 写入新 capture，orphan 维度违反 AC-002。

coverage = 2 / 2

verdict: FAIL

## Round 3 (2026-08-11 06:30 UTC+8)

- task：`t103_network_stop_deferred_timers`
- spec：`docs/tasks/t103_network_stop_deferred_timers/spec.md`
- diff_anchor：`bc6207db0c640c1465bcc7f7dea40f572d013e1d`
- target：`git diff bc6207db0c640c1465bcc7f7dea40f572d013e1d`
- round：3
- reviewed_at：2026-08-11 06:30 UTC+8

reviewed_scope: b4e16a08397c45e4

## Findings

本轮 0 条新 finding。

## 结论

- 前轮 finding 复核（Round 3）：
  - `t103_code_f001`（important，orphan timer 未清 + in-flight promise 迟到回调跨写）：以方案 (b)「回调入口守卫 + stop 清空 map/handler」闭合。`stop_network_capture` 清 `deferred_web_requests` + `_deferred_cdp_index`（`network_capture.ts:132-137`），`getResponseBody` then/catch 回调入口加身份守卫（`:584`/`:639`），迟到回调不再重新插回 `cdp_body_results` 也不再排新 orphan timer，跨写根因消除。残余「stop 前排出的 orphan timer 未被 clearTimeout」属实现层非清理，但 stop 已清 `cdp_body_results`/`cdp_request_meta` 并置 `on_cdp_body_event=null`，orphan 回调无可发数据；唯一残余边缘场景是旧 orphan timer 在 restart 后命中 requestId 复用（cap2 自身 req_key 同值）时重复 emit cap2 自身数据，非 AC-002 所禁的「旧数据写入」，且 requestId 复用窗口极窄，不构成可观测 AC 违反，不进 finding。
  - `t103_code_f002`（important，布尔 `is_capturing` 守卫无法区分采集身份，stop→restart 跨写）：**已消除**。守卫改为 `capture_id_at_send !== capture_id || !is_capturing`（`:584`/`:639`），快照取发送时 `capture_id`（`:578`）。逐路径核实：stop 无 restart → `!is_capturing` 早退；stop→restart → `capture_id_at_send('cap1') !== capture_id('cap2')` 早退；正常未 stop → 两条件均不触发，行为无回归。突变验证：将两处守卫还原为纯布尔 `if (!is_capturing) return;` 后 `AC-002b` 红（`orphan_events` 得 1，`tests/unit/network_stop_deferred_timers.test.ts:186`），恢复身份守卫后绿，判别力锚定在 capture_id 快照。
- 本轮新发现：0 条
- 未进表的提示：
  - 文件过大：`src/extension/background/network_capture.ts` 1219 行（src 阈值 400/800）。本 task 净增 12 行，过大为既有存量，未直接导致可观测缺陷，按降级规则不进 finding 表。
  - 复杂度：`handle_cdp_event` 两处守卫为单条件早退，分支未显著增加，无 ≥15 函数。
- 总体判断：f002 身份守卫在 then/catch 双路径生效，stop→restart 跨写已根除；deferred timer 清理保留。无未解决 critical/important。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` —— 阅读 `network_capture.ts:132-137` 清理循环（clearTimeout + map clear + reverse index clear）+ 重跑全量 `npx vitest run`（115 files / 1215 tests passed）；deferred timer 经 clearTimeout 后推进时钟无写入。
- AC-002：`re_verified` —— deferred 维度：AC-002 测试判别力成立；orphan 维度：身份守卫突变验证（纯布尔挡 → AC-002b 红，capture_id 挡 → 绿），stop→restart 后迟到回调不写任何 capture。

coverage = 2 / 2

verdict: PASS
