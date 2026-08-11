# Task review t120（reviewer_focus: 测试）

- task：`t120_nav_retry_decouple_export_busy_guard`
- spec：`docs/tasks/t120_nav_retry_decouple_export_busy_guard/spec.md`
- diff_anchor：`ae15ca2565bb592790bbc3fed40c2ea9a95c2201`
- target：`git diff ae15ca2565bb592790bbc3fed40c2ea9a95c2201`
- round：1
- reviewed_at：2026-08-11 16:55 UTC+8

reviewed_scope: 28b595174b6ad99d

## Findings

### t120_test_f001 - onUpdated 早退移除与 CDP 重试无测试，AC-001 仅覆盖 onActivated 的 start-send

- 严重度：minor
- 锚点：AC-001（「onActivated/onUpdated 早退不再跳过 start-send 与 console/error/body CDP 重试」）
- 位置：`tests/unit/nav_retry_decouple.test.ts`（两个 it 均只触发 onActivated）
- 问题：测试只验证了 onActivated listener 的 start-send 触发（`send_message_spy` with `action: 'start'`）与 nav 事件不写入。AC-001 语义中的其余部分无任何断言：onUpdated listener（`src/extension/background/service_worker.ts:1085-1159`，改动在 1102 行）的早退移除完全未测；onActivated 的 console/error/body CDP 重试（1010-1049 行）与 onUpdated 的 CDP 重试（1119-1158 行，需 `is_restricted && is_normal` 前置）均无断言。若 onUpdated 的 CDP 重试被误包进 `nav_count_enabled !== false` 块内，现有测试无法发现（测试配置 `capture_console: true`，console retry 路径真实执行但未被断言）。
- 建议：补 onUpdated 测试（restricted→normal URL 变化触发 console/error/body 重试），或在 AC-001 测试中断言 console retry 的 debugger attach 发生。

### t120_test_f002 - 名为 AC-002 的测试验证语义与 spec AC-002 不符

- 严重度：minor
- 锚点：AC-002（「导航关闭时重试按需触发，start-send 有状态轮询兜底语义不回归」）
- 位置：`tests/unit/nav_retry_decouple.test.ts` 第 2 个 it（「nav_count_enabled 缺省（开启）时 tab_switch 事件正常写入（回归）」）
- 问题：该测试验证的是 `nav_count_enabled: true` 时 tab_switch 事件写入 1 条——是 nav-on 回归对照组（AC-001 的逆场景），与 AC-002 语义不对应。AC-002 的「重试按需触发」部分由 AC-001 测试的 nav-off start-send 断言重叠覆盖；「start-send 有状态轮询兜底不回归」无直接测试（`poll_capture_status` 有既有测试且本 diff 未改该模块）。测试名易误导 ac_evidence 映射。
- 建议：将测试改为真正的 nav-off 重试按需场景，或在测试名中明确其为「nav-on 回归对照组」而非 AC-002 覆盖。

### t120_test_f003 - export 测试内 AC 编号与 spec AC-003 错位

- 严重度：minor
- 锚点：AC-003
- 位置：`tests/unit/export_busy_guard.test.ts` 两个 it 名称（「AC-001」「AC-002」）
- 问题：spec 契约区 AC-001/AC-002 属于 p019 导航重试，AC-003 才是 dashboard 导出防重入。export 测试内复用「AC-001/AC-002」编号，实际对应 spec AC-003 的两半（in-flight 拦截 / 标记释放）。编号错位会给 handoff `ac_evidence` 精确映射带来歧义。
- 建议：it 名称改引 spec 编号 AC-003（如「AC-003: in-flight 拦截」）。

### t120_test_f004 - export 防重入仅测 archive 格式路径

- 严重度：minor
- 锚点：AC-003
- 位置：`tests/unit/export_busy_guard.test.ts`
- 问题：guard（`export_in_flight`）在 format 分支之前，逻辑与格式无关，两个测试均只传 `'archive'`。html/har/json/jsonl 分支的 in-flight 拦截行为无验证（属「还可以再加一个 case」）。
- 建议：可选补一个非 archive 格式的重复触发拦截 case。

## 结论

- 前轮 finding 复核：Round 1，无
- 改测方向复核：无（diff 无既有测试修改，两个测试均为新文件；task.md 仅 front matter 状态字段）
- 本轮新发现：4 条（均为 minor）
- 未进表的提示：
  1. `dashboard_captures.ts:169` batchExport 批量导出在防重入下只导出第一个 id，其余静默拦截且无用户提示。AC-003 批准「拦截」语义，但批量场景用户感知为「只导出一个」，建议后续评估是否需排队语义。
  2. `popup_category_capture_gates.test.ts` 的源码正则断言（`nav_count_enabled === false) return; // T106`）现仅匹配 onCreated（1069 行）一处；onActivated/onUpdated 门控语义被 p019 有意移除，该正则测试语义衰减但仍通过（既有测试，非本 task 引入，已重跑确认通过）。
  3. onCreated（1069 行）保留 nav-off 早退——该 listener 无重试逻辑，行为正确，无需处理。
