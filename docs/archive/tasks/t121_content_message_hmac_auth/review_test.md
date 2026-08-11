# Task review t121（reviewer_focus: 测试）

- task：`t121_content_message_hmac_auth`
- spec：`docs/tasks/t121_content_message_hmac_auth/spec.md`
- diff_anchor：`0d2b4f4be83c58d16acf3a3a401bf77d61fdb517`
- target：`git diff 0d2b4f4be83c58d16acf3a3a401bf77d61fdb517`
- round：1
- reviewed_at：2026-08-11 18:00 UTC+8

## Findings

### t121_test_f001 - 改测后的 AC-003b 验证假行为，掩盖 stop→start 真实数据丢失回归

- 严重度：critical
- 锚点：AC-004（原「非签名消息被拒」门控语义不回归）+ 可观测行为缺陷（stop→start 后采集数据全丢）
- 位置：`tests/unit/content_postmessage_nonce.test.ts:199-231`（改动点 216-225）；`src/extension/content/network_hook.ts:19,23,327-329,342`
- 问题：注入脚本首行 `if (window.__capture_all_network_hook_installed__) return;`（network_hook.ts:19）置位后 stop 不清除，stop→start 不重注入；SECRET 内联闭包（:23）永不更新；start 每次旋转 secret（:329）；content 用当前 secret 校验（:342）。由此：stop→start 后页面旧注入脚本的 `post()` 仍用旧 SECRET 计算 `data.sig`（:30），content 以新 secret 校验失败 → **新采集内所有网络消息被拒收，数据丢失**。storage（`storage_capture.ts:32,116,128`）与 ws（`websocket_capture.ts` 同构）同病。T097 f005 专修的正是「stop→start 后采集仍工作」，本 diff 把该场景改回数据丢失，而 AC-003b 测试（本应防护此回归）被改成用 `sign_message(TEST_SECRET)`（helper 以**当前** secret 签名）手工构造消息冒充「注入脚本发送的事件」（:217），与注入脚本真实输出（旧 secret 签名）不一致——测试全绿但真实链路已坏。同构问题也波及 AC-003s（:336-380）：它用 `sign_message_with_secret(..., 'secret-b')` 验证「新 secret 签名被接受」，但真实页面不存在能产出新 secret 签名的注入脚本，content 层语义成立而真实链路失效。
- 建议：修复实现（stop→start 时使注入脚本 SECRET 同步，或 start 时清除 guard 重新注入；注意不得把 secret 写 window）；修复后新增测试驱动真实注入脚本（eval 后实际触发其 post/fetch 路径）验证 stop→start 后消息仍入库，且旋转 secret 后旧 secret 签名被拒。

### t121_test_f002 - 注入脚本 SYNC_HMAC_JS 签名路径零执行测试，双实现漂移无防护

- 严重度：critical
- 锚点：AC-001（注入脚本持 secret 计算签名——注入脚本侧行为完全未验证）；可测试性声明「注入脚本逻辑经 mock/vi 执行验证签名构造与校验」未落实
- 位置：`src/extension/content/content_hmac.ts:150-234`（SYNC_HMAC_JS）；`tests/unit/content_postmessage_nonce.test.ts:171-197`（AC-002e2e）；`tests/support/helpers/signed_message.ts:16`
- 问题：全部测试的签名均由 helper `signed_message.ts` 用 **TS 版**实现生成；注入脚本的 `sign_str` 从未被调用。AC-002e2e 名义「端到端」，实际 eval 注入脚本后只做语法检查（:181 不抛错即通过），随后 dispatch 的是 helper 签名消息，**注入脚本内 SHA-256/HMAC/canonical/sign_str 无一行被执行**。storage/ws 测试连 eval 都没有。content_hmac.ts:5 注释声明「正确性由 RFC 4231 测试向量锁定」，但测试套件中无任何 RFC 4231 / SHA-256 / HMAC 向量测试（grep 确认 `tests/` 内仅 `hash.test.ts` 测 `src/shared/hash` 的 Web Crypto 实现，与 content_hmac 同步实现无关）。双实现若漂移（任一方向改动），真实注入脚本消息要么全部被拒（数据丢失）要么签名不可信，测试全绿无法发现。reviewer 独立复验：TS 版与 SYNC_HMAC_JS 版当前输出与 RFC 4231 用例 1/2、Node `crypto` HMAC-SHA256、标准 SHA-256 向量（含 55/56/63/64/65/1000 字节跨块边界、长 key >64 触发 key 哈希、中文/emoji）**全部一致**——实现当前正确，但无测试锚定。
- 建议：新增直接测试（jsdom 内 eval SYNC_HMAC_JS 或以函数求值方式提取注入函数）执行注入脚本侧签名，与 TS 版/固定 RFC 4231 向量比对；至少为 `hmac_sha256_hex` 补 2-3 条 RFC 4231 向量 + 跨块长度边界用例，锁定双实现一致。

