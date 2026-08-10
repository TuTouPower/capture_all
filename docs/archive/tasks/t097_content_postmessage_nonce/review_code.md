# Task review t097（reviewer_focus: 代码）

- task：`t097_content_postmessage_nonce`
- spec：`docs/tasks/t097_content_postmessage_nonce/spec.md`
- diff_anchor：`5293872288edec8c210f804969d0bebb4b2b37df`
- target：`git diff 5293872288edec8c210f804969d0bebb4b2b37df`
- round：1
- reviewed_at：2026-08-11 03:45 UTC+8
- reviewed_scope: f41e7f8ffe23cb23

## Findings

### t097_code_f001 - 同页 stop→start 重启后网络/ws/storage hook 采集静默失效（AC-002 违反 + AC-003 真实语义不可达成）

- 严重度：important
- 锚点：AC-002（带正确 nonce 的合法 hook 事件仍能入库）在同页重启场景下被违反；AC-003（per-start nonce，旧 nonce 失效）声称的"新 nonce 仍接受"在真实页面中不可达成。
- 位置：`src/extension/content/network_hook.ts:285-287`（per-start 重新生成 nonce + 重新注入）；guard 在 `network_hook.ts:15`；同构 `websocket_capture.ts:145-147`、`storage_capture.ts:87-89`
- 问题：content 每次 start 都重新生成 `current_nonce = _nonce_override ?? crypto.randomUUID()` 并调用 `inject_page_script(current_nonce)`，但注入脚本首行 guard `if (window.__capture_all_*_installed__) return;` 在同页生命周期内只放行一次注入。stop→start（页面不刷新）时，第二次注入被 guard 跳过，页面 MAIN world 里实际生效的仍是**首次注入**的脚本，其闭包 `NONCE` 冻结为旧值。接收端 `if (d.nonce !== current_nonce) return;` 用新 nonce 校验，于是所有合法 hook 事件（网络/ws/storage 三通道）被静默丢弃，直到整页刷新才恢复。改动前为 SIGNAL-only 校验，重启后脚本 SIGNAL 恒定、校验恒过，无此问题；本 task 引入的 per-start nonce 直接造成该回归。用 scratch 测试复现：`nonce-a` 启动 → 正常入库；stop → `nonce-b` 重启 → 页面脚本真实发送的仍是 `nonce-a` 事件，被拒，sender 不再增加（采集失效）。AC-003 单测通过手动 dispatch 带 `nonce-b` 的消息"验证"新 nonce 接受，但真实注入脚本永远不会持有 `nonce-b`，该断言在真实页面中无对应输入，等于测了接收端逻辑而没测注入路径。
- 建议：让注入脚本在 `post()` 发送时从 content 可更新的可变态读取 nonce（例如 content 每次 start 写 `window.__capture_all_network_nonce__`，脚本 `post` 内 `nonce: window.__capture_all_network_nonce__`），使 per-start 旋转在真实脚本中生效；或退化为 per-injection nonce（AC-003 允许"或每次注入"），接收端与脚本共用同一 per-page nonce，避免接收端单独换 nonce 而脚本不换。修复需同步三通道并补一条覆盖"重启后真实脚本事件仍入库"的回归测试。

### t097_code_f002 - nonce 模板插值未转义，脚本安全依赖 UUID 字符集