- 总体判断：危险模式扫描无命中，4 个测试全过且无 flaky（nav 测试重跑 5 次），mock 边界与测试策略一致，均触达真实生产逻辑；仅 4 条 minor 覆盖/映射问题，可 PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——重跑 `nav_retry_decouple.test.ts`，测试经真实 `chrome.tabs.onActivated` listener 触发，断言 start-send 消息发出（`toHaveBeenCalledWith(42, objectContaining({action:'start'}))`）且 navigation 事件 0 条；onUpdated 分支无测试（见 F001）。
- AC-002：`re_verified`——可测部分「nav off 时重试按需触发」由 AC-001 测试的 nav-off start-send 断言重叠覆盖（重跑通过）；「轮询兜底」模块 `poll_capture_status` 未在本 diff 改动且有既有测试；AC-002 无独立直接测试（见 F002）。
- AC-003：`re_verified`——重跑 `export_busy_guard.test.ts`：挂起 snapshot 阶段第二次触发被拦截、download_blob/build_archive/flush 各 1 次；串行两次导出标记释放、download 2 次。
- coverage = 3 / 3

verdict: PASS

## Round 2 (2026-08-11 17:01 UTC+8)

- round：2
- reviewed_at：2026-08-11 17:01 UTC+8

reviewed_scope: 649c683576a714e5

### 前轮 finding 复核

- t120_test_f001（onUpdated 早退移除与 CDP 重试无测试，minor）：**已修**。新增 `nav_retry_decouple.test.ts` 第 3 个 it（「AC-003: nav_count_enabled=false 时 onUpdated restricted→normal 仍触发 CDP 重试」）：`mock_chrome_debugger.set_command_error('Runtime.enable')` 令 console 启动失败（`is_console_active()` false），依次触发 onUpdated chrome://→https 导航，断言 `Runtime.enable` sendCommand 调用次数增加且 navigation 事件 0 条。重跑通过（3 tests）。若重试被误包回 nav-off 早退块，Runtime.enable 不增加，测试失败——能锁定 AC-001 的 onUpdated 解耦。error/body 同构分支未单独断言（条件模式与 console 平行，属可选扩展，见 f001 原建议的未覆盖尾）。
- t120_test_f002（名为 AC-002 的测试语义与 spec AC-002 不符，minor）：**语义覆盖已达成，命名残留**。「重试按需触发」由新增 AC-003 it 覆盖；该 it 测试名仍为「AC-002: nav_count_enabled 缺省（开启）时 tab_switch 事件正常写入（回归）」——验证 nav-on 回归对照组，非 AC-002 语义，f002 所提命名问题仍在（minor）。
- t120_test_f003（export 测试内 AC 编号与 spec AC-003 错位，minor）：**未修**。export_busy_guard.test.ts 前两个 it 仍命名「AC-001」「AC-002」（对应 spec AC-003 的 in-flight 拦截 / 标记释放两半）；本轮新增第 3 个 it 命名「AC-003」恰好对上 spec AC-003，但同文件内编号序列仍与 spec 全局编号撞号（见本轮 f005）。
- t120_test_f004（export 仅测 archive 格式，minor）：**未修**。guard 在 format 分支之前，逻辑与格式无关，非 archive 分支属可选加 case。

### 本轮新发现

### t120_test_f005 - nav_retry_decouple 新增 it 命名「AC-003」与 spec AC-003（dashboard 导出）撞号

- 严重度：minor
- 锚点：AC-001（该 it 实际覆盖 onUpdated CDP 重试，属于 AC-001 语义）
- 位置：`tests/unit/nav_retry_decouple.test.ts:140`（it「AC-003: nav_count_enabled=false 时 onUpdated restricted→normal 仍触发 CDP 重试」）
- 问题：spec 契约区 AC-003 是 dashboard 导出防重入（p027）；导航侧该 it 验证的是 AC-001 的 onUpdated 半段，却命名「AC-003」，与 export_busy_guard.test.ts 的「AC-003」（不同 capture 互不拦截，对应 spec AC-003）撞号。handoff `ac_evidence` 若按测试名机械映射会错位。
- 建议：导航侧 it 改引「AC-001」（如「AC-001: onUpdated restricted→normal CDP 重试」），export 侧统一「AC-003: …」前缀，与 f003 一并收敛编号。

### 改测方向复核

