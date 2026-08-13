# Task review t189（reviewer_focus: 代码）

- task：`t189_fix_content_state_navigation`
- spec：`docs/tasks/t189_fix_content_state_navigation/spec.md`
- diff_anchor：`6ece61a4dbb8d8290788273643cc29cfe4fd6f0b`
- target：`git diff 6ece61a4dbb8d8290788273643cc29cfe4fd6f0b`
- round：1
- reviewed_at：2026-08-14 00:10 UTC+8
reviewed_scope: 0662c7dcbf4cce5d

## Findings

### t189_code_f001 - AC-005 轮询「可重启」仅在模块层成立，content_script 集成层无重建调用点

- 严重度：minor
- 锚点：AC-005（content 状态轮询在 stop 后可重启）
- 位置：`src/extension/content/content_script.ts:80`、`:85-110`、`:357-361`
- 问题：注释（:80「再次 start 时 ensure_status_poll 可重建」、:357「后续 start/重载可 ensure_status_poll 重启」）声明轮询可重建，但 `ensure_status_poll` 唯一调用点只有模块加载处（:110）。`start_capture`（:116-119）与 `stop_capture`（:358-361）只做「停轮询并置空」，`start` 分支内没有任何路径重新调用 `ensure_status_poll`。因此 AC-005 的「可重启」实际只在 poll 模块层成立（`start_status_poll` 可新建独立实例 + in-flight stopped guard，已由 `content_state_navigation_fixes.test.ts` 与 `poll_capture_status.test.ts` 覆盖）；content_script 层 stop→restart 后轮询不复活。当前无行为缺陷（SW 每次采集启动都经 `tabs_send_message_retry` 发 `start` 消息，消息路径可靠），但「可重建」能力是死路径，注释与实现不符。
- 建议：二选一——若设计意图是 stop→restart 后仍由轮询兜底（`start` 消息丢失场景），在 `start_capture` 中不重建（采集已开始无需轮询），改为在 `stop_capture` 之外的恢复路径（如收到 `start` 但 `start_capture` 早退、或 `on_active` 之外的再次 start）调用 `ensure_status_poll`；若确无需重启，删掉「可重建」注释，避免误导后续维护。

### t189_code_f002 - handle_navigation_message 未校验 d.url，畸形值在监听器内抛未捕获 TypeError

- 严重度：minor
- 锚点：行为缺陷（输入校验/错误处理），AC-001 消息通道
- 位置：`src/extension/content/content_script.ts:280-303`（`new URL(new_url).pathname` 在 :297-298）
- 问题：`handle_navigation_message` 对 `d.url` 只做「string 且非空」检查，随后直接 `new URL(new_url)`。页面（或注入页面自身的任意脚本）postMessage `{source:'__capture_all_nav__', action:'push_state', url:'%%bad%%'}` 即抛 TypeError，该消息事件处理中断（此条 route_change 丢失 + 控制台报错），且无 try/catch。真实 page script 发出的 url 恒为 `new URL(...)` 解析后的绝对 URL（:241/:246），故仅伪造消息触发；威胁模型注释（:227-228）已接受页面可伪造导航数据，但伪造畸形 URL 应被忽略而非抛异常刷监听器。`last_url` 因异常未更新，后续正常事件不受污染（污染面仅本条消息）。
- 建议：对 `d.url` 用 `try { new URL(...) } catch { return; }` 校验，或整体给 handler 包 try/catch（静默忽略畸形消息）。

### t189_code_f003 - 导航 patch 注入未复用项目公共 inject_script_element，CSP 拦截时静默无诊断

