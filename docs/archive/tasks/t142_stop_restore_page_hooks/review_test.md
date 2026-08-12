# Task review t142（reviewer_focus: 测试）

- task：`t142_stop_restore_page_hooks`
- spec：`docs/tasks/t142_stop_restore_page_hooks/spec.md`
- diff_anchor：`51e0843c0bff79665b8d2e166edc584b7da11f22`
- target：`git diff 51e0843c0bff79665b8d2e166edc584b7da11f22`
- round：1
- reviewed_at：2026-08-12 20:20 UTC+8

## Findings

### t142_test_f001 - AC-001 还原行为断言在 jsdom 下空转：fetch/XHR「还原」断言恒真，还原内容未验证

- 严重度：important
- 锚点：AC-001（stop 后 fetch/XHR/localStorage/WebSocket 还原为原始实现）
- 位置：`tests/unit/t142_stop_restore_page_hooks.test.ts:52-54`（`expect(window.fetch).toBe(orig_fetch)` / XHR prototype 断言）、`:47-50`（兜底模板回显）
- 问题：
  1. jsdom 不执行 appendChild 注入的 `<script>` 元素——项目既有测试已反复记录此环境事实（`content_postmessage_nonce.test.ts:214`、`:420`、`:526`「jsdom 不执行注入脚本，手动 eval 模拟真实浏览器执行」；`storage_capture.test.ts` 与 `websocket_capture_injected_script.test.ts` 均用 `eval(build_page_script(...))` 执行注入脚本，而非依赖脚本元素执行）。因此本测试里 `start_network_hook` 注入的 hook 从未真正安装：`window.fetch`/XHR prototype 从未被改写，`:52-54` 的「还原后与原始引用一致」断言恒真（`undefined === undefined`），无判别力。
  2. 真正有判别力的只有 `:42` 的 `expect(script_spy).toHaveBeenCalledWith('script')`——能拦截到 `restore_page_script` 在 stop 期间创建了 script 元素（spy 装在 start 之后、stop 之前，stop 内仅此一处 createElement，精确）。它只能证明「stop 调用了还原注入路径」，不能证明还原内容正确。
  3. `:47-50` 兜底是**回显断言**：手造 `restore_body` 直接喂给 `page_script_restore`，断言输出包含输入。它验证的是模板函数把传入 body 原样插值，与 `network_hook.ts:320-330` 里 `restore_page_script` 实际传给模板的 signal/body 完全解耦。若生产侧还原遗漏 XHR（只写 `window.fetch = prev.fetch`）或 signal 写错，此断言仍绿。
- 失败场景：把 `network_hook.ts` `restore_page_script` 的 body 改成只还原 fetch、漏掉 `XMLHttpRequest.prototype.open/send`，本测试全部通过。AC-001 声称的「fetch/XHR 还原」在本测试中没有被行为级验证。
- 建议：遵循项目既有 eval 惯例（参考 `content_postmessage_nonce.test.ts:416-451` T121e2e），`start_network_hook` 前先把 `window.fetch` stub 成可观察函数、`__capture_all_network_hook_installed__ = false`，`eval(build_page_script(...))` 确认 hook 已安装（window.fetch 变体），stop 后断言 window.fetch 回到 stub——行为级验证还原。兜底回显断言可保留为模板层检查，但不能替代接线验证。

### t142_test_f002 - WebSocket stop 还原接线零断言：删 `restore_page_script` 测试仍绿

- 严重度：important
- 锚点：AC-001（WebSocket 还原）
- 位置：`tests/unit/t142_stop_restore_page_hooks.test.ts:81-87`
- 问题：ws 测试对 `stop_websocket_capture` 只有 `:83` 的 `expect(() => stop_websocket_capture()).not.toThrow()`（happy path 恒真）和 `:85-86` 的模板回显断言。没有任何断言验证 stop 是否创建了还原脚本——没有 createElement spy（对比 network 测试 `:38`），没有对注入脚本内容的检查。`stop_websocket_capture`（`websocket_capture.ts:233-241`）若删掉 `restore_page_script()` 调用（本 task 要修的 bug 类），本测试全部通过。
- 失败场景：`websocket_capture.ts` 的 `restore_page_script` 被完全移除，`stop_websocket_capture` 恢复为「只删 message_listener」，测试绿。AC-001 的 ws 部分无任何判别断言。
- 建议：至少加 `vi.spyOn(document, 'createElement')` 断言 stop 期间创建了 script 元素；更强是参考 f001 建议，stub `window.WebSocket` → `eval(build_page_script(secret))` → stop → 断言 `window.WebSocket` 回到 stub。