### t121_test_f003 - AC-001s「secret 不外泄」断言自相矛盾，secret 明文在 MAIN world 可读脚本文本中

- 严重度：important
- 锚点：AC-001（secret 仅注入脚本持有，仅读 nonce 的页面脚本无法构造合法签名）；测试策略「测试覆盖 secret 不外泄给页面 MAIN world 的场景」
- 位置：`tests/unit/content_postmessage_nonce.test.ts:388-399`；`src/extension/content/network_hook.ts:17-24`（storage/ws 同构）
- 问题：测试以 `expect(injected!).toContain("var SECRET = 'secret-hidden';")`（:394）作为「不外泄」证据，并注释「SECRET 为闭包 var（非 window 全局赋值）」。但该断言恰好证明 secret **明文**存在于注入脚本文本中，而注入脚本经 `document.createElement('script')` + `appendChild`（network_hook.ts:303-305）进页面 MAIN world——页面脚本可提前 monkey-patch appendChild 或挂 MutationObserver 读取该元素 textContent 提取 SECRET，进而伪造合法签名。「不写 window 全局」≠「不外泄给页面 MAIN world」，测试验证的属性弱于其声称的属性（存在即通过变体）。spec 风险区「需保持 secret 仅注入脚本持有」未达成：任何可读 DOM 的页面脚本都能获取 secret，伪造面未解决。该测试另断言 `window.__capture_all_network_secret__` undefined（:399）同样只覆盖「不写 window」。
- 建议：修正安全模型（secret 不落 MAIN world 可读存储——考虑隔离域内保持 secret 的通道，如 content 与注入脚本经 CSP 受限的隔离世界通信，或注入脚本仅持有每次 post 的单次派生值），并将测试改为验证 secret 对页面脚本不可达（而非仅非 window 全局）；若安全模型维持现状，则 AC-001 的「页面脚本无法构造合法签名」前提不成立，需按实现缺陷处置。

### t121_test_f004 - storage/ws 无「正确 nonce + 签名缺失」负向用例（仅 network 覆盖）

- 严重度：minor
- 锚点：AC-002（签名缺失/不匹配消息被拒）在三通道的负向分支
- 位置：`tests/unit/storage_capture.test.ts:50-68`；`tests/unit/websocket_capture_page.test.ts:75-93`
- 问题：storage/ws 的拒收用例均因 nonce 不匹配（nonce 检查先于签名检查），`verify_payload` 负向分支只在 network 的 AC-002b（content_postmessage_nonce.test.ts:93-123）触达。三通道共用同一 `verify_payload` 且 storage/ws 合法消息正向触达校验路径，负向语义已有 network 覆盖，不阻断；建议在 storage/ws 各补一条「正确 nonce + 无签名」用例以锁通道级门控顺序。
- 建议：各补一条负向用例即可。

## 结论

