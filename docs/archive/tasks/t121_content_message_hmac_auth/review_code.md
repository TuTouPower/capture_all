# Task review t121（reviewer_focus: 代码）

- task：`t121_content_message_hmac_auth`
- spec：`docs/tasks/t121_content_message_hmac_auth/spec.md`
- diff_anchor：`0d2b4f4be83c58d16acf3a3a401bf77d61fdb517`
- target：`git diff 0d2b4f4be83c58d16acf3a3a401bf77d61fdb517`
- round：1
- reviewed_at：2026-08-11 18:00 UTC+8

## Findings

### t121_code_f001 - stop→start / 扩展重建后三通道采集静默断流（secret 失配 + guard 阻止重注入）

- 严重度：important
- 锚点：可观测行为缺陷（数据丢失）——stop→start（页面未刷新）后全部采集消息被 HMAC 校验拒绝，静默断流至页面刷新；回退 t097 已验收的「restart 后采集仍工作」（f005）行为。spec AC-003 背书 secret 旋转本身，但实现未配套 restart 恢复机制，spec 未讨论该权衡。
- 位置：
  - `src/extension/content/network_hook.ts:329`（start 内 `current_secret = _secret_override ?? generate_secret()`）+ `network_hook.ts:19-20`（guard `window.__capture_all_network_hook_installed__` 阻止二次注入）
  - `src/extension/content/storage_capture.ts:116`（同构）+ `storage_capture.ts:32-33`（guard）
  - `src/extension/content/websocket_capture.ts:173`（同构）+ `websocket_capture.ts:33-34`（guard）
- 问题：注入脚本的 `SECRET` 内联进闭包、每次 start 旋转，但 stop 不清 guard、页面脚本无法卸载。用户 popup 停止采集再开始（`content_script.ts:45-53` start/stop 消息路径），或扩展更新/content script 重建（`content_script.ts:66-81` status poll 自动 start 路径），页面旧注入脚本继续持有旧 SECRET 发消息：nonce 动态读 window 最新值可通过（T097 设计），但 `verify_payload` 用新 secret 校验旧签名全部失败 → 三通道（network/ws/storage）事件 0 入库，无任何日志。t097 的 f005 正是修复此路径（动态 nonce 解耦 restart），t121 重新引入耦合。测试 `content_postmessage_nonce.test.ts:199-224`「restart 后采集仍工作」用 beforeEach 固定 `TEST_SECRET`、restart 不换 secret，未覆盖生产「每次 start 旋转 secret」的真实场景，掩盖回归。
- 建议：stop 时注入清除 guard 的小脚本（`window.__capture_all_network_hook_installed__ = false` 等三通道各自变量），使下次 start 重新注入带新 secret 的完整脚本（旧脚本残留消息因签名不符被拒，无重复入库）；或 start 时检测 guard 已置位则先重置再注入。同步补「旋转 secret + restart 后采集仍工作」的回归测试（不能再用固定 secret）。

### t121_code_f002 - 注入脚本签名路径（SYNC_HMAC_JS）零执行测试，AC-001 注入侧实现未验证