### t142_test_f003 - storage_capture 还原逻辑（本 diff 新增）零测试

- 严重度：important
- 锚点：AC-001（localStorage/sessionStorage 还原）
- 位置：`src/extension/content/storage_capture.ts:122-137`（新增 `restore_page_script`）、`:199`（stop 调用）；`tests/unit/t142_stop_restore_page_hooks.test.ts` 无任何 storage 用例
- 问题：本 diff 为 `storage_capture.ts` 新增了完整还原逻辑，但测试文件只覆盖 network_hook 与 websocket_capture，storage 一个用例都没有。AC-001 契约原文明确含 localStorage（「window.fetch/XHR/localStorage/WebSocket 还原为原始实现」），该分支的还原路径未被任何测试断言。既有 `storage_capture.test.ts` 的 stop 相关用例只验证消息不再转发，不触碰 window API 还原。
- 失败场景：`storage_capture.ts` 的 `restore_page_script` 内容写错（漏 session_clear 等）或 stop 不调用它，全仓库测试仍绿。新增生产逻辑零覆盖。
- 建议：补 storage 还原用例，参考既有 `storage_capture.test.ts:109-156` 的 mock-storage + eval 模式：注入 hook 后断言 localStorage.setItem 被替换，stop 后断言回到原始实现。

### t142_test_f004 - AC-003 降级断言恒真：只覆盖 happy path 不抛错，降级 catch 分支未触达

- 严重度：important
- 锚点：AC-003（还原失败（页面已变化）时静默降级不报错）
- 位置：`tests/unit/t142_stop_restore_page_hooks.test.ts:63-67`
- 问题：`:66` 的 `expect(() => stop_network_hook()).not.toThrow()` 在正常 jsdom 环境下调用，`restore_page_script` 的 `createElement/appendChild/remove` 都不会抛错，catch 分支（降级路径）从未进入。若把 `network_hook.ts:320-330` 的 `try { ... } catch { /* ignore */ }` 整体删掉，本测试仍绿。AC-003 的「页面已变化 → 静默降级」是唯一未被触达的分支，断言只能证明 happy path 不抛错。
- 失败场景：还原失败场景（如 `document.createElement` 抛错）下是否静默降级——测试从未构造该场景，删掉降级实现测试照样通过。
- 建议：spy `document.createElement` 抛异常（或删除 `document.documentElement`），再断言 `stop_network_hook()` 不抛错，显式触达 catch 分支。

### t142_test_f005 - 死代码：`created` 变量过滤后 `void`，无任何断言

- 严重度：minor
- 锚点：行为缺陷（无）
- 位置：`tests/unit/t142_stop_restore_page_hooks.test.ts:44-45`
- 问题：`const created = script_spy.mock.results.filter(...); void created;`——过滤结果从未断言。且过滤条件 `textContent?.includes('page_script_restore') === false` 语义可疑：还原脚本的 textContent 是 `page_script_restore(...)` 的**输出**（`if (window.__capture_all_network_hook_installed__) {...}`），本身不含字符串 `page_script_restore`，该过滤基本不过滤任何元素。疑为调试残留。
- 建议：删除该死代码，或补上对还原脚本 textContent 的真实断言。

### t142_test_f006 - AC-002 用例重复既有覆盖，无新增判别力

- 严重度：minor
- 锚点：AC-002（采集进行中 hook 行为不变）
- 位置：`tests/unit/t142_stop_restore_page_hooks.test.ts:57-61`
- 问题：`:60` 的 `expect(build_page_script(true, TEST_SECRET)).toContain('clone.text()')` 与既有 `network_hook_gate_behavior.test.ts:71-75`（AC-003b）完全重复。作为 AC-002 回归代理可以保留，但不构成新增覆盖。
- 建议：无需必改；若保留，注释注明引用既有覆盖即可。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 改测方向复核：无（本 diff 未修改既有测试，仅新增测试文件；无「迁就实现」的改测）
- 本轮新发现：6 条（f001-f004 important，f005-f006 minor）
- 未进表的提示：
  - 测试文件 `tests/unit/t142_stop_restore_page_hooks.test.ts` 目前为 untracked（`??`），不属 `git diff 51e0843...` 范围。实施 commit 须显式纳入，否则 AC-001 测试证据随 task 提交丢失；也意味着 review scope 指纹不含该文件，需留意实施侧渲染指纹时是否计入。
  - `:52` 的 `as never` 类型断言冗余，无必要（不掩盖内层表达式类型错误，纯噪音）。
  - `storage_capture.ts` 还原 body 用 `if (prev.xxx) window.xxx = prev.xxx` 形式、network/ws 用裸 `window.xxx = prev.xxx`，模板行为一致性非测试职责，略。