- 严重度：minor
- 锚点：代码质量（DRY / 错误处理），与 B3-M3 项目约定不一致
- 位置：`src/extension/content/content_script.ts:231-258`（注入）、`:260-278`（还原）；对照 `src/extension/content/content_page_script.ts:53-66`（`inject_script_element`）
- 问题：`inject_navigation_page_script` 手写 script 元素注入（`createElement('script')` + `textContent` + `appendChild`），与 `network_hook`/`storage_capture`/`websocket_capture` 共用的 `inject_script_element` helper 重复。后者按 B3-M3 约定挂 `error` 事件监听（CSP 拦截 inline script 时触发）并上报 `warn + capture_error`；本实现仅 catch DOM 异常——CSP 拦截不抛异常，故在 CSP 严格页面（script-src 不含 'unsafe-inline'）上 patch 静默失败，注释宣称的「降级」无任何诊断日志，与其余 page script 注入的诊断能力不一致。
- 建议：复用 `content_page_script.ts` 的 `inject_script_element(script_text, on_failure)`（无需 secret/preamble，helper 本身通用），或至少补 `error` 事件监听与 warn 日志。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（本轮 Round 1）
- 本轮新发现：3 条（均 minor）
- 未进表的提示：
  - 文件过大（降级规则，只列不计 finding）：`src/extension/dashboard/dashboard_detail.ts` 850 行（本 task 净增 +21，≥800 important 阈值）；`src/extension/content/network_hook.ts` 509 行（净增 +4，≥400）；`src/extension/content/content_script.ts` 402 行（净增 +110，≥400）；`tests/unit/dashboard_timeline_marker.test.ts` 606 行（净增 +26，≥600 测试阈值）。均未给出不可拆硬约束；本 task 未见因堆大导致的可观测缺陷，故不进 finding 表。
  - 复杂度：范围内新增/修改函数手算 McCabe 均 <10（`handle_navigation_message` ~6、`finish_marker` ~5、`ensure_status_poll` ~2），无 ≥15 项。
  - 范围外观察（不进 finding 表）：
    1. `restore_navigation_page_script`（content_script.ts:260-278）无条件把 `history.pushState/replaceState` 还原为注入时保存的原件；若页面在 capture 期间自行覆写这两个方法（常见于 SPA 框架懒加载初始化），stop 时会把框架 wrapper 一并抹掉、破坏页面路由。spec「风险与回退」已明示该风险且回退计划即「restore patches on stop」，实现按计划执行；建议后续可考虑在 restore 脚本中比对当前函数是否仍为本扩展安装的 wrapper 再决定还原。
    2. AC-002 的 reload 恢复路径（poll `on_active`，content_script.ts:93-104）不携带 sender，iframe 的 `frame_id` 保持初始随机数，直至后续 `start` 消息到达才被 `sender.frameId` 修正——自愈窗口内事件 frame_id 为随机值，属「平台可用时」边界内的既存行为。
    3. hash 锚点回退（back/forward）会同时触发 `popstate`（标 `back_forward`）与 `hashchange`（标 `hash_change`）两条 route_change——既存双事件行为，非本 task 引入；本 task 仅修正了 back/forward 的标签。
- 总体判断：6 条 AC 均有实现且不偏航（改动集中于 content/network_hook/poll/dashboard_detail/types + 2 个测试文件 + domain.md 同步），3 条 minor 均不阻断；无未解决 critical / important，PASS。
- 系统性 follow-up：无
- AC 复验方式：
  - AC-001：re_verified——代码核查 pushState/replaceState patch 安装/还原对称、popstate 改标 `back_forward`（content_script.ts:205-303）、`RouteChangeData` 枚举扩展（types.ts:269）；`content_state_navigation_fixes.test.ts` 4 条源码扫描断言通过；已排除 pushState 触发 hashchange 重复事件顾虑（MDN 与 2024-03 sveltekit issue #12044 均确认 pushState 不派发 hashchange）。
  - AC-002：re_verified——`start` 分支以 `sender.frameId` 更新 `frame_id`（content_script.ts:54-58）；manifest `all_frames: true`；SW 经 `tabs_send_message_retry(tab.id, ...)` 无 frameId 发送（service_worker.ts:54-60、744-749），全部 frame 各收自身 frameId。
  - AC-003：re_verified——`build_segment` 改 `:nth-of-type` 与 `get_nth_of_type` 语义对齐（dom_capture.ts:45-64）、id/class `CSS.escape`（:63/:75）；jsdom round-trip 测试（特殊字符 id / nth-of-type / 特殊字符 class）通过。
  - AC-004：re_verified——fetch hook method 解析 `(init && init.method) || (input instanceof Request ? input.method : null) || 'GET'`（network_hook.ts:243-245），init.method 优先、Request.method 兜底、缺省 GET；测试为源码扫描断言（同项目既有模式），逻辑经 tsc 与逐行核查。
  - AC-005：re_verified——poll 模块 `stopped` guard 位于 `await` 之后（poll_capture_status.ts:50），stop 后 in-flight 响应不触发 `on_active`；模块层重启 + guard 竞态测试通过（content_state_navigation_fixes.test.ts AC-005 两条）；stop/start 双路径停轮询并置空（content_script.ts:116-119、358-361）；「集成层无重启调用点」已列 f001。
  - AC-006：re_verified——marker 与 normal lane 拖拽统一 `finish_marker`/`finish_lane` 处理 pointerup/pointercancel/lostpointercapture/blur 并清 `_tl_dragging`（dashboard_detail.ts:694-749）；`get_tl_dragging` 经 router 注入 poll render 检查（dashboard_shared.ts:14/36、dashboard.ts:145）；pointercancel/lostpointercapture 行为测试通过。
  - coverage = 6 / 6