- 严重度：important
- 锚点：AC-001 前半「采集消息携带 per-message HMAC 签名（注入脚本持 secret 计算）」——仓库内没有任何测试执行注入脚本的签名代码；spec 可测试性声明「注入脚本逻辑经 mock/vi 执行验证签名构造与校验」未履行。TS 与 JS 注入版为两套独立同步实现，漂移无测试锁定。
- 位置：`src/extension/content/content_hmac.ts:113-233`（SYNC_HMAC_JS）；`tests/unit/content_postmessage_nonce.test.ts:177-193`（eval 注入脚本仅验证语法与字符串内容，不触发 post/sign）
- 问题：所有「接受」路径的签名均由 `tests/support/helpers/signed_message.ts`（TS 版 `hmac_sha256_hex`，与 content 侧 `verify_payload` 同源）构造，注入脚本的 `sign_str / hmac_sha256_str / sha256_hex_str / canonical_str` 从未被调用执行。测试自洽（helper 与 verify 同一实现必然互验），但无法发现 TS/JS 双实现漂移——若 JS 版有误，生产页面脚本签名的消息全部被拒（采集断流），而测试全绿（32 passed，已复跑确认）。`content_hmac.ts:2-5` 注释声称「正确性由 RFC 4231 测试向量锁定」「防双实现漂移」，但仓库内不存在任何 RFC 4231 向量测试（grep 仅 `signed_message.ts` 引用）。
- 补充证据（reviewer 独立验证）：本次审阅用 Node 独立跑 RFC 4231 case2/3/4/6/7 与 SHA-256('abc'/'')，TS 版与 JS 注入版输出完全一致且与 Node `crypto` 吻合；canonical 对含中文/嵌套/undefined 样例两版一致；JS 签名可被 TS `verify_payload` 通过。即当前实现正确，本 finding 针对的是自动化回归锁定缺失与 spec 测试声明未履行，不判定实现存在实际 bug。
- 建议：补一个测试——eval 注入脚本（或直接执行 SYNC_HMAC_JS 内函数）对 RFC 4231 向量断言 `hmac_sha256_str` 输出，并与 TS 版 `hmac_sha256_hex` 对同一消息比对（双实现一致性锁定）；可复用 `content_postmessage_nonce.test.ts` 现有 eval 基础设施。删除或修正「测试向量锁定」的注释（现状与事实不符）。

### t121_code_f003 - 既有测试未随 build_page_script 签名更新（无参调用 → SECRET='undefined'）

- 严重度：minor
- 锚点：接口变更遗漏调用点；tsconfig `exclude: ["tests"]` 使 tsc 不拦截，静默通过
- 位置：`tests/unit/websocket_capture_injected_script.test.ts:70`
- 问题：t121 将 `build_page_script(secret: string)` 改为必选参数，该既有测试仍 `eval(build_page_script())` → 注入脚本 `var SECRET = 'undefined'` 运行。该测试断言不涉及 sig，故仍绿（esbuild 转译不做类型检查，tsc 排除 tests），但注入脚本以伪 secret 执行、与 content 侧实际 secret 无关，后续若在该测试上扩展签名相关断言会产生误导。
- 建议：传入确定性 secret（如 `TEST_SECRET`），并视需要由 test reviewer 评估是否补签名断言。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：3 条（f001 important、f002 important、f003 minor）
- 未进表的提示：
  - 文件过大（降级规则，不进表）：`src/extension/content/network_hook.ts` 408 行（≥400 minor 阈值，本 task 净增 21 行；含内联注入脚本大字符串，属协议一体文件，未达 important 阈值 800）
  - 安全局限观察（范围外/AC 字面未违反，不进表）：secret 内联在注入脚本字符串（`var SECRET = '...'`），页面 MAIN world 脚本可通过 hook `document.createElement('script')`/`MutationObserver` 窃取 textContent，AC-001「仅读取 window nonce 的页面脚本无法构造合法签名」的限定语不覆盖主动 hook 场景；内联闭包已满足 spec「不写 window」要求，属内联方案固有暴露面
  - 风险提示：`generate_secret`（content_hmac.ts:96-106）无 `crypto.getRandomValues` 时 fallback 到 `Math.random()`（非加密安全，secret 可预测）；现代浏览器均具 getRandomValues，触发面小
  - 潜在漂移点（无触发路径，不进表）：注入脚本 `sign_str`（content_hmac.ts:228-232）不排除已存在的 `sig` 字段，而 TS 版 `sign_payload`（:108-112）显式排除；当前所有 post 调用点均新建 payload 对象，二次签名场景不可达，但两实现语义已分叉，建议后续统一
  - 复杂度：无函数达阈值（canonical/verify/generate_secret 分支均低；注入脚本 utf8_bytes 分支数低于 minor 阈值）
- 总体判断：HMAC/SHA-256 双实现经 reviewer 独立向量验证正确且一致、三通道校验语义与 secret 不写 window 均达标，但存在 restart 后采集静默断流（数据丢失）与注入侧签名实现零测试验证两个未解决 important，不能 PASS。
- 系统性 follow-up：建议标题「content 采集 restart 恢复机制与注入脚本签名测试锁定」，slug `content_restart_hmac_recovery`；也可作为本 task 修复轮纳入，不另立 task。t097 的 f005 回归测试（`content_postmessage_nonce.test.ts` restart 用例）应更新为覆盖生产 secret 旋转语义，不必新增 task。

