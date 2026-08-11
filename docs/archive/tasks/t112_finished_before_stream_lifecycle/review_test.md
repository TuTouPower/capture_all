# Task review t112（reviewer_focus: 测试）

- task：`t112_finished_before_stream_lifecycle`
- spec：`docs/tasks/t112_finished_before_stream_lifecycle/spec.md`
- diff_anchor：`a424a8adaf63a5ca288f75ff5a72bb1ec9d65f6f`
- target：`git diff a424a8adaf63a5ca288f75ff5a72bb1ec9d65f6f`
- round：1
- reviewed_at：2026-08-11 11:33 UTC+8

reviewed_scope: `eb1cbed41f7b79d6`

## 审阅执行摘要

- 9 个用例全部通过：`npx vitest run tests/unit/t112_finished_before_stream_lifecycle.test.ts` → 9/9 passed。
- 用例经 `start_network_capture` + `enable_response_body_capture` + `mock_chrome_debugger.emit_event` 驱动生产 `handle_cdp_event`，mock 停在 chrome.debugger 系统边界；断言目标为生产 Set `_finished_before_stream_for_test`（spec 测试策略明示）。
- 危险模式逐条扫描：无恒真断言、无删/反转/注释断言、无 `.skip`/`.only`、无 eslint-disable/ts-ignore、无条件跳过、无阈值掩盖、无 `.fill()` 冒充交互。断言形式为 `toBe(false)` / `size === 0` / `some(streamResourceContent)`，均够强。
- 静态 + 实证发现 2 类覆盖缺陷（子 session 假覆盖、deferred/复制实现清理未触达），共 3 条 finding。

## Findings

### t112_test_f001 - AC-004 子 session 覆盖为假覆盖：child 事件被路由门静默丢弃

- 严重度：important
- 锚点：AC-004（"root target 与子 session 在连续 100 个请求后 `finished_before_stream` 为空"）+ spec 测试策略（"覆盖…root/子 session"）
- 位置：`tests/unit/t112_finished_before_stream_lifecycle.test.ts:209-222`（AC-004 it 块）；根因在 `src/extension/background/cdp_event_router.ts:34`（`should_handle_event`）
- 问题：测试向 `emit_event` 传入 `sessionId: 'child_session'`，但全文件从未注册该 session（未 emit `Target.attachedToTarget`、未调 `register_session`）。`beforeEach` 的 `stop_network_capture()` 还会执行 `clear_sessions()`。`should_handle_event` 对未注册 session 返回 false，50 个子 session 请求（requestWillBeSent/responseReceived/loadingFinished）全部在进入生产 `handle_cdp_event` 前被丢弃。实证（.scratch 复现，已删）：100 请求（50 root + 50 child）后 `Network.getResponseBody` 命令仅 50 次、`child_session` 会话命令 0 次、marker size 0——说明断言 `size === 0` 只验证了 root 的 50 个请求，子 session 路径（marker key `child_session:req_i` 的写入/清理）从未执行。即使子 session 的 marker 清理完全失效，本用例仍 PASS，属「测试存在但验证的是假行为」。对照：既有 `tests/unit/network_capture_session_key.test.ts:107-108` 在同一 mock 体系下先 `register_session(SESSION_A/B)` 再发 child 事件，是正确姿势。
- 建议：AC-004 用例在发 child 事件前经 `mock_chrome_debugger.emit_event({tabId:1}, 'Target.attachedToTarget', {sessionId:'child_session'})` 注册（贴合生产注册路径），或在 `beforeEach` 直接 `register_session('child_session')`；并可补断言子 session marker 在竞态窗口存在、终态为 0，防止该部分再变假。

### t112_test_f002 - cdp_handler 复制实现的修复无任何测试断言

