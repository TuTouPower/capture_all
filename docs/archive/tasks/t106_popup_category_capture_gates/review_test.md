# Task review t106（reviewer_focus: 测试）

- task：`t106_popup_category_capture_gates`
- spec：`docs/tasks/t106_popup_category_capture_gates/spec.md`
- diff_anchor：`adba86003c7ce829aa0ac98bbc11022b9d038fc0`
- target：`git diff adba86003c7ce829aa0ac98bbc11022b9d038fc0`
- round：1
- reviewed_at：2026-08-11 07:09 UTC+8
- reviewed_scope: dd134bc70d580ebb

## Findings

### t106_test_f001 - 静态测试只验证单一发射源门控，未验证「类别级不写入」，用户行为/页面导航类别仍有未门控发射源

- 严重度：important
- 锚点：契约区范围「Popup 分类开关关闭时，对应类别事件在新 start 的 capture 中不写入」；可观测行为缺陷（输入：关闭「用户行为」/「页面导航」开关后 start，坏结果：该类事件仍入库）
- 位置：`tests/unit/popup_category_capture_gates.test.ts:23,27` 与 `src/extension/content/content_script.ts:105-107,128`、`src/extension/background/service_worker.ts:917-1111`
- 问题：
  - 静态断言 `/event_count_enabled !== false\) \{\s*start_dom_capture/`（test:23）只 pin 了 `start_dom_capture` 一处作为「用户行为门控」。但 `user_action` 类别发射源共 10 个模块（mouse/keyboard/scroll/clipboard/form_submit/focus/visibility/resize/fullscreen/print/dom），`start_mouse_capture`/`start_keyboard_capture`/`start_scroll_capture`（content_script.ts:105-107）等 9 个模块**未**被 `event_count_enabled` 门控。行为推演：关闭「用户行为」后点击页面按钮，`mouse_capture.ts:119-122 handle_click` 无条件发 `category:'user_action'` 事件入库。
  - 静态断言 `/nav_count_enabled !== false\)/`（test:26）只 pin 了 content 侧 page_load 门控；SW 侧 `onActivated`(941)/`onCreated`(1029)/`onUpdated`(1059) 仍无条件写 `category:'navigation'` 事件。关闭「页面导航」后开新 tab/切换 tab 仍产生 navigation 事件入库。
  - 上述两种情况静态测试全绿——它验证的是「实施方选择写入的接线」，不是「关闭开关后该类事件不写入」这一任务核心行为。
  - 预置行为契约 `tests/e2e/e2e-toggle-effects.spec.ts` test1/test2 明确断言关闭后 `user_action`/`navigation` 事件为 0，本可捕获上述缺陷；但该文件不匹配 `playwright.config.ts` 中任何 project 的 `testMatch`（e2e / e2e-ext / e2e-p1 / e2e-streaming / e2e-real 等均不含 toggle-effects），`npm run test:e2e` 默认不运行它——行为层验证是死代码。
- 建议：至少保证「用户行为」门控覆盖鼠标/键盘/滚动等主要发射源（或由 code review 确认实施是否应全量门控）；将 `e2e-toggle-effects.spec.ts` 接入某个 project 使其可运行，作为类别级行为验证；静态断言可加强为逐一断言各发射源受控。

### t106_test_f002 - AC-002 测试名不副实：未断言 capture_console（AC-002 正文为「控制台」）

- 严重度：minor
- 锚点：AC-002 覆盖说明
- 位置：`tests/unit/popup_category_capture_gates.test.ts:17-27`
- 问题：测试名写「AC-002: 类别开关映射到采集门控（cookie/storage/error/event/nav）」，实际断言的是 5 个新门控字段，**没有**断言 `capture_console`。AC-002 正文要求「关闭控制台后不产生 console 事件」；`capture_console` 门控（service_worker.ts:458 `if (config.capture_console)`、popup.ts:326 映射）在单元层无断言，仅 e2e test4 覆盖且默认不运行。
- 建议：补一条 `capture_console` 断言（popup 映射 + SW 门控），或至少将测试名/注释改为「AC-002 衍生：类别开关门控」避免误导。

### t106_test_f003 - AC-003「重新打开恢复采集」无 off→on 行为测试，仅静态缺省语义

