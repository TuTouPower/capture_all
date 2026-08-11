# Task review t120（reviewer_focus: 代码）

- task：`t120_nav_retry_decouple_export_busy_guard`
- spec：`docs/tasks/t120_nav_retry_decouple_export_busy_guard/spec.md`
- diff_anchor：`ae15ca2565bb592790bbc3fed40c2ea9a95c2201`
- target：`git diff ae15ca2565bb592790bbc3fed40c2ea9a95c2201`
- round：1
- reviewed_at：2026-08-11 16:48 UTC+8

## Findings

### t120_code_f001 - export 防重入 guard 粒度过粗，批量导出只执行第一条

- 严重度：important
- 锚点：行为缺陷（无对应 AC；真 bug）。输入：dashboard「采集记录」页勾选 ≥2 条采集记录，点击「批量导出」；坏结果：只有第一个 capture 被导出，其余 N-1 个被静默丢弃，无任何提示。
- 位置：`src/extension/dashboard/dashboard_shared.ts:242-243`（guard）、`src/extension/dashboard/dashboard_captures.ts:169`（批量接线）
- 问题：`#batchExport` 的 handler 是 `selected.forEach((id) => export_capture(id))`，遍历中第一次调用在第一个 `await` 前同步置 `export_in_flight = true`（dashboard_shared.ts:243），后续对其它 capture 的调用全部命中 `if (export_in_flight) return`（:242）直接返回。改前每次点击会对每个选中 capture 独立执行 flush + 构建 + 下载（并发），多选批量导出可用；改后只导出第一项，其余静默丢失。AC-003 只要求「重复触发同一导出不并行执行」，未授权拦截不同 capture 的并行导出——这是防重入实现把合法并行导出一并拦掉的范围外行为破坏（违反「不偏航」）。
- 建议：最小修复方向二选一——(a) 防重入 key 改为 `(capture_id, format)` 维度（如 `Map<string, boolean>`，key 为 `` `${id}:${format}` ``），同 key 重复触发拦截，不同 capture 并行导出恢复；或 (b) 批量接线改为 `for (const id of selected) await export_capture(id)` 串行执行，保留「导出期间不并发」意图同时每个选中项都完成。推荐 (a)，改动最小且不改变单次导出语义。

### t120_code_f002 - AC-001 测试只覆盖 onActivated/start-send，onUpdated 分支与 CDP 重试无断言

- 严重度：minor
- 锚点：spec 上下文区测试策略明确「mock chrome.tabs onActivated/onUpdated 事件触发 listener，断言 nav_count_enabled=false 时重试调用仍发生」；AC-001 行为面包含「start-send 与 console/error/body CDP 重试」。
- 位置：`tests/unit/nav_retry_decouple.test.ts:92-117`
- 问题：实现层 onActivated（service_worker.ts:978-990）与 onUpdated（:1102-1114）两处早退都已改为 if 包裹，但测试只触发 onActivated 一个用例，且仅断言 start-send（`expect.objectContaining({ action: 'start' })`，:108-111）与导航事件不写入，未断言 console/error/body CDP 重试调用。onUpdated 的 tab_url_change 跳过 + restricted→normal CDP 重试（service_worker.ts:1116-1158）完全无测试。测试策略要求的 onUpdated 一半未实现。onUpdated 改动与 onActivated 结构对称且代码正确（重试块保持在 nav 分支外、`last_tab_urls.set` 在分支前保证 `prev_url` 正确），无已知缺陷被掩盖，故不 blocking。
- 建议：补 onUpdated 用例（`changeInfo.status = 'loading'` 触发 listener），断言 nav_count_enabled=false 时 tab_url_change 不写入，且 prev_url 为 restricted（如 `chrome://`）→ new_url 为 normal 时 console/error/body 重试调用仍发生；onActivated 用例补 console/error/body 重试断言。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 本轮新发现：2 条
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` 1190 行（≥800 important 阈值），本 task 净增仅 +4 行（numstat 28/24），未继续堆大；`dashboard_shared.ts` 305 行未超阈值。按降级规则不进 finding 表。
  - 复杂度：无新增 ≥10 分支函数；onActivated/onUpdated 由早退改为 if 包裹，分支数未增。
  - 测试内 AC 编号与 spec AC 编号语义错位：`nav_retry_decouple.test.ts` 的「AC-002」实为 nav 开启回归（对应 spec 无此条）、`export_busy_guard.test.ts` 的「AC-001/002」对应 spec AC-003。不改代码，仅提示收尾时勿据此映射 `handoff.json` 的 `ac_evidence`。
  - 静默拦截：guard 拦截时无 UI 反馈（AC-003 允许「被拦截或排队」，属已批准设计，仅观察）。
- 总体判断：p019 解耦实现正确、测试通过；p027 防重入实现自身正确但粒度过粗，破坏既有多选批量导出功能（f001 important），需修复后重审。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified` — 重跑 `npx vitest run tests/unit/nav_retry_decouple.test.ts`（2 用例通过）；读代码确认 onActivated/onUpdated 早退均改为 `nav_count_enabled !== false` 包裹，start-send（service_worker.ts:997-1003）与 console/error/body 重试（:1010-1048、:1119-1158）保持在 nav 分支之外。
- AC-002：`re_verified` — 代码确认 `tabs_send_message_retry` 调用点与 `is_active_generation` 有状态守卫（:991-1004）均在 nav 分支外保留，`check_limit_and_stop` 语义不变（只影响事件写入分支）；nav 开启路径由测试 2 断言 tab_switch 正常写入。注意：测试标签「AC-002」实为 nav 开启回归，AC-002 的验证主要靠代码阅读。
- AC-003：`re_verified` — 重跑 `npx vitest run tests/unit/export_busy_guard.test.ts`（2 用例通过）；测试 1 断言 in-flight 期间二次触发被拦截、download_blob/build_archive/flush 各一次，测试 2 断言 flag 释放后串行两次均执行；代码确认 `finally` 覆盖 alert/异常/正常全部路径释放 flag。
- coverage = 3 / 3