### AC 复验披露

- AC-001：`re_verified`。secret 不写 window 由 `content_postmessage_nonce.test.ts` AC-001s 断言（注入脚本含 `var SECRET`、window 无 secret）；签名构造正确性为 reviewer 手动 Node 跑 RFC 4231 向量验证（见 f002 补充证据），非仓库内自动化测试。
- AC-002：`re_verified`。AC-002b 覆盖无签名/坏签名拒绝；各通道测试（storage/ws/network）用签名消息验证接受路径。
- AC-003：`re_verified`。AC-003s 覆盖 secret 旋转后旧签名拒绝、新签名接受；nonce 旋转由既有 T097 用例覆盖。
- AC-004：`re_verified`。network/ws/storage 三通道 diff 均含 `verify_payload` 统一门控；但 f001 指出 restart 语义回归（t097 已验证行为），门控本身未删、语义存在缺陷。

coverage = 4 / 4

verdict: FAIL

reviewed_scope: 7da99edf4a2c1edf

## Round 2 (2026-08-11 18:30 UTC+8)

## Findings（本轮新发现）

### t121_code_f004 - storage/ws 两通道重注入修复无回归测试触达；T121restart 未锁「无 hook 链叠加/双写」

- 严重度：minor
- 锚点：f001 修复核心诉求「还原+重装逻辑无 hook 链叠加/双写」在三通道的同构覆盖
- 位置：
  - `src/extension/content/storage_capture.ts:33-43,69-79`（重注入还原+保存逻辑）与 `src/extension/content/websocket_capture.ts:34-37,108`（同构）——`tests/unit/storage_capture.test.ts` / `tests/unit/websocket_capture_injected_script.test.ts` 均无「两次注入、换 secret、验证新签名消息入库」用例，两通道修复零测试触达
  - `tests/unit/content_postmessage_nonce.test.ts:493-495`（T121restart 重注入后断言 `msgs2.length` 为 `toBeGreaterThan(0)`，未断言 `=== 1`）
- 问题：f001 修复横跨三通道，回归测试（T121restart）只覆盖 network；storage/ws 的还原字段名、还原顺序若未来漂移，测试无法发现。T121restart 对 network 也只验证「≥1 条消息」，若还原逻辑失效导致旧 wrapper 残留（fetch 一次触发两条 post），`msgs2[0]` 仍可能匹配新 SECRET 而通过——「无 hook 链叠加/双写」未被断言锁定。当前实现经人工核对还原顺序正确（network 还原 fetch/open/send 在保存 prev 与重装之前；storage/ws 同构），无行为缺陷，仅测试锚定缺口。
- 建议：storage/ws 各补一条重注入用例（eval 两次、第二次换 secret、触发真实路径、断言新 secret 签名消息入库）；T121restart 对 `msgs2.length` 断言 `=== 1` 锁双写。

### t121_code_f005 - spec 未知契约清单条目「secret 共享通道」未按约定删除并注明结论

- 严重度：minor
- 锚点：spec 上下文区「未知契约清单」要求「核实后删除标记，改为结论并注明验证方式」；该条目文本自述「成功后删除本标记并注明」
- 位置：`docs/tasks/t121_content_message_hmac_auth/spec.md:71`
- 问题：实现已确定 secret 共享通道为「内联进注入脚本闭包」（`content_hmac.ts:2-3`、ADR-020 已记录），该清单条目未删除、未注明结论。属实施收尾文档闭环遗漏，不影响实现正确性（非 UNVERIFIED 分类标记，不触发 blocking 门槛）。
- 建议：删除该条目并注明「已确定为注入脚本内联闭包，见 `docs/blueprint/decisions.md` ADR-020」。

## 结论（Round 2）

