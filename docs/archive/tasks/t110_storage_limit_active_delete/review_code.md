# Task review t110（reviewer_focus: 代码）

- task：`t110_storage_limit_active_delete`
- spec：`docs/tasks/t110_storage_limit_active_delete/spec.md`
- diff_anchor：`ef496b886c6af8b698814fbb92869568016fac55`
- target：`git diff ef496b886c6af8b698814fbb92869568016fac55`
- round：1
- reviewed_at：2026-08-11 08:47 UTC+8

## Findings

### t110_code_f001 - 限额检查仅接线 handle_event 单点，network/console/tab_switch 写路径绕过限额

- 严重度：important
- 锚点：契约区范围「采集过程中持久化/检查存储用量，超限时停止写入或 stop capture 并给出可观察失败/状态」；AC-001
- 位置：`src/extension/background/service_worker.ts:778`（唯一检查点）；绕过点 `:898`（`handle_network_request`→`write_network_requests`）、`:918`（`handle_console_log`→`write_console_events`）、`:963`（tab_switch 直写 `write_events`）
- 问题：`check_storage_limit` 只在 `handle_event` 入口调用（service_worker.ts:778）。网络请求、控制台日志、tab_switch 导航三类写入各走独立路径，均不经过 `handle_event`，因此超限后这些事件仍持续写入，capture 不会因限额进入 stopped/failed；同时这些写最终都经 `flush_store`（storage.ts:375 `update_bytes_written`）累加 `bytes_written`，即 `get_capture_size` 数据完整、仅触发缺失。网络响应体通常是最大存储消耗者：纯网络/纯控制台会话可在超过 `MAX_SESSION_SIZE_BYTES`（500MB，constants.ts:20）后继续增长而不停机。AC-001 两条分句（不再接受新事件写入 / capture 进入 stopped/failed）在该路径上均不成立。
- 建议：将限额检查下沉到统一写入口（`write_events`/`write_network_requests`/`write_console_events` 公共封装，或 `flush_store` 提交后），超限时触发 stop 并返回可观察失败；或至少在 `handle_network_request`、`handle_console_log` 入口同样调用 `check_storage_limit`。

### t110_code_f002 - 超限触发的 stop 生命周期事件 reason 硬编码 'user_stop'