- 总体判断：AC-001/AC-003 的核心断言判别力不足——还原行为在 jsdom 下空转、ws/storage 还原接线零断言、降级路径恒真，存在 4 条未解决 important，测试不可信。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——逐一阅读测试断言并对照 jsdom 脚本执行惯例（既有测试明载「jsdom 不执行注入脚本」）：network 有 createElement spy（可判别「还原整体缺失」）但行为断言空转、ws/storage 还原无判别断言。
- AC-002：`re_verified`——断言读取：既有 network/ws/storage 测试保持通过，t142 新增 `clone.text()` 断言为既有 `network_hook_gate_behavior.test.ts:74` 的重复项。
- AC-003：`re_verified`——断言读取：`not.toThrow()` 仅 happy path，降级 catch 分支未触达。

coverage = re_verified / 总 AC 数 = 3/3

reviewed_scope: cde15ef869363513

verdict: FAIL

## Round 2 (2026-08-12 21:05 UTC+8)

### 前轮 finding 复核

- **f001 修不彻底（仍 important）**：模板/hook 行为级验证已补——`eval(build_page_script(...))` 安装后 `expect(window.fetch).not.toBe(orig_fetch)`、还原后 `toBe(orig_fetch)`、XHR `open`/`send` 还原、installed/prev 标记清理，均有判别力（`tests/unit/t142_stop_restore_page_hooks.test.ts:45-60`）。但 `stop_network_hook()` 在本测试文件中**无任何调用**；Round 1 中唯一验证 stop→restore 接线的 `document.createElement` spy（`toHaveBeenCalledWith('script')`）被移除。生产 `network_hook.ts:408` 若删除 `restore_page_script()` 调用（本 task 修复的 H-13 回归本体），测试仍全绿。且 `:52-53` 的 restore body 为硬编码副本，与生产 `network_hook.ts:323-324` 解耦：生产 body 若漏 XHR 或 signal 写错，测试不红。AC-001「stop 触发还原」这一核心可观察行为仍未触达。
- **f002 修不彻底（仍 important）**：同 f001。ws 模板还原已行为级验证（WebSocket 安装/还原，`:80-88`），但 `stop_websocket_capture()` 无任何测试调用；`websocket_capture.ts:235` 删 `restore_page_script()` 测试仍绿。AC-001 ws 部分「stop 触发还原」未验证。
- **f003 已消除**：storage 改用 `readFileSync` 结构断言锚定生产 `storage_capture.ts` 的 `restore_page_script`（`page_script_restore('storage'` + localStorage/sessionStorage 还原语句，`:96-100`），有判别力（删语句/改 signal 会红）。符合项目既有 readFileSync 结构断言先例（`content_page_script.test.ts:38-52`）。
- **f004 已消除（换形式，可接受）**：从恒真 `not.toThrow()` 改为 `readFileSync` 断言生产 `network_hook.ts` `restore_page_script` 含 `try {`/`} catch {`（`:109-112`）。切片范围（`function restore_page_script` → `export function stop_network_hook`）内含 restore_page_script 与 start_network_hook，start 无内联 try/catch，断言锚定正确；删除降级包裹会红。属结构级 pin（catch 分支未行为级触达），但判别力足够。
- **f005 已消除**：死代码 `created`/`void` 已删。
- **f006 已消除**：重复 AC-002 `clone.text()` 用例删除合法——AC-002 由既有 `network_hook_gate_behavior.test.ts:71-75`（AC-003b `clone.text()`）与 storage/ws 采集行为测试等价覆盖，非「为迁就实现而删测试」。

### 本轮新发现

- 无新增 finding。剩余 blocker 为 f001/f002 未修彻底的接线缺口。
- 提示（minor，未进 finding 表）：AC-003「页面已变化（installed 在但 prev 缺失）」降级路径可补行为级 case（设 installed=true、删 prev、eval restore，断言不抛错且标记清理）；ws/storage 的 restore try/catch 未被 AC-003 断言（只锚定 network）。

### 改测方向复核

- 本轮删除的 AC-002 `clone.text()` 用例为既有覆盖重复项，合法删除（见 f006 复核），非「迁就实现」。
- 新增断言均为行为级/结构级判别断言，无恒真、无 `.skip`/`.only`、无注释掉断言。
- `eslint-disable-next-line no-eval` 用于 eval 测试模式，同既有 `storage_capture.test.ts:124`、`content_postmessage_nonce.test.ts:179`，属项目既定惯例，非静默错误。
- `require('node:fs')`/`__dirname` 与既有 `content_script_uses_poll.test.ts:24`、`popup_immediate_refresh.test.ts:91` 一致，vitest shim 提供，非新风险。