- 前轮 finding 复核：Round 1，无
- 改测方向复核：本 diff 对既有测试的改动主要是把消息构造包上签名（旧测试消息在新签名门控下必然被拒，包合法签名属适配新语义的合法改法，断言预期未迁就实现）。例外：AC-003b（content_postmessage_nonce.test.ts:199-231）从「注入脚本消息 stop→start 后仍入库」静默变成「helper 以当前 secret 签名消息被接受」，验证对象被替换、真实回归被掩盖——见 f001，不属「迁就实现」但属「测假行为」
- 本轮新发现：4 条（f001-f004）
- 未进表的提示：
  - `generate_secret` 的 Math.random fallback 路径（content_hmac.ts:123-125）无测试；生产环境通常有 `crypto.getRandomValues`，AC 无直接要求，建议后续补
  - `canonical_payload` 对 `undefined` 顶层/属性值的语义（JSON.stringify(undefined) 返回非字符串）仅理论边界，真实三通道 payload 均显式赋值，无实际风险
  - AC-002e2e 测试手动翻转 `__capture_all_network_hook_installed__`（:177、:203），测试间通过 window 全局耦合，guard 状态管理脆弱；非阻断
- 总体判断：HMAC 双实现数学正确性经 reviewer 独立复验成立，但三处测试可信问题（f001 假端到端掩盖真实数据丢失回归、f002 注入脚本签名路径零执行、f003 不外泄断言自相矛盾）未解决，安全敏感 task 不可放行
- 系统性 follow-up：无
- AC 复验方式：
  - AC-001：`re_verified`——reviewer 独立验证 HMAC 双实现与 RFC 4231/Node crypto 一致、canonical 双实现一致、secret 每次 start 旋转（代码+测试双证）；但「secret 仅注入脚本持有」属性**不成立**（f003），「页面脚本无法构造合法签名」前提被脚本文本可读破坏
  - AC-002：`re_verified`——重跑 5 个相关测试文件 32 用例全绿；AC-002b 负向（无签名/错签名拒收）+ 三通道正向（合法签名入库）断言与代码路径核对一致
  - AC-003：`re_verified`——AC-003s 验证 content 层旧 secret 拒/新 secret 收，代码确认每次 start 旋转；但真实链路 stop→start 后注入脚本旧 SECRET 导致新采集内消息全拒（f001），AC-003 字面语义成立、回归语义被破坏
  - AC-004：`re_verified`——三通道 `verify_payload` 调用点逐一核对存在且门控顺序为 nonce→签名；「原门控语义不回归」被 f001 打破（stop→start 采集恢复语义回归为数据丢失）
  - coverage = 4 / 4（其中 AC-001 安全属性与 AC-004 回归语义复验结论为「不成立」，见 f003/f001）
  - 无 trust_prior 项（全部可本地自动验证）

verdict: FAIL

reviewed_scope: 7da99edf4a2c1edf

## Round 2 (2026-08-11 18:40 UTC+8)

### 前轮 finding 复核（以 diff 与实跑为准）

实跑基准：`npx vitest run` 覆盖 7 个相关测试文件 44 用例全绿（含 content_hmac_vectors 4、content_postmessage_nonce 15、storage 6、ws page 9、ws injected 4、gate_behavior 4、event_id 2）。向量期望值 reviewer 用 node:crypto 独立复算 5 条全部一致。