- 严重度：minor
- 锚点：spec 风险区「注入字符串拼接 nonce 需防破坏」
- 位置：`network_hook.ts:18`、`websocket_capture.ts:26`、`storage_capture.ts:25`（`var NONCE = '${nonce}';`）
- 问题：nonce 以未转义单引号字符串拼入注入脚本。当前生产 nonce 恒为 `crypto.randomUUID()`（`[0-9a-f-]`），不含引号/反斜杠/`</script>`，故现网不破坏；但一旦 `_nonce_override` 或未来 nonce 源含 `'`、`\`、`</script>`，注入脚本即语法错误或 HTML 提前闭合，对应通道采集全无。风险区已明确点名该拼接风险，实现未做防御。
- 建议：改用 `JSON.stringify(nonce)` 插值：`var NONCE = ${JSON.stringify(nonce)};`，天然转义引号与反斜杠。

### t097_code_f003 - `_set_nonce_for_test` 无条件导出进生产模块，且 `''` 重置与 `??` 语义冲突

- 严重度：minor
- 锚点：spec 测试策略「必要时导出测试钩子仅测试环境」；实现正确性
- 位置：`network_hook.ts:254-257`、`websocket_capture.ts:11-15`、`storage_capture.ts:11-15`
- 问题：测试钩子在三个生产模块无条件 `export`（未按环境门控）。content 脚本运行于 isolated world，页面无法触达，无安全暴露；但 `_set_nonce_for_test('')`（network 测试 `afterEach` 用于"重置"）会把 `_nonce_override` 置为空串，而 `'' ?? crypto.randomUUID()` 返回 `''`（空串非 nullish），下次未显式设 nonce 的 start 会以空串为 `current_nonce`，全部消息被拒。当前各测试文件 start 前都显式设 nonce，未触发；属潜在脆弱点。
- 建议：导出加环境门控（`import.meta.env.DEV`/`NODE_ENV==='test'`）；重置改为置 `null` 而非 `''`（如 `_set_nonce_for_test(null)` 或独立 `_reset_nonce_for_test()`）。

### t097_code_f004 - network_hook 注入脚本内 `nonce: NONCE,` 缩进不一致

- 严重度：minor
- 锚点：项目约定 4 空格缩进（`docs/blueprint/conventions.md`「编码与测试」）
- 位置：`network_hook.ts:68,93,108,154,210`
- 问题：5 处 `nonce: NONCE,` 以 16 空格缩进，同级 `source: SIGNAL,` 等为 20 空格，违反 4 空格缩进约定；`websocket_capture.ts` / `storage_capture.ts` 无此问题。纯格式，无行为影响。
- 建议：对齐为 20 空格缩进。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：4 条（1 important，3 minor）
- 未进表的提示：
  - nonce 保密性局限：nonce 为注入 IIFE 闭包变量，页面不能直接从 `window` 读到；但页面可用 `message` listener 观察到每次携带 nonce 的 postMessage 载荷从而提取 nonce。此属「对抗高级页面 hook」同类，spec 已列入「有意不测」，非 blocking；本方案防的是仅知公开 SIGNAL 的盲伪造，符合 AC-001 字面语义。
  - 文件大小：`network_hook.ts` 361 行、`websocket_capture.ts` 186 行、`storage_capture.ts` 135 行，均未达 400 阈值。
  - 复杂度：`start_*` 消息处理分支数未达阈值。
- AC 复验方式：
  - AC-001：`re_verified`。三通道接收端均见 `if (d.nonce !== current_nonce) return;`（network_hook.ts:295 / websocket_capture.ts:155 / storage_capture.ts:97）；`content_postmessage_nonce.test.ts` 对 network 通道验证了缺 nonce 与错 nonce 均被拒；ws/storage 通道拒绝行为由代码同构推断。
  - AC-002：`re_verified`（首启路径）。`content_postmessage_nonce.test.ts` AC-002 用例通过、相关 5 文件 19 用例全绿；但同页重启路径下 AC-002 被违反，见 f001。
  - AC-003：`re_verified`（仅接收端层）。单测验证两次 start 换 nonce 后旧 nonce 拒、新 nonce 接受；但真实注入脚本无法随 start 换 nonce，生产可观测行为是重启后采集失效而非干净轮换，见 f001。
  - coverage = 3 / 3
- 总体判断：三通道 nonce 校验、per-start 旋转与 `_set_nonce_for_test` 钩子均已落地，但同页 stop→start 重启因注入 guard 与 per-start nonce 冲突，导致网络/ws/storage hook 采集静默失效（数据丢失），违反 AC-002 且使 AC-003 真实语义不可达成；存在未解决 important，verdict FAIL。
- 系统性 follow-up：无已有 tid。建议 follow-up（或在 f001 修复内一并处理）：标题「content hook 同页重启后 nonce 失效致采集中断」，slug `content_hook_restart_nonce`，阻断性 important。

verdict: FAIL

## Round 2 (2026-08-11 03:53 UTC+8)

reviewed_scope: 8ebfd803941d5f36

### Findings

#### t097_code_f005 - 扩展重建（reload/禁用→启用）后 guard 阻止二次注入，接收端新 nonce 与页面脚本旧 nonce 失配，采集静默失效（AC-002 违反）

- 严重度：important
- 锚点：AC-002（带正确 nonce 的合法 hook 事件仍能入库）；f001 同根因在 content 脚本重建路径仍可达
- 位置：`src/extension/content/network_hook.ts:290-294`（hook_injected 门控）与 `network_hook.ts:16` 守卫；同构 `websocket_capture.ts:150-154 / :26`、`storage_capture.ts:92-96 / :25`；接收端 nonce 校验 `network_hook.ts:302`、`websocket_capture.ts:162`、`storage_capture.ts:104`
- 问题：per-injection 修复依赖模块级 `hook_injected`/`current_nonce`（content isolated world 内存）与页面注入脚本守卫/闭包 `NONCE`（MAIN world，随页面持久）二者生命周期一致。但扩展重建（chrome://extensions reload、禁用→启用）重跑 content 脚本而**不重跑页面**：模块状态清零（`hook_injected=false`、`current_nonce=''`），注入脚本与守卫变量仍在。此后 start 生成新 nonce B 并 `inject_page_script(B)`，守卫已置位 → 跳过，页面脚本仍持旧 nonce A；接收端 `d.nonce !== current_nonce` 使所有合法 hook 事件被拒，网络/ws/storage 三通道采集静默失效直到整页刷新。f001 的 stop→start（同一模块生命周期）已修，但扩展重建把同一根因（接收端旋转、注入脚本不旋转）重新暴露；T097 前为 SIGNAL-only 无此问题，属本 task 引入的回归残留。
- 建议：让 nonce 随页面持久：start 时若页面守卫已置位（注入脚本已存在），从 `window.__capture_all_*_nonce__` 读取既有 nonce 作为 `current_nonce`，仅守卫未置位时生成新 nonce 并写回；或注入脚本 `post()` 每次从该 window 变量读 nonce。三通道同步，可同时覆盖 stop→start 与扩展重建，消除对模块内存生命周期与页面生命周期的耦合假设。

### 结论

- 前轮 finding 复核（Round 2）：
  - f001：**已消除（stop→start 路径）**。`hook_injected` 门控使同页 restart 不再重新生成/重注入，`current_nonce` 与首次注入脚本 `NONCE` 保持一致（network_hook.ts:290-294 / ws:150-154 / storage:92-96 同构）；但扩展重建路径仍暴露同根因，见本轮 f005。
  - f002：**已消除**。三通道注入脚本均改 `var NONCE = ${JSON.stringify(nonce)};`（network_hook.ts:19 / ws:29 / storage:28）。
  - f003：**修不彻底**。签名改 `string | null` 并重置 `hook_injected`，`??` 冲突可通过传 `null` 规避；但导出仍无条件（未环境门控），且 `content_postmessage_nonce.test.ts:24` afterEach 仍用 `_set_nonce_for_test('')`——`''` 非 nullish，若某测试 start 前未显式设 nonce 会以空串为 `current_nonce` 全拒。当前各测试 start 前均显式设 nonce，未触发；仍为潜在脆弱点（minor）。
  - f004：**仍存在**。network_hook.ts:69/94/109/155/211 的 `nonce: NONCE,` 仍为 16 空格缩进（同级 20 空格），纯格式（minor）。
- 本轮新发现：1 条（f005 important）
- 未进表的提示：
  - 文件大小：network_hook.ts 369 行、websocket_capture.ts 194 行、storage_capture.ts 143 行，均未达 400 阈值。
  - 复杂度：start 消息处理分支未达阈值。
  - 三通道 `_set_nonce_for_test`/`build_page_script`/nonce 门控块重复为既有平行模块结构（各模块本有独立 PAGE_SCRIPT/start/stop），非本 task 新增缺陷。
- AC 复验方式：
  - AC-001：`re_verified` — 三通道接收端均见 `if (d.nonce !== current_nonce) return;`（network_hook.ts:302 / ws:162 / storage:104）；本轮重跑 5 相关文件 24 用例全绿。
  - AC-002：`re_verified`（单次 start + stop→start 路径）— 单次 start 用例通过；stop→start 经代码核实 `hook_injected` 门控已修（无独立测试，见 test 报告 f004）；扩展重建路径仍违反（见 f005）。
  - AC-003：`re_verified`（per-injection 语义）— 每次新注入（或测试 `_set_nonce_for_test` 重置）生成不同 nonce；同页 restart 不旋转符合「或每次注入」。
  - coverage = 3 / 3
- 总体判断：f001 的 stop→start 回归已修、f002 已修；但扩展重建路径仍存在与 f001 同根因的静默采集中断（数据丢失），f003 修不彻底、f004 缩进未修；存在未解决 important，verdict FAIL。
- 系统性 follow-up：无已有 tid。f005 建议本 task 内一并解决（或处置表登记 follow-up）：标题「content hook nonce 随页面持久化，消除扩展重建后采集失效」，slug `content_hook_nonce_page_persisted`，阻断性 important。

verdict: FAIL

## Round 3 (2026-08-11 04:05 UTC+8)

reviewed_scope: de2e92c3b9322695

### Findings

#### t097_code_f006 - content 脚本在 http（非 secure context）页面 `crypto.randomUUID()` 不可用，start_* 抛 TypeError，网络/ws/storage 采集中断（本 task 引入回归）

- 严重度：important
- 锚点：可观测行为缺陷 —— 输入：http:// 页面（manifest `"matches": ["<all_urls>"]`）开启采集；坏结果：`start_capture` 在 `start_storage_capture` 抛 TypeError 中止，其后的 network_hook/websocket 及 clipboard/form_submit/focus/visibility/resize/fullscreen/print 与 popstate/hashchange/DOMContentLoaded 监听全部未启动，采集静默中断（数据丢失）。
- 位置：`src/extension/content/network_hook.ts:292`、`websocket_capture.ts:158`、`storage_capture.ts:100`（`current_nonce = _nonce_override ?? crypto.randomUUID()`）；调用链 `src/extension/content/content_script.ts:105-114`（start_capture 无 try/catch）
- 问题：`crypto.randomUUID()` 仅 secure context（https/localhost）可用；content 脚本隔离世界继承页面 origin 的安全上下文，http:// 页面下 `crypto.randomUUID` 为 undefined，调用即抛 TypeError。三模块 start_* 直接调用且未做能力检测。start_capture 顺序 storage(105) → network_hook(106) → websocket(114)，storage 先抛错即中止整段，网络/ws/storage 三通道及后续模块全部不启动，且模块级 `is_capturing` 已被置 true（storage_capture.ts:99 先于 :100 抛错），后续重试 start 也 early-return，直到 content 脚本重载。T097 前 content 通道无 randomUUID 调用，无此问题；属本 task 引入回归。项目已有同场景防护先例：`src/shared/event_utils.ts:15-21` 对 `typeof crypto.randomUUID === 'function'` 做能力检测并 fallback（注释明言「fallback 用于非 secure context」）。jsdom 测试环境提供 crypto.randomUUID 或经 `_set_nonce_for_test` 覆盖，故全量测试绿但真实 http 页面崩。
- 建议：仿 event_utils.ts，能力检测后给随机 nonce fallback（如 `Math.random().toString(36)` 拼接，仅需每次 start 不同、接收端按字符串精确匹配），三通道同步；并补一条非 secure context（或 stub `crypto.randomUUID` 为 undefined）下 nonce 生成路径的测试。

#### t097_code_f007 - nonce 改存页面 MAIN world 全局，页面可直读直写，偏离 spec 范围「注入脚本持有」表述（安全取舍）

- 严重度：minor
- 锚点：spec 范围「content 生成、注入脚本持有、接收端校验」——实现改为「window 全局持有」；AC-001 字面语义（仅 SIGNAL 不带 nonce 被拒）仍满足
- 位置：`network_hook.ts:23,259`、`websocket_capture.ts:77,125`、`storage_capture.ts:30,67`
- 问题：动态 window nonce 方案把 nonce 存入页面 MAIN world 全局 `window.__capture_all_*_nonce__`。此前闭包方案页面需监听 message 载荷（等待至少一条合法事件）才能提取 nonce；现方案页面脚本可随时直读 nonce 伪造，或直写错误值使注入脚本事件全被拒（静默 DoS）。「对抗高级页面」属 spec 有意不测，AC-001 的「仅 SIGNAL、不带正确 nonce」仍被拒，不阻断；但 spec 范围「注入脚本持有」描述已过时，且相对闭包方案暴露面增大。
- 建议：在 `docs/blueprint/decisions.md` 记录该安全取舍（window 全局 nonce 为解耦 stop→start / 扩展重建生命周期的最小可行代价）；spec 范围表述同步为「content 生成、注入脚本运行时读取 window 全局、接收端校验」。

### 结论

- 前轮 finding 复核（Round 3）：
  - f001：**已消除**。动态 window nonce 方案下，stop→start 由 `update_page_nonce` 刷新 window nonce + 注入脚本 `post()` 运行时读取解决；接收端 `current_nonce` 与 window nonce 同源同值。原「脚本闭包 NONCE 冻结旧值」问题不再存在。
  - f002：**已消除**。nonce 不再字符串插值进 `build_page_script`（改为运行时从 window 读，无插值）；`update_page_nonce` 用 `JSON.stringify(nonce)` 写 window 变量（network_hook.ts:259 / ws:125 / storage:67）。
  - f003：**修不彻底（minor）**。`_set_nonce_for_test` 仍无条件导出；`content_postmessage_nonce.test.ts:31` afterEach 仍 `_set_nonce_for_test('')`——`''` 非 nullish，`_nonce_override ?? crypto.randomUUID()` 得 `''`，若某测试 start 前未显式设 nonce 会全拒。当前各用例均显式设 nonce，未触发；潜在脆弱点。
  - f004：**已消除**。nonce 移入共享 `post()`（network_hook.ts:23），8 处 post 调用点全部经共享函数，字面量内不再含 nonce 字段，缩进问题随重构消失。
  - f005：**已消除**。注入脚本 `post()` 运行时读 `window.__capture_all_*_nonce__`（network_hook.ts:23 / ws:77 / storage:30）；content 每次 start 先 `update_page_nonce`（无 guard）后 `inject_page_script`（有 guard，仅首次装）；扩展重建时 guard 阻止二次注入，但旧脚本 `post()` 读新 window nonce → 接收端接受。stop→start 与扩展重建两条路径均已解耦，`current_nonce` 与 window nonce 在 start_* 内由同一值赋值保持同步（network_hook.ts:292-293 / ws:158-159 / storage:100-101）。
- 本轮新发现：2 条（f006 important、f007 minor）
- 未进表的提示：
  - 升级迁移：扩展从 pre-T097 版本热更后，已注入的旧脚本（无 nonce 字段或闭包 NONCE）在新接收端校验下全拒，且 guard 阻止新脚本注入，采集静默失效直到整页刷新。一次性升级副作用，与协议变更同性质，非本 task 语义缺陷；建议升级说明提示刷新已开页面。
  - 文件大小：network_hook.ts 369 行、websocket_capture.ts 199 行、storage_capture.ts 149 行，均未达 400 阈值。
  - 复杂度：start_* 消息处理分支未达阈值。
- AC 复验方式：
  - AC-001：`re_verified` — 三通道接收端均见 `if (d.nonce !== current_nonce) return;`（network_hook.ts:302 / ws:168 / storage:110）；负向用例 network 2 + storage 2 + ws 2 全绿，断言 sender 不被调。
  - AC-002：`re_verified` — AC-002 / AC-002e2e 用例通过；注入脚本 `post()` 从 window 动态读 nonce 经代码核实（network_hook.ts:23 / ws:77 / storage:30），ws 发送侧经 push 断言验证。
  - AC-003：`re_verified` — AC-003（旧 nonce 拒 / 新 nonce 接受）与 AC-003b（restart 后新 window nonce 接受）通过；生产每次 start `crypto.randomUUID()` 保证不同（但 http 非 secure context 下抛错，见 f006）。
  - coverage = 3 / 3
- 总体判断：f005 的动态 window nonce 方案已正确解耦 stop→start 与扩展重建两条路径，f001/f002/f004/f005 均消除；但 content 脚本 `crypto.randomUUID()` 在 http（非 secure context）页面不可用使三通道采集中断，为本 task 引入的未解决重要回归（数据丢失）；存在未解决 important，verdict FAIL。
- 系统性 follow-up：无已有 tid。建议在 f006 修复内同步处理（或登记 follow-up）：标题「content nonce 生成对非 secure context fallback」，slug `content_nonce_insecure_context_fallback`，阻断性 important。

verdict: FAIL

## Round 4 (2026-08-11 04:15 UTC+8)

reviewed_scope: 5b48d5b401081a48

### Findings

#### t097_code_f008 - generate_nonce 三通道 verbatim 重复，可提取共享 helper（DRY）

- 严重度：minor
- 锚点：DRY 维度「单纯 verbatim 重复默认 minor」；当前三份一致、无行为分叉
- 位置：`src/extension/content/network_hook.ts:252-262`、`websocket_capture.ts:16-26`、`storage_capture.ts:16-26`
- 问题：f006 修复在三个平行模块内各落一份 11 行完全相同的 `generate_nonce()`（能力检测 + Math.random fallback）。三份现一致，但后续调整 nonce 格式（换 fallback 源 / 加熵）须同步三处，存在修复遗漏风险。三个模块均已 import `./content_event_utils`（network_hook.ts:9 / ws:3 / storage:3），提取至该共享模块成本低。
- 建议：将 `generate_nonce`（连同能力检测）提升到 `content_event_utils.ts` 或 `event_utils.ts`，三模块 import 复用。非阻断。

### 结论

- 前轮 finding 复核（Round 4）：
  - f001：**已消除**。动态 window nonce 方案 + 每次 start `update_page_nonce` 刷新 window 变量，stop→start 不再依赖注入 guard；注入脚本 `post()` 运行时读 window nonce（network_hook.ts:23 / ws:89 / storage:42）。
  - f002：**已消除**。nonce 不再插值进 `build_page_script`；`update_page_nonce` 用 `JSON.stringify(nonce)` 写 window 变量（network_hook.ts:271 / ws:137 / storage:79）。
  - f003：**仍存在（潜在，minor）**。`_set_nonce_for_test` 仍无条件导出；content_postmessage_nonce.test.ts:31 afterEach 仍 `_set_nonce_for_test('')`——`'' ?? generate_nonce()` 得 `''`，若某测试 start 前未显式设 nonce 会全拒。当前各测试均先显式设值，未触发。
  - f004：**已消除**。nonce 移入共享 `post()`，无 inline nonce 字面量缩进问题。
  - f005：**已消除**。`update_page_nonce`（无 guard）每次 start 刷新 window nonce，扩展重建后旧脚本 `post()` 读新 nonce，接收端接受。
  - f006：**已消除**。三通道 `generate_nonce()`（network_hook.ts:252 / ws:16 / storage:16）先 `typeof crypto.randomUUID === 'function'` 能力检测再调用，否则 `Math.random` fallback；与 `event_utils.generate_event_id`（event_utils.ts:15-21）同模式。`_nonce_override` 改 `string | null`，默认 null 走真实生成路径。AC-002http 用例 stub `crypto={}` 验证 start 不抛（本轮重跑通过）。
  - f007：**仍存在（minor，已接受取舍）**。nonce 存页面 MAIN world 全局可直读直写；属解耦 stop→start / 扩展重建生命周期的最小可行代价。建议在 `docs/blueprint/decisions.md` 记录该安全取舍（非本 task 阻断）。
- 本轮新发现：1 条（f008 minor）
- 未进表的提示：
  - AC-002http 用例 `vi.stubGlobal('crypto', {})` 未显式恢复（vitest 未开 `unstubGlobals`）。本文件内该用例为末位、跨文件受 `isolate:true` 隔离，现无污染；后续在其后追加用例或重排顺序需注意。测试侧观察，已记 test 报告。
  - 文件大小：network_hook.ts 381 行、websocket_capture.ts 212 行、storage_capture.ts 161 行，均未达 400 阈值。
  - 复杂度：generate_nonce 单 if + try/catch，start_* 消息处理分支未达阈值。
  - 升级迁移：pre-T097 已注入旧脚本在新接收端校验下全拒，一次性升级副作用，非本 task 语义缺陷。
- AC 复验方式：
  - AC-001：`re_verified` — 三通道接收端均见 `if (d.nonce !== current_nonce) return;`（network_hook.ts:314 / ws:180 / storage:122）；负向用例 network 2 + storage 2 + ws 2 全绿。
  - AC-002：`re_verified` — AC-002 / AC-002e2e 用例通过；注入脚本 `post()` 从 window 读 nonce 经代码核实（network_hook.ts:23 / ws:89 / storage:42）；ws 发送侧经 push 断言验证。
  - AC-003：`re_verified` — AC-003（旧 nonce 拒 / 新 nonce 接受）与 AC-003b（restart 后新 window nonce 接受）通过；生产每次 start `generate_nonce()` 保证不同（http 下 Math.random fallback，f006 已修）。
  - coverage = 3 / 3
- 总体判断：f006（http 非 secure context 采集中断）已正确修复且三通道一致，f001/f002/f004/f005 均消除；仅存 minor（f003 潜在脆弱、f007 已接受取舍、f008 DRY），无未解决 critical/important，verdict PASS。
- 系统性 follow-up：无已有 tid。f007 建议登记 follow-up：标题「记录 content hook window 全局 nonce 安全取舍到 decisions」，slug `content_nonce_security_tradeoff_doc`，阻断性 minor。

verdict: PASS
