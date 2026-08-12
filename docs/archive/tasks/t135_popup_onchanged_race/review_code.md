# Task review t135（reviewer_focus: 代码）

- task：`t135_popup_onchanged_race`
- spec：`docs/tasks/t135_popup_onchanged_race/spec.md`
- diff_anchor：`10d59918eeb5b1031d8ed0a4e06e7c2bf42f2e6e`
- target：`git diff 10d59918eeb5b1031d8ed0a4e06e7c2bf42f2e6e`
- round：1
- reviewed_at：2026-08-12 18:10 UTC+8

reviewed_scope: 33f40e00e5c77a59

## Findings

### t135_code_f001 - `_self_transition` guard 用 setTimeout(0) 复位，与 storage.onChanged 实际派发无时序保证，AC-001 竞态未可靠闭合

- 严重度：important
- 锚点：AC-001（用户 popup 手动 stop 后稳定停留 saved，不被监听重渲染覆盖为 ready）
- 位置：`src/extension/popup/popup.ts:382-383`（start 复位）、`:416-417`（stop 复位）、`:498`（guard 短路）；声明于 `:32`
- 问题：
  - guard 的释放与 `chrome.storage.onChanged` 的实际派发完全解耦。`chrome.storage.local` 数据驻留浏览器进程，`set()` 与 `onChanged` 派发都必须经跨进程 IPC 往返；Chrome API 不保证 onChanged 在 `set()` 返回后的一个事件循环 tick 内派发。本渲染进程在同一任务里排队的 `setTimeout(0)` 必然先于任何跨进程响应到达执行，guard 在自写 onChanged 派发前已复位为 false。
  - 因此 `:498` 的短路对 popup 自身写入基本不生效：自写 onChanged 仍进入 `load_state()`，读到 `is_capturing:false` 置 `state='ready'` 并 render。当该续体在 popup 侧 `state='saved'`（`stop_capture` 内 `await load_history()` 之后，`:419`）之后完成时，终态被 ready 覆盖——正是 H-12 / AC-001 要消除的竞态。
  - 注释「onChanged 异步派发晚于 set 返回，guard 须保留到事件循环下个 tick」把派发时序当作事实假设，缺 API 依据；且该假设与原 bug 触发前提自相矛盾：原 bug 需要 onChanged 晚于 `state='saved'`（多 tick、多 IPC 之后）到达，而 guard 在第 1 个 tick 即复位，恰不覆盖该情形。可观测后果：竞态窗口仍在，AC-001 依赖的「稳定停留 saved」未获实现层保证。
  - 附带：`tests/unit/popup_onchanged_race.test.ts` 只做源码字符串断言（断言 `_self_transition = true`、`setTimeout(...)`、`if (_self_transition) return;` 等字面量存在），未模拟 set 后延迟派发并断言最终态为 saved，无法证明竞态已闭。spec 可测试性声明（「模拟 storage.onChanged 触发时序，断言最终态为 saved」）未落地（此属测试层职责，此处仅作 f001 佐证）。
- 建议：
  - 把 guard 生命周期与派发绑定，而非定时器：在 onChanged 监听内识别到自写后「跳过并消费该次事件」再复位；或
  - 用非侵入 token：popup `set()` 时附带一个标记键（如 `_popup_epoch: n`），监听按 `changes._popup_epoch?.newValue === n` 确定性识别自写并跳过；外部写入无该键，AC-002 自然保留，无需任何计时假设。
  - 修复后应补行为级回归：mock storage.onChanged 在 set() 后 >1 tick 派发，断言 popup 最终态为 saved（对接 spec 可测试性声明）。

## 结论

- 前轮 finding 复核（Round 1 无）：无
- 本轮新发现：1 条（t135_code_f001，important）
- 未进表的提示：
  - 文件过大（降级规则，不进表）：`src/extension/popup/popup.ts` 当前 507 行，base 495 行（`git show 10d5991:...`），本 task 净增 12 行。已达 src 实现源码 minor 阈值 400 行且本 task 仍净增，未给不可拆硬约束，建议后续任务拆分时关注。复杂度：`start_capture` / `stop_capture` / onChanged 监听均无高分支，无复杂度命中。
  - 范围外观察：spec「可测试性声明」承诺的 AC-001 行为级单测未实现，当前 `popup_onchanged_race.test.ts` 为纯源码字符串断言，属测试层审查职责，转 test reviewer 核对。
  - 系统性 follow-up：无现有 task 覆盖 storage.onChanged 派发时序问题（`task.py list` 无命中）。若 f001 处置时引入 popup↔SW 写 storage 的 token 机制，建议单独观察是否需沉淀到 `docs/blueprint/decisions.md`，本报告不另立 follow-up tid。
- 总体判断：实现引入的 guard 释放时序与 Chrome 事件派发解耦，AC-001 未获可靠实现，存在未解决 important。

### AC 复验方式