- **t121_test_f001（critical，stop→start 断流/AC-003b 假端到端）→ 已消除**。实现：guard 语义改为「还原上次 hook 后重装」（`network_hook.ts:21-28` 还原块、`:171-175` prev 保存点；storage/ws 同构）。还原点覆盖注入脚本全部包装面（fetch + XHR open/send；storage 6 方法；WebSocket），重装前重新读取 `window.fetch`（restore 后），无 hook 链叠加；旧 wrapper 残留消息持旧 SECRET 被 content 拒收，无双写。测试：新增 `T121restart`（`content_postmessage_nonce.test.ts:452-510`）eval 真实页面脚本 + 真实 fetch 走注入 wrapper，`verify_payload('secret-r2', msg)` 通过证明重注入脚本持新 SECRET，旧 SECRET 消息被 content 拒收——真实链路回归已锁定。
- **t121_test_f002（critical，注入脚本 JS 签名路径零执行）→ 已消除**。`content_hmac_vectors.test.ts:15-18` 经 `new Function(SYNC_HMAC_JS)` 真实执行注入侧实现，5 条向量 TS 版逐条断言（`:30-34`）、JS 版与 TS 逐条对照（`:36-40`）、canonical 双实现对照（`:42-52`，含中文/嵌套/undefined/空数组）；5 条期望值与 node:crypto 独立复算完全一致（2 条标准向量 + 3 条生成值）。`T121e2e`（`:415-450`）eval 完整页面脚本触发真实 fetch hook，断言 64 位 hex 签名、`verify_payload(TEST_SECRET, msg)===true`、篡改 url 后拒绝——注入侧 sign_str 真实执行且与 content TS 校验交叉验证。「正确性由 RFC 4231 测试向量锁定」注释（`content_hmac.ts:5`）现与事实相符。
- **t121_test_f003（important，AC-001s「不外泄」断言自相矛盾）→ 已解决**。处置路径为「语义修正 + ADR-020 威胁模型边界」：AC-001s（`:383-413`）断言收窄为「SECRET 为闭包 var、非 window 全局、window 无 secret、仅读 nonce 消息被拒」，与 spec AC-001「仅读取 window nonce 的页面脚本无法构造合法签名」的限定语一致；`docs/blueprint/decisions.md` ADR-020 如实记录边界——「对抗性页面（MutationObserver/DOM hook 拦截注入脚本文本）可窃取内联 secret……该暴露面不在本方案防御范围」，且记录断流规避的 guard 语义变更。ADR 记录与代码实现一致，无失实。残留仅文字措辞（见 f006）。
- **t121_test_f004（minor，storage/ws 缺「正确 nonce+无签名」负向用例）→ 已消除**。`storage_capture.test.ts:70-79` 与 `websocket_capture_page.test.ts:95-105` 各补「正确 nonce 但签名缺失的消息被拒」用例，均实跑通过。
- **t121_code_f001（important，断流）→ 已消除**（与 test f001 同一修复面；`T121restart` 回归测试覆盖）。
- **t121_code_f002（important，注入侧零执行测试）→ 已消除**（向量测试 + `T121e2e`，见 test f002 复核）。
- **t121_code_f003（minor，ws injected 测试无参调用）→ 已消除**。`websocket_capture_injected_script.test.ts:71` 改 `eval(build_page_script(TEST_SECRET))`；仓库内已无 `build_page_script()` 无参残留调用（grep 确认）。

### 改测方向复核

无「迁就实现」改测。本轮对既有测试的改动仅两类：消息包合法签名（`sign_message`/`sign_message_with_secret`）适配新签名门控、`build_page_script` 补 secret 参数适配接口签名变更——断言预期均未向当前实现输出让步；AC-001s 断言调整属 f003 处置的语义收窄（与 spec 限定语对齐），非实现驱动。无删 expect/反转/弱化/跳过模式。

### 本轮新发现

### t121_test_f005 - 向量测试未覆盖 SHA-256 跨块边界与 HMAC 长 key 分支（回归锁定缺口）

- 严重度：minor
- 锚点：AC-001（签名实现边界分支无自动化锁定；f002 建议中「跨块长度边界用例」未落实）
- 位置：`tests/unit/content_hmac_vectors.test.ts:21-27`（RFC_CASES 全部消息 ≤50 字节、key ≤40 字节）
- 问题：5 条向量消息全部落在 SHA-256 单块区间（≤55 字节）、key 均 <64 字节，SHA-256 补齐算术的双块路径（消息 56-119 字节）与 HMAC key>64 的 key 哈希分支无测试锁定；两分支真实可达（采集消息含 response_body，长度可超 55 字节）。reviewer 独立验证当前实现在这两处边界（消息 55/56/63/64/65/100/1000 字节、key 63/64/65/100/131 字节）与 node:crypto 全部一致——实现正确，属防漂移缺口而非真 bug。
- 建议：补 ≥2 条用例：消息 56 与 64 字节（跨块边界）、key 65 与 131 字节（触发 key 哈希），期望值取 RFC 4231 case 6/7 或 node:crypto 实测。

