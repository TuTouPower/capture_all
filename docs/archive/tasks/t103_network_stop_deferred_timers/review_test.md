# Task review t103（reviewer_focus: 测试）

- task：`t103_network_stop_deferred_timers`
- spec：`docs/tasks/t103_network_stop_deferred_timers/spec.md`
- diff_anchor：`bc6207db0c640c1465bcc7f7dea40f572d013e1d`
- target：`git diff bc6207db0c640c1465bcc7f7dea40f572d013e1d`
- round：1
- reviewed_at：2026-08-11 06:10 UTC+8

reviewed_scope: 0097200313c5e74f

## Findings

### t103_test_f001 - AC-001 前置设置是死代码，制造 deferred 的实际手段是直接注入

- 严重度：minor
- 锚点：AC-001
- 位置：`tests/unit/network_stop_deferred_timers.test.ts:93-98`（`emit_request`、`attach`、`sendCommand('Network.enable')`）与 `:62-73`（`emit_request` 定义）
- 问题：测试先 `start_network_capture` 后 `emit_request('req_defer', …)`，但生产路径 `handle_cdp_event` 只由 `enable_response_body_capture` 注册监听并设置 `dbg_tab_id`；本测试从未调用该函数，`mock_chrome_debugger.reset()` 后 `listeners` 为空，`emit_event` 空转；即便触发，`handle_cdp_event` 也会因 `dbg_tab_id === null` 提前 return。`attach`/`Network.enable` 只改 mock 计数，不设 `dbg_tab_id`。真实制造 deferred 的手段是第 100 行直接注入 entry（测试注释也已承认）。`emit_request`/`attach`/`sendCommand` 全是误导性死代码。
- 建议：删除 `emit_request`、`attach`、`sendCommand` 调用与 `emit_request` 函数定义，保留注释说明「注入 deferred entry 模拟 pending deferred」，使测试只含实际生效的路径。

### t103_test_f002 - AC-002 的 `new_events` 断言在本构造下恒真，跨写可观测未独立验证

- 严重度：minor
- 锚点：AC-002
- 位置：`tests/unit/network_stop_deferred_timers.test.ts:146`（`expect(new_events.length).toBe(0)`）
- 问题：注入的 deferred timer 回调（`:132-134`）直接 `events.push(...)` 到旧 capture 闭包数组，完全绕开生产 `send_to_background` 模块变量。因此无论 timer 是否被清，`new_events` 都恒为 0，该断言在本测试中永远成立、无判别力。真正的判别力完全落在 `expect(events.length).toBe(0)`（`:147`）上——它验证「旧 timer 被清掉」，而非 AC-002 字面可观测「旧 timer 不写入新 capture_id」。已实证：revert 生产修复后两测试全红（`events` 得 1），说明测试整体判别力成立，但跨写路径未被忠实模拟。
- 建议：可接受当前机制级验证（fix 就是清 timer，清后无处可写）。若要忠实模拟跨写，注入 timer 的回调应改为调用 `send_to_background`（生产路径），再断言新 capture 的 writer 未收到写入。

### t103_test_f003 - orphan timer 路径未覆盖，推进量也够不到 ORPHAN_TIMEOUT_MS

- 严重度：minor
- 锚点：AC-001（文本「deferred/orphan timer」）
- 位置：`tests/unit/network_stop_deferred_timers.test.ts:116`（`DEFERRED_TIMEOUT_MS + 100`）与 `src/extension/background/cdp_handler.ts:891-892`（ORPHAN=3000, DEFERRED=1500）
- 问题：AC-001 明写「deferred/orphan timer」，但测试只注入 deferred entry（`deferred_web_requests` map），未覆盖 `schedule_orphan_check` 的 orphan timer（`network_capture.ts:794-830`）。且推进量 `1500+100=1600ms` 小于 `ORPHAN_TIMEOUT_MS=3000`，即便存在 orphan timer 也不会触发。已核查：orphan 路径由 stop 清空 `cdp_body_results`/`cdp_request_meta` 与 `on_cdp_body_event=null`（`network_capture.ts:157-166`）双重守卫，迟到回调早退，无实际串写 bug。
- 建议：非阻断。如需补强，可加一条注入 orphan 场景（或使推进量超过 ORPHAN_TIMEOUT_MS）验证 stop 后 orphan 迟到回调不写。

### t103_test_f004 - 未使用的 import

- 严重度：minor
- 锚点：无（测试卫生）
- 位置：`tests/unit/network_stop_deferred_timers.test.ts:45`（`find_cdp_candidates`）
- 问题：`find_cdp_candidates` 导入后从未使用；`_cdp_request_meta_for_test`/`_cdp_body_results_for_test` 仅用于 beforeEach 清理。属未使用 import，非逻辑问题。
- 建议：删除 `find_cdp_candidates` 导入。

