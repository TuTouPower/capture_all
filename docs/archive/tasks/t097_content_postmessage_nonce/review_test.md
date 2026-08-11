# Task review t097（reviewer_focus: 测试）

- task：`t097_content_postmessage_nonce`
- spec：`docs/tasks/t097_content_postmessage_nonce/spec.md`
- diff_anchor：`5293872288edec8c210f804969d0bebb4b2b37df`
- target：`git diff 5293872288edec8c210f804969d0bebb4b2b37df`
- round：1
- reviewed_at：2026-08-11 03:41 UTC+8

## Findings

### t097_test_f001 - AC-001 拒绝行为仅 network 通道有测试，ws/storage 接收端 nonce 拒绝路径零负向覆盖

- 严重度：important
- 锚点：AC-001（枚举 network/ws/storage 三通道）
- 位置：`tests/unit/storage_capture.test.ts:23-29`、`tests/unit/websocket_capture_page.test.ts:12-24`
- 问题：三模块各自有独立 message_listener 与独立的 `d.nonce !== current_nonce` 拒绝行（`src/extension/content/storage_capture.ts`、`websocket_capture.ts`），但负向用例只存在于 network 通道（`content_postmessage_nonce.test.ts` 的 AC-001/AC-001b）。storage/ws 两个测试文件的 dispatch helper 恒带正确 nonce，全部用例只走接收成功路径。若 `storage_capture.ts` 或 `websocket_capture.ts` 删除/写错 nonce 检查，现有全量测试仍全部通过，AC-001 对这两个通道的可观测行为（伪造 SIGNAL 不入库）无任何测试兜底。
- 建议：为 storage/ws 各补一条无 nonce 与错 nonce 消息被拒（sender 不被调）的负向用例。

### t097_test_f002 - 注入脚本→接收端 nonce 端到端一致性未验证，「采集全无」风险无测试兜底

- 严重度：important
- 锚点：AC-002 + 范围「content 生成、注入脚本持有、接收端校验」链路
- 位置：`tests/unit/content_postmessage_nonce.test.ts:13-19`、`tests/unit/websocket_capture_injected_script.test.ts:57-61`
- 问题：AC-002 回归仅在接收端用手工 `window.dispatchEvent` 构造的、已知正确 nonce 事件验证，未走真实生产发送方（注入脚本）。network 注入脚本 `build_page_script`（`network_hook.ts:13`）在任何测试中均未被 eval，其新增的 8 处 `nonce: NONCE` 无功能验证；ws 注入脚本测试 `eval(build_page_script(NONCE))` 但 mock 掉 `window.postMessage`（仅记录，不达 content message_listener），且断言只查 `data_preview/data_bytes/direction`，不查 nonce。若注入脚本遗漏或写错 nonce（如 `build_page_script` 未用参数、`inject_page_script` 未传 `current_nonce`），脚本产生的消息在生产端会被全部丢弃（spec 风险「错误实现可能采集全无」），而当前所有测试仍通过。
- 建议：ws 注入脚本测试放开 postMessage mock 让消息实际走 content 接收校验，或至少断言 `posted_messages[*].nonce === NONCE`；network 侧补一条 eval 注入脚本→接收端可用性验证。

### t097_test_f003 - AC-003 nonce 生成侧未直接验证（crypto.randomUUID 被测试钩子覆盖）

- 严重度：minor
- 锚点：AC-003
- 位置：`tests/unit/content_postmessage_nonce.test.ts:86-130`
- 问题：AC-003 用 `_set_nonce_for_test` 手工指定 nonce-a/nonce-b，验证的是「nonce 改变后旧 nonce 失效」的可观测行为，未覆盖真实 `crypto.randomUUID()` 每次 start 生成不同值的生产路径。若实现把 `current_nonce` 提升为模块级常量（不复生成），此测试仍通过。
- 建议：spec 可测试性声明明确允许「两次 start 对比 nonce 或旧消息拒绝」，此处采用「旧消息拒绝」法属合规；可留待后续补一条两次 start 对比真实 nonce 的用例，不阻断。

## 结论