- 严重度：important
- 锚点：spec 范围（"修复 `src/extension/background/cdp_handler.ts` 中同因复制实现的剩余早退路径"）+ spec 测试策略（"断言必须触达生产 `network_capture` 路径及 `cdp_handler` 复制实现"）
- 位置：`tests/unit/t112_finished_before_stream_lifecycle.test.ts:37-43`（仅 import `network_capture`）；对应未断言改动 `src/extension/background/cdp_handler.ts:357,380,496,830,842`
- 问题：本 task 在 `cdp_handler.ts` 新增/外移 5 处 `finished_before_stream.delete`（capture_response_body=false 早退、streaming 早退、loadingFailed 无 meta 分支、`try_resolve_deferred` 两处），但 t112 测试文件只驱动 `network_capture.ts` 的本地 `handle_cdp_event`；`network_capture.ts` 仅从 `cdp_handler.ts` 引入 `cdp_request_key`/超时常量/工具函数，不调用其事件处理。既有直接以 state 驱动 `cdp_handler.handle_cdp_event` 的测试（`cdp_state_cleanup.test.ts`、`cdp_response_body_config.test.ts`、`loading_failed_events.test.ts`）均未断言 `finished_before_stream` 状态：`cdp_state_cleanup` 的 100 请求断言只覆盖 with-meta 老路径（修复前已删 marker），`cdp_response_body_config`/`loading_failed_events` 只断言命令未发出与输出事件。结果：复制实现的新增清理语义（尤其 no-meta orphan 与 capture_response_body=false 无 meta 分支）零断言，行为分叉/回归无测试可捕获，违反 spec 测试策略「及 cdp_handler 复制实现」的显式要求。
- 建议：按 `cdp_state_cleanup.test.ts` 的 state 直驱模式，为 `cdp_handler.ts` 复制实现补至少两个断言：capture_response_body=false 且无 meta 的 loadingFinished 后 marker 为 0；no-meta 走 orphan 3s 后 marker 为 0。

### t112_test_f003 - AC-003「deferred 终态后均清理」无测试：try_resolve_deferred 的 marker 删除从未执行

- 严重度：important
- 锚点：AC-003（"最终输出、deferred 或 orphan 终态后均清理"）
- 位置：`tests/unit/t112_finished_before_stream_lifecycle.test.ts`（全文件无 deferred 场景）；未执行的生产删除 `src/extension/background/network_capture.ts:810,822`（`try_resolve_deferred` 两分支）
- 问题：`try_resolve_deferred` 的 marker 清理仅在存在匹配 deferred entry（`_deferred_cdp_index` 命中且 `pending_cdp_ids` 清空）时执行；9 个用例均无 webRequest 挂起条目——测试文件把 `chrome.webRequest.*` 监听注册为 no-op `vi.fn()`，不派发任何 webRequest 事件，`pending_requests`/`deferred_web_requests` 恒空。因此 loadingFinished 无 meta 后 `try_resolve_deferred` 全部命中早退（`network_capture.ts:782`），两条新增 delete 从未被任何用例执行。AC-003 明确要求 deferred 终态后清理，该子句无覆盖；若该删除未来回退，测试全绿。
- 建议：补一个用例通过 seed `_deferred_web_requests_for_test` + `_deferred_cdp_index_for_test`（或驱动 webRequest 事件流）制造 deferred 解析终态，断言 marker 清理；也可顺带覆盖 `DEFERRED_TIMEOUT_MS` 兜底路径。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（Round 1）
- 改测方向复核：无（diff 未修改任何既有测试，仅新增测试文件）
- 本轮新发现：3 条（f001/f002/f003，均 important）
- 未进表的提示：
  - `loadingFailed` 的 marker 清理（`network_capture.ts:697`、`cdp_handler.ts:496` 均本次新增）无专门断言，AC 未显式列出该场景，作可选扩展；如需补，随 f002/f003 一起覆盖即可。
  - 「orphan 早退（无 consumer）」用例名与实际 setup 略有出入：`start_capture` 恒注册 `set_cdp_body_event_handler(() => {})`，测试的是"有 consumer、无 deferred/无 meta"的 orphan 兜底（getResponseBody reject 分支）；当 `on_cdp_body_event` 为 null 时 `schedule_orphan_check` 早退且不删 marker（`network_capture.ts:831`）。该分支生产不可达（`service_worker.ts:534` 在 body capture 启动前注册 handler），建议改名或补注释说明，避免误读。
  - AC-004 用例未断言 root 子 session marker key 的具体形态（仅 `size === 0`），修复 f001 后建议同时断言 child marker 存在/消失窗口。
- 总体判断：用例质量整体良好（9/9 绿、危险模式干净、旧码回归灵敏度逐一核验成立），但 AC-004 子 session 为假覆盖、cdp_handler 复制实现与 deferred 终态两类新增清理零触达，存在 3 条未解决 important，测试尚不足以支撑 spec 验收。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 静态核对 `network_capture.ts:654` then-branch meta 删除 + 跑用例；旧码推演：删除缺失时 `has('root:req_normal')` 为 true，用例必红，复用 requestId 场景的 `streamResourceContent` 存在性断言（`:136`）亦随残留标记翻转。
- AC-002：`re_verified` — SSE 流式删除 `network_capture.ts:596`、getResponseBody reject 分支删除 `:682`，对应两个用例（`:139-158`）旧码下必红。
- AC-003：`re_verified`（deferred 子句除外）— 逆序竞态（`:160-172`）、无 metadata（`:174-184`）、orphan（`:186-197`）、capture_response_body=false（`:199-207`）四场景静态核对 + 用例全绿；deferred 子句见 f003 未触达。
- AC-004：`re_verified`（root 部分）；子 session 部分经 .scratch 实证被路由门丢弃，属测试缺陷（f001），非"复验通过"。
- 覆盖率行：`coverage = 4 / 4`（4 条均独立复验；AC-004 复验结论为子 session 假覆盖、AC-003 复验结论为 deferred 子句缺测试）

