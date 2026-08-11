# Task review t101（reviewer_focus: 代码）

- task：`t101_bridge_cdp_idle_and_bounds`
- spec：`docs/tasks/t101_bridge_cdp_idle_and_bounds/spec.md`
- diff_anchor：`146b0de9b400daa17ffd75a5a91dcbbb268a9620`
- target：`git diff 146b0de9b400daa17ffd75a5a91dcbbb268a9620`
- round：1
- reviewed_at：2026-08-11 05:30 UTC+8
- reviewed_scope: a1c98be43dd7ab00

## Findings

### t101_code_f001 - WebSocket 建立无超时，AC-003「CDP 连接永不响应」分支未实现

- 严重度：important
- 锚点：AC-003（模拟 /json/list **或 CDP 连接**永不响应时，detect/start 在超时后返回失败结果）；范围「对 CDP HTTP/WebSocket 建立与 /json/list 设超时」
- 位置：`src/bridge/cdp_handler.ts:190`（`new WebSocket(target.webSocketDebuggerUrl)`），start 在 `:354` 立即返回 ok:true
- 问题：scope 明确要求对「WebSocket 建立」设超时。当前实现只对 `/json/list` 的 fetch 加 AbortController 超时（detect 的 list fetch、start 的 list fetch），`new WebSocket(...)` 无任何超时/abort 机制。若 target 的 `webSocketDebuggerUrl` 永不响应（既无 onopen 也无 onerror/onclose），start 已同步返回 `{ok:true}`，调用方拿不到失败结果；会话残留于 map，`connect_error` 保持 null，直到 5 分钟 idle TTL 才被 destroy。AC-003 用「或」并列两个失败场景（/json/list、CDP 连接），当前只覆盖前者；「CDP 连接永不响应 → start 在超时后返回失败结果」未满足。
- 建议：为 WS 建立加 connect-timeout（如复用 `CDP_DETECT_TIMEOUT_MS`，用带超时的 connect Promise，超时 reject 后置 `connect_error` 并返回 `cdp_start_failed`），或让 start 等待 WS onopen/超时二选一的竞速结果再决定返回 ok/fail。

### t101_code_f002 - push_bounded 丢最旧无日志/指标记录

- 严重度：minor
- 锚点：范围「超限不 OOM（可丢最旧并记日志/指标）」
- 位置：`src/bridge/cdp_handler.ts:51-56`
- 问题：`push_bounded` 超上限时 `splice(0, len - MAX)` 静默丢最旧，无日志亦无指标。范围句将「记日志/指标」列为淘汰策略的组成部分；当前行为仅满足「可丢最旧」一半。桥模块全局无 logging 基础设施，但至少可在 splice 分支记录一条可观测信号（console/事件计数）。
- 建议：splice 分支补一条计数或日志（注意项目「库/服务路径禁止 print」约定，优先指标计数或结构化日志）。

### t101_code_f003 - MAX_SESSION_EVENTS 不可注入，「测试设小 cap」无法实现

- 严重度：minor
- 锚点：AC-002「写入超过上限条数的 events（测试设小 cap）」；风险「默认值写进常量并可测」
- 位置：`src/bridge/cdp_handler.ts:48`
- 问题：`MAX_SESSION_EVENTS = 5000` 为模块级 const，不可覆盖/注入。AC-002 明确要求测试「设小 cap」验证 bounded-drop 路径，但当前实现无法在小 cap 下单测触达 splice 分支（现测试灌 250 条 << 5000，bounded 分支实际未被测试执行）。「可测」要求未落实。
- 建议：将上限改为可注入（如模块级 `let` 供测试覆写，或经 start 配置参数传入），使 AC-002 能以小 cap 真实验证淘汰路径。

## 结论