- 前轮 finding 复核（Round 1）：无
- 改测方向复核：无迁就实现。4 个既有测试文件（dom_network_hook_event_id / storage_capture / websocket_capture_page / websocket_capture_injected_script）的改动均为适配本 task 新契约：给 dispatch 消息补 `nonce`、调用 `_set_nonce_for_test` 对齐接收端。断言强度不变，无删 expect / 弱化 / 反转，AC-002 明确要求「带正确 nonce 合法事件仍入库」，属 spec 驱动的 fixture 更新。
- 本轮新发现：3（f001 important、f002 important、f003 minor）
- 未进表的提示：`_set_nonce_for_test` 为 spec 测试策略明确批准的测试钩子，不算 mock 误用；`network_hook.ts` 注入字符串内 `nonce: NONCE,` 缩进错乱为代码风格问题，不在测试审查范围；`content_postmessage_nonce.test.ts` afterEach 将 override 置 `''` 而非 null，因 vitest 各文件模块隔离且用例均先显式设置，无跨文件污染。
- 总体判断：核心 network 接收端校验测试真实触达 message_listener 与 nonce 检查，断言强度合格；但 AC-001 的 ws/storage 两通道拒绝路径与注入脚本→接收端 nonce 链路（本 task 核心安全机制）存在真实覆盖缺口，需补测后重审。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified` — 重跑 `content_postmessage_nonce.test.ts` 通过；AC-001/AC-001b 经 `window.dispatchEvent` → 真实 message_listener → `d.nonce !== current_nonce` 拒绝，断言 sender 不被调。注：复验仅覆盖 network 通道，ws/storage 通道见 f001。
- AC-002：`re_verified` — 重跑 AC-002 用例通过；sender 被调 1 次，`event.type === 'network_request'`、`data.url` 正确。注：接收端手工事件复验，注入脚本发送侧见 f002。
- AC-003：`re_verified` — 重跑 AC-003 用例通过；旧 nonce 被拒、新 nonce 被接受（`toHaveBeenCalledTimes` 1→1→2）。
- 覆盖率行：`coverage = 3 / 3`（全部 re_verified，但三 AC 复验均基于 network 通道 + 接收端；ws/storage 通道与注入脚本发送侧未独立复验，见 f001/f002）

reviewed_scope: f41e7f8ffe23cb23

verdict: FAIL

## Round 2 (2026-08-11 03:53 UTC+8)

reviewed_scope: 8ebfd803941d5f36

### Findings

#### t097_test_f004 - f001 修复的「同页 restart 沿用 nonce 且事件继续入库」无回归测试，退化 per-start 模型时全量测试仍绿

- 严重度：important
- 锚点：f001 修复要求「补一条覆盖『重启后真实脚本事件仍入库』的回归测试」；AC-002 重启路径缺测试
- 位置：`tests/unit/content_postmessage_nonce.test.ts`（AC-003 用例两次 start 之间调用 `_set_nonce_for_test('nonce-b')` 重置了 `hook_injected`，未覆盖「不重置 override 的 restart」）；afterEach `:24` 用 `_set_nonce_for_test('')`
- 问题：现网 5 个相关测试文件 24 用例全部为单次 start 或经 `_set_nonce_for_test` 强制换 nonce 的两次 start，无一覆盖「stop → 再次 start（不调用 `_set_nonce_for_test`）→ 首次 nonce 消息仍被接受」的 per-injection 连续性。若实现退化为 per-start（删除 `hook_injected` 门控，每次 start 重新 `current_nonce = _nonce_override ?? crypto.randomUUID()` 并重注入），AC-001/001b/002/003/002e2e 全部仍通过——f001 描述的「同页重启后采集静默失效」回归无任何自动化护栏，修复仅靠代码注释保证，属「AC 缺测试」。
- 建议：补一条 restart 连续性测试（network 即可，或三通道各一）：`_set_nonce_for_test('nonce-a')` → start → dispatch nonce-a 接受 → stop → start（不重置 override）→ dispatch nonce-a 应仍被接受（per-injection 语义）。per-start 回归下该测试失败，是 f001 的自动化护栏。

### 结论

- 前轮 finding 复核（Round 2）：
  - f001：**已消除**。storage_capture.test.ts 与 websocket_capture_page.test.ts 各补「无 nonce / 错 nonce 被拒」2 例，断言 sender 不被调（本轮重跑 5 文件 24 用例全绿）。
  - f002：**已消除**。ws 注入脚本测试经 `posted_messages.push` 覆盖断言每条 `nonce === NONCE`（websocket_capture_injected_script.test.ts:62-66）；network 补 AC-002e2e（eval build_page_script + 正确 nonce dispatch 接受）。
  - f003：**处置为遗留**（登记 pending）——minor，同意不阻断。
- 改测方向复核：无迁就实现。既有测试改动均为适配新契约（dispatch 补 nonce、beforeEach/afterEach 调 `_set_nonce_for_test`），断言强度不变，无删 expect / 弱化 / 反转 / .skip / .only。
- 本轮新发现：1 条（f004 important）
- 未进表的提示：
  - ws 注入脚本测试 `vi.spyOn(window,'addEventListener').mockImplementation(()=>{})`（websocket_capture_injected_script.test.ts:61）为冗余防御性 mock：postMessage 已 mock 不回发真实事件，该 mock 不掩盖行为，非危险模式。
  - AC-002e2e 未走真实 fetch/XHR 触发 post，network 注入脚本实际发送载荷的 nonce 未直接断言（ws 通道已断言；network_hook.ts 8 处 post 均含 `nonce: NONCE`，经代码核实）。
  - f003 遗留的「真实 randomUUID 未验证」按处置登记 pending。
- 总体判断：ws/storage 负向用例与注入脚本→接收端 nonce 链路已补齐；但 f001 修复的核心行为（同页 restart 沿用 nonce 继续入库）无回归测试，退化 per-start 模型时全量测试仍绿，修复缺自动化护栏；存在未解决 important，verdict FAIL。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified` — 三通道负向用例（network 2 + storage 2 + ws 2）全绿，断言 sender 不被调。
- AC-002：`re_verified`（单次 start）— AC-002 / AC-002e2e 用例通过；restart 路径无测试（见 f004）。
- AC-003：`re_verified` — AC-003 用例通过（旧 nonce 拒 / 新 nonce 接受）。
- 覆盖率行：`coverage = 3 / 3`（全部 re_verified；restart 路径待 f004 补测）

