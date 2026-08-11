# Task review t110（reviewer_focus: 测试）

- task：`t110_storage_limit_active_delete`
- spec：`docs/tasks/t110_storage_limit_active_delete/spec.md`
- diff_anchor：`ef496b886c6af8b698814fbb92869568016fac55`
- target：`git diff ef496b886c6af8b698814fbb92869568016fac55`
- round：1
- reviewed_at：2026-08-11 08:45 UTC+8

## Findings

### t110_test_f001 - AC-002「数据仍在」半条未断言

- 严重度：minor
- 锚点：AC-002 第二分句「且数据仍在」
- 位置：`tests/unit/storage_limit_active_delete.test.ts:95-102`（it 'AC-002: active capture 不可删除'）
- 问题：测试仅断言 `del.success === false`，未验证被拒后 capture 记录仍在存储中。实现侧靠 guard 先于 `storage_delete_capture` 返回保证数据未删，测试未锁住该行为：若未来重构改成「先删后回滚」，本测试仍会绿而数据可能丢失。AC-002 的「且数据仍在」分句当前无断言覆盖。
- 建议：delete 被拒后追加 `const rec = await get_capture('cap_active')`，断言 `rec` 非空且 `status === 'capturing'`。属「加一个 case」级别，不阻断。

### t110_test_f002 - AC-003「ended_at 非空」分句未断言

- 严重度：minor
- 锚点：AC-003「并存在 stop 生命周期事件或 ended_at 非空」
- 位置：`tests/unit/storage_limit_active_delete.test.ts:125-128`（it 'AC-003: cleanup_stale 终态化'）
- 问题：断言 `update_capture` 被调时仅 `objectContaining({ capture_id, status: 'completed' })`，未断言 `ended_at` 非空。实现侧 cleanup 确写 `ended_at: new Date().toISOString()`，但「ended_at 非空或 stop 生命周期事件」的可观察终态字段未被测试锁住。
- 建议：`objectContaining` 追加 `ended_at: expect.any(String)`。属「加一个 case」级别，不阻断。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（首轮）。
- 改测方向复核：无。`logger.test.ts` 仅追加 timeout 参数，断言未变；无「迁就实现」的改测。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
  - `tests/unit/logger.test.ts:140` 追加 timeout `10000`：已调查，断言未弱化，属慢速脱敏（100KB 字符串 URL 扫描）的抖动豁免，非掩埋失败；且非 t110 语义，不出 finding。
  - `src/extension/background/storage.ts:467-470` `set_capture_size_for_test` 为生产模块内测试钩子：符合 spec 测试策略「mock bytes_written」，仅基建风味观察，非阻断。
  - AC-001 单测（`check_storage_limit` 阈值 `>=` 返回 true）未测下界（略低于 500MB 返回 false），可补边界 case，属扩展建议。
- 总体判断：测试经真实消息接口触达生产 `handle_event` / `stop_capture` / `delete_capture` guard / `cleanup_stale_capture_state`，判别力经代码追踪确认（移除限额检查则 AC-001b 失败、移除 delete guard 则 AC-002 失败、移除终态化则 AC-003 失败）；仅 AC-002「数据仍在」与 AC-003「ended_at」两个分句未直接断言，均 minor，PASS。

### AC 复验方式

- AC-001：`re_verified`。重跑 `tests/unit/storage_limit_active_delete.test.ts` 5 例全过；AC-001b 经 send_message('start'/'event'/'get_status') 驱动真实 `handle_event` → `check_storage_limit` → `stop_capture`，断言 `evt_res.success===false` 且 `status.is_capturing===false`；AC-001 单测直连 `check_storage_limit` 阈值。
- AC-002：`re_verified`（第一分句）。真实 start 后经消息接口 delete，断言 `success===false`；guard 先于 `storage_delete_capture` 返回故数据未删（代码核证）。「数据仍在」分句无断言，见 f001。
- AC-003：`re_verified`（第一分句）。直调生产 `cleanup_stale_capture_state`，断言其调用 `update_capture` 且 status='completed'（storage 边界 mock 合理，spec 测试策略「直接调 cleanup」）；「ended_at/stop 事件」分句无断言，见 f002。

coverage = 3 / 3

### 系统性 follow-up

