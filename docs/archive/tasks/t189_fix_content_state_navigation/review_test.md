# Task review t189（reviewer_focus: 测试）

- task：`t189_fix_content_state_navigation`
- spec：`docs/tasks/t189_fix_content_state_navigation/spec.md`
- diff_anchor：`6ece61a4dbb8d8290788273643cc29cfe4fd6f0b`
- target：`git diff 6ece61a4dbb8d8290788273643cc29cfe4fd6f0b`
- round：1
- reviewed_at：2026-08-14 00:40 UTC+8

## Findings

### t189_test_f001 - AC-004 行为可测却用源码扫描（弱于项目既有 eval 行为测试模式）

- 严重度：minor
- 锚点：AC-004（`fetch(new Request('/api',{method:'POST'}))` fallback 记录 method 为 POST）覆盖存在但验证强度低于可行方案
- 位置：`tests/unit/content_state_navigation_fixes.test.ts:89-94`（断言 92-93）
- 问题：AC-004 是运行时行为（fetch Request method 解析）。项目已有行为级先例：`tests/unit/network_hook_gate_behavior.test.ts:198-199`（`eval(build_page_script(...))` + FakeXHR 驱动真实页脚本，L3 用例）与 M7/L8（对生成的页脚本字符串断言）。本测试仅对 `network_hook.ts` 源码断言两行存在（`input instanceof Request ? input.method : null`、`var method = (init && init.method)`）。若 `typeof input !== 'string'` 守卫、`||` 优先级等回归，源码扫描仍可能 PASS。非假覆盖（回退修复会删掉这两行、测试会红），但属"可做行为测试却退到静态断言"。
- 建议：按既有 eval 模式补行为测试——jsdom 下先 stub `window.fetch`（jsdom 无 fetch），`eval(build_page_script(...))` 后执行 `fetch(new Request('https://example.com/api', { method: 'POST' }))`（相对 URL 在 jsdom/undici 抛错，用绝对 URL；method 解析逻辑相同），断言上报 method=POST。

### t189_test_f002 - AC-006 缺 blur 用例与 normal-lane 路径

- 严重度：minor
- 锚点：AC-006 列 pointercancel/lostpointercapture/blur 三种结束路径，测试仅覆盖前两者且仅 marker 路径
- 位置：`tests/unit/dashboard_timeline_marker.test.ts:351-374`
- 问题：测试覆盖 marker 拖拽的 pointercancel + lostpointercapture（真实 DOM 事件，断言 `get_tl_dragging()` 状态门控，可信）。未覆盖：blur 结束路径；normal-lane 路径的 `finish_lane`（`dashboard_detail.ts:738-744` 同样注册四事件，行为未验证）；"恢复详情刷新"仅经 `_tl_dragging` 门控断言，未验证轮询恢复渲染本身。属"可以再加 case"类，非假覆盖。
- 建议：补 blur 用例（`window.dispatchEvent(new Event('blur'))` 后 `get_tl_dragging()` false）与 normal-lane pointercancel 用例。

### t189_test_f003 - AC-001 stop 还原断言为存在性（不能区分函数定义与调用点）

- 严重度：minor
- 锚点：非 AC 行为（restore-on-stop 属 spec「风险与回退」），弱断言不影响 AC-001 主体覆盖
- 位置：`tests/unit/content_state_navigation_fixes.test.ts:43-47`（45 行）
- 问题：`expect(src).toMatch(/restore_navigation_page_script/)` 同时命中 `content_script.ts` 中的函数定义与 `stop_capture` 调用点；若调用点被删（stop 不再还原 history patch），测试仍 PASS。同用例 46 行 `removeEventListener('message', handle_navigation_message` 能区分（该字符串仅存在于 stop_capture），故用例部分可信，但测试名"stop 还原 history patch"与断言强度不符。
- 建议：对 stop_capture 函数体切片断言 `restore_navigation_page_script\(\)` 调用（与 29 行 popstate 切片同法）。

### t189_test_f004 - AC-005 重启集成（ensure_status_poll 置空/重建）无断言

- 严重度：minor
- 锚点：AC-005（stop 后可重启）主体已由 in-flight guard 测试覆盖，重启接线缺口属覆盖可更广
- 位置：`tests/unit/content_state_navigation_fixes.test.ts:117-135`
- 问题：重启测试仅验证 poll 模块可顺序建两个实例（`start_status_poll` 两次调用 t189 之前也成立，非红绿驱动），未触达 `content_script.ts` 的 `stop_status_poll = null`（start/stop_capture 内）+ `ensure_status_poll` 重建接线。content_script 不可 import，项目惯例是源码扫描（`content_script_uses_poll.test.ts`），但 AC-005 无对应扫描断言——若删掉置空/重建逻辑，全部测试仍 PASS。in-flight guard 测试（98-115）为真实红绿测试（去 `if (stopped) return false` 守卫则 on_active 被调、测试红），AC-005 核心缺陷防护已可信。
- 建议：补源码扫描断言 `ensure_status_poll` 定义与 `stop_status_poll = null` 出现在 start/stop_capture 内。

## 结论