- 前轮 finding 复核（Round 1）：无前轮。
- 本轮新发现：3 条（1 important + 2 minor）。
- 未进表的提示：
  - 文件过大（降级规则，不进表）：`src/bridge/cdp_handler.ts` 418 行（≥400 minor 阈值），本 task 净增 ~51 行；`tests/unit/cdp_session_idle_bounds.test.ts` 125 行（未超阈值）。
  - 复杂度：各函数 CC 均 < 10，无提示。
  - 范围外观察：
    - `handle_cdp_detect`/`start` 的 AbortController 在 `await fetch` 返回后立即 `clearTimeout`，随后 `res.json()` 若 body 流停滞将无超时保护（headers 已收、信号已清）。对 CDP /json/list 小 body 场景风险极低，属边界健壮性观察。
    - touch 与 destroy 竞态：JS 单线程下 touch_session 同步清旧 timer 再重排，timer 回调不会与 touch 交错；destroy 后迟到的 onmessage 会对已出 map 的 session 重排一个悬空 timer（5 分钟后空跑），不复活 session、不崩溃，可忽略。
    - 测试层观察（供 test reviewer）：AC-002 测试只灌 250 条 events，未超过 MAX_SESSION_EVENTS=5000，bounded-drop 路径未被测试真正执行；AC-001 两用例在旧固定墙钟下会失败、新代码下通过，判定有意义。根因见 f003。

### AC 复验方式

- AC-001：`re_verified`。读 `touch_session`（cdp_handler.ts:69-79）与 onmessage 活动刷新，确认每次 CDP 消息重置 `last_activity` 并重排 idle timer；实跑 `npx vitest run tests/unit/cdp_session_idle_bounds.test.ts` 5 用例全过，AC-001/AC-001b 分别覆盖「活动刷新存活」与「idle 超 TTL 销毁 404」。
- AC-002：`re_verified`（实现层）。`push_bounded`（cdp_handler.ts:51-56）在 `length > 5000` 时 splice 丢最旧，进程不因无界增长失败；但测试未触达上限分支（见 f003），淘汰路径未真正被执行过。证据为代码阅读 + 测试运行。
- AC-003：`re_verified`（部分）。detect 与 start 的 `/json/list` 挂起超时用例（AC-003/AC-003b）实跑通过，超时后返回 ok:false；「CDP 连接永不响应」分支未实现（f001），start 返回 ok:true 无超时。证据为测试运行 + 代码阅读。

coverage = re_verified 3 / 3（AC-002 淘汰分支、AC-003 WS 分支为部分复验，见上）。

- 总体判断：核心 idle TTL 语义与 /json/list 超时正确实现、测试通过，但 AC-003 的 WebSocket 建立超时分支缺失（important），本 task 在修复前不可信。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-11 05:36 UTC+8)

reviewed_scope: 38441e23d1bf89f4

### 前轮 finding 复核

- t101_code_f001（important）：已消除。`handle_cdp_start` 现以 `ws_connected` Promise 将 WS onopen 与 `CDP_DETECT_TIMEOUT_MS`(3000ms) 超时竞速（cdp_handler.ts:202-225）；超时 resolve(false) 后 `sessions.delete(session_key)` 并返回 `cdp_start_failed`。AC-003c 测试（WS 永不 onopen，advance 4000ms）实跑通过，断言 ok:false。AC-003「CDP 连接永不响应 → start 超时返回失败、Promise 有限时间 settle」已满足。
- t101_code_f002（minor）：已消除。`push_bounded` splice 分支现递增 `_eviction_count.value`（cdp_handler.ts:62），AC-002 测试断言该计数 > 0。范围句「可丢最旧并记日志/指标」的指标部分已落实。
- t101_code_f003（minor）：已消除。`MAX_SESSION_EVENTS` 改为模块级 `let _max_session_events` 并导出 `_set_max_session_events_for_test(cap)` 钩子（cdp_handler.ts:50-53），AC-002 测试以 cap=10 真实触达淘汰分支（见 test reviewer 复核）。

### 本轮新发现

### t101_code_f004 - WS 建立失败/超时路径未关闭 socket，迟到 onopen 会留下孤儿 CDP 连接