verdict: FAIL

## Round 2 (2026-08-11 11:48 UTC+8)

reviewed_scope: `168e6582c5784add`

### 前轮 finding 复核（以 diff 与代码/测试为准，不采信处置表）

- **t112_test_f001（AC-004 子 session 假覆盖）：已消除。** `register_session('child_session')`（测试 `:218`）注册后，child 事件经 `network_capture.ts:367` 路由门（`cdp_event_router.ts:34` 对已注册 session 放行）进入生产 `handle_cdp_event`；mock 在 `chrome_debugger.ts:57` 记录 `sessionId`，断言 body 命令 100 次、child 50 次（`:230-233`）。去掉 register_session → child 事件全被丢弃、`body_calls`=50 → 断言必红；child marker 清理失效 → 50 个残留 → `size === 0` 必红。非恒真、非假覆盖。
- **t112_test_f002（cdp_handler 复制实现零断言）：部分达成，残留缺口转 f004。** 新增 describe 4 用例直驱生产 `cdp_handler.handle_cdp_event`（`cdp_handler.ts:114`），覆盖 capture_response_body=false 早退（`:357`）、loadingFailed 无 meta（`:496`）、orphan 无 meta 兜底（`:849`）、orphan 已消费兜底（`:849`+早退 return）。但复制实现本次改动的其余 3 个删除点——streaming 无 meta 早退（`:380`）、`try_resolve_deferred` 完整解析（`:830`）与兜底（`:842`）——仍零断言。
- **t112_test_f003（deferred 终态未触达）：已消除。** 新用例（`:253-278`）seed 生产 module 级 Map（`_deferred_web_requests_for_test`/`_deferred_cdp_index_for_test`，结构核对与生产 `DeferredEntry` 一致：`{pending, details, timer, pending_cdp_ids}`，`pending_cdp_ids` 为 Set）；loadingFinished 无 meta → getResponseBody resolve → `try_resolve_deferred`（`network_capture.ts:659`）index 命中、`pending_cdp_ids` 清空走完整解析分支（`:803-814`）→ `:810` delete；断言 deferred entry 已消费 + marker 清 0。若 `:810` delete 回退，断言红。真触达，非复制生产逻辑。

### 改测方向复核

无。diff 未修改任何既有测试文件，仅新增 t112 测试文件；无「把断言预期改成当前实现输出」的迁就行为。

### 本轮新发现

#### t112_test_f004 - cdp_handler 复制实现 streaming 早退与 deferred 终态清理仍零断言（f002 修不彻底）

- 严重度：important
- 锚点：spec 测试策略「断言必须触达生产 `network_capture` 路径及 `cdp_handler` 复制实现」；AC-003「deferred 或 orphan 终态后均清理」（复制实现侧无覆盖）
- 位置：`tests/unit/t112_finished_before_stream_lifecycle.test.ts:281-375`（cdp_handler describe）；未触达 `src/extension/background/cdp_handler.ts:380,830,842`
- 问题：本 task 在 `cdp_handler.ts` 的清理删除点共 6 处（capture_response_body=false `:357`、streaming `:380`、loadingFailed 无 meta `:496`、try_resolve_deferred `:830`/`:842`、orphan `:849`/`:865`），新增 4 用例只覆盖 3 处。剩余 3 处零断言：① streaming 分支需 responseReceived 带 event-stream header 标记 streaming 后 loadingFinished 走 force_flush 分支（`:361-382`），现有用例 2 命名「SSE 无 metadata」实际无 responseReceived、无 streaming 标记，走的是 getResponseBody→orphan 兜底，`:380` 从未执行；② `make_state` 恒用空 `deferred_web_requests`/`_deferred_cdp_index`（`:310-311`），无任何用例 seed，`:830`/`:842` 两分支（本次核心修复点之一）从未执行。三处 delete 若回退，测试全绿，复制实现 marker 生命周期仍可能分叉，与 f002 原始关切同构。
- 建议：cdp_handler describe 补两个用例——(a) requestWillBeSent + responseReceived（`Content-Type: text/event-stream`）+ loadingFinished → 断言 streaming 早退后 `state.finished_before_stream` 无该 key；(b) `make_state` overrides 中 seed `deferred_web_requests`/`_deferred_cdp_index` 各一条后 loadingFinished 无 meta → 断言完整解析（或兜底）后 marker 清 0。