verdict: FAIL

## Round 3 (2026-08-11 04:05 UTC+8)

reviewed_scope: de2e92c3b9322695

### Findings

#### t097_test_f005 - AC-003b 手工写 window nonce，`update_page_nonce` 生产写路径无直接测试；网络通道注入脚本发送侧未真实触发

- 严重度：minor
- 锚点：f005 修复新增的 `update_page_nonce` 写路径无测试兜底（非 AC 完全无测试，覆盖可更广）
- 位置：`tests/unit/content_postmessage_nonce.test.ts:161-193`（AC-003b）；ws 发送侧断言 `tests/unit/websocket_capture_injected_script.test.ts:62-66`
- 问题：jsdom 不执行注入的 `<script>`，AC-003b 在 restart 后手动 `(window as any).__capture_all_network_nonce__ = 'nonce-y'` 模拟 `update_page_nonce` 的效果（:176 注释已透明说明）。若 `update_page_nonce` 被删除或 start_* 未调用它，AC-003b 仍通过——该生产函数无任何测试护栏。且 AC-003b 置 `installed__=true` 后 `eval(build_page_script())` 是 no-op，注入脚本从未真正安装，消息为手工 dispatch，网络通道「注入脚本 post() 从 window 读 nonce 并随消息发送」的发送侧未真实触发（ws 通道经 push 断言已覆盖发送侧）。整体：接收端旋转语义有测试，写侧 + 网络发送侧为跨通道间接覆盖。
- 建议：可选补测——spy `document.createElement` 断言 start 后注入的更新脚本 `textContent` 含 `JSON.stringify` 的新 nonce；或网络通道补一条经真实 fetch（stub `window.fetch` 返回 resolved Response）触发注入脚本 post() 并断言消息 nonce 为当前 window 变量值。非阻断。

### 结论

- 前轮 finding 复核（Round 3）：
  - f001：**已消除**。storage_capture.test.ts:44-62 / websocket_capture_page.test.ts:73-92 各补「无 nonce / 错 nonce 被拒」2 例，断言 sender 不被调。
  - f002：**已消除**。ws 注入脚本测试经 `posted_messages.push` 覆盖断言每条 `nonce === NONCE`（websocket_capture_injected_script.test.ts:62-66）；network 补 AC-002e2e（eval build_page_script + 正确 nonce dispatch 接受）。
  - f003：**处置为遗留**（登记 pending）——minor，同意不阻断。
  - f004：**已消除**。AC-003b 已补（content_postmessage_nonce.test.ts:161-193），验证 guard 置位（模拟扩展重建 / 二次注入被拦）下 restart 后新 window nonce 被接收端接受；其验证的是 f005 修复的接收端旋转语义（若 start 不旋转 current_nonce，本用例失败）。
- 改测方向复核：无迁就实现。既有测试改动均为适配新契约（dispatch 补 nonce、before/afterEach 调 `_set_nonce_for_test`、`PAGE_SCRIPT` 改名 `build_page_script`），断言强度不变；本轮新增仅 AC-003b。
- 本轮新发现：1 条（f005 minor）
- 未进表的提示：
  - ws 注入脚本测试 `vi.spyOn(window, 'addEventListener').mockImplementation(()=>{})`（websocket_capture_injected_script.test.ts:61）仍为冗余防御性 mock（postMessage 已 mock 不回发），非危险模式。
  - 生产 `crypto.randomUUID()` 真实生成路径仍未直接验证（f003 遗留）；且 http 非 secure context 下 `crypto.randomUUID` 不可用会使 start_* 抛错——此为代码层缺陷，已记 code 报告 f006，测试侧不重复。