- 严重度：minor
- 锚点：行为缺陷 + 资源泄漏。AC-003 已满足（超时返回失败），本项是失败路径的资源清理缺口，不阻断。
- 位置：`src/bridge/cdp_handler.ts:202-225`
- 问题：`ws_connected` 竞速中，超时分支 `setTimeout(() => resolve(false), CDP_DETECT_TIMEOUT_MS)` 只 resolve，未 `ws.close()` 也未摘除 onopen/onerror/onclose 处理器。若底层 WS 在 3s 后才完成握手（慢握手），迟到的 `ws.onopen` 仍会执行 `session.cdp_ws = ws`、`ws.send(Network.enable)` 并 `resolve(true)`（no-op），产生一个不再被任何 map 追踪、无人关闭的孤儿 socket，并向 target 发出多余的 Network.enable。AC-003c 的「永不响应」场景下 socket 一直处于 CONNECTING，同样被桥端持有直至浏览器侧超时。对半开端口重复重试 start 会累积这类连接。
- 建议：超时分支 `try { ws.close() } catch {}` 并在 resolve 后置空/解绑三个 handler；或在 `!ws_connected` 分支统一销毁 ws。

### t101_code_f005 - 非超时类 WS 失败返回「connect timeout」误导性消息

- 严重度：minor
- 锚点：行为缺陷（错误消息准确性）。onerror/onclose 与超时共用同一失败返回，消息固定写「timeout」。
- 位置：`src/bridge/cdp_handler.ts:222-225`
- 问题：`ws.onerror`（如连接被拒）或 `ws.onclose` 触发时 `ws_connected` resolve false，返回体消息为 `CDP WebSocket connect timeout on port ${port}`。此时并非超时；`session.connect_error` 已记录真实原因（'WebSocket error'/'WebSocket closed'）但未反映到返回体。扩展侧据此排查会误判为超时。
- 建议：失败返回区分原因——超时分支用 timeout 文案，onerror/onclose 分支带出 `connect_error` 或改用「connect failed」。

### 结论

- 前轮 finding 复核：f001/f002/f003 均已按 diff 核实消除（见上）。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
  - 文件过大（降级规则，不进表）：`src/bridge/cdp_handler.ts` 435 行（≥400 minor 阈值），本 task 净增 +53 行，未达 800 important 阈值；`tests/unit/cdp_session_idle_bounds.test.ts` 148 行未超阈值。
  - 复杂度：各函数 CC 均 < 10，无提示。
  - 范围外观察：
    - 连接成功后的中途 WS 关闭：connect-phase 的 onclose 处理器仍挂着（未被后续覆盖），会设 `connect_error` 但不再置 `cdp_ws = null`（旧代码会置 null）。`destroy_session` 对已关闭 socket 调 `close()` 为 no-op、不崩溃；session 仍由 idle TTL 兜底销毁。可观测影响可忽略，属一致性观察。
    - `connect_error` 字段全程只写不读（T062 遗留），本 task 未扩大。
    - AC-001 测试残留一行 `console.log`（cdp_session_idle_bounds.test.ts:61），已交测试 reviewer。
- 总体判断：Round 1 的 important（f001）与两个 minor（f002/f003）均已真修；本轮仅 2 条 minor 清理项，无未解决 critical/important。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。读 `touch_session`（cdp_handler.ts:77-87）与 onmessage 首行 `touch_session(session)`（:230）确认每次 CDP 消息重置 last_activity 并重排 idle timer；实跑 cdp_session_idle_bounds.test.ts AC-001/AC-001b——AC-001 活动续期后 T0+6min 轮询仍 200 且 events ≥ 1、AC-001b 无活动 T0+6min 轮询 404。
- AC-002：`re_verified`。`push_bounded`（:58-64）在 `length > _max_session_events` 时 splice 丢最旧并递增 `_eviction_count`；AC-002 测试经 `_set_max_session_events_for_test(10)` 灌 30 事件实跑通过，断言 length ≤ 10、r0 丢弃、计数递增。若 push_bounded 退化为无界 push，三条断言均红。
- AC-003：`re_verified`。detect/start 的 /json/list AbortController 超时（:100-111、:154-158）与 WS 建立 onopen/超时竞速（:202-225）均实现；AC-003/AC-003b/AC-003c 三用例实跑通过，均在 advance 后有限时间返回 ok:false。