### t121_test_f006 - AC-001s 标题/注释仍过度声明「不暴露给页面 MAIN world」，与 ADR-020 边界矛盾

- 严重度：minor
- 锚点：AC-001 安全属性表述一致性（测试注释可能误导维护者高估防御面）
- 位置：`tests/unit/content_postmessage_nonce.test.ts:383`（标题「secret 不暴露给页面 MAIN world（不写 window 全局）」）、`:399`（注释「页面脚本只能读到 nonce，读不到 secret」）
- 问题：ADR-020 明确记录对抗性页面可经 DOM hook 窃取内联 secret、该面不在防御范围；但测试标题仍称「不暴露给页面 MAIN world」、注释称「读不到 secret」，与 ADR 记录直接矛盾。断言本身（闭包 var、非 window 全局、window 无 secret、仅读 nonce 拒收）与修正后语义一致，仅文字残留过度声明。
- 建议：标题/注释与 ADR-020 对齐，如「secret 不写 window 全局；仅读 nonce 无法构造合法签名（对抗性 DOM hook 窃取面见 ADR-020）」。

### t121_test_f007 - AC-003b 标题描述已废弃的 guard 语义

- 严重度：minor
- 锚点：无 AC 违反；测试文档与实现行为不符
- 位置：`tests/unit/content_postmessage_nonce.test.ts:200`（标题「注入脚本（guard 阻止二次注入）仍发新 nonce 且入库」）
- 问题：T121 已将 guard 语义从「阻止重注入」改为「还原上次 hook 后重装」，该标题/注释仍描述旧语义；测试实际 eval 第二次脚本时会走还原+重装路径（prev 未存则跳过还原）。断言（新 nonce 消息入库）仍有效，属 T097 nonce 旋转回归，但与 T121restart 语义重叠。
- 建议：标题与注释同步新语义；或并入 T121restart 维护。

### 结论（Round 2）

- 前轮 finding 复核：f001/f002（test+code）与 code f001 经 diff+实跑核实已消除；test f003 按「语义修正+ADR-020」路径解决；test f004、code f003 已消除。前轮 blocker 无一遗留。
- 改测方向复核：无迁就实现改测（见上）。
- 本轮新发现：3 条（f005-f007，均 minor）。
- 未进表提示：
  - `T121restart` 未断言「双 wrap」防护（`prev_hook` 缺失时 guard 跳过后重装会新包旧 wrapper 造成双 post；需页面主动删除 `__capture_all_network_hook_prev__` 才可达，对抗性窄场景，非阻断）
  - XHR 还原路径无测试（T121restart 仅 fetch）；storage/ws 通道 restore+reinstall 无独立回归测试（三通道结构同构、network 已验证，属「再加 case」）
  - storage 注入脚本 post() 组装路径无直接执行测试（sign 正确性由向量测试锁定，postMessage 组装与 ws/network 同构）；ws injected 测试已执行真实 post() 但未断言 sig 字段值
  - 注入脚本 `sign_str` 不排除既有 sig 字段（TS `sign_payload` 显式排除）——语义分叉仍存，当前 post() 均新建 payload 无触发路径（Round 1 code review 已提示，未变）
  - `generate_secret` Math.random fallback 无测试；AC-002e2e/AC-003b 手动翻转 guard 的 window 全局耦合（Round 1 已提，均未变，非阻断）
- 总体判断：7 条前轮 finding 全部以 diff 与实跑核实消除/解决，本轮 3 条 minor 均属覆盖扩展与措辞，无未解决 critical/important，可放行。
- 系统性 follow-up：无新跨 task 缺口（Round 1 code review 建议的 restart 恢复机制与注入脚本签名测试锁定已在本 task 内落实）。

### AC 复验方式（Round 2）