reviewed_scope: 28b595174b6ad99d

verdict: FAIL

## Round 2 (2026-08-11 16:59 UTC+8)

### 前轮 finding 复核

- **t120_code_f001（important，export 防重入粒度过粗）**：已消除。diff 核实：`dashboard_shared.ts:239` 单一 boolean 改为 `const export_in_flight = new Map<string, true>()`，key 为 `` `${id}:${format}` ``（:243-245），同 key 重复触发 `has()` 拦截、`finally`（:291-293）释放覆盖 alert-return / 异常 / 正常全部路径；不同 capture 不同 key 互不拦截，批量接线 `dashboard_captures.ts:169`（`selected.forEach((id) => export_capture(id))`）恢复逐项导出。新增测试 `export_busy_guard.test.ts` AC-003 用例复现「cap_a in-flight 时 cap_b 导出正常完成」，`download_blob` 计 2 次，实测通过。
- **t120_code_f002（minor，onUpdated 分支与 CDP 重试无测试）**：核心已修，onActivated 部分未闭环（见 f003）。diff 核实：新增 `nav_retry_decouple.test.ts` AC-003 用例触发 onUpdated listener（`changeInfo.status='loading'`，先 `chrome://extensions/` 再 `https://example.com/page`），配合 `mock_chrome_debugger.set_command_error('Runtime.enable')` 使 console 启动失败（`is_console_active` false），断言 `Runtime.enable` 调用数增加（restricted→normal CDP 重试真实触达 `service_worker.ts:1120-1129` 重试块）+ `tab_url_change` 不写入（nav 关闭）。测试 6/6 通过，重试块确认在 nav 分支（:1102-1114）之外。

### 本轮新发现

### t120_code_f003 - f002 残余：onActivated 路径的 console/error/body CDP 重试仍无断言