### 未进表的提示

- cdp_handler 直驱用例 1 开头 `mock_chrome_debugger.emit_event`（`:331-335`）：该 describe 的 beforeEach 已 `reset()` 清空 listeners 且未 start_network_capture，此 emit_event 无监听者、无效果，属冗余；真正驱动是后续直调 `handle_cdp_event`。建议删除以免误导，非阻断。
- 复制实现 with-meta 各分支删除（`:434`/`:459`/`:485`）系「外移」非新增语义（原代码 meta 存在时已删），network_capture 侧 AC-001/AC-002 已覆盖同语义生产路径，不要求复制实现重复断言。
- DEFERRED_TIMEOUT_MS 兜底（webRequest 侧挂起超时）未覆盖，Round 1 f003 建议的「顺带」项，可选扩展。

### 总体判断

f001/f003 已真修，f002 建议的两点已达成；但复制实现仍有 3 个本次改动删除点零断言（f004，important），测试覆盖尚不足以完全支撑 spec 对 cdp_handler 复制实现的验证要求。

### AC 复验方式（Round 2）

- AC-001：`re_verified` — 静态核对 `network_capture.ts:654`/`:596` 删除路径 + 2 用例全绿。
- AC-002：`re_verified` — SSE 与 getResponseBody reject 用例全绿。
- AC-003：`re_verified` — 逆序竞态/无 meta/orphan/capture_response_body=false/deferred 5 用例全绿；deferred 用例真触达 `try_resolve_deferred` 完整解析（index 命中 + pending 清空 + entry 消费断言）；cdp_handler 侧 deferred/streaming 清理缺口见 f004。
- AC-004：`re_verified` — 100 请求用例全绿，body 命令 100/50 断言证明子 session 事件真实路由处理，非假覆盖。
- 覆盖率行：`coverage = 4 / 4`
- 复验证据：`npx vitest run tests/unit/t112_finished_before_stream_lifecycle.test.ts` → 14/14 passed；既有相关测试 `cdp_state_cleanup` / `cdp_response_body_config` / `loading_failed_events` / `network_capture_session_key` → 13/13 passed，生产改动无回归。

verdict: FAIL

## Round 3 (2026-08-11 11:55 UTC+8)

reviewed_scope: 9c73c7a85adcb1d9

### 前轮 finding 复核（以 diff 与代码/测试为准）

- **t112_test_f001（AC-004 子 session 假覆盖）：已消除（维持）。** `register_session('child_session')`（`:218`）+ body 命令 100/50 断言（`:230-233`）仍在；本轮 16/16 全绿。
- **t112_test_f002（cdp_handler 复制实现零断言）：已消除（按 Round 2 转 f004 的处置路径复核，其余部分见 f004/f005）。**
- **t112_test_f003（deferred 终态未触达）：已消除（维持）。** network_capture 侧 deferred 用例（`:253-278`）seed 生产 module 级 Map、走 `try_resolve_deferred` 完整解析，仍在。
- **t112_test_f004（cdp_handler streaming 早退与 deferred 终态零断言）：修不彻底，`:380`/`:830` 已真修，`:842` 剩余（转 f005）。**
  - `:380`（streaming 早退删除）已覆盖：新用例「SSE streaming 完成 emit 后 marker 清理」（`:376-389`）中，responseReceived 带 `Content-Type: text/event-stream` → `is_streaming_response`（`cdp_handler.ts:752-753`）为真 → `streaming_requests.add('root:sse')`（`cdp_handler.ts:291`）；loadingFinished 命中 streaming 分支（`:361`）→ meta 存在 → emit → `:380` 同步 delete。关键证据：该用例**无任何 await / 计时器推进**——若退化为 getResponseBody 路径（`chrome.dbg.sendCommand` 微任务未 flush），marker 在断言时点仍在、用例必红；绿即证明同步走了 `:380`。
  - `:830`（try_resolve_deferred 完整解析删除）已覆盖：新用例「deferred 完整解析终态后 marker 清理」（`:391-411`）seed `deferred_web_requests`/`_deferred_cdp_index`（`pending_cdp_ids` 单元素）→ loadingFinished 无 meta → getResponseBody resolve（mock 默认 resolve undefined）→ then 分支 set body_result（`:419`）→ `try_resolve_deferred` index 命中、pending 清空走完整解析（`:823-834`）→ `:830` delete。该 flow 内无其他删除点（orphan timer 3000ms 未触发），`:830` 回退则断言红。真触达。
  - `:842`（try_resolve_deferred 兜底分支）仍零断言：见 f005。