- 严重度：minor
- 锚点：AC-003 覆盖说明
- 位置：`tests/unit/popup_category_capture_gates.test.ts:29-34`
- 问题：AC-003 要求「开关重新打开后 start，对应类别可再入库（回归）」。测试只断言 `!== false` 缺省开启语义（4/5 新字段），未做 off→on 再入库行为验证。该断言可接受为「缺省=开启」代理，但「重新打开后恢复」的行为回归没有证据。
- 建议：可选加行为级 off→on 两段 capture 对比，或注明此为静态代理。

### t106_test_f004 - error/nav 断言为纯存在性，强度弱于 cookie/dom/storage

- 严重度：minor
- 锚点：断言强度
- 位置：`tests/unit/popup_category_capture_gates.test.ts:21,26`
- 问题：`/error_count_enabled !== false\)/` 与 `/nav_count_enabled !== false\)/` 只验证字符串存在，不验证其包裹实际采集调用；若条件被迁移到不包裹 `start_exception_capture` / page_load 发送的「诱饵位置」，测试仍绿。cookie/dom/storage 用了 `\{\s*start_X_capture` 强形式，error/nav 未对齐。
- 建议：改为 `error_count_enabled !== false\) \{\s*const target_tab_id`、`nav_count_enabled !== false\) \{\s*const page_load_data` 等包裹形式。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1，无前轮。
- 改测方向复核：无（本 diff 仅新增测试文件，未修改既有测试；不存在「迁就实现」的改测）。
- 本轮新发现：4 条（1 important + 3 minor）。
- 未进表的提示：
  - 静态测试对 5 个新门控字段的 popup 映射（popup.ts:343-347）无断言；若 popup 停止下发这些键，单元测试全绿而 P1-9 原病（开关不生效）复现。e2e `config_snapshot` 断言可捕获，但 e2e 不运行。与 f001 同源，建议并入 follow-up。
  - `e2e-toggle-effects.spec.ts` 未接入任何 playwright project，属跨 task 测试基础设施缺口，建议 follow-up 统一接线。
  - content 侧网络门控（content_script.ts:115-121）与 AC-001 断言匹配，无问题。
- 总体判断：静态测试对「门控条件被删」的防回归有效（断言字符串删除即红），但对「类别级不写入」这一任务核心行为验证不足——存在静态可证的未门控发射源（鼠标/键盘/滚动 → user_action；SW tab 导航事件 → navigation），且唯一行为契约测试默认不运行。f001 未解决，判定 FAIL。
- 系统性 follow-up：建议标题「接线并启用 e2e-toggle-effects 到 playwright project」，slug `e2e_toggle_effects_wiring`；类别级门控完整性（鼠标/键盘/SW 导航事件）建议由 code review 确认或另建 task。

### AC 复验方式

- AC-001（网络）：`re_verified` —— 静态断言 popup `capture_network: toggles.request_count !== false` 且 SW `if (config.capture_network) { start_network_capture` 存在（popup.ts:325、service_worker.ts:453）；content 侧 network_hook/websocket 亦受 `config.capture_network` 门控（content_script.ts:115-121）。行为层 e2e test3 存在但默认不运行。
- AC-002（控制台）：`re_verified`（静态）—— SW `if (config.capture_console)`（service_worker.ts:458）与 popup `capture_console: toggles.log_count !== false`（popup.ts:326）。单元测试未覆盖，仅静态查证。
- AC-003（回归）：`re_verified`（静态，受限）—— `!== false` 缺省开启语义在 SW/content 各门控点成立；未做 off→on 行为复验。
- `coverage = 3 / 3`（均基于静态查证；e2e 行为层未实跑，`trust_prior` 占比 0%，但行为复验依赖静态推演而非实测）。

verdict: FAIL

## Round 2 (2026-08-11 07:19 UTC+8)

reviewed_scope: 365185b0e3924914

### Findings

### t106_test_f005 - AC-002 测试注释声明覆盖 tab_switch，但断言未 pin 该生产者；代码中 tab_switch 仍无门控