- 严重度：minor
- 锚点：spec 上下文区测试策略「断言 nav_count_enabled=false 时重试调用仍发生」；f002 建议「onActivated 用例补 console/error/body 重试断言」未落实
- 位置：`tests/unit/nav_retry_decouple.test.ts:25-51`（AC-001 用例）、`src/extension/background/service_worker.ts:1010-1049`（onActivated 重试块）
- 问题：AC-001 用例未 mock `Runtime.enable` 报错，start 时 console 捕获成功（`is_console_active` 为 true），onActivated 触发时 console/error/body 重试分支（service_worker.ts:1010-1049）条件不满足、不执行、无断言——该用例仅验证 start-send 与 tab_switch 不写入。onUpdated 用例（AC-003）同样只断言 console 一条分支（`error_count_enabled: false`、`capture_network: false` 主动排除 error/body，:1130-1157 无断言）。若未来把 onActivated 三个重试块误移回 nav `if` 内，现有测试不红灯。实现代码本身正确（重试块在 nav 分支外），属测试覆盖缺口，非行为缺陷。
- 建议：AC-001 用例加 `mock_chrome_debugger.set_command_error('Runtime.enable', new Error('boom'))` 后触发 onActivated，断言 `Runtime.enable` 调用数增加；如需 error/body 分支，配置 `error_count_enabled: true` / `capture_network + capture_response_body: true` 并 mock 对应启动失败。

## 结论（Round 2）

- 前轮 finding 复核：f001 已消除（Map key 化防重入 + finally 释放 + 互不拦截测试，diff/测试双重核实）；f002 核心已修（onUpdated CDP 重试用例真实触达生产逻辑），onActivated 的 console/error/body 断言残留为 f003 minor。
- 本轮新发现：1 条（f003，minor）
- 未进表的提示：
  - 文件过大：`service_worker.ts` 1190 行（≥800 important 阈值），本 task 净增 -4 行（numstat 28/24），未继续堆大；`dashboard_shared.ts` 307 行、测试 138/171 行均未超阈值。按降级规则不进表。
  - 复杂度：无新增 ≥10 分支函数；onActivated/onUpdated 由早退改 if 包裹分支数未增。
  - 测试内 AC 标签与 spec 编号错位（Round 1 已提示，本轮未改）：`export_busy_guard.test.ts` 的「AC-001/002/003」对应 spec AC-003；`nav_retry_decouple.test.ts` 的「AC-002」实为 nav 开启回归。收尾映射 `handoff.json` 的 `ac_evidence` 时勿按标签直取。
  - `export_in_flight` 值恒为 `true`，用 `Set<string>` 语义更贴切；纯风格观察，不入表。
- 总体判断：f001（important）已修，f002（minor）核心已修，仅余测试覆盖扩展级 minor（f003），无未解决 critical / important。
- 系统性 follow-up：无

### AC 复验披露（Round 2）

- AC-001：`re_verified` — 重跑 `npx vitest run tests/unit/nav_retry_decouple.test.ts`（3 用例通过）；读代码确认 onActivated/onUpdated 早退均改为 `nav_count_enabled !== false` 包裹，start-send（service_worker.ts:997-1003）与 CDP 重试（:1010-1049、:1116-1158）均在 nav 分支外。
- AC-002：`re_verified` — 代码确认 `tabs_send_message_retry` 轮询重试（:49-74）与 `is_active_generation` 有状态守卫（:991/:1004）保留在 nav 分支外，`check_limit_and_stop` 仅在 nav 开启分支内调用（与 T106 原语义一致）；nav 开启路径由测试 2 断言 tab_switch 正常写入。
- AC-003：`re_verified` — 重跑 `npx vitest run tests/unit/export_busy_guard.test.ts`（3 用例通过）；测试 1 断言 in-flight 二次触发拦截且 flush/build/download 各一次，测试 2 断言释放后串行两次均执行，测试 3 断言不同 capture 互不拦截（f001 回归锚点）；代码确认 Map key 化 + `finally` 释放。
- coverage = 3 / 3

reviewed_scope: 649c683576a714e5

verdict: PASS

## Round 3 (2026-08-11 17:10 UTC+8)

### 前轮 finding 复核