- 无。

reviewed_scope: 72e55698589fae12

verdict: PASS

## Round 2 (2026-08-11 08:58 UTC+8)

reviewed_scope: 8325d389956950bb

### 前轮 finding 复核

- t110_test_f001（minor，AC-002「数据仍在」未断言）：**仍存在**。测试文件本轮零改动（mtime 早于 Round 1 review），AC-002 用例（storage_limit_active_delete.test.ts:95-102）仍只断言 `del.success === false`，未断言被拒后 capture 记录仍在存储。非阻断。
- t110_test_f002（minor，AC-003「ended_at 非空」未断言）：**仍存在**。AC-003 用例（:125-128）仍只 `objectContaining({ capture_id, status: 'completed' })`，未断言 `ended_at`。非阻断。

### Findings

### t110_test_f003 - AC-001b 仅覆盖 handle_event 路径，network/console 限额接线与 'storage_limit' reason 未断言

- 严重度：minor
- 锚点：AC-001「不再接受新事件写入或 capture 进入 stopped/failed 且 status 可查询」
- 位置：`tests/unit/storage_limit_active_delete.test.ts:133-150`（it 'AC-001b: 超限后新事件写入被拒且 capture 停止'）
- 问题：本轮代码修复把 `check_limit_and_stop` 接入 `handle_network_request`（service_worker.ts:884）与 `handle_console_log`（:919），并把超限停机 reason 改为 `'storage_limit'`（:876）；但测试仅覆盖 handle_event 入口，且只断言 `evt_res.success===false` 与 `status.is_capturing===false`，未断言 ① network/console 入口超限同样拒绝写入并停机，② 停机生命周期事件 `capture_stopped.reason === 'storage_limit'`。若 wiring 被拆或 reason 回退为 `'user_stop'`，无测试拦截。属「加 case」级别，不阻断——共享 helper `check_limit_and_stop` 机制已由 AC-001b 经真实 `write_events`/`stop_capture` 端到端验证。
- 建议：AC-001b 追加读回 `capture_stopped` 事件并断言 `reason === 'storage_limit'`（经真实 write_events 落 fake-indexeddb 后查询）；可选补 network/console 入口各一例。

## 结论（Round 2）

- 前轮 finding 复核：f001 / f002 仍存在（均 minor，非阻断）。
- 改测方向复核：无。本轮测试文件零改动，无「迁就实现」的改测。
- 本轮新发现：1 条（minor）。
- 未进表的提示：navigation 写路径（onActivated / onCreated / onUpdated）超限停机无测试，与该路径实现缺口（code 侧 f003）对应，属实现问题，测试侧按「AC-001 已有 handle_event 覆盖」不重复阻断。
- 总体判断：AC-001 / 002 / 003 均有真实触达生产逻辑的测试，无危险模式命中；仅覆盖扩展类 minor，PASS。
- AC 复验方式：
  - AC-001：`re_verified`。重跑 `tests/unit/storage_limit_active_delete.test.ts` 5 例全过；AC-001b 经 send_message('start'/'event'/'get_status') 端到端驱动真实 `handle_event`→`check_limit_and_stop`→`stop_capture`，断言 `evt_res.success===false` 且 `is_capturing===false`；AC-001 单测直连 `check_storage_limit` 阈值（`>=` 500MB）。注：仅 handle_event 路径被断言，见 f003。
  - AC-002：`re_verified`（第一分句）。真实 start 后经消息接口 delete，断言 `success===false`；guard 先于 `storage_delete_capture` 返回故数据未删（代码核证）。「数据仍在」分句无断言，见 f001。
  - AC-003：`re_verified`（第一分句）。直调生产 `cleanup_stale_capture_state`，断言其调用 `update_capture` 且 status='completed'（storage 边界 mock 合理，spec 测试策略「直接调 cleanup」）；「ended_at」分句无断言，见 f002。
  - coverage = 3 / 3
- 系统性 follow-up：无。

verdict: PASS

## Round 3 (2026-08-11 09:10 UTC+8)

reviewed_scope: eb6879a5e41fa811

### 前轮 finding 复核（以 `git diff ef496b8...` 为准）