### 改测方向复核

无。14→16 用例仅新增（cdp_handler describe 原 4 用例内容与行号同 Round 2 报告逐一比对一致），无修改既有断言预期的迁就行为。

### 本轮新发现

#### t112_test_f005 - try_resolve_deferred 兜底分支删除点（cdp_handler:842 / network_capture:819）仍零断言（f004 剩余）

- 严重度：important
- 锚点：spec 测试策略「断言必须触达生产 `network_capture` 路径及 `cdp_handler` 复制实现」；AC-003 marker 生命周期泄漏类防护（CDP 侧候选被丢弃时残留 marker 会改变同 session 同 requestId 复用行为，AC-001/AC-002 语义）
- 位置：`tests/unit/t112_finished_before_stream_lifecycle.test.ts:391-411`（新 deferred 用例仅覆盖完整解析分支）；未触达 `src/extension/background/cdp_handler.ts:838-842` 与 `src/extension/background/network_capture.ts:815-819`
- 问题：`try_resolve_deferred` 兜底分支（index 命中、body_result 存在、但删掉本 CDP 候选后**无任何 entry 的 pending_cdp_ids 清空**）中，本 task diff 新增的 `finished_before_stream.delete(cdp_req_key)`（`cdp_handler.ts:842`、`network_capture.ts:819`）无任何用例可达。两个 deferred 用例都 seed 单候选 `pending_cdp_ids`（删后必空）→ 只走完整解析分支；兜底分支需 entry 的 `pending_cdp_ids` 含 ≥2 个候选才执行。若该删除回退，CDP 侧被丢弃候选的 marker 残留，测试全绿。task.md 处置表 f004 行自称「覆盖 :380/:830/:842 删除点」，与代码事实不符——`:842` 未被任何用例触达。
- 建议：cdp_handler describe 补一用例：seed 单 deferred entry `pending_cdp_ids = new Set(['root:req_a','root:req_b'])`、`_deferred_cdp_index` 同时注册两 key → `loadingFinished('req_a')` 无 meta → getResponseBody resolve → 兜底分支 → 断言 `finished_before_stream.has('root:req_a')` 为 false 且 entry 未被消费（`deferred_web_requests.has('dk')` 为 true、`pending_cdp_ids` 仍含 `root:req_b`）；network_capture 侧同构补一例覆盖 `:819`。

### 未进表的提示

- cdp_handler describe 用例 1 开头的冗余 `mock_chrome_debugger.emit_event`（`:331-335`，Round 2 已提示）仍在，无监听者、无效果，建议删除，非阻断。
- streaming 用例无「loadingFinished 后 marker 先存在」的正向断言：若 production 移除 `streaming_requests.add`，用例会退化为 getResponseBody 路径仍绿（不再触达 `:380`）。可加 `expect(state.finished_before_stream.has('root:sse')).toBe(true)` 加固，属可选增强，非阻断。

### 总体判断

f001/f003 维持消除，f004 的 `:380`/`:830` 两删除点确认真修（含无 await 的时序判别证据），但 `:842` 兜底分支（连同 network_capture 复制 `:819`）仍零断言，f004 修不彻底，存在 1 条未解决 important（f005），测试尚不足以完全支撑 spec 对 marker 生命周期全覆盖的验证要求。

### AC 复验方式（Round 3）

- AC-001：`re_verified` — 静态核对 `network_capture.ts:654`/`:596` 删除路径 + 2 用例（`:113-143`）全绿。
- AC-002：`re_verified` — SSE 与 getResponseBody reject 用例（`:145-164`）全绿。
- AC-003：`re_verified` — 逆序竞态/无 meta/orphan/capture_response_body=false/deferred 完整解析（主实现与复制实现两侧）用例全绿；deferred 兜底分支（`cdp_handler:842`、`network_capture:819`）零断言见 f005。
- AC-004：`re_verified` — 100 请求用例（`:215-234`）全绿，body 命令 100/50 断言在。
- 覆盖率行：`coverage = 4 / 4`
- 复验证据：`npx vitest run tests/unit/t112_finished_before_stream_lifecycle.test.ts` → 16/16 passed；既有相关测试 4 套件 → 13/13 passed，无回归；指纹 `9c73c7a85adcb1d9` 与 `check_review_status.py` / `render_review_prompts.py` 双口径一致。

verdict: FAIL

## Round 4 (2026-08-11 12:02 UTC+8)

reviewed_scope: 05bf00c591a5f8b6

