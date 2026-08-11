# Task review t106（reviewer_focus: 代码）

- task：`t106_popup_category_capture_gates`
- spec：`docs/tasks/t106_popup_category_capture_gates/spec.md`
- diff_anchor：`adba86003c7ce829aa0ac98bbc11022b9d038fc0`
- target：`git diff adba86003c7ce829aa0ac98bbc11022b9d038fc0`
- round：1
- reviewed_at：2026-08-11 07:10 UTC+8

reviewed_scope: dd134bc70d580ebb

## Findings

### t106_code_f001 - exception 门控未覆盖 tab 切换/URL 变化的重试路径

- 严重度：important
- 锚点：spec 范围「Popup 分类开关关闭时，对应类别事件在新 start 的 capture 中不写入」；错误类别开关门控失效（P1-9）。
- 位置：`src/extension/background/service_worker.ts:979`、`src/extension/background/service_worker.ts:1082`
- 问题：T106 只在初始 start 把 exception 改为按 `error_count_enabled` 独立启动（`service_worker.ts:484`），但 tab 切换重试（`:979`）与 URL 从受限页跳转重试（`:1082`）仍以 `current_config.capture_console && !is_exception_active()` 门控。可观测缺陷：控制台开、错误异常关，start 后切一次 tab（或从 chrome:// 跳到 http(s)），`is_exception_active()` 为 false、`capture_console` 为 true → `start_exception_capture` 被执行，错误事件（category `error`）重新入库，错误开关门控被绕过。反向：控制台关、错误异常开（缺省），初始 exception 已 attach 到旧 tab，但重试路径被 `capture_console` 挡掉，切 tab 后新 tab 错误事件丢失。
- 建议：把 `:979` 与 `:1082` 的条件改为 `current_config.error_count_enabled !== false`（与初始 start 一致），并同步更新 T106 注释覆盖两处重试位点。

### t106_code_f002 - event_count_enabled 只门控 DOM，其余 user_action 生产者未门控

- 严重度：important
- 锚点：spec 范围「对应类别事件在新 start 的 capture 中不写入」；用户行为开关（popup `event_count` → `user_action_count` 统计）失效。
- 位置：`src/extension/content/content_script.ts:107`（仅包 `start_dom_capture`）；`mouse_capture.ts:93`、`keyboard_capture.ts:81`、`scroll_capture.ts:49`、`focus_capture.ts:77`、`resize_capture.ts:41`、`fullscreen_capture.ts:37`、`print_capture.ts:47`、`clipboard_capture.ts:84`、`form_submit_capture.ts:74` 均发 `category: 'user_action'`
- 问题：关闭「用户行为」开关后，`event_count_enabled===false` 只跳过 `start_dom_capture`（`content_script.ts:107-109`），而 `content_script.ts:103-105,122-128` 仍无条件启动 mouse/keyboard/scroll/focus/resize/fullscreen/print/clipboard/form_submit 采集，这些模块继续产生 `user_action` 事件并入库。可观测缺陷：用户行为关，鼠标点击/键盘/滚动事件仍写入。`handle_event`（`service_worker.ts:741-774`）无中央类别过滤，门控必须落在生产者侧，故这是漏网生产者。
- 建议：`event_count_enabled!==false` 时再启动上述全部 user_action 生产者，或统一门控；至少与 popup 开关语义（用户行为=user_action_count）对齐。

### t106_code_f003 - nav_count_enabled 只门控 page_load，其余 navigation 生产者未门控

- 严重度：important
- 锚点：spec 范围「对应类别事件在新 start 的 capture 中不写入」；页面导航开关（popup `nav_count` → `nav_count` 统计）失效。
- 位置：`src/extension/content/content_script.ts:167`（popstate route_change）、`:185`（hashchange route_change）、`:195`（dom_ready）；`src/extension/content/visibility_capture.ts:42`（navigation `visibility_change`）；`src/extension/background/service_worker.ts:942`（tab_switch）、`:1032`（tab_created）、`:1058`（tab_url_change）
- 问题：T106 仅把 page_load 事件包进 `nav_count_enabled!==false`（`content_script.ts:88-98`），但 SPA route_change、dom_ready、visibility_change，以及 background 侧 tab_switch/tab_created/tab_url_change 均为 `category: 'navigation'` 且未门控。可观测缺陷：页面导航关，SPA 路由切换、dom_ready、标签页事件仍写入。
- 建议：navigation 类别事件统一按 `nav_count_enabled` 门控（content 侧 handler 内判，background 侧 tab 事件判 `current_config.nav_count_enabled`）。