- 严重度：important
- 锚点：契约区范围「Popup 分类开关关闭时，对应类别事件在新 start 的 capture 中不写入」；可观测行为缺陷（关闭「页面导航」后切 tab 仍写 navigation 事件）。
- 位置：`tests/unit/popup_category_capture_gates.test.ts:29-30` 与 `src/extension/background/service_worker.ts:939-948`
- 问题：测试注释写「background 导航门控（tab_switch/tab_created/tab_url_change）」，但断言 `/nav_count_enabled === false\) return; \/\/ T106/` 只能匹配 tab_created（service_worker.ts:1027）与 tab_url_change（service_worker.ts:1058）两处 `return; // T106` 门控——`onActivated` 内 tab_switch（service_worker.ts:939-948）无 `nav_count_enabled` 门控，断言字符串根本无法命中该生产者。实测 `npx vitest run` 全绿（3 passed），但 `onActivated` 仍无条件写 `category:'navigation'` tab_switch 事件。测试对「页面导航」类别的完整性给了假信心：注释宣称覆盖 3 处、实际只 pin 2 处，且漏掉的是唯一仍泄漏的生产者（与 code f005 同源）。
- 建议：补 `onActivated` 内 tab_switch 门控断言（pin `tabs.onActivated` 范围内 `nav_count_enabled === false` 早退），或改为行为级测试（构造 config.nav_count_enabled=false 跑 start + 触发 onActivated 写 tab_switch 断言不入库）；代码侧缺口见 code f005。

## 结论

- 前轮 finding 复核（以 diff 为准）：
  - t106_test_f001（静态测试不验证类别级不写入）：修不彻底。断言已扩展覆盖 event 全生产者（`event_count_enabled !== false\) \{\s*start_mouse_capture`，test:24）、storage（test:25）、nav handler 内判（`if \(!nav_enabled\) return;`，test:28）、background 两处 return 门控（test:30）；代码侧 user_action 生产者已全量门控。但 nav 侧 tab_switch 仍无门控且测试未 pin（注释还宣称覆盖）→ 新 finding f005。`e2e-toggle-effects.spec.ts` 仍未接入任何 playwright project（playwright.config.ts 未随本 diff 改动），行为层验证仍是死代码。f001 的核心「类别级不写入无行为证据」仍未闭合。
  - t106_test_f002（AC-002 未断言 capture_console）：仍存在（minor）。测试名仍写「AC-002: 类别开关映射到采集门控（cookie/storage/error/event/nav）」，仍无 `capture_console` 断言；`capture_console` 门控（service_worker.ts:458、popup.ts:326）在单元层仍无断言，仅 e2e test4 且默认不运行。minor，非阻断。
  - t106_test_f003（AC-003 无 off→on 行为测试）：仍存在（minor）。测试仍只静态断言 `!== false` 缺省语义，无 off→on 再入库行为回归。minor。
  - t106_test_f004（error/nav 纯存在性断言）：部分处理。error 现含重试路径断言（test:22 `/current_config\.error_count_enabled !== false && !is_exception_active\(\)/`）比 Round 1 强；nav 仍为 `/nav_count_enabled !== false\)/`（test:27）纯存在性 + handler 内判断言，但未对齐 cookie/storage 的 `\{\s*start_X_capture` 包裹强度。minor。
- 改测方向复核：无。本轮 diff 仅新增测试文件 + 强化断言，无「迁就实现」的改测；`event_count_enabled` 断言从 `start_dom_capture` 改为 `start_mouse_capture` 是随代码全量门控的正确同步，非弱化。
- 本轮新发现：1 条（f005 important）
- 未进表的提示：
  - `e2e-toggle-effects.spec.ts` 仍未被任何 playwright project 的 `testMatch` 覆盖（`e2e-{...}` 集合不含 toggle-effects），行为契约测试死代码；建议 follow-up 接线（Round 1 已列 slug `e2e_toggle_effects_wiring`，本 task 未处理，仍成立）。
  - 静态测试对 5 个新门控字段的 popup 映射（popup.ts:343-347）仍无断言；与 f001 同源，并入 follow-up。
  - content 侧网络门控（content_script.ts:123-129）与 AC-001 断言匹配，无问题。
- AC 复验方式：
  - AC-001（网络）：`re_verified`（静态）—— 断言 popup `capture_network: toggles.request_count !== false` + SW `if (config.capture_network) { start_network_capture`（test:13-14）；content network_hook/websocket 按 capture_network 门控（content_script.ts:123-129）。行为层 e2e test3 存在但默认不运行。
  - AC-002（控制台）：`re_verified`（静态）—— SW `if (config.capture_console)`（service_worker.ts:458）+ popup `capture_console: toggles.log_count !== false`（popup.ts:326）。单元测试仍未覆盖，仅静态查证。
  - AC-003（回归）：`re_verified`（静态，受限）—— `!== false` 缺省开启语义在 SW/content 各门控点成立（service_worker.ts:484,556,1027,1058；content_script.ts:87,91,106,118,131）；未做 off→on 行为复验。
  - coverage = 3 / 3（均静态；e2e 行为层未实跑）