- 严重度：minor
- 锚点：行为缺陷（生命周期数据语义误导）
- 位置：`src/extension/background/service_worker.ts:702`（`stop_capture_inner` 内 `reason: 'user_stop'`）
- 问题：`stop_capture()` / `stop_capture_inner()` 无 reason 参数。t110 在 `handle_event` 限额分支调用 `stop_capture()`（service_worker.ts:780），最终写入的 `capture_stopped` 生命周期事件 reason 恒为 `'user_stop'`，把「存储限额停机」记录成「用户主动停止」。导出/查询生命周期事件的消费方无法区分停因。
- 建议：`stop_capture(reason?: StopReason)` 透传 reason，限额路径传 `'storage_limit'`（或新增失败类 reason），默认仍 `'user_stop'`。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（首轮）。
- 本轮新发现：2 条（1 important、1 minor）。
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` 1164 行（本 task +13）、`src/extension/background/storage.ts` 588 行（+5）均达源码阈值，但本 task 净增行数小且为既有单体文件，按降级规则不进 finding 表。
  - 范围外观察：`tests/unit/logger.test.ts:140` 追加 timeout `10000`，与 t110 功能无关，属慢测健壮性调整（1 行），非偏航；`set_capture_size_for_test` 符合项目既有 `*_for_test` 测试钩子惯例（agent_bridge_client.ts:23 等）。
  - AC-003 实现侧已写 `ended_at`（service_worker.ts:149/162），满足 AC「ended_at 非空或 stop 生命周期事件」；测试未断言 ended_at 分句，已由 test reviewer（t110_test_f002）登记。
- 总体判断：存在 1 个未解决 important（限额检查未覆盖 network/console/tab_switch 写路径），FAIL。

### AC 复验方式

- AC-001：`re_verified`（handle_event 路径）。重跑 `tests/unit/storage_limit_active_delete.test.ts` 5 例全过；AC-001b 经消息接口驱动真实 `handle_event`→`check_storage_limit`→`stop_capture`，断言 `success===false` 且 `status.is_capturing===false`。代码核证检查仅覆盖 `handle_event` 路径，network/console/tab_switch 写路径超限不停机（见 f001）。
- AC-002：`re_verified`。`service_worker.ts:229` guard 先于 `storage_delete_capture` 返回；AC-002 用例经真实 start+delete 断言 `success===false`。guard 用模块级 `is_capturing && current_capture_id === message.capture_id` 判断，语义正确。
- AC-003：`re_verified`。`cleanup_stale_capture_state`（service_worker.ts:130-183）对陈旧 active 写 `status:'completed'` 与 `ended_at` 非空；AC-003 用例直调并断言 `update_capture` 收到 `status:'completed'`。

coverage = 3 / 3

### 系统性 follow-up

- 无。

reviewed_scope: 72e55698589fae12

verdict: FAIL

## Round 2 (2026-08-11 08:58 UTC+8)

reviewed_scope: 8325d389956950bb

### 前轮 finding 复核

- t110_code_f001（important）：**修不彻底**。`check_limit_and_stop` helper（service_worker.ts:872-880）已接入 `handle_event`（:778）、`handle_network_request`（:884）、`handle_console_log`（:919），network/console 两条 bypass 已封堵；但 f001 点名的第三条 bypass——导航写路径——仍未接入：`chrome.tabs.onActivated`（:979 直写 `write_events` 写 tab_switch）、`onCreated`（:1068 tab_created）、`onUpdated`（:1099 tab_url_change）均不经限额检查。见新 finding f003。
- t110_code_f002（minor）：**已修复**。`stop_capture(reason='user_stop')`（:612）与 `stop_capture_inner(reason)`（:633）透传 reason，`check_limit_and_stop` 超限时传 `'storage_limit'`（:876），`stopped_data.reason = reason`（:702）；`CaptureStoppedData['reason']` 联合类型加 `'storage_limit'`（types.ts:509）。

### Findings

### t110_code_f003 - 导航写路径仍绕过限额检查（f001 修不彻底）

- 严重度：important
- 锚点：AC-001「模拟 bytes 超限后，不再接受新事件写入或 capture 进入 stopped/failed 且 status 可查询」；范围「超限时停止写入或 stop capture 并给出可观察失败/状态」
- 位置：`src/extension/background/service_worker.ts:979`（`onActivated` 直写 `write_events`）、`:1068`（`onCreated`）、`:1099`（`onUpdated`）；`check_limit_and_stop` :872
- 问题：f001 修复仅覆盖 handle_event / handle_network_request / handle_console_log 三入口。导航事件 `tab_switch` / `tab_created` / `tab_url_change` 由三个 `chrome.tabs.*` 监听器直写 `write_events`，无 `check_limit_and_stop` 调用。超限后若后续事件仅剩导航类（例如 `capture_network=false`、`capture_console=false`，用户以快捷键切 tab / 页面导航），capture 不会进入 stopped，导航事件持续写入，AC-001 两条分句在该路径均不成立。与 f001 同构：这些事件最终经 `flush_store` 累加 `bytes_written`，`get_capture_size` 数据完整、仅检查缺失。
- 建议：三个导航监听器在写 `write_events` 前调用 `check_limit_and_stop()`，命中即 return 放弃本次写入，与 `handle_network_request` 同式；或把检查下沉到 `write_events` 公共封装统一入口。

## 结论（Round 2）

- 前轮 finding 复核：f001 修不彻底（network/console 已封，导航路径仍绕过，见 f003）；f002 已修复。
- 本轮新发现：1 条（important）。
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` 1175 行（本 task +33）、`src/extension/background/storage.ts` 588 行（+5），均达源码阈值但本 task 净增小、为既有单体文件，按降级规则不进 finding 表。
  - `set_capture_size_for_test`（storage.ts:468）为生产模块内测试钩子，沿用项目 `*_for_test` 惯例，不重复出 finding。
  - 并发安全：超限时多个回调并发调 `stop_capture` 由 `capture_state.run_exclusive` 串行，第二次调用经 `!is_capturing && phase==='idle'` 早退，不会重复写 `capture_stopped` 事件；已核证。
- 总体判断：f001 只部分消除，导航写路径仍未接入限额检查，存在未解决 important，FAIL。
- AC 复验方式：
  - AC-001：`re_verified`（不完整）。重跑 `tests/unit/storage_limit_active_delete.test.ts` 5 例全过；AC-001b 经消息接口驱动真实 `handle_event`→`check_limit_and_stop`→`stop_capture('storage_limit')`，断言 `success===false` 且 `status.is_capturing===false`。代码核证 handle_event / network / console 三入口已接入；导航路径未接入（见 f003）。
  - AC-002：`re_verified`。`service_worker.ts:229` guard 先于 `storage_delete_capture` 返回；AC-002 用例真实 start+delete 断言 `success===false`，guard 语义正确。
  - AC-003：`re_verified`。`cleanup_stale_capture_state`（service_worker.ts:130-183）写 `status:'completed'` 与 `ended_at` 非空；AC-003 用例直调并断言 `update_capture` 收到 `status:'completed'`。
  - coverage = 3 / 3（AC-001 覆盖不完整，导航路径缺口见 f003）
- 系统性 follow-up：无。

verdict: FAIL

## Round 3 (2026-08-11 09:10 UTC+8)

reviewed_scope: eb6879a5e41fa811

### 前轮 finding 复核