- AC-001：`re_verified`——向量测试 5 条期望值经 node:crypto 独立复算全一致、JS/TS 双实现逐用例对照；`T121e2e` 真实注入脚本签名被 TS `verify_payload` 接受、篡改被拒；`AC-001s` 验证非 window 全局且仅读 nonce 消息被拒。安全边界按 ADR-020 文档化（对抗性 DOM hook 面外）。
- AC-002：`re_verified`——AC-002b（无签名/错签名拒）+ storage/ws 新增负向用例 + 三通道正向入库断言，7 文件 44 用例实跑全绿。
- AC-003：`re_verified`——AC-003s（secret 旋转旧拒新收）、AC-003/003b/004（nonce 旋转）、T121restart（真实重注入脚本持新 SECRET 后采集不断流、旧 SECRET 拒收）。
- AC-004：`re_verified`——三通道 `verify_payload` 调用点逐一核对（network_hook.ts:357、storage_capture.ts:150、websocket_capture.ts:192），门控顺序 nonce→签名；restart 断流语义由 T121restart 锁定。
- coverage = 4 / 4（无 trust_prior 项）

reviewed_scope: e14dd27060384c3f

verdict: PASS

## Round 3 (2026-08-11 18:45 UTC+8)

### 前轮 finding 复核（以 diff 与实跑为准）

实跑基准：7 个相关测试文件 46 用例全绿（Round 2 44 + storage 旋转 1 + 跨块边界 1）。边界正确性 reviewer 独立复算：TS 版跨块/长 key/UTF-8 与 node:crypto 全部一致、JS 注入版与 TS 版逐项一致、canonical 双实现一致（8 种消息长度 × 5 种 key + 中文/emoji 样例，独立脚本复算 PASS）。

- **t121_test_f005（minor，向量未覆盖跨块/长 key/UTF-8）→ 已修（换形式，见下）**。`content_hmac_vectors.test.ts:42-55` 新增「跨块边界与长 key 分支双实现一致」：消息 55/56/57/63/64/65/112/1000 字节 × key 63/64/65/131/short 全组合对照 + 中文/emoji 多字节 UTF-8，断言 JS 版 === TS 版（`toBe` 精确比对）。实现侧未按 f005 建议「期望值取 RFC 4231 case 6/7 或 node:crypto 实测」用标准值锚定，改为双实现对照——TS 版跨块/长 key 路径仍无标准期望值直接锁定（RFC_CASES 最长消息 50 字节、最长 key 40 字节，均在单块/短 key 区间），若双实现同源同错，测试仍绿。属理论残留（两版独立实现、reviewer 复算当前正确），非阻断，见「未进表提示」。
- **t121_test_f006（minor，AC-001s 标题/注释过度声明）→ 已消除**。`:383` 标题改为「secret 不写 window 全局——仅读 window nonce 的页面脚本无法构造签名」、`:399-400` 注释注明「对抗性 DOM hook 窃取注入脚本文本的暴露面见 ADR-020 威胁模型边界」——与 ADR-020 及 spec AC-001 限定语一致，过度声明已清除。
- **t121_test_f007（minor，AC-003b 标题描述旧 guard 语义）→ 已消除**。`:200` 标题改为「stop→start 后窗口 nonce 旋转，重注入脚本仍发新 nonce 且入库」，不再表述「guard 阻止二次注入」；`:203-204` 注释「首次注入脚本已安装（guard 置位）」为手动置位模拟的事实陈述，与新语义（置位→走还原+重装）不冲突。
- **t121_code_f004（minor，storage/ws 重注入无测试触达 + T121restart 未锁双写）→ 修不彻底（部分消除）**。已修：`content_postmessage_nonce.test.ts:482,495` T121restart 对 `msgs1`/`msgs2` 断言收紧为 `toHaveLength(1)`（原 `toBeGreaterThan(0)`，锁单条无双写）；`storage_capture.test.ts:87-106` 新增 storage 通道「stop→start secret 旋转后新签名接受、旧签名被拒」用例。未落实：f004 建议的「storage/ws 各补一条**注入脚本级**重注入用例（eval 两次、换 secret、触发真实路径）」——storage 新用例为 content 层 dispatch 手工签名消息（未 eval 注入脚本，storage 注入脚本还原+重装路径 `storage_capture.ts:33-44` 仍不被执行），ws 通道（`websocket_capture_injected_script.test.ts`）完全无旋转/重注入用例。即两通道的还原字段名/顺序漂移仍无独立回归测试，同构逻辑仅由 network T121restart 覆盖。minor 级残留，不阻断。
- **t121_code_f005（minor，spec 未知契约清单条目未删）→ 已消除**。`spec.md:71` 条目已改为删除标记 + 结论（「content 每次 start 生成 secret，内联进注入脚本闭包（不写 window）…见 ADR-020」），与实现及 ADR-020 一致，注明验证方式。