- 前轮 finding 复核（以 diff 与实跑为准）：
  - `t121_code_f001`（important，断流）：**已消除**。三通道注入脚本 guard 语义改为「还原上次 hook 后重装」（`network_hook.ts:21-28` 还原 + `:171-175` 保存 prev + 重装；storage `:33-43`/`:69-79`；ws `:34-37`/`:108`），还原在保存 prev 与重装之前执行、顺序正确，无链叠加、无双写；每次 start 持最新 SECRET（`:344`）。T121restart（`content_postmessage_nonce.test.ts:452-510`）eval 注入脚本两次（secret-r1/r2），第二次 guard 置位走还原重装路径，真实触发 fetch hook，验证 r2 签名消息可被 TS 校验通过、r1 旧签名被拒、content 拒收旧 secret 签名消息——覆盖真实重注入签名路径。
  - `t121_code_f002`（important，JS 签名零测试）：**已消除**。`content_hmac_vectors.test.ts` 以 `new Function(SYNC_HMAC_JS + ...)` 执行注入脚本侧 `hmac_sha256_str/canonical_str`，对照 5 条标准向量 + TS 版逐用例比对；向量值经 reviewer 用 node:crypto 独立复算全部吻合（`5bdcc146…`/`f7bc83f4…`/`2d721966…`/`8514faad…`/`1c1c4046…`）。T121e2e（`:415-450`）eval `build_page_script` 后触发注入脚本真实 fetch hook，JS 实现签名可被 TS `verify_payload` 通过且篡改被拒——注入脚本签名路径已真执行，注释「正确性由 RFC 4231 测试向量锁定」与事实相符。
  - `t121_code_f003`（minor，ws injected 无参调用）：**已消除**。`websocket_capture_injected_script.test.ts:71` 已传 `TEST_SECRET`；`network_hook_gate_behavior.test.ts:65,72`、`content_postmessage_nonce.test.ts` 各调用点均带参。
  - `t121_test_f001`（critical，restart 回归被掩盖）：**已消除**。T121restart 驱动真实注入脚本重注入 + 签名路径（见 code f001 复核）；AC-003b（`:200-232`）在新实现下语义兼容（start 重注入不再被 guard 阻止，消息用当前 secret 签名接受）。
  - `t121_test_f002`（critical，向量测试缺失）：**已消除**。同 code f002 复核。
  - `t121_test_f003`（important，AC-001s 语义 + 威胁模型）：**已消除**。ADR-020 记录威胁模型边界准确（防御对象「仅读取 window nonce 的页面脚本」；对抗性 DOM hook 窃取内联 secret 不在防御范围——扩展与页面 MAIN world 同权，无隐藏通道）；AC-001s（`:383-413`）断言与注释对齐「不写 window 全局」语义，并补「仅读 nonce 无签名消息被拒」。spec AC-001 限定语「仅读取 window nonce 的页面脚本」与 ADR-020 边界一致，无 spec 过时问题。
  - `t121_test_f004`（minor，storage/ws 负向用例）：**已消除**。`storage_capture.test.ts`「正确 nonce 但签名缺失被拒」、`websocket_capture_page.test.ts` 同构用例已补，实跑通过。
  - 实跑：7 个相关测试文件 44 用例全绿（`content_hmac_vectors` 4 / `content_postmessage_nonce` 15 / `storage_capture` 6 / `websocket_capture_page` 9 / `websocket_capture_injected_script` 4 / `network_hook_gate_behavior` 4 / `dom_network_hook_event_id` 2）。
- 本轮新发现：2 条（f004 minor、f005 minor）
- 未进表的提示：
  - 文件过大（降级规则）：`src/extension/content/network_hook.ts` 423 行（≥400 minor 阈值，本 task 净增 15 行；含内联注入脚本大字符串属协议一体文件，未达 important 阈值 800）。其余：`content_hmac.ts` 234、`storage_capture.ts` 189、`websocket_capture.ts` 224、`content_postmessage_nonce.test.ts` 530（<600）。
  - 复杂度：无函数达阈值（verify/canonical/generate_secret 分支低；注入脚本内函数属协议一体字符串，Round 1 已排除）。
  - AC-001s 测试命名「secret 不暴露给页面 MAIN world」与 ADR-020 边界（对抗性 MAIN world 脚本可读脚本文本）不一致，属简写误导；三处 `build_page_script` 注释「页面脚本无法读取，构造不了合法签名」为绝对表述，建议与 ADR-020 限定语义对齐（风格级，不改行为）。
  - 向量测试未覆盖长 key（>64 字节触发 key 哈希）与 emoji（代理对 utf8）边界；Round 1 reviewer 已独立验证两版一致，生产 secret 恰 64 字节不触发 key 哈希路径。
  - `sign_str`（注入脚本版）不排除已存在 `sig` 字段、TS `sign_payload` 显式排除（`content_hmac.ts:129-132` vs `:231-233`）——双实现语义分叉，当前所有 post 调用点均新建 payload 无触发路径（Round 1 已提，仍成立）。
  - 对抗性场景（页面主动 `delete` prev 还原点、页面自身再包装 fetch 后扩展还原跳过其新层）不在 ADR-020 防御范围，与威胁模型一致。