### 前轮 finding 复核（以 diff 与代码/测试为准，不采信处置表）

- **t112_test_f001（AC-004 子 session 假覆盖）：已消除（维持）。** `register_session('child_session')`（`:218`）+ body 命令 100/50 断言（`:230-233`）仍在，本轮 17/17 全绿。
- **t112_test_f002（cdp_handler 复制实现零断言）：已消除（维持）。** cdp_handler describe 6 用例仍在，覆盖 capture_response_body=false / orphan / loadingFailed / streaming / deferred 完整解析。
- **t112_test_f003（deferred 终态未触达）：已消除（维持）。** network_capture 侧 deferred 完整解析用例（`:253-278`）仍在。
- **t112_test_f004（cdp_handler streaming 与 deferred 零断言）：已消除（维持）。** `:380`（streaming 用例 `:376-389`）与 `:830`（完整解析用例 `:391-411`）覆盖仍在；`:842` 剩余部分本轮新用例补齐，见 f005 复核。
- **t112_test_f005（try_resolve_deferred 兜底分支零断言）：修不彻底，cdp_handler 侧已修，network_capture 侧剩余（转 f006）。**
  - cdp_handler 侧已修：新用例「deferred 多候选兜底分支终态后 marker 清理」（`:413-436`）seed entry `pending_cdp_ids = new Set(['root:req_ma','root:req_mb'])`、`_deferred_cdp_index` 注册 `root:req_ma` → `loadingFinished('req_ma')` 无 meta → getResponseBody resolve（mock 默认 resolve undefined，`chrome_debugger.ts:72`）→ `try_resolve_deferred`（`cdp_handler.ts:800`）index 命中、for 循环 `pending_cdp_ids.delete('root:req_ma')` 后仍有 `root:req_mb` → 不落完整解析（`:823`），走兜底 `:838-843` → `:842` delete。静态 trace 全链路成立（marker 于 `:335` 写入、`:842` 为唯一删除点、orphan 3s timer 未推进）。
  - 断言足够区分：① `finished_before_stream.has('root:req_ma')` false——若 `:842` delete 回退，marker 残留（timer 3000ms 未触发无旁路清理）→ 必红；② `deferred_web_requests.has('dk_m')` true——若落入完整解析分支，entry 于 `:826` 被删 → 必红；若 index 未命中早退（`:802`），marker 残留 → 必红。真触达、非恒真、非复制生产逻辑。
  - 缺项：`network_capture.ts:822`（f005 原报告点名两处之一，且为**生产主路径**）仍无任何用例可达——见 f006。处置表 f005 行自称「覆盖 cdp_handler:842 与 network_capture:819 兜底删除点」，后半句与代码事实不符（本轮 17 用例 + 全仓既有测试均不触达 network_capture 兜底分支）。

### 改测方向复核

无。本轮 diff 仅新增 1 用例（`:413-436`）与 task.md 处置表更新，未修改任何既有断言，无「迁就实现」行为。

### 本轮新发现

#### t112_test_f006 - network_capture 生产主路径 try_resolve_deferred 兜底分支删除点（:822）仍零断言（f005 修不彻底）

- 严重度：important
- 锚点：spec 测试策略「断言必须触达生产 `network_capture` 路径及 `cdp_handler` 复制实现」；AC-003「最终输出、deferred 或 orphan 终态后均清理」（生产路径 deferred 兜底终态未验证）
- 位置：`tests/unit/t112_finished_before_stream_lifecycle.test.ts:237-279`（network_capture deferred describe 仅单候选完整解析 `:810`）；未触达 `src/extension/background/network_capture.ts:818-822`（兜底分支 `finished_before_stream.delete` 在 `:822`）
- 问题：f005 原报告同时点名 `cdp_handler.ts:842` 与 `network_capture.ts:819` 两个兜底删除点，本轮只补了 cdp_handler 侧。network_capture 是**生产主路径**（`service_worker.ts:466` 经 `start_network_capture` 启用；`network_capture.ts:231` 将 `handle_cdp_event` 注册到 `chrome.dbg.onEvent`），其 `try_resolve_deferred` 兜底分支（index 命中、body_result 存在、for 循环后无 entry 的 `pending_cdp_ids` 清空）全仓无任何用例可达：`_try_resolve_deferred_for_test` 仅两处调用（`network_capture.test.ts:530` index 未命中早退 `:782`、`:549` 无 body_result 早退 `:785-788`），均不落兜底；t112 的 network_capture deferred 用例只 seed 单候选走完整解析；`loading_failed_events` / `network_stop_deferred_timers` 用例亦不触达。若 `network_capture.ts:822` 的 delete 回退，被丢弃 CDP 候选的 marker 残留（同 session 同 requestId 复用将改变 SSE/body 行为，AC-001/AC-002 语义），测试全绿——与 f005 原始关切同构，且发生在生产路径上。处置表 f005 行对 network_capture 侧的「已修」claim 与代码事实不符。
- 建议：t112 的 network_capture deferred describe 补同构用例：seed `_deferred_web_requests_for_test` entry `pending_cdp_ids = new Set(['root:req_a','root:req_b'])`、`_deferred_cdp_index_for_test` 注册 `root:req_a` → `send_loading_finished('req_a')` 无 meta → getResponseBody resolve → 兜底分支，断言 `_finished_before_stream_for_test.has('root:req_a')` false 且 `_deferred_web_requests_for_test.has('dk')` true（marker 清理 + entry 保留）。