## 结论

- 前轮 finding 复核：Round 1，无
- 改测方向复核：无（diff 仅新增测试文件，未修改既有测试）
- 本轮新发现：4 条（全 minor）
- 未进表的提示：
  - 注入 deferred entry 的结构忠实：`{ pending, details, timer, pending_cdp_ids }` 与生产 `DeferredEntry` 形状一致，`timer` 为真实 `setTimeout` 句柄，注入进的是生产模块真实 map `_deferred_web_requests_for_test`；`stop_network_capture` 清理循环直接操作该 map。注入策略合法，非 mock 被测逻辑。
  - 判别力已实证：临时 revert `network_capture.ts` 的 T103 清理循环后，AC-001/AC-002 两测试全红（`expected 1 to be 0`）；恢复后全绿。stop 未清 timer 时测试必失败。
- 总体判断：AC-001/002 各有测试且判别力实证成立，无未解决 critical/important，仅有 4 条 minor，PASS。

### AC 复验方式

- AC-001：`re_verified` —— 审查测试断言 `expect(events.length).toBe(0)` 并实证 revert 生产清理循环后测试失败，恢复后通过。
- AC-002：`re_verified` —— 同上，revert 后 `events` 得 1 致失败；另核查 `new_events` 断言虽恒真但 `events` 断言承担判别力（见 f002）。

coverage = 2 / 2

- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-11 06:25 UTC+8)

- task：`t103_network_stop_deferred_timers`
- spec：`docs/tasks/t103_network_stop_deferred_timers/spec.md`
- diff_anchor：`bc6207db0c640c1465bcc7f7dea40f572d013e1d`
- target：`git diff bc6207db0c640c1465bcc7f7dea40f572d013e1d`
- round：2
- reviewed_at：2026-08-11 06:25 UTC+8

reviewed_scope: e98db8ab474edcc4

## Findings

### t103_test_f005 - AC-002b 对 f001 路径零判别力：未武装 orphan handler、未推进 ORPHAN_TIMEOUT_MS，无论守卫存在与否测试恒绿

- 严重度：important
- 锚点：AC-002（orphan 维度）；f001 声称的回归保护
- 位置：`tests/unit/network_stop_deferred_timers.test.ts:150-187`（AC-002b）
- 问题：AC-002b 自称「f001 回归」测试，但结构上无法观测 f001 描述的跨写路径：
  1. 测试从不调用 `set_cdp_body_event_handler`，`on_cdp_body_event` 保持 null；orphan timer 即便触发也因 `network_capture.ts:803 if (!on_cdp_body_event) return` 早退，且 orphan 走 `on_cdp_body_event` 而非 `send_to_background`，测试观察的 `events`/`new_events` 数组根本收不到 orphan 写入。
  2. `vi.advanceTimersByTimeAsync(0)`（`:180`）只推进 0ms，`ORPHAN_TIMEOUT_MS=3000` 的 orphan timer 永不触发。
  3. 迟到 resolve 前 stop 已清空 `cdp_request_meta`/`cdp_body_results`，then 路径 `meta` 缺失（`:618`），不会走到 `send_to_background`，故 `events`/`new_events` 恒为 0，与守卫有无无关。
  4. `get_body_spy` 被调断言（`:172`）只证明「getResponseBody 发出了」，未证明守卫拦截了什么。
- 复验证据：含守卫的**当前源码**下，用测试同构 harness 复现（临时 `.scratch/t103_round2_repro.test.ts`，已跑后删除）：start cap1 → enable body capture → 挂起 getResponseBody → stop → `set_cdp_body_event_handler(spy)` + start cap2 → resolve → 推进 `ORPHAN_TIMEOUT_MS+10`，spy 收到 `{ request_id:'req_late', url:'', status_code:0, response_body:'late-body' }`——f001 跨写仍发生，而 AC-002b 却通过，证明该测试对 f001 无判别力。
- 建议：让 AC-002b 忠实模拟跨写——新 capture 侧 `set_cdp_body_event_handler(spy)` 武装 handler，resolve 迟到 body 后推进 `ORPHAN_TIMEOUT_MS+`，断言 spy 未收到旧请求数据（当前实现会收到，遂揭示 t103_code_f002）；修复后该测试方可守住。

## 结论