无——diff 无既有测试修改（`export_busy_guard.test.ts`、`nav_retry_decouple.test.ts` 均为新增文件；task.md 为流程文件），无「迁就实现」改测。

### 测试可信与覆盖核对

- export_busy_guard（3 it，重跑通过）：AC-003 三半均有断言——in-flight 拦截（download_blob/build_archive 各 1、flush 消息 1 次）、串行释放（download 2）、不同 capture 互不拦截（cap_a 挂起时 cap_b 完整执行，download 2）。第三 it 是 f001（单一 flag）修复的**有效回归测试**：单一 flag 下 cap_b 被误拦，download 仅 1 次，断言失败。guard（`export_in_flight` Map）为被测生产代码，未被 mock。
- nav_retry_decouple（3 it，重跑通过）：AC-001 断言 start-send 重试发生（`tabs.sendMessage(42, objectContaining({action:'start'}))`）+ navigation 事件 0；AC-003 断言 onUpdated CDP 重试（Runtime.enable 次数增加）。`toBeGreaterThan` 用于「重试再次发生」证据，mock 环境无其他 Runtime.enable 来源，非弱化。
- 危险模式扫描：无恒真断言、无删/反转/注释 expect、无 skip/only、无 ts-ignore/eslint-disable、无阈值掩盖、无条件跳过、无 `.value=` 冒充交互、无存在即通过。mock 均在系统边界（chrome/CDP/存储/下载/时钟链路），测试策略批准 mock flush/构建/下载链路。

### 结论

- 前轮 finding 复核：f001 已修；f002 语义覆盖达成、命名残留；f003 未修；f004 未修（均为 minor）。
- 改测方向复核：无。
- 本轮新发现：1 条（f005，minor）。
- 未进表的提示：
  1. 同 id 不同 format（如 archive + json 同时导出）不受拦截——key 含 format，属实现语义取舍，由 code 路判定；对测试无影响。
  2. onActivated 的 error 重试分支（`error_count_enabled` 缺省时走）未断言——与 console 同构，可选扩展。
  3. 测试名「nav_count_enabled 缺省（开启）」实际传 `nav_count_enabled: true`，非缺省，描述不准（并入 f002 命名残留）。
- 总体判断：无新 blocker，前轮 4 minor 中 f001 已修，其余为命名/覆盖扩展级 minor，PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——重跑 `nav_retry_decouple.test.ts`（3 tests 过）：nav-off 下 onActivated start-send 发出且 navigation 事件 0 条；onUpdated restricted→normal 时 `Runtime.enable` sendCommand 次数增加且 navigation 事件 0 条。error/body 重试分支未单独断言（与 console 同构）。
- AC-002：`re_verified`——「重试按需触发」由 AC-003 it（nav-off onUpdated 重试）覆盖；「轮询兜底」重跑 `poll_capture_status.test.ts`（6 tests 过），本 diff 未改该模块。
- AC-003：`re_verified`——重跑 `export_busy_guard.test.ts`（3 tests 过）：挂起 in-flight 时同 key 第二次触发被拦截（flush/build/download 各 1）；串行两次各执行（download 2）；不同 capture 并发互不拦截（download 2）。
- coverage = 3 / 3

verdict: PASS

## Round 3 (2026-08-11 17:12 UTC+8)

- round：3（终审）
- reviewed_at：2026-08-11 17:12 UTC+8

reviewed_scope: f18e5a66db2d99a2

### 前轮 finding 复核