verdict: PASS

## Round 2 复核 (2026-08-14 00:20 UTC+8)

reviewed_scope: 2b8967427010cccb

### 前轮 finding 复核（以当前 diff 为准）

- **t189_code_f001（minor）— 已基本消除，残留一处注释矛盾**：模块主注释（`content_script.ts:81-83`）已改为准确语义——「轮询加载时启动一次；start_capture 停轮询并置空；stop 后由 SW 重新下发 start 消息重建采集（不依赖轮询重启）」，与实现一致（`ensure_status_poll` 唯一调用点在 :113 模块加载；start/stop 只停不启）。残留观察：`stop_capture` 处注释（`content_script.ts:366`）仍写「后续 start/重载可 ensure_status_poll 重启」，与本轮主注释「不依赖轮询重启」语义矛盾——`ensure_status_poll` 确无重启调用点，该函数仅是保留的可重建能力。纯注释残留，无行为影响，建议顺手对齐；不计阻断。
- **t189_code_f002（minor）— 已消除**：`handle_navigation_message`（`content_script.ts:294-301`）以 `try { new_url = ...; new URL(new_url); } catch { return; }` 校验畸形 url，伪造/畸形消息不再抛未捕获 TypeError，安全忽略；`last_url` 仅在解析成功后更新，语义不变。新增测试断言（`content_state_navigation_fixes.test.ts`「handle_navigation_message 对畸形 url 安全忽略」）通过。
- **t189_code_f003（minor）— 已消除**：`inject_navigation_page_script` 改为复用 `inject_script_element`（`content_page_script.ts:53-66`，B3-M3 error 事件诊断），失败回调 `logger.warn('Navigation page script injection failed', { reason })`（`content_script.ts:231-237`）；import 无循环依赖（content_page_script 不引用 content_script）。新增测试断言（「navigation patch 经 inject_script_element 注入」）通过。restore 路径仍为手写 script 注入（CSP 拦截仅致 patch 残留，无事件侧影响），维持 f003 原建议范围，不新增。

### 本轮新发现

0 条（仅 f001 残留注释矛盾观察，见上）。

### 复验证据

- `npx tsc --noEmit -p tsconfig.json`：exit 0。
- `npx vitest run tests/unit/content_state_navigation_fixes.test.ts tests/unit/dashboard_timeline_marker.test.ts tests/unit/poll_capture_status.test.ts`：3 文件 55 测试全绿（content_state_navigation_fixes 14 条，含 f002/f003 处置新增断言）。

### 总体判断

三项处置均落地（f002/f003 彻底，f001 语义已澄清、仅一处注释残留）；无未解决 critical / important。

verdict: PASS

## Round 3 复核 (2026-08-14 00:25 UTC+8)

reviewed_scope: 6a0e11a3cca1aff1

### 前轮 finding 复核（以当前 diff 为准）

- **t189_code_f001（minor）— 已完全消除**：`stop_capture` 注释（`content_script.ts:366-367`）已对齐为「停轮询并置空——轮询为加载时一次性（每 frame 一份 content script），stop 后由 SW 重新下发 start 消息重建采集」，与模块主注释（:81-83「不依赖轮询重启」）语义一致，Round 2 指出的注释矛盾已消除。代码逻辑与 Round 2 一致（`ensure_status_poll` 仍仅加载时调用一次，start/stop 只停不启）。
- **t189_code_f002（minor）— 维持已消除**：`handle_navigation_message` 的 `try { new URL(new_url) } catch { return }` 校验（:294-301）自 Round 2 确认后无代码变化。
- **t189_code_f003（minor）— 维持已消除**：注入经 `inject_script_element`（B3-M3 诊断 warn）自 Round 2 确认后无代码变化。