coverage = re_verified 3 / 3

verdict: PASS

## Round 3 (2026-08-11 05:41 UTC+8)

reviewed_scope: 2ed43ce5596990e7

### 前轮 finding 复核

- t101_code_f004（minor）：已消除。超时分支现先 `try { ws.close() } catch {}` 再 `resolve('timeout')`（cdp_handler.ts:203-207）。对 CONNECTING 态 socket 调 `close()` 中止握手，迟到的 `onopen` 不再可能执行（`session.cdp_ws = ws` + `Network.enable` 的孤儿连接路径已封堵）；onerror/onclose 分支下 socket 已处 failed/closed 态，无孤儿风险，无需再 close。AC-003c 用例（WS 永不 onopen）实跑通过，超时后返回 ok:false。
- t101_code_f005（minor）：已消除。`ws_connect` 改为 `'ok' | 'timeout' | 'failed'` 三态（cdp_handler.ts:202-225）；失败返回按态区分文案——timeout 用 `CDP WebSocket connect timeout on port ${port}`，onerror/onclose 用 `CDP WebSocket connect failed on port ${port} (${session.connect_error})`（:229-232）。`connect_error` 分别记录 'WebSocket error'/'WebSocket closed'（:217、:222），非超时失败不再误报 timeout。
- t101_test_f002（minor）：已消除。cdp_session_idle_bounds.test.ts 全文无 `console.log`（原残留行现为注释，:61），残留调试输出已删。

### 本轮新发现

无。

## 结论

- 前轮 finding 复核：f004/f005/f002 均已按 diff 核实消除（见上）。
- 本轮新发现：0 条。
- 未进表的提示：
  - 文件过大（降级规则，不进表）：`src/bridge/cdp_handler.ts` 443 行（≥400 minor 阈值），本 task 净增 +61 行，未达 800 important 阈值；`tests/unit/cdp_session_idle_bounds.test.ts` 147 行未超阈值。
  - 复杂度：各函数 CC 均 < 10，无提示。
  - 范围外观察：
    - onopen 内 `ws.send(Network.enable)` 若抛异常，`resolve('ok')` 被跳过且 timeout 已 clear，`ws_connect` Promise 永不 settle → start 挂起。仅当 send 对 OPEN 态 socket 抛错才触发；ws/undici 在 OPEN 态 send 不抛，属理论边界，非可观测缺陷，不阻断。
    - 连接成功后的中途 WS 关闭仍走 connect-phase onclose（未覆盖），设 `connect_error` 但不清理 session，由 idle TTL 兜底销毁；Round 2 已记录，本 task 未扩大。
- 总体判断：Round 2 三条 minor（f004/f005/f002）均已真修，无未解决 critical/important，无新 blocker。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。`touch_session`（cdp_handler.ts:77-87）在 onmessage 首行调用（:238），每次 CDP 消息重置 last_activity 并重排 idle timer；实跑 AC-001/AC-001b——活动续期后 T0+6min 轮询 200 且 events ≥ 1，无活动 T0+6min 轮询 404。
- AC-002：`re_verified`。`push_bounded`（:58-64）超上限 splice 丢最旧并递增 `_eviction_count`；AC-002 测试经 `_set_max_session_events_for_test(10)` 灌 30 事件实跑通过，断言 length ≤ 10、r0 丢弃、计数递增。
- AC-003：`re_verified`。detect/start 的 /json/list AbortController 超时（:100-111、:155-158）与 WS 建立 onopen/超时竞速（:202-225）均实现；AC-003/AC-003b/AC-003c 三用例实跑通过，均在有限时间返回 ok:false。

coverage = re_verified 3 / 3

verdict: PASS