- t110_code_f003（important）：**已修复**。核证 `git diff ef496b886c6af8b698814fbb92869568016fac55` 当前工作区三处导航写路径均在 `write_events` 前接入限额检查并命中即 return：
  - `chrome.tabs.onActivated`：service_worker.ts:979 `if (await check_limit_and_stop()) return;` → :980 `write_events([tab_switch])`
  - `chrome.tabs.onCreated`：service_worker.ts:1069 同式 → :1070 `write_events([tab_created])`
  - `chrome.tabs.onUpdated`：service_worker.ts:1101 同式 → :1102 `write_events([tab_url_change])`
  - 与 `handle_network_request`（:884）、`handle_console_log`（:919）同构。检查点位于事件构造之后、write 之前，期间无其他写入，限位语义正确。
- t110_code_f001（important）：**完全消除**。f001 点名的三条 bypass（network :898 / console :918 / tab_switch :963 直写）现均已接入 `check_limit_and_stop`（:884 / :919 / :979），且 f003 追加的 onCreated/onUpdated 也覆盖。
- t110_code_f002（minor）：**已修复**（前轮确认，本轮未改动）。

### 遗漏写路径扫描（本轮新增核证）

对 `src/` 全量 grep `write_events` / `write_network_requests` / `write_console_events`，全部 9 处调用点均在 service_worker.ts：

| 行号 | 写路径 | 限额检查 |
|------|--------|----------|
| 456 | capture_started 生命周期（start） | 不适用（新建采集 size 0，起始事件必须写） |
| 706 | capture_stopped 生命周期（stop） | 不适用（终止事件必须写，否则无法终态化） |
| 783 | handle_event | :778 ✓ |
| 894 | ws_frame（经 handle_network_request） | :884 ✓ |
| 908 | network request | :884 ✓ |
| 929 | console log | :919 ✓ |
| 980 | onActivated tab_switch | :979 ✓ |
| 1070 | onCreated tab_created | :1069 ✓ |
| 1102 | onUpdated tab_url_change | :1101 ✓ |

未发现遗漏的导航/数据写路径。`handle_event` 内 `network_body_hook` 分支（:757）转发 `handle_fallback_body_event` → `handle_network_request`，已由 :884 覆盖，非绕过。

### 新引入缺陷扫描

- 并发安全：超限时多回调并发调 `check_limit_and_stop` → `stop_capture`，由 `capture_state.run_exclusive` 串行；第二次进入经 `!is_capturing && phase==='idle'` 早退（:615），不会重复写 `capture_stopped`。已核证。
- 代次守卫未破坏：onActivated 内检查点位于 `await chrome.tabs.get` 与代次复核（:959）之后；stop 后 phase 回 idle，`is_active_generation(gen)` 为 false，后续逻辑（send start / CDP retry）由 :981 阻断，无跨采集写入。onCreated/onUpdated 自入口 `!is_capturing` 至检查点无 await，无交错窗口。
- 检查点在 nav_count_enabled 门控（onCreated :1059 / onUpdated :1091）之后：导航类别关闭时不检查也不写，无副作用。
- 超限命中时导航监听器直接 return，跳过 send-start / CDP retry，行为正确（采集已停止）。

## 结论（Round 3）

- 前轮 finding 复核：f003 已修复（三处导航写路径均接入 check_limit_and_stop）；f001 完全消除；f002 已修复。无仍未解决的前轮 blocker。
- 本轮新发现：0 条。
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` 1164 行、`storage.ts` 588 行达源码阈值，但本 task 净增小、为既有单体文件，按降级规则不进 finding 表（前轮已述，本轮不变）。
  - 测试覆盖：AC-001c/AC-001d 用例驱动真实 onActivated 监听器（覆盖 :979 路径）；onCreated（:1069）/ onUpdated（:1101）两处仅有代码对称核证、无对应用例，属 test reviewer 覆盖面提示，非代码层 blocking。
  - 复杂度：`check_limit_and_stop`（:872-880）与各监听器分支简单，无高复杂度。
- 总体判断：f003 已彻底修复，grep 全量写路径均受限位检查或属预期生命周期写入，无未解决 critical / important，PASS。
- AC 复验方式：
  - AC-001：`re_verified`。重跑 `npx vitest run tests/unit/storage_limit_active_delete.test.ts` 7 例全过；全量 `npx vitest run tests/unit` 122 文件 1243 例全过。代码核证六条写路径（handle_event :778 / network :884 / console :919 / onActivated :979 / onCreated :1069 / onUpdated :1101）均先 `check_limit_and_stop` 再写；AC-001d 用例驱动真实 onActivated，断言超限后 nav 写入 0 且 `is_capturing===false`。
  - AC-002：`re_verified`。guard（service_worker.ts:230）先于 `storage_delete_capture` 返回 `{success:false}`；AC-002 用例真实 start+delete 断言 `success===false`。本轮未改动该路径。
  - AC-003：`re_verified`。`cleanup_stale_capture_state`（service_worker.ts:130-183）写 `status:'completed'` 与 `ended_at` 非空；AC-003 用例直调并断言 `update_capture` 收到 `status:'completed'`。本轮未改动该路径。
  - coverage = 3 / 3
- 系统性 follow-up：无。

verdict: PASS