- 前轮 finding 复核（Round 1）：无
- 改测方向复核：无迁就实现的改测——`dashboard_timeline_marker.test.ts` 仅新增 `get_tl_dragging` import 与 1 个 `it` 块（351-374），未改动任何既有断言
- 本轮新发现：4 条（全部 minor）
- 未进表的提示：
  - `content_script.ts` 顶层注册 chrome API 使 AC-001/002 只能源码扫描；`handle_navigation_message` 事件链（origin/source 校验、`last_url` 去重、`nav_enabled` 门控）无任何测试。提取为可导入模块属重构，超出本任务范围，可作 follow-up 候选。
  - AC-005 in-flight 测试中 `timers`/`next_id` 仅收集未断言（98-100、106），清理性小问题。
- 总体判断：4 条 minor、无 critical/important；AC-001~006 均有测试且无假行为覆盖，测试可信度达标。
- 系统性 follow-up：无
- AC 复验方式：
  - AC-001：`re_verified` — 源码扫描测试运行通过；逐一比对 `content_script.ts` 实际文本（popstate handler 含 `back_forward` 不含 `push_state`；page script patch 字符串；`types.ts` 枚举）确认断言成立
  - AC-002：`re_verified` — 源码扫描测试运行通过；比对 `content_script.ts:54-57` 的 `typeof sender?.frameId === 'number'` / `frame_id = sender.frameId` 确认
  - AC-003：`re_verified` — 3 条 jsdom round-trip 行为测试运行通过；`querySelector(generated) === target` 语义核验（特殊字符 id/class、nth-of-type 计数与 `get_nth_of_type` 一致）
  - AC-004：`re_verified` — 源码扫描测试运行通过；比对 `network_hook.ts:241-244` method 解析链确认
  - AC-005：`re_verified` — 模块行为测试运行通过；红绿推演：去掉 `if (stopped) return false` 守卫后迟到响应触发 on_active、测试转红
  - AC-006：`re_verified` — DOM 行为测试运行通过；核验 `render_trace` DOM 顺序（`tlLanes` 先于 `tlMmTrack`）确认 `querySelector('[data-event-idx]')` 命中 lane marker、真实走 marker 拖拽路径
  - coverage = 6 / 6

reviewed_scope: 0662c7dcbf4cce5d

verdict: PASS

## Round 2 复核 (2026-08-14 01:20 UTC+8)

### 前轮 finding 复核（以 diff 与代码核实，不采信处置表自称）

- **f001：仍存在（处置理由不成立）** — implementer 处置理由「build_page_script 不导出，行为测试需重构导出——列为限制」与事实不符：`src/extension/content/network_hook.ts:26` 导出 `build_page_script`，既有 `tests/unit/network_hook_gate_behavior.test.ts:10` 已 import 该函数且 L3 用例（198-199 行）`eval(build_page_script(...))` 驱动行为测试。AC-004 行为测试实际可行，「列为限制」不成立，finding 仍 open（minor，不阻断）。补偿新增的导航注入诊断与畸形 url 断言（`content_state_navigation_fixes.test.ts:54-65`）为真实源码断言，与生产代码一致（`content_script.ts:236-237` 的 `logger.warn('Navigation page script injection failed'`、238-243 的 `new URL(new_url)` try/catch 守卫），但未改变 AC-004 仍为源码扫描的事实。
- **f002：已修** — `dashboard_timeline_marker.test.ts:377-398` 新增 blur 用例（marker 路径 `window.dispatchEvent(new Event('blur'))` → `get_tl_dragging()` false，真实走 `finish_marker`）与 normal-lane pointercancel 用例（`finish_lane` 路径无异常、状态保持 false）。行为真实、测试通过。
- **f003：已修** — `content_state_navigation_fixes.test.ts:45` 断言改为 `restore_navigation_page_script\(\);` 调用点，仅命中 `stop_capture` 内调用（`content_script.ts:374`），不再被函数定义满足；同用例测试名同步更新。属断言加强（存在性 → 调用点），非弱化。
- **f004：已修** — `content_state_navigation_fixes.test.ts:150-156` 新增 content_script 轮询接线源码断言：`ensure_status_poll();`（加载启动）、`stop_status_poll();`（start/stop 停轮询）、`stop_status_poll = null`（置空防重启竞态）、in-flight stopped guard 注释文本，四条逐一与 `content_script.ts` 实际文本比对成立。

### 改测方向复核

无迁就实现的改测——两测试文件本轮仅新增 it 块与一处断言加强，未改动任何既有断言预期。

### 本轮新发现

0 条新 finding。

### 未进表的提示

- normal-lane 用例（`dashboard_timeline_marker.test.ts:388-396`）仅断言「无异常 + 状态不变」，未直接验证 listener 移除（如 cancel 后 pointermove 不再 seek）；可选加强，不阻断。
- f001 若最终按「遗留」关闭，`task.md` 处置表须按事实修正理由（build_page_script 已导出、eval 行为测试先例存在），或补行为测试后关闭。

### 总体判断

f002/f003/f004 修复到位且为真实加强；f001 处置理由事实有误、仍 open（minor，不阻断）。无未解决 critical/important，Round 2 verdict PASS。