- t120_test_f001（onUpdated 早退移除与 CDP 重试无测试，minor）：**已修（维持）**。`nav_retry_decouple.test.ts:163-193` onUpdated 用例保留：`set_command_error('Runtime.enable')` 令 console 未激活，chrome://→https 导航后断言 `Runtime.enable` sendCommand 次数增加（重试块 `service_worker.ts:1119-1129` 在 nav 分支外）+ navigation 事件 0 条。重跑通过。
- t120_test_f002（名为 AC-002 的测试语义与 spec AC-002 不符，minor）：**已修（命名残留消除）**。原「AC-002: nav_count_enabled 缺省（开启）…」it 改为 `nav on：tab_switch 事件正常写入（回归）`（`nav_retry_decouple.test.ts:142`），名实相符（传 `nav_count_enabled: true`），不再误导 ac_evidence 映射。
- t120_test_f003（export 测试内 AC 编号与 spec AC-003 错位，minor）：**已修**。`export_busy_guard.test.ts` 3 个 it 全部语义化命名（`in-flight 期间同 key 重复触发被拦截，单次 flush/构建/下载` :61 / `串行两次导出均正常执行（防重入标记释放）` :95 / `不同 capture 的导出互不拦截（批量导出语义保留）` :111），无 AC 编号残留。
- t120_test_f004（export 仅测 archive 格式，minor）：**维持未修（属性为可选扩展，不阻断）**。guard（`export_in_flight` Map key）在 format 分支之前、与格式无关；非 archive 格式补 case 属「还可以再加一个」级，不强制。
- t120_test_f005（nav 新增 it「AC-003」与 spec AC-003 撞号，minor）：**已修**。原「AC-003: …」it 改为 `onUpdated nav off：restricted→normal 导航仍触发 CDP 重试`（`nav_retry_decouple.test.ts:163`），无编号撞号。
- t120_code_f003（onActivated 路径 console/error/body CDP 重试无断言，minor，code 路）：**已修（console 分支闭环）**。新增 `onActivated nav off：console 未激活时 CDP 重试仍触发`（`nav_retry_decouple.test.ts:119-140`）：`set_command_error('Runtime.enable', boom)` → `start_console_capture` 内 `Runtime.enable` reject → `is_capturing=false`（`console_capture.ts:51-65`）→ `is_console_active()` false；onActivated 触发后 `service_worker.ts:1010` 重试条件成立，`start_console_capture` 再次 `attach` + `Runtime.enable`（:44），断言调用数增加。若重试块被误移回 nav `if` 内，Runtime.enable 不增 → 红灯。error/body 分支仍无独立断言（`error_count_enabled: false` / `capture_network: false` 排除，与 console 平行同构），原 finding 建议即先 console，属可选扩展。

### 本轮新发现

无（0 条）。新增用例断言链逐一核实：mock `_send_command_calls.push` 先于 reject（`chrome_debugger.ts:57-61`），失败调用计入 before 基数；`runtime_enable_before` 在 `send_message('start')` 之后采样，onActivated 后增长仅可能来自 console 重试路径；`await on_activated_cb()` 完整等待，无 race。

### 危险模式扫描（Round 3）

无命中：无恒真断言、无删/反转/注释 expect、无 skip/only、无 ts-ignore/eslint-disable、无阈值掩盖、无条件跳过、无 `.value=` 冒充交互、无存在即通过。`toBeGreaterThan` 为「重试再次发生」相对增长证据，mock 环境唯一 Runtime.enable 来源为 console 启动/重试，非弱化。mock 均在系统边界（chrome/CDP/存储/下载/时钟链路），被测生产逻辑（`service_worker.ts` / `dashboard_shared.ts` / `console_capture.ts`）未被 mock。

### 改测方向复核

无——diff 无既有测试修改（两测试文件均为新增文件，本轮仅在其中加用例与改名），无「迁就实现」改测。

### 结论

- 前轮 finding 复核：test f001/f002/f003/f005 与 code f003 已修，f004 维持（可选扩展，不阻断）；均以 diff 与实测核实，不采信处置表自述。
- 改测方向复核：无。
- 本轮新发现：0 条。
- 未进表的提示：
  1. error/body 单分支无独立断言（onActivated 与 onUpdated 均只锁 console 分支）——与 console 平行同构，可选扩展，不阻断。
  2. export 非 archive 格式分支未测——f004 延续，可选扩展。
  3. 处置表（`task.md`「Review 处置」）当前仅登记 code f001/f002，test 路 f001-f005 与 code f003 待收尾时补登记（流程事项，非测试问题）。
- 总体判断：前轮 5 条 test minor + code f003 全部修复/命名收敛，新用例真实触达生产重试路径（console 分支），无未解决 critical / important，PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-001：`re_verified`——重跑 `npx vitest run tests/unit/nav_retry_decouple.test.ts tests/unit/export_busy_guard.test.ts`（7 tests 过）：nav off 下 onActivated start-send 发出 + navigation 0 条（it 1）；onActivated console 未激活时 `Runtime.enable` 重试次数增加（it 2）；onUpdated restricted→normal 重试增加 + navigation 0 条（it 4）。代码核实重试块（service_worker.ts:1010/1021/1031、:1120/1130）均在 nav 分支外。
- AC-002：`re_verified`——「重试按需触发」由 it 2/it 4 的 nav-off CDP 重试断言覆盖；「轮询兜底」`tabs_send_message_retry`（service_worker.ts:997）在 nav 分支外保留，Round 2 已重跑 `poll_capture_status.test.ts`（6 tests），本 diff 未改该模块。
- AC-003：`re_verified`——重跑 export_busy_guard.test.ts（3 tests 过）：同 key in-flight 拦截（flush/build/download 各 1）、串行释放（download 2）、不同 capture 互不拦截（download 2）；guard Map key 化 + `finally` 释放（dashboard_shared.ts:239-292）。
- coverage = 3 / 3

verdict: PASS