### 总体判断

f003-f006 已消除；f001/f002 修不彻底——核心修复点（stop 触发 restore 注入）仍无测试触达，存在 2 条未解决 important，测试不可信。

### AC 复验方式（Round 2）

- AC-001：`re_verified`——读取测试断言：模板+body 行为级还原已验证（eval 安装/还原、XHR/WebSocket/localStorage 语句），但「stop 触发还原」生产接线无测试（f001/f002 未修彻底）。
- AC-002：`re_verified`——既有 storage/ws/network 采集行为测试保持通过；新文件未削弱。
- AC-003：`re_verified`——结构断言锚定 try/catch 包裹，判别力足够；catch 分支未行为级触达。

coverage = re_verified / 总 AC 数 = 3/3

reviewed_scope: cde15ef869363513

verdict: FAIL

## Round 3 (2026-08-12 21:30 UTC+8)

### 前轮 finding 复核

- **f001 已消除**：新增 `AC-001b: stop_network_hook 注入还原脚本（接线断言）`（`tests/unit/t142_stop_restore_page_hooks.test.ts:69-86`）。真实调用 `start_network_hook(...)` 后 eval 安装 hook，再 spy `document.createElement` 调 `stop_network_hook()`，过滤 textContent 含 `__capture_all_network_hook_installed__` 的 script，断言 `length > 0` 且含 `window.fetch = prev.fetch;` / `XMLHttpRequest.prototype.send = prev.send;`。判别力核实：
  - spy 装在 `start_network_hook`/`eval` 之后，只捕获 stop 期间 `restore_page_script` 创建的还原 script（start 的 inject/update_nonce 脚本未被捕获）；
  - 断言读取的是**生产** `network_hook.ts:323-324` 实际拼出的 textContent，非硬编码副本——生产 body 漏 XHR 或 signal 写错，`toContain`/过滤条件即红；
  - 删 `stop_network_hook` 内 `restore_page_script()` 调用 → stop 期间无 createElement → `length === 0` → 红。H-13 回归本体已被锁死。
- **f002 已消除**：新增 `AC-001b: stop_websocket_capture 注入 ws 还原脚本`（`tests/unit/t142_stop_restore_page_hooks.test.ts:121-134`），同款机制：start + eval 安装 → spy createElement → stop → 过滤 `__capture_all_ws_installed__` → 断言 `length > 0` 且含 `window.WebSocket = prev;`。删 `websocket_capture.ts:235` 的 restore 调用即红。
- **f003 保持已消除**：storage 结构断言未变（`:137-148`）。
- **f004 保持已消除**：AC-003 结构断言未变（`:150-160`）。
- **f005 保持已消除**：死代码已删，无复现。
- **f006 保持已消除**：AC-002 重复用例未复现。

### 本轮新发现

- 无新增 finding。
- 提示（minor，未进 finding 表）：
  - `document.createElement` spy 未在 afterEach `vi.restoreAllMocks()`，同文件后续测试（ws AC-001a、AC-003/storage 结构测试）经核实不调用 createElement，且 `vi.spyOn` 保留原实现，无交叉污染或假红/假绿，属卫生细节。
  - AC-003 降级 catch 分支仍未行为级触达（ws/storage 的 restore try/catch 也未结构断言），维持 Round 2 判定：结构 pin 判别力足够，非 blocker。

### 改测方向复核

- 本轮新增断言全部行为级/接线级判别断言，无恒真、无 `.skip`/`.only`、无注释掉断言、无弱化。未发现「迁就实现」的改测。

### 总体判断

6 条 finding 全部消除，无未解决 critical / important。AC-001/AC-002/AC-003 均有判别力断言锚定生产接线，测试可信。

### AC 复验方式（Round 3）

- AC-001：`re_verified`——逐条读断言：network/ws eval 安装+还原行为级验证，stop 接线经 createElement spy 捕获生产还原 script 并断言内容（删 restore 调用/漏语句/错 signal 均红）；storage 结构断言锚定生产还原语句。
- AC-002：`re_verified`——既有 network/ws/storage 采集行为测试保持通过，新文件未削弱；未新增重复用例。
- AC-003：`re_verified`——结构断言锚定生产 `try {`/`} catch {` 包裹（slice 范围经核实唯一 try/catch 对在 restore_page_script），判别力足够。

coverage = re_verified / 总 AC 数 = 3/3

reviewed_scope: cde15ef869363513

verdict: PASS