- **t120_code_f001（important，export 防重入粒度过粗）**：已消除（Round 2 确认，本轮生产代码零改动维持）。diff 核实：`dashboard_shared.ts:237-250` 仍为 `Map<string, true>` 按 `` `${id}:${format}` `` key 化防重入，`finally`（:291-293）释放；批量导出不同 capture 互不拦截。生产代码相对 Round 2 无任何改动（service_worker.ts / dashboard_shared.ts diff 逐行比对一致）。
- **t120_code_f002（minor，onUpdated 分支与 CDP 重试无测试）**：已消除。`nav_retry_decouple.test.ts:163-193`「onUpdated nav off：restricted→normal 导航仍触发 CDP 重试」保留：两次 onUpdated 触发（chrome://extensions/ → https://example.com/page）+ `set_command_error('Runtime.enable')`，断言 `Runtime.enable` 调用数增加（真实触达 `service_worker.ts:1116-1158` 重试块）与 tab_url_change 不写入。
- **t120_code_f003（minor，onActivated 路径的 CDP 重试仍无断言）**：已消除。新增用例 `nav_retry_decouple.test.ts:119-140`「onActivated nav off：console 未激活时 CDP 重试仍触发」：`set_command_error('Runtime.enable')` 使 console 启动失败（`is_console_active()` false），触发 onActivated 后断言 `send_command_calls` 中 `Runtime.enable` 计数增加（:139），真实触达 `service_worker.ts:1010-1020` console 重试分支。计数窗口内唯一 `Runtime.enable` 来源为该分支（error/body 被 config `error_count_enabled: false` / `capture_network: false` 排除，onUpdated 未触发），断言可靠，无假阳性。error/body 分支（:1021-1049）无独立断言：f003 建议中属「如需」可选扩展，console 断言已锚定重试块整体位于 nav 分支外（未来若整块移回 nav `if` 内即红灯），不构成未修。

### 本轮新发现

无（0 条）。

### 命名收敛核对

- `nav_retry_decouple.test.ts` 4 个 `it` 全部语义化（start-send 重试 / CDP 重试触发 / nav on 回归 / onUpdated CDP 重试），无 AC-NNN 标签。
- `export_busy_guard.test.ts` 3 个 `it` 全部语义化（同 key 拦截 / 串行释放 / 互不拦截），无 AC-NNN 标签。
- 全库 grep 两测试文件 `AC-\d{3}` 零命中；Round 1/2 提示的「测试内 AC 标签与 spec 编号错位」消除，`handoff.json` 的 `ac_evidence` 映射不再受标签误导。

## 结论（Round 3）

- 前轮 finding 复核：f001 / f002 / f003 全部已消除（生产代码零改动，测试侧 diff 与重跑双重核实）。
- 本轮新发现：0 条
- 未进表的提示：
  - 文件过大：`service_worker.ts` 1190 行（≥800 important 阈值），本 task 生产代码零改动、无净增，按降级规则不进表；`nav_retry_decouple.test.ts` 194 行、`export_busy_guard.test.ts` 138 行均 <600 阈值。
  - 复杂度：无新增 ≥10 分支函数；onActivated/onUpdated 早退改 if 包裹分支数未增。
  - 测试覆盖观察：onActivated 用例仅断言 console（Runtime.enable）分支，error/body 分支（service_worker.ts:1021-1049）无独立断言；console 断言已锚定重试块位置，error/body 属「覆盖可更广」，不入 finding 表。
  - 范围外观察：无。
- 总体判断：前轮全部 finding 已闭环，命名收敛无撞号，测试真实触达生产逻辑且 7/7 通过，无未解决 critical / important，终审 PASS。
- 系统性 follow-up：无

### AC 复验披露（Round 3）

- AC-001：`re_verified` — 重跑 `npx vitest run tests/unit/nav_retry_decouple.test.ts`（4/4 通过）；代码确认早退 if 包裹（service_worker.ts:977-990、:1097-1115）与 CDP 重试块（:1010-1049、:1116-1158）在 nav 分支外；新用例断言 onActivated 下 Runtime.enable 重试触发。
- AC-002：`re_verified` — 代码确认 `tabs_send_message_retry` 有状态轮询（:49-74）与 `is_active_generation` 守卫（:991/:1004/:1015/:1044）保留在 nav 分支外；nav on 回归用例（:142-161）断言 tab_switch 正常写入。
- AC-003：`re_verified` — 重跑 `npx vitest run tests/unit/export_busy_guard.test.ts`（3/3 通过）；断言同 key in-flight 拦截且 flush/build/download 各一次、释放后串行两次均执行、不同 capture 互不拦截；代码确认 Map key 化 + `finally` 释放（dashboard_shared.ts:237-250、:291-293）。
- coverage = 3 / 3

reviewed_scope: f18e5a66db2d99a2

verdict: PASS