- 前轮 finding 复核（Round 2）：
  - `t103_test_f001`（minor，AC-001 死代码）：仍存在——`network_stop_deferred_timers.test.ts:93-98` 的 `attach`/`Network.enable`/`emit_request` 仍为无效设置（`emit_request` 定义 `:62-73` 未产生模块状态），未处置。
  - `t103_test_f002`（minor，AC-002 `new_events` 恒真）：仍存在——`:146` 断言在本构造下恒真，判别力由 `:147` `events` 断言承担，未处置。
  - `t103_test_f003`（minor，orphan 路径未覆盖）：仍存在——AC-001/002 只注入 deferred entry，orphan 场景仍未覆盖，未处置。本轮 f005 与 f003 同源但升级：f003 当时判 minor 依据「orphan 迟到回调有 `on_cdp_body_event=null` + map 清空双重守卫，无实际串写 bug」；本轮实测该前置判断不成立（stop→restart 后守卫失效，串写可复现），故 orphan 覆盖缺口升级为 important。
  - `t103_test_f004`（minor，未使用 import）：已消除——当前 import 块（`:37-45`）已不导入 `find_cdp_candidates`。
- 改测方向复核：无（diff 仅新增测试文件，未修改既有测试）。
- 本轮新发现：1 条（f005，important）
- 未进表的提示：无
- 总体判断：新增 AC-002b 声称覆盖 f001 回归但实际零判别力，orphan 维度 AC-002 无测试且已实测存在串写缺陷（见 code f002），存在未解决 important。
- 系统性 follow-up：无（并入本 task）

### AC 复验方式

- AC-001：`re_verified` —— 重跑 `npx vitest run tests/unit/network_stop_deferred_timers.test.ts`（3 passed）+ 全量 1215 tests passed；判别力由 Round 1 实证记录（revert 清理循环 → 红）引用。注：orphan 维度仍无测试（f003）。
- AC-002：`re_verified`（deferred 维度）——deferred timer 清理测试通过；orphan 维度未覆盖且 f005/f002 实证跨写仍可复现，AC-002 在 orphan 维度未闭环。

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
  - `t103_test_f001`（minor，AC-001 死代码）：仍存在——AC-001 仍调用 `attach`/`Network.enable`/`emit_request`（`network_stop_deferred_timers.test.ts:93-98`），这些调用未注册 `handle_cdp_event`（未走 `enable_response_body_capture`）也不设 `dbg_tab_id`，`emit_event` 空转，制造 deferred 的真实手段是注入 entry。非阻断。
  - `t103_test_f002`（minor，AC-002 `new_events` 恒真）：仍存在——AC-002 注入 timer 回调直写旧 capture 闭包 `events`，`new_events` 断言恒真，判别力由 `events` 断言承担。非阻断。
  - `t103_test_f003`（minor，orphan 路径未覆盖）：**已消除**——AC-002b 武装 `set_cdp_body_event_handler(spy)` 并推进 `4000ms`（> `ORPHAN_TIMEOUT_MS=3000`），实际覆盖 orphan timer 迟到回调路径，与本轮 f005 复核共用同一修复。
  - `t103_test_f004`（minor，未使用 import）：已消除——import 块（`:37-45`）已无 `find_cdp_candidates`。
  - `t103_test_f005`（important，AC-002b 零判别力）：**已消除**——AC-002b 重写为「stop→restart 后武装 orphan handler → 迟到 resolve → 推进 4000ms」：`set_cdp_body_event_handler((evt) => orphan_events.push(evt))`（`:177`），`resolve_body?.({...})`（`:181`），`advanceTimersByTimeAsync(4000)`（`:183`），断言 `orphan_events.length === 0`（`:186`）。突变验证：将生产守卫还原为纯布尔 `if (!is_capturing) return;` 后 `AC-002b` 红（`orphan_events` 得 1），恢复 capture_id 快照守卫后绿——判别力有效，覆盖 f001/f002 描述的跨写路径。
- 改测方向复核：无——diff 仅新增测试文件，未修改既有测试；AC-002b 为新增用例，方向是忠实模拟跨写路径（武装 handler + 推进 orphan 时长），非迁就实现。
- 本轮新发现：0 条（含 minor）
- 未进表的提示：AC-002b 的 `expect(new_events.length).toBe(0)`（`:185`）与 f002 同源——旧 body 迟到写入实际走 orphan handler（`orphan_events`）而非 cap2 `send_to_background`（`new_events`），故该断言在本构造下恒真、无判别力；真实判别力完全由紧随其后的 `orphan_events` 断言（`:186`）承担。不影响本测试判别力，属冗余断言，可在处置表标注或后续清理。
- 总体判断：f005 判别力经突变验证成立，orphan 维度 AC-002 已有真实覆盖；剩余 f001/f002/f003（minor）非阻断。无未解决 critical/important。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` —— 重跑全量 `npx vitest run`（115 files / 1215 tests passed）+ `tsc --noEmit` exit 0；判别力引用 Round 1 实证（revert 清理循环 → 红）。
- AC-002：`re_verified` —— deferred 维度：AC-002 判别力成立；orphan 维度：AC-002b 突变验证（纯布尔挡 → 红 `orphan_events=1`，capture_id 挡 → 绿），迟到回调不写新 capture 由 `orphan_events===0` 锚定。

coverage = 2 / 2

verdict: PASS