### 未进表的提示

- 新 cdp_handler 兜底用例未断言 `pending_cdp_ids` 仍含 `root:req_mb`（f005 建议的第三项）。entry 保留断言已足以区分兜底与完整解析分支，pending 内容断言属加固；若补，建议连同 f006 一并加上。
- cdp_handler describe 用例 1 开头冗余 `mock_chrome_debugger.emit_event`（`:331-335`，Round 2/3 已提示）仍在，本轮 diff 未涉及，无监听者、无效果，建议删除，非阻断。
- 用例总数 17（前轮 16 + 新增 1），命名与场景描述一致，无新增危险模式命中。

### 总体判断

f001/f002/f003/f004 维持消除，f005 的 cdp_handler 侧（`:842` 兜底删除点）确认真修且断言够强（marker 清理 + entry 保留，双断言均可区分分支），但 f005 另一落点——生产主路径 `network_capture.ts:822` 兜底删除点——仍零断言且处置表 claim 失实，f005 修不彻底，存在 1 条未解决 important（f006），测试尚不足以完全支撑 spec 对两条实现路径 marker 生命周期的验证要求。

### AC 复验方式（Round 4）

- AC-001：`re_verified` — 用例（`:113-143`）全绿；`network_capture.ts:564-567`/`:610-614` 删除路径静态核对。
- AC-002：`re_verified` — SSE 与 getResponseBody reject 用例（`:145-164`）全绿。
- AC-003：`re_verified` — 逆序竞态/无 meta/orphan/capture_response_body=false/deferred 完整解析（主实现与复制实现两侧）全绿；deferred 兜底：cdp_handler 侧新用例（`:413-436`）真触达 `:842`（静态 trace + 断言区分度核验），network_capture 生产路径兜底 `:822` 仍零断言见 f006。
- AC-004：`re_verified` — 100 请求用例（`:215-234`）全绿，body 命令 100/50 断言在。
- 覆盖率行：`coverage = 4 / 4`（AC-003 复验结论含 f006 缺口）
- 复验证据：`npx vitest run tests/unit/t112_finished_before_stream_lifecycle.test.ts` → 17/17 passed；既有相关 6 套件（cdp_state_cleanup / cdp_response_body_config / loading_failed_events / network_capture_session_key / network_capture / network_stop_deferred_timers）→ 109/109 passed，无回归；指纹 `05bf00c591a5f8b6` 与 prompt 注入一致。

verdict: FAIL

## Round 5 (2026-08-11 12:07 UTC+8)

reviewed_scope: 13b80fcc3619633f

### 前轮 finding 复核（以 diff 与代码/测试为准，不采信处置表）