### 本轮新发现

0 条。

### 变更范围确认

- **代码侧无逻辑变化**：对 `content_script.ts` 当前 diff 去除注释行后与 Round 2 比对，逻辑代码逐行一致（本任务增量 169→170 行，唯一差为 stop 注释扩为 2 行）；`dom_capture` / `network_hook` / `dashboard_detail` / `poll_capture_status` / `types` 的 diff 统计与 Round 2 完全相同。
- **测试侧新增（非业务代码）**：`content_state_navigation_fixes.test.ts`（157→179 行，14→15 tests）新增 AC-004 eval 行为测试——`eval(build_page_script)` 注入后 mock `window.postMessage`，真实驱动 `fetch(new Request('https://example.com/api', { method: 'POST' }))` 并断言记录 `method === 'POST'`（仿既有 `network_hook_gate_behavior.test.ts` 先例）；另新增 AC-005 源码接线断言（`ensure_status_poll()` / `stop_status_poll()` / `stop_status_poll = null` / in-flight 注释）。两测试均通过。小观察：AC-004 行为测试名标注「（f001 处置）」疑为笔误（应指 AC-004 对应缺陷处置，与 f001 轮询无关），仅测试命名注记，无行为影响。

### 复验证据

- `npx tsc --noEmit -p tsconfig.json`：exit 0。
- `npx vitest run tests/unit/content_state_navigation_fixes.test.ts`：15 tests 全绿（含 AC-004 行为测试 940ms 执行通过）。

### 总体判断

注释已对齐，代码逻辑零变化，测试增强无恒真断言；f001~f003 全部消除，无未解决 critical / important。

verdict: PASS

## Round 4 复核 (2026-08-14 00:26 UTC+8)

reviewed_scope: 5488e92a2ea20bd6

### 前轮 finding 复核（以当前 diff 为准）

- **t189_code_f001（minor）— 维持已消除**：`stop_capture` 注释（content_script.ts:366-367）与主注释（:81-83）一致，Round 3 已确认；本轮代码无变化。
- **t189_code_f002（minor）— 维持已消除**：`handle_navigation_message` 畸形 url try/catch（:294-301）无代码变化。
- **t189_code_f003（minor）— 维持已消除**：注入经 `inject_script_element`（B3-M3 warn 诊断）无代码变化。

### 本轮新发现

0 条。

### 变更范围确认

- **代码侧无变化**：`content_script.ts` 增量 170 行与 Round 3 相同；`dom_capture`（12）/ `network_hook`（6）/ `dashboard_detail`（59）/ `poll_capture_status`（3）/ `types`（3）diff 统计与 Round 3 逐项一致；domain.md 不变。业务代码零改动。
- **测试侧改动（非业务代码）**：AC-004 行为测试（`content_state_navigation_fixes.test.ts` 179→183 行，15 tests 不变）增加 `window.fetch` stub（`async () => new Response('{}', ...)`），消除 jsdom 下 `window.fetch === undici` 的真实外网依赖、测试确定性结算（执行耗时 940ms→103ms）。stub 仅替代网络层——被测的 fetch method 解析逻辑仍在 page script wrapper 内真实执行（`fetch(new Request({method:'POST'}))` → wrapper 取 `Request.method` → stub 返回 → `process_response` → 断言记录 `POST`），非 mock 被测逻辑，符合测试规范。finally 中 postMessage 与 fetch 均还原。
- 遗留小观察（Round 3 已提，无行为影响）：AC-004 测试名标注「（f001 处置）」疑为笔误，与 f001（轮询注释）无关。

### 复验证据

- `npx tsc --noEmit -p tsconfig.json`：exit 0。
- `npx vitest run tests/unit/content_state_navigation_fixes.test.ts`：15 tests 全绿（103ms，确定性）。

### 总体判断

代码侧零变化，测试侧 stub fetch 消除外网依赖且不削弱断言；f001~f003 维持已消除，无未解决 critical / important。

verdict: PASS