- t110_test_f001（minor，AC-002「数据仍在」分句未断言）：**仍存在**。AC-002 用例（storage_limit_active_delete.test.ts:95-102）仍只断言 `del.success === false`，未断言被拒后 capture 记录仍在存储；代码核证 delete guard 先于 `storage_delete_capture` 返回故数据未删。非阻断。
- t110_test_f002（minor，AC-003「ended_at 非空」分句未断言）：**仍存在**。AC-003 用例（:125-128）仍只 `objectContaining({ capture_id, status: 'completed' })`，未断言 `ended_at`。非阻断。
- t110_test_f003（minor，network/console 限额接线与 `'storage_limit'` reason 未断言）：**仍存在，范围收窄**。本轮新增 AC-001c/AC-001d 覆盖 navigation 写路径中 onActivated 入口（见下），原提示的「onCreated/onUpdated 写路径」缺口部分闭合；但 network（service_worker.ts:884）/console（:919）两入口与停机事件 `reason === 'storage_limit'` 仍无断言。属「加 case」级，不阻断——共享 helper `check_limit_and_stop` 机制已由 AC-001d 经真实 `write_events`/`stop_capture` 端到端验证。

### Findings

本轮新发现 0 条。

### 结论（Round 3）

- 前轮 finding 复核：f001 / f002 仍存在（均 minor，非阻断）；f003 仍存在但范围收窄（onActivated 写路径已覆盖，network/console/reason 残留，均 minor）。
- 改测方向复核：无。本轮测试改动仅新增两个用例（AC-001c/AC-001d），未修改既有断言；`logger.test.ts` timeout 为 R1 已审的既有改动，非本轮引入。无「迁就实现」的改测。
- 本轮新发现：0 条。
- 未进表的提示：
  - `on_activated_cb()` 依赖 `chrome.tabs.onActivated.addListener.mock.calls[0][0]` 位置取到导航监听器。当前 service_worker.ts 对 onActivated 仅一处注册（:947），正确；若未来前置注册其他 onActivated 监听器，取错回调会致 AC-001c 失败（length=0），属「假失败」脆弱性而非「假通过」，不阻断。可改为按函数体特征定位或注册时返回句柄，属测试基建优化。
  - onCreated/onUpdated 导航写路径（:1069/:1101 各接一处 `check_limit_and_stop`）无测试，与 network/console 入口同属 f003 残留，均「加 case」级扩展，不阻断。
- 总体判断：本轮新增 AC-001c/AC-001d 经真实消息接口与真实 `onActivated` 监听器回调驱动生产 `check_limit_and_stop` → `check_storage_limit`（非 mock）→ `stop_capture`，再经真实 `write_events` 落 fake-indexeddb 后用真实 `get_events_by_category` 读回断言，判别力经代码追踪确认——移除 onActivated 监听器内限额检查则 AC-001d 的 `nav_events.length===0` 与 `is_capturing===false` 双断言均失败；移除写路径则 AC-001c 的 `length===1` 失败。AC-001c/AC-001d 构成「正常写入基线 vs 限额门控」对比对，杜绝「监听器从不写入→AC-001d 假通过」的假阴性。无危险模式命中，PASS。
- AC 复验方式：
  - AC-001：`re_verified`。重跑 `tests/unit/storage_limit_active_delete.test.ts` 7 例全过。AC-001 单测直连 `check_storage_limit` 阈值（`>=` 500MB，精确边界被钉住）；AC-001b 经消息接口驱动真实 `handle_event`→`check_limit_and_stop`→`stop_capture`；AC-001c/AC-001d 经真实 onActivated 回调驱动导航写路径（超限前写入 1 条 tab_switch、超限后写入被拒且 is_capturing 变 false）。
  - AC-002：`re_verified`（第一分句）。真实 start 后经消息接口 delete，断言 `success===false`；guard 先于 `storage_delete_capture` 返回故数据未删（代码核证）。「数据仍在」分句无断言，见 f001。
  - AC-003：`re_verified`（第一分句）。直调生产 `cleanup_stale_capture_state`，断言其调用 `update_capture` 且 status='completed'（storage 边界 mock 合理，spec 测试策略「直接调 cleanup」）；「ended_at」分句无断言，见 f002。
  - coverage = 3 / 3
- 系统性 follow-up：无。

verdict: PASS