- 总体判断：Round 1 双路 7 条 finding 全部按 diff 与实跑核实已消除；三通道还原+重装顺序正确、向量测试有效且独立复算吻合、ADR-020 威胁模型记录准确。仅 2 条 minor 级测试锚定/文档闭环缺口，无未解决 critical/important。
- 系统性 follow-up：无。

### AC 复验方式（Round 2）

- AC-001：`re_verified`。T121e2e 真实注入脚本 fetch hook 签名可被 TS 校验通过（`content_postmessage_nonce.test.ts:415-450`）；`content_hmac_vectors.test.ts` 执行注入脚本侧实现对照标准向量；AC-001s 断言 secret 不写 window。安全边界（对抗性 DOM hook）由 ADR-020 显式记录为不在防御范围，与 AC-001 限定语一致。
- AC-002：`re_verified`。AC-002b 无签名/坏签名拒收 + 三通道正向入库；storage/ws 负向用例已补（f004 复核）。
- AC-003：`re_verified`。AC-003s 旋转 secret 旧签名拒/新签名收；T121restart 覆盖真实重注入持新 secret；nonce 旋转由 AC-003/AC-004 既有用例覆盖。
- AC-004：`re_verified`。三通道 `verify_payload` 门控调用点核对存在、门控顺序 nonce→签名；f001 断流回归已由 T121restart 修复验证。
- coverage = 4 / 4（无 trust_prior 项）

verdict: PASS

reviewed_scope: e14dd27060384c3f

## Round 3 (2026-08-11 18:45 UTC+8)

### 前轮 finding 复核（以 diff 与实跑为准）

实跑基准：`npx vitest run` 覆盖 7 个相关测试文件 46 用例全绿（较 Round 2 +2：storage 旋转用例、向量跨块边界用例）。生产代码自 Round 2 零改动（`network_hook.ts` 423 行 / `content_hmac.ts` 234 / `storage_capture.ts` 189 / `websocket_capture.ts` 224 与 Round 2 记录一致；还原+重装结构、guard 语义、secret 旋转位置均无漂移）。

- **t121_code_f004（minor，T121restart 未锁无双写 / storage、ws 无重注入用例）→ 部分落实，非阻断**。T121restart 已锁单条：`content_postmessage_nonce.test.ts:495` `expect(msgs2).toHaveLength(1)`（`:482` msgs1 同），无双写锚定达成。storage 补「stop→start secret 旋转后新签名接受、旧签名被拒」（`storage_capture.test.ts:87-106`），覆盖 storage 通道旋转回归（AC-003 语义）；但该用例走 content 校验层（`_set_secret_for_test` 换 secret + helper 构造签名），非建议的「eval 注入脚本两次、触发真实 post」路径，storage 注入脚本 post 组装仍未直接执行。ws 通道无对应对应旋转/重注入用例（page/injected 两文件均无）。缺口均属同构逻辑：还原+重装由 T121restart（network 真实路径）锁定、JS 签名由向量测试锁定，无行为缺陷，维持 minor 不阻断；建议处置表如实标注（storage 已修（content 层）、ws 按建议需补或登记遗留）。
- **t121_code_f005（minor，spec 未知契约清单条目未删除）→ 已修**。`spec.md:71` 该条目已改为删除线 + 结论：「已定：content 每次 start 生成 secret，内联进注入脚本闭包……威胁模型边界见 ADR-020」，符合「核实后删除标记，改为结论并注明验证方式」。
- **t121_test_f005（minor，向量缺跨块/长 key/UTF-8 边界）→ 已修（实现为建议的合理变体）**。`content_hmac_vectors.test.ts:42-55` 补消息 55/56/57/63/64/65/112/1000 字节、key 63/64/65/131 字节、中文/emoji 多字节输入。实现采用双实现互验而非建议的「外部期望值」——TS 版正确性由 5 条标准向量锚定（2 条 RFC 4231，Round 2 已独立复算），互验传递至 JS 版，逻辑闭环成立。
- **t121_test_f006（minor，AC-001s 措辞过度声明）→ 已修**。标题改「secret 不写 window 全局——仅读 window nonce 的页面脚本无法构造签名」（`:383`），注释注明「对抗性 DOM hook 窃取注入脚本文本的暴露面见 ADR-020 威胁模型边界」（`:399-400`），与 ADR-020 一致。
- **t121_test_f007（minor，AC-003b 标题描述废弃 guard 语义）→ 已修**。标题改「stop→start 后窗口 nonce 旋转，重注入脚本仍发新 nonce 且入库」（`:200`），注释（`:203,213-214`）同步新语义；真实重注入路径由 T121restart 覆盖，职责分明。