### t106_code_f004 - AC 验证测试为源码字符串正则断言，未覆盖运行期行为

- 严重度：minor
- 锚点：spec 可测试性声明「全部 AC 可自动测试（改配置后 start 的单元/集成级）」。
- 位置：`tests/unit/popup_category_capture_gates.test.ts:8-33`
- 问题：测试用 `readFileSync` 读源文件后对 `toMatch(/.../)` 正则做静态匹配（如 `sw_src).toMatch(/cookie_change_count_enabled !== false\)/)`），不构造 config、不跑 start、不验证事件是否入库。正则匹配通过 ≠ 运行期门控生效，无法捕获本报告 f001-f003 这类「门控存在但未覆盖全部生产者」的缺陷；与可测试性声明预期的行为级测试不符。
- 建议：改为构造 `CaptureConfig`（含各开关 false）调用 start 路径并断言对应类别事件不写入；正则层留给 test reviewer 的完整测试审阅。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：4 条（f001-f003 important，f004 minor）
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` = 1142 行（实现源码 ≥800 阈值），本 task 净增约 20 行；按降级规则仅列出，不进 finding 表。
  - 圈复杂度：diff 触及函数无 ≥15 分支，未达 minor 阈值；无。
  - 范围外观察：`tests/unit/popup_category_capture_gates.test.ts` 属 test reviewer 职责，此处仅按「测试 anti-pattern 仍可标」降为 minor f004 提示，完整测试层审阅交 test reviewer。
- 总体判断：cookie/storage 门控完整、network/console 门控与重试路径一致、缺省 `!== false` 视为 true 语义正确；但 error 门控漏改重试路径、event/nav 门控只覆盖单个生产者，均产生可观测的类别事件泄漏，未解决 critical/important 存在。
- AC 复验方式：
  - AC-001（网络）：`re_verified` — popup `capture_network: toggles.request_count !== false`（popup.ts:325）、SW `if (config.capture_network) start_network_capture`（service_worker.ts:453）、content `if (config.capture_network) start_network_hook/start_websocket_capture`（content_script.ts:115-121），重试路径亦按 `capture_network` 门控；静态代码路径核对，非部署态集成。
  - AC-002（控制台）：`re_verified` — popup `capture_console: toggles.log_count !== false`（popup.ts:326）、SW 门控（service_worker.ts:458）、tab 切换/URL 重试均按 `capture_console`（service_worker.ts:968,1072）；静态代码路径核对。
  - AC-003（回归/缺省开启）：`re_verified` — 新字段均以 `!== false` 判，缺省视为 true（service_worker.ts:484,556；content_script.ts:89,107,110），popup 默认 toggles 全 true；静态代码路径核对。
  - coverage = 3 / 3
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-11 07:19 UTC+8)

reviewed_scope: 365185b0e3924914

### Findings

### t106_code_f005 - nav 门控修复不彻底：tab_switch（onActivated）仍无 nav_count_enabled 门控

- 严重度：important
- 锚点：spec 范围「Popup 分类开关关闭时，对应类别事件在新 start 的 capture 中不写入」；页面导航开关关后切 tab 仍产生 navigation 事件（P1-9 原病复现）。
- 位置：`src/extension/background/service_worker.ts:939-948`（onActivated 内 tab_switch 事件创建 + 写入）
- 问题：Round 1 f003 明确列出 tab_switch（原 `service_worker.ts:942`）为未门控 navigation 生产者。本轮修复为 content 侧 popstate/hashchange/dom_ready 加了 `if (!nav_enabled) return;`（content_script.ts:158,178,197）、为 visibility 启动包了 nav 门控（content_script.ts:131）、为 background tab_created（service_worker.ts:1027）与 tab_url_change（service_worker.ts:1058）加了 `if (current_config.nav_count_enabled === false) return;`——但 `chrome.tabs.onActivated` 内 tab_switch 事件（service_worker.ts:939-948）仍无任何 nav 门控，`create_base_event` 到 `write_events` 无条件执行。可观测缺陷：关闭「页面导航」开关后 start，切换 tab 仍写入 `category:'navigation'` 的 tab_switch 事件入库。navigation 生产者 8 处中仅 tab_switch 漏网。
- 建议：在 `service_worker.ts:939`（tab_switch create_base_event 前）加 `if (current_config.nav_count_enabled === false) return;`，与 tab_created/tab_url_change 一致。

## 结论

- 前轮 finding 复核（以 diff 为准）：
  - t106_code_f001（exception 重试路径门控）：已消除。`onActivated` 重试（service_worker.ts:979）与 `onUpdated` URL 变化重试（service_worker.ts:1084）均改为 `current_config.error_count_enabled !== false && !is_exception_active()`；初始启动（service_worker.ts:484）同步独立于 console 门控，且用 `debugger_attached_tab_id ?? tabs[0]?.id` 规避 console 关闭时 debugger 未 attach 的问题。
  - t106_code_f002（event_count_enabled 全生产者）：已消除。content_script.ts:106-117 将 mouse/keyboard/scroll/dom/clipboard/form_submit/focus/resize/fullscreen/print 共 10 个 user_action 生产者全部包进 `event_count_enabled !== false` 块；storage 独立门控（content_script.ts:118-120）。全量 grep 确认无漏网 user_action 生产者。
  - t106_code_f003（nav_count_enabled 全生产者）：修不彻底。content 侧 + visibility + tab_created + tab_url_change 已门控，但 tab_switch（service_worker.ts:939-948）漏网 → 新 finding f005。
  - t106_code_f004（测试静态正则）：已处理。测试断言覆盖新增门控点（error 重试、event 全生产者、nav handler + background 两处 return 门控）；仍为静态正则但属 test reviewer 职责，此处仅确认 code 侧门控点均有对应断言锚点。tab_switch 无断言（因代码无门控），由 f005 覆盖。
- 本轮新发现：1 条（f005 important）
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` = 1144 行（实现源码 ≥800 阈值），本 task 净增约 24 行；按降级规则仅列出，不进 finding 表。`content_script.ts` = 266 行、测试 = 39 行，未超阈值。
  - 圈复杂度：diff 触及函数无 ≥15 分支；无。
  - 范围外观察：`tests/e2e/e2e-toggle-effects.spec.ts` 仍未接入任何 playwright project（playwright.config.ts 未随本 diff 改动），行为层验证仍为死代码——属 test reviewer 职责 / 跨 task 缺口，此处仅提示。