### AC 复验（Round 2）

- AC-001~006：`re_verified` — 目标测试 49/49 绿（`content_state_navigation_fixes` 14 + `dashboard_timeline_marker` 35）；新增断言逐一比对生产源码成立；全量 `npx vitest run` 与本轮重跑均通过；`npx tsc --noEmit` 退出码 0
- coverage = 6 / 6

reviewed_scope: 2b8967427010cccb

verdict: PASS

## Round 3 复核 (2026-08-14 01:40 UTC+8)

### 前轮 finding 复核（以 diff 与代码核实）

- **f001：已修** — `content_state_navigation_fixes.test.ts:109-129` 新增 AC-004 eval 行为测试：`eval(build_page_script(false, 'test_secret'))` 驱动真实页脚本，stub `window.postMessage` 捕获上报，`await window.fetch(new Request('https://example.com/api', {method:'POST'}))` 后严格断言 `post.method === 'POST'`。红绿推演成立：旧实现 `(init && init.method) || 'GET'` 对 `init=undefined` 记 GET、断言转红；新实现走 `input instanceof Request ? input.method : null` 记 POST。断言非存在性、非弱化；无消息上报时 `post` 为 undefined 亦转红，无空过风险。f001 关闭成立。

### 本轮新发现

- **t189_test_f005 - AC-004 行为测试未 stub 原 fetch，真实触发外网请求（测试稳健性）**
  - 严重度：minor
  - 锚点：AC-004 覆盖已补足，本 finding 为测试确定性/外部依赖问题，不构成行为覆盖缺口
  - 位置：`tests/unit/content_state_navigation_fixes.test.ts:123`（`await window.fetch(new Request('https://example.com/api', ...))`）
  - 问题：jsdom 环境 `window.fetch === globalThis.fetch`（Node undici，探测确认），eval 前未 stub 原 fetch，测试对 example.com 发起真实网络请求（实测该用例 750ms，约同文件其他用例 50 倍）。失败场景：离线/防火墙静默丢包环境 undici 挂起 → 测试超时 flake；受限网络策略 CI 拒绝出站亦受影响。断言本身严格且红绿有效，不构成假行为，但单测引入外部网络依赖与该扩展数据本地化准则不一致。
  - 建议：eval 前 stub `window.fetch = () => Promise.resolve({ status: 200, ok: true, ... })`（仿 `network_hook_gate_behavior.test.ts` FakeXHR 先例），确定性结算 `.then` 路径；或至少 stub 一个立即 reject 的 fetch。

### 改测方向复核

无迁就实现的改测——本轮仅新增 1 个 it 块，未改既有断言。

### 未进表的提示

- eval 行为测试后 `window.fetch` 保持被包装状态（未还原），同文件后续用例不依赖 fetch，且 jsdom 环境按文件隔离，无实际影响；如后续在该文件新增 fetch 用例需注意。
- `eslint-disable-next-line no-eval` 与 `network_hook_gate_behavior.test.ts:198` 既有先例一致，属测试基础设施，不计 finding。

### 总体判断

f001 处置到位（真实行为测试，红绿有效）；本轮新发现 f005 为 minor（真实外网依赖，断言本身可信）。无未解决 critical/important，Round 3 verdict PASS。

### AC 复验（Round 3）

- AC-001~006：`re_verified` — `content_state_navigation_fixes.test.ts` 15/15 绿（含新行为测试）；`npx tsc --noEmit` 退出码 0；window.fetch 来源经探测确认（globalThis.fetch 同源）
- coverage = 6 / 6

reviewed_scope: 6a0e11a3cca1aff1

verdict: PASS

## Round 4 复核 (2026-08-14 02:00 UTC+8)

### 前轮 finding 复核（以 diff 与代码核实）

- **f005：已修** — `content_state_navigation_fixes.test.ts:120-130` eval 前 stub `window.fetch`（`(async () => new Response('{}', { status: 200, ... }))`，确定性结算，无外网），`finally` 同时还原 `window.postMessage` 与 `window.fetch`。验证：该用例运行耗时 750ms → 95ms（15 用例全绿）；jsdom 下 `window.fetch === globalThis.fetch`（undici）已被 stub 阻断，无外部网络依赖。断言仍严格（`post?.method === 'POST'`）、红绿语义不变（旧实现记 GET 转红）。处置成立，f005 关闭。

### 改测方向复核

无迁就实现的改测——本轮仅改 stub 注入与 finally 还原，未改断言。

### 本轮新发现

0 条新 finding。

### 未进表的提示

无。

### 总体判断

f005 处置到位：确定性、无外网、断言未弱化。当前无未解决 critical/important、无未决 minor（f001~f005 全部闭环），Round 4 verdict PASS。

### AC 复验（Round 4）

- AC-001~006：`re_verified` — `content_state_navigation_fixes.test.ts` 15/15 绿（95ms，确定性）；`npx tsc --noEmit` 退出码 0
- coverage = 6 / 6

reviewed_scope: 5488e92a2ea20bd6

verdict: PASS