### 改测方向复核

本轮测试改动仅：T121restart 断言 `toBeGreaterThan(0)` → `toBeLength(1)`（收紧）、AC-001s/AC-003b 标题注释措辞、storage 新增旋转用例、向量测试新增边界用例。无删 expect / 反转 / 弱化 / `.skip` / 恒真断言；断言向当前实现输出让步的情况：无。

### 本轮新发现

0 条。生产代码零改动，测试改动全部为收紧断言与措辞对齐，docs 改动符合规范。

### 结论（Round 3）

- 前轮 finding 复核：Round 2 双路 5 条 minor 中 4 条完全消除；code f004 核心诉求（无双写锁定）已达成，storage/ws 重注入用例为部分落实（同构覆盖成立，非阻断）。无未解决 critical / important。
- 本轮新发现：0 条
- 未进表的提示：
  - 文件过大（降级规则，不进表）：`src/extension/content/network_hook.ts` 423 行（≥400 minor 阈值；含内联注入脚本大字符串属协议一体文件，未达 important 阈值 800，Round 1/2 同结论）。其余文件均未达阈值。
  - 复杂度：无函数达阈值（与 Round 2 同）。
  - `sign_str`（注入脚本版）不排除既有 `sig` 字段、TS `sign_payload` 显式排除（`content_hmac.ts:129-132` vs `:231-233`）——双实现语义分叉仍存，当前所有 post 调用点均新建 payload，无触发路径（Round 1/2 已提示，未变）。
  - storage 注入脚本 post() 组装路径无直接执行测试（Round 2 未进表提示，未变）；ws 通道无旋转专项用例（见 code f004 复核）。
- 总体判断：5 条 minor 均已处置或部分落实且同构覆盖成立，生产代码零改动，实跑 46 用例全绿，无未解决 critical/important，可放行。
- 系统性 follow-up：无。

### AC 复验方式（Round 3）

- AC-001：`re_verified`。AC-001s 断言与 ADR-020 威胁模型边界一致（`:383-413`）；向量测试 5 条标准向量 + 跨块/长 key/UTF-8 边界双实现互验；T121e2e 真实注入脚本 JS 签名被 TS 校验通过、篡改被拒（`:416-451`）。
- AC-002：`re_verified`。AC-002b 无签名/错签名拒收（`:94-170`）+ storage/ws 负向用例（`storage_capture.test.ts:70-78`、`websocket_capture_page.test.ts:95-103`）+ 三通道正向入库断言；实跑全绿。
- AC-003：`re_verified`。AC-003s 旋转旧拒新收（`:337-380`）+ T121restart 真实重注入持新 SECRET 不断流（`:453-511`）+ storage 旋转用例（`storage_capture.test.ts:87-106`）；实跑全绿。
- AC-004：`re_verified`。三通道 `verify_payload` 门控调用点核对存在（`network_hook.ts:357`、`storage_capture.ts`、`websocket_capture.ts`），门控顺序 nonce→签名；restart 断流回归由 T121restart 锁定（`msgs2` 单条 + r2 签名通过）。
- coverage = 4 / 4（无 trust_prior 项）

verdict: PASS

reviewed_scope: 80c8a96dd778186f