- AC 复验方式：
  - AC-001（网络）：`re_verified` — popup `capture_network: toggles.request_count !== false`（popup.ts:325）、SW `if (config.capture_network) start_network_capture`（service_worker.ts:453）、content network_hook/websocket 按 capture_network 门控（content_script.ts:123-129）；静态代码路径核对。
  - AC-002（控制台）：`re_verified` — popup `capture_console: toggles.log_count !== false`（popup.ts:326）、SW 门控（service_worker.ts:458）、tab 切换/URL 重试按 capture_console（service_worker.ts:968,1074）；静态代码路径核对。
  - AC-003（回归/缺省开启）：`re_verified` — 新字段均以 `!== false` 判，缺省视为 true（service_worker.ts:484,556,1027,1058；content_script.ts:87,91,106,118,131）；静态代码路径核对。
  - coverage = 3 / 3
- 总体判断：f001/f002 修复完整、f003 大部分修复但 tab_switch 漏网（f005 important），navigation 类别仍有可观测事件泄漏；未解决 important 存在。
- 系统性 follow-up：无。

verdict: FAIL

## Round 3 (2026-08-11 07:30 UTC+8)

reviewed_scope: d186b6ab69d58e6e

### Findings

### t106_code_f006 - nav 门控早退同时跳过非 navigation 副作用（start-send 与 CDP 重试）