- 总体判断：event/storage/error 测试覆盖已随代码修复增强，但 nav 类别完整性仍有静态可证的漏网生产者（tab_switch），测试注释宣称覆盖而实际未 pin，f001/f005 未解决 important 存在。
- 系统性 follow-up：建议标题「接线并启用 e2e-toggle-effects 到 playwright project」，slug `e2e_toggle_effects_wiring`；tab_switch 门控缺口由 code f005 跟进。

verdict: FAIL

## Round 3 (2026-08-11 07:30 UTC+8)

reviewed_scope: d186b6ab69d58e6e

### Findings

（本轮无新 finding）

## 结论

- 前轮 finding 复核（以 diff 为准）：
  - t106_test_f005（注释宣称覆盖 tab_switch 但断言未 pin）：已消除。代码三处背景导航门控（service_worker.ts:939/1028/1059）均为字节相同串 `if (current_config.nav_count_enabled === false) return; // T106: 导航类别关闭`，测试断言 `/nav_count_enabled === false\) return; \/\/ T106/`（test:30）现可命中 tab_switch 位点；注释「tab_switch/tab_created/tab_url_change」与代码一致。实测 `npx vitest run tests/unit/popup_category_capture_gates.test.ts` 3 passed。
  - t106_test_f001（静态测试不验证类别级不写入）：仍存在（minor/已知限制）。断言已覆盖 event 全生产者（test:24）、storage（test:25）、nav handler 内判（test:28）、background 三处 return 门控（test:30）；核心「类别级不写入」仍无行为级证据，`e2e-toggle-effects.spec.ts` 仍未接入任何 playwright project（playwright.config.ts 未随本 diff 改动），行为验证仍是死代码。非阻断。
  - t106_test_f002（AC-002 未断言 capture_console）：仍存在（minor）。测试名仍写「AC-002: 类别开关映射到采集门控（cookie/storage/error/event/nav）」，仍无 `capture_console` 断言；`capture_console` 门控（service_worker.ts:458、popup.ts:326）单元层仍无断言，仅 e2e test4 且默认不运行。minor。
  - t106_test_f003（AC-003 无 off→on 行为测试）：仍存在（minor）。测试仍只静态断言 `!== false` 缺省语义，无 off→on 再入库行为回归。minor。
  - t106_test_f004（error/nav 纯存在性断言）：部分处理。error 含重试路径断言（test:22）；nav 仍为 `/nav_count_enabled !== false\)/`（test:27）纯存在性 + handler 内判断言，未对齐 cookie/storage 的 `\{\s*start_X_capture` 包裹强度。minor。
- 改测方向复核：无。本轮 diff 未修改既有测试（仅代码侧新增 tab_switch 门控），无「迁就实现」的改测。
- 本轮新发现：0 条
- 未进表的提示：
  - `e2e-toggle-effects.spec.ts` 仍未接线任何 playwright project，行为契约测试死代码；建议 follow-up（Round 1/2 已列 slug `e2e_toggle_effects_wiring`，仍成立）。
  - 5 个新门控字段的 popup 映射（popup.ts:343-347）仍无静态断言；与 f001 同源，并入 follow-up。
- AC 复验方式：
  - AC-001（网络）：`re_verified`（静态）— 断言 popup `capture_network: toggles.request_count !== false` + SW `if (config.capture_network) { start_network_capture`（test:13-14）；content network_hook/websocket 按 capture_network（content_script.ts:123-129）。行为层 e2e test3 存在但默认不运行。
  - AC-002（控制台）：`re_verified`（静态）— SW `if (config.capture_console)`（service_worker.ts:458）+ popup `capture_console: toggles.log_count !== false`（popup.ts:326）。单元测试仍未覆盖，仅静态查证。
  - AC-003（回归）：`re_verified`（静态，受限）— `!== false` 缺省开启语义在 SW/content 各门控点成立（service_worker.ts:484,556,939,1028,1059；content_script.ts:87,91,106,118,131）；未做 off→on 行为复验。
  - coverage = 3 / 3（均静态；e2e 行为层未实跑）
- 总体判断：f005 测试缺口已闭合（断言可命中 tab_switch 门控，代码侧该生产者亦已门控），剩余 f001-f004 均 minor 非阻断；无未解决 important。
- 系统性 follow-up：建议标题「接线并启用 e2e-toggle-effects 到 playwright project」，slug `e2e_toggle_effects_wiring`。

verdict: PASS