- **t112_test_f001（AC-004 子 session 假覆盖）：已消除（维持）。** `register_session('child_session')`（`:218`）+ body 命令 100/50 断言（`:230-233`）仍在，本轮 18/18 全绿。
- **t112_test_f002（cdp_handler 复制实现零断言）：已消除（维持）。** cdp_handler describe 6 用例仍在，覆盖 capture_response_body=false / orphan / loadingFailed / streaming / deferred 完整解析与兜底。
- **t112_test_f003（deferred 终态未触达）：已消除（维持）。** network_capture 侧 deferred 完整解析用例（`:253-278`）seed 生产 module 级 Map、走 `try_resolve_deferred` 完整解析 `:810`，仍在。
- **t112_test_f004（cdp_handler streaming 与 deferred 零断言）：已消除（维持）。** `:380`（streaming 用例 `:404-417`）与 `:830`（完整解析用例 `:419-439`）覆盖仍在。
- **t112_test_f005（try_resolve_deferred 兜底分支零断言）：已消除。** cdp_handler 侧兜底用例（`:441-464`）触达 `cdp_handler.ts:842` 维持；network_capture 侧落点（`network_capture.ts:819`→现 `:822`）由本轮新增用例补齐，见 f006 复核。
- **t112_test_f006（network_capture 生产主路径兜底删除点 :822 零断言）：已消除。** 新增用例「AC-003 deferred 多候选兜底分支后 marker 清理（生产 network_capture）」（`:280-306`）：
  - **真触达 `network_capture.ts:822`（静态 trace 全链路成立）**：seed `_deferred_web_requests_for_test` entry `pending_cdp_ids = Set(['root:req_mb1','root:req_mb2'])`、`_deferred_cdp_index_for_test` 注册 `root:req_mb1`（`:287-297`）→ `send_loading_finished('req_mb1')` 无 meta（无 requestWillBeSent）→ `:542` marker add → `capture_response_body` true 跳过 `:547` 分支 → 非 streaming 跳过 `:568` → `Network.getResponseBody` resolve（mock 默认 `{body:'{}'}`）→ then 回调 `:606` → 无 meta 落 `:659` `try_resolve_deferred('root:req_mb1')` → index 命中、body_result 存在 → for 循环 `pending_cdp_ids.delete('root:req_mb1')` 后 size 仍 1 ≠ 0 → 不落完整解析 `:803-814`，走兜底 `:818-822` → `:822` delete。全链唯一删除点；orphan 3s timer 未推进（仅 `advanceTimersByTimeAsync(0)`）无旁路清理。
  - **断言够强（marker 清理 + entry 保留，双断言区分三分支）**：`:303` `expect(_finished_before_stream_for_test.has(cdp_a)).toBe(false)`——若 `:822` delete 回退，marker 残留必红；`:305` `expect(_deferred_web_requests_for_test.has('dk_m')).toBe(true)`——若误落完整解析分支（`:806` entry 被删）必红，若 index 未命中早退（`:782`，marker 残留）必红。非恒真、非弱化、非复制生产逻辑。
  - 处置表 f006 行 status=已修 与代码事实一致（本轮核实通过，无 f005 式 claim 失实）。

### 改测方向复核

无。本轮 diff 仅新增 1 用例（`:280-306`）与 task.md 处置表更新，未修改任何既有断言预期，无「迁就实现」行为。

### 本轮新发现

0 条。危险模式逐条扫描新增用例：无恒真断言、无弱化断言、无条件跳过、无 `.skip`/`.only`、无 ts-ignore、无阈值掩盖、无 mock 误用（seed 生产 module 级 Map 系 spec 测试策略认可的既有模式）；生产代码自 anchor 无新增改动。

### 未进表的提示

- cdp_handler describe 用例 1 开头冗余 `mock_chrome_debugger.emit_event`（`:359-363`，Round 2/3/4 已提示）仍在，本轮未涉及，无监听者、无效果，建议删除，非阻断。
- 新用例未断言 `pending_cdp_ids` 仍含 `root:req_mb2`（f006 建议第三项，可选加固）；entry 保留断言已足以区分兜底与完整解析分支。
- `network_capture.ts:697`（loadingFailed 无 meta 删除）仍无 network_capture 侧专门用例；Round 1 已列为可选扩展，AC 未显式列该场景，cdp_handler 侧同语义已有断言，非新问题。

### 总体判断

f001-f005 维持消除，f006 已真修且断言够强（marker 清理 + entry 保留，负向敏感性核验成立）；无未解决 critical / important，无新问题，测试覆盖已完整支撑 spec 对两条实现路径 marker 生命周期的验收要求。

### AC 复验方式（Round 5）

- AC-001：`re_verified` — 用例（`:113-143`）全绿；`network_capture.ts:564-567`/`:610-614` 删除路径静态核对。
- AC-002：`re_verified` — SSE 与 getResponseBody reject 用例（`:145-164`）全绿。
- AC-003：`re_verified` — 逆序竞态/无 meta/orphan/capture_response_body=false/deferred 完整解析与兜底（主实现 `:810`/`:822` 与复制实现 `:830`/`:842` 两侧）用例全绿；新增用例真触达 `network_capture.ts:822`（静态 trace 全链路 + 负向敏感性推演成立）。
- AC-004：`re_verified` — 100 请求用例（`:215-234`）全绿，body 命令 100/50 断言在。
- 覆盖率行：`coverage = 4 / 4`
- 复验证据：`npx vitest run tests/unit/t112_finished_before_stream_lifecycle.test.ts` → 18/18 passed（前轮 17 + 新增 1）；既有相关 6 套件 → 109/109 passed，无回归；指纹 `13b80fcc3619633f` 与 prompt 注入一致（重算比对通过）。

verdict: PASS