- 严重度：minor
- 锚点：代码质量/正确性；非 AC 违约。
- 位置：`src/extension/background/service_worker.ts:939`（onActivated 早退）、`src/extension/background/service_worker.ts:1059`（onUpdated 早退）
- 问题：`if (current_config.nav_count_enabled === false) return;` 在 onActivated（:939）与 onUpdated（:1059）以早退实现，不仅门控 navigation 事件写入，还跳过同 handler 内非导航工作。onActivated：跳过「向新激活 tab 发送 start」（:956）与 console/exception/body CDP 重试（:969-1008）；onUpdated：跳过 restricted→normal 的 console/exception/body 重试（:1075-1113）。可观测影响：nav 关闭时若初始 CDP attach 失败（如从 chrome:// 启动采集），后续切 tab/导航到 http(s) 不再重试 → console/error 事件在该 tab 丢失（跨类别副作用）。start-send 缺口由 content_script 状态轮询兜底（`poll_capture_status.ts` POLL_INTERVAL_MS=2000 且首次立即检查），非硬断裂。onCreated（:1028）无副作用，早退无害。
- 建议：若需保留非导航副作用，将门控收窄为仅包裹 `create_base_event` + `write_events`（`if (current_config.nav_count_enabled !== false) { ... }`）；或确认 nav 关闭时放弃 CDP 重试与 start-send 为可接受语义，在注释注明。

## 结论

- 前轮 finding 复核（以 diff 为准）：
  - t106_code_f005（tab_switch 门控）：已消除。`service_worker.ts:939` 在 `create_base_event` 前加 `if (current_config.nav_count_enabled === false) return; // T106`，与 tab_created（:1028）/tab_url_change（:1059）一致；grep 确认 background 三处 navigation 生产者（tab_switch/tab_created/tab_url_change）均已门控，visibility 由 content_script.ts:131 门控，navigation 生产者无漏网。
  - t106_code_f001（exception 重试路径）：无回归。onActivated:980、onUpdated:1085 均 `current_config.error_count_enabled !== false && !is_exception_active()`，与初始启动（:484）一致。
  - t106_code_f002（event_count_enabled 全生产者）：无回归。content_script.ts:106-117 包裹全部 10 个 user_action 生产者（mouse/keyboard/scroll/dom/clipboard/form_submit/focus/resize/fullscreen/print），storage 独立门控（:118-120）。
  - t106_code_f003：随 f005 消除，navigation 各生产者全门控。
  - t106_code_f004（静态正则测试）：未改，仍为 test reviewer 职责（minor）。
- 本轮新发现：1 条（f006 minor）
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` = 1145 行（实现源码 ≥800 阈值），本 task 净增约 27 行；按降级规则仅列出，不进 finding 表。`content_script.ts` = 266 行、测试 = 39 行，未超阈值。
  - 圈复杂度：diff 触及函数无 ≥15 分支；无。
  - 范围外观察：`tests/e2e/e2e-toggle-effects.spec.ts` 仍未接入任何 playwright project，行为层验证死代码——既有 follow-up（slug `e2e_toggle_effects_wiring`）。
- AC 复验方式：
  - AC-001（网络）：`re_verified` — popup.ts:325 `capture_network: toggles.request_count !== false`、SW:453 `if (config.capture_network) start_network_capture`、content_script.ts:123-129 network_hook/websocket 按 capture_network；静态代码路径核对。
  - AC-002（控制台）：`re_verified` — popup.ts:326、SW:458 `if (config.capture_console)`、重试 :969/:1075 按 capture_console；静态代码路径核对。
  - AC-003（回归/缺省开启）：`re_verified` — 5 新字段均 `!== false` 缺省视为 true（SW :484/:556/:939/:1028/:1059，content :87/:91/:106/:118/:131），popup 默认 toggles 全 true（popup.ts:33-39）；静态代码路径核对。
  - coverage = 3 / 3
- 总体判断：f005 已消除、f001/f002 无回归，navigation/user_action 生产者全量门控；全量 1225 测试与 `tsc --noEmit` 通过。仅新增 f006 minor（nav 早退副作用，边缘场景且 start-send 有轮询兜底），无未解决 important。
- 系统性 follow-up：无（e2e 接线沿用既有 `e2e_toggle_effects_wiring`）。

verdict: PASS