### 改测方向复核

无「迁就实现」改测。本轮对既有测试仅三类改动：标题/注释措辞对齐 ADR-020（f006/f007 处置）、T121restart 断言收紧 `>0 → ===1`（更强，非弱化）、spec.md 文档条目（code f005）。新增用例（跨块向量、storage 旋转）断言均实质，无删 expect/反转/弱化/跳过模式。

### 本轮新发现

无（0 条）。

### 结论（Round 3）

- 前轮 finding 复核：Round 2 共 5 条 minor（test f005-f007 + code f004-f005）：f006/f007/code f005 已消除；test f005 已修（双实现对照形式，标准期望值未落实，理论残留见下）；code f004 修不彻底——T121restart 锁双写与 storage 通道旋转语义已覆盖，storage/ws 注入脚本级重注入用例仍未补（minor 残留）。无未解决 critical/important。
- 改测方向复核：无（见上）。
- 本轮新发现：0 条。
- 未进表的提示：
  - test f005 残留：跨块/长 key 分支为「JS vs TS 对照」而非「标准期望值」，TS 版边界路径无标准值直接锚定（双实现同错则绿；reviewer 复算当前实现正确）。可选增强：补 2 条标准期望值（RFC 4231 case 6/7 或 node:crypto 实测值）直接锚定 TS 版边界输出。
  - code f004 残留（minor）：storage/ws 注入脚本还原+重装路径无独立测试，同构逻辑仅 network T121restart 覆盖；若需闭环，storage/ws 各补一条 eval 两次换 secret 的真实重注入用例。
  - 前两轮遗留提示（sign_str 不排除既有 sig 字段的语义分叉、generate_secret Math.random fallback 无测试、AC-002e2e 手动翻转 guard 的 window 全局耦合）均未变，非本轮新增，不阻断。
- 总体判断：生产代码自 Round 2 零改动（锚点逐文件核对一致），5 条 minor 中 3 条消除、2 条以可接受形式处置（f005 换形式、f004 部分消除），残留均为 minor 级覆盖扩展/文档措辞，无未解决 critical/important，可放行。
- 系统性 follow-up：无新跨 task 缺口。

### AC 复验方式（Round 3）

- AC-001：`re_verified`——向量测试 TS 版对 5 条标准值 + JS/TS 全区间对照（含跨块/长 key/UTF-8 边界，reviewer 独立复算与 node:crypto 一致）；T121e2e 真实注入脚本签名被 TS 校验接受、篡改被拒；AC-001s 验证 secret 非 window 全局、仅读 nonce 消息被拒；安全边界按 ADR-020 文档化。
- AC-002：`re_verified`——AC-002b（无签名/错签名拒）+ storage/ws 各「正确 nonce + 签名缺失被拒」负向用例 + 三通道正向入库断言，7 文件 46 用例实跑全绿。
- AC-003：`re_verified`——AC-003s（secret 旋转旧拒新收）、T121restart（真实重注入脚本持新 SECRET 不断流、旧 SECRET 拒收）、storage 旋转用例（storage_capture.test.ts:87-106）三通道旋转语义已覆盖。
- AC-004：`re_verified`——三通道 `verify_payload` 调用点核对（network_hook.ts:357、storage_capture.ts:151、websocket_capture.ts:193），门控顺序 nonce→签名；restart 断流语义由 T121restart 锁定。
- coverage = 4 / 4（无 trust_prior 项）

reviewed_scope: 80c8a96dd778186f

verdict: PASS