- 总体判断：f004 的 restart 连续性回归测试已补，两条前轮 important 均消除；AC-001/002/003 全覆盖，无危险模式，无迁就实现的改测；仅 f005 minor 覆盖扩展建议，verdict PASS。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified` — 三通道负向用例（network 2 + storage 2 + ws 2）全绿，断言 sender 不被调。
- AC-002：`re_verified` — AC-002 / AC-002e2e 通过；ws 发送侧经 push 断言验证 nonce 来自 window 变量。
- AC-003：`re_verified` — AC-003（旧 nonce 拒 / 新 nonce 接受）与 AC-003b（restart 后新 window nonce 接受）通过。
- 覆盖率行：`coverage = 3 / 3`（全部 re_verified；`update_page_nonce` 写路径与网络发送侧为间接覆盖，见 f005）

verdict: PASS

## Round 4 (2026-08-11 04:15 UTC+8)

reviewed_scope: 5b48d5b401081a48

### Findings

#### t097_test_f006 - AC-002http 负向断言不能证明 fallback nonce 非空，注释高估证据；正向链路无断言

- 严重度：minor
- 锚点：覆盖可更广 + 测试证据表述；f006 回归护栏本身成立
- 位置：`tests/unit/content_postmessage_nonce.test.ts:195-224`（AC-002http）
- 问题：用例注释称「空 nonce 被拒 → 证明 current_nonce 非空（fallback 生成了有效值）」。但若 `current_nonce` 恰为空串 `''`，缺 nonce（undefined）与错 nonce（'wrong'）的消息 `d.nonce !== current_nonce` 均成立、均被拒——两条负向断言无法区分「fallback 生成了有效 nonce」与「current_nonce 为空」。该用例真正锚定 f006 回归的是 `expect(() => start_network_hook(...)).not.toThrow()`（crypto.randomUUID 不可用时 start 不崩），此断言有效；缺口在无正向断言证明「fallback 生成的 nonce 值被接收端接受」（用例无法得知生成值，模块未导出 current_nonce）。
- 建议：注释改为如实描述「验证 start 在 crypto.randomUUID 不可用时不抛」；如需正向覆盖，测试环境导出 current_nonce 读钩子后 dispatch 该值断言 sender 被调（非阻断）。

### 结论

- 前轮 finding 复核（Round 4）：
  - f001：**已消除**。storage_capture.test.ts 与 websocket_capture_page.test.ts 各补「无 nonce / 错 nonce 被拒」2 例，断言 sender 不被调。
  - f002：**已消除**。ws 注入脚本测试经 `posted_messages.push` 覆盖断言每条 `nonce === NONCE`；network AC-002e2e eval 注入脚本 + 正确 nonce dispatch 接受。
  - f003：**遗留（minor，登记 pending）**。真实随机生成路径未直接验证；AC-002http 补的是 fallback 路径（stub crypto 后走 Math.random），randomUUID 分支仍非直接验证。维持遗留处置。
  - f004：**已消除**。AC-003b 覆盖 stop→start 旋转后新 window nonce 被接受。
  - f005：**仍存在（minor）**。AC-003b 仍手动写 window nonce，`update_page_nonce` 生产写路径无直接测试；AC-002http 未覆盖该路径。维持 minor。
- 改测方向复核：无迁就实现。既有测试改动均为适配新契约（dispatch 补 nonce、beforeEach/afterEach 调 `_set_nonce_for_test`、`PAGE_SCRIPT`→`build_page_script`），断言强度不变，无删 expect / 弱化 / 反转 / .skip / .only；新增仅负向用例与 AC-002http。
- 本轮新发现：1 条（f006 minor）
- 未进表的提示：
  - AC-002http `vi.stubGlobal('crypto', {})` 未显式恢复：vitest 配置未开 `unstubGlobals`，本文件内该用例为末位、跨文件受 `isolate:true` 隔离，现无污染；后续追加用例或重排顺序需注意。
  - 相关 5 文件 26 用例全绿（本轮重跑）；全量套件 1186 用例中 logger.test.ts 1 例超时失败，孤立重跑通过，与 T097 无关（机器负载）。
- 总体判断：f006 回归护栏（start 不崩）已落地，前轮重要 finding 均消除；仅存 minor（f003/f005 遗留覆盖、f006 证据表述），无危险模式，无迁就实现的改测，verdict PASS。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified` — 三通道负向用例（network 2 + storage 2 + ws 2）全绿，断言 sender 不被调。
- AC-002：`re_verified` — AC-002 / AC-002e2e 通过；ws 发送侧经 push 断言验证 nonce 来自 window 变量；AC-002http 验证 http 场景 start 不崩。
- AC-003：`re_verified` — AC-003（旧 nonce 拒 / 新 nonce 接受）与 AC-003b（restart 后新 window nonce 接受）通过。
- 覆盖率行：`coverage = 3 / 3`（全部 re_verified；`update_page_nonce` 写路径与 fallback 正向链路为间接覆盖，见 f005/f006）

verdict: PASS