- AC-001：`re_verified`（代码分析：guard 复位 setTimeout(0) 与跨进程 onChanged 派发无时序保证，短路对自写不生效，竞态未闭合 → AC 未满足；分析基于 popup.ts:380-383/414-417/498 与 service_worker.ts:717-720 写入路径交叉核对）。
- AC-002：`re_verified`（代码分析：监听仍走 `load_state()`/`render()`/`start_timer()`/`stop_timer()`（popup.ts:500-505）；guard 窗口极短且外部事件晚于其到达，外部 MCP/SW 写入同步语义保留）。
- AC-003：`re_verified`（代码分析：本 diff 未新增监听器，仅加单一布尔 guard；guard 生效时反而减少 render，无监听泄漏面）。

coverage = 3 / 3

verdict: FAIL

## Round 2 (2026-08-12 18:40 UTC+8)

reviewed_scope: c9bbfd9a94f6bd2f

### 前轮 finding 复核

- **t135_code_f001（important，setTimeout 复位与 onChanged 派发无时序保证）— 已消除**。
  - 证据：`_self_transition` 布尔 + `setTimeout(0)` 复位已整体移除（`grep` 全仓仅剩测试的 `not.toContain` 负断言引用）；改为 token 方案：`const SELF_WRITE_KEY = '_popup_self_write'`（`popup.ts:34`），start/stop 的 `storage.set` 携带 `[SELF_WRITE_KEY]: Date.now()`（`:382`、`:413`），监听在 `SELF_WRITE_KEY in changes` 时 `remove` + `return` 消费跳过（`:493-496`）。
  - 自写识别改由「事件内容是否携带 token」判定，不再依赖任何定时器/事件派发时序假设——f001 的核心缺陷已消除。外部写入（SW/i18n/theme/user_config 等 `storage.set`）均不携带该键，`in changes` 为 false，仍走 `load_state()` 同步刷新，AC-002 保留。
  - 附带核对：外部写入事件不会因 storage 中残留 token 键而被误跳过——`changes` 只含本次被修改的键，残留键不出现于无关事件；SW 手动 stop 的 `service_worker.ts:717` 写入无 token，事件仍被处理。AC-001 主竞态（popup 自身 `is_capturing:false` 写入在 `await load_history()` 窗口内触发 onChanged 覆盖 saved）已被可靠闭合。

## Findings（Round 2）

### t135_code_f002 - `_popup_self_write` token 键在 popup 提前卸载时残留 storage，且 remove 为无错误处理 fire-and-forget

- 严重度：minor
- 锚点：无 AC 违反（行为正确性不受影响），属实现卫生
- 位置：`src/extension/popup/popup.ts:494`（`void chrome.storage.local.remove(SELF_WRITE_KEY)`）
- 问题：
  - token 的消费（remove）依赖 popup 的 onChanged 监听存活。若用户在 popup `set()` 后、onChanged 派发前关闭 popup（点击外部/浏览器关窗），监听不再执行，`_popup_self_write` 键永久留在 `chrome.storage.local`，直至下次 popup 自写时被覆盖再移除。单键、有界（每次覆盖新 `Date.now()`），无行为影响——残留键不进入无关事件的 `changes`，外部事件不会被误跳过（已核对）。
  - 每次自写还会因 remove 触发第二次 onChanged（changes 仅含 token），监听再次 remove（键已删为 no-op，不再派发），无循环但有额外事件；`void` fire-and-forget 未处理 remove 失败（如 context invalidated）的 rejection。
  - 属新方案的固有副作用，非本轮引入的功能缺陷。
- 建议：可选——在 popup `DOMContentLoaded` 初始化时顺手 `remove(SELF_WRITE_KEY)` 清残留；或接受单键残留并在注释说明。不阻断。

## 结论（Round 2）

- 前轮 finding 复核：f001 已消除（证据见上）。
- 本轮新发现：1 条（t135_code_f002，minor）。
- 未进表的提示：
  - 残留风险（非 finding）：spec 背景称「正常 popup stop 产生两次 is_capturing:false 写入」——本轮 token 只防护 popup 自身那次写入；SW 侧 `service_worker.ts:717` 的外部写入事件（无 token）仍在 popup 手动 stop 期间被监听处理，`load_state()` 置 `ready`。分析认为其在 `await sendMessage('stop')` 窗口内派发、`storage.get` 早于 `load_history`（SW list_captures IPC）完成，终态仍为 saved，实际覆盖窗口极小且非本轮引入；未达到 blocking 硬阈值（无法给出可辩护的可观测失败场景）。如需彻底闭合可让 SW 写入亦带 token 或由 saved 态 render 兜底，建议后续观察，不立 follow-up。
  - 文件过大（降级规则）：`popup.ts` 507 行（base 495，本轮净增 12 行），仍超 src 400 行 minor 阈值；同 Round 1，建议后续拆分。
  - 测试侧（转 test reviewer）：`popup_onchanged_race.test.ts` 为源码字符串断言（`toContain` token 字面量），未模拟「set 后延迟派发 → 断言终态 saved」的行为级验证；与 spec 可测试性声明仍存差距。
- 总体判断：f001 阻塞已消除，token 方案确定性解决自写识别；仅余 minor 卫生项，无未解决 critical / important。
- 系统性 follow-up：无。

verdict: PASS
