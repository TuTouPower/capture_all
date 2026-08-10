# Task review t095（reviewer_focus: 代码）

- task：`t095_body_external_poll_stop`
- spec：`docs/tasks/t095_body_external_poll_stop/spec.md`
- diff_anchor：`f746378110be78b04280a973076239d616eb125d`
- target：`git diff f746378110be78b04280a973076239d616eb125d`
- round：1
- reviewed_at：2026-08-11 03:02 UTC+8

## Findings

### t095_code_f001 - AC-001 的 `stop_body_capture_with_cleanup` 路径缺直接单测

- 严重度：minor
- 锚点：AC-001 明文列出两个停止入口（`stop_body_capture` 或 `stop_body_capture_with_cleanup`），新增测试仅覆盖前者。
- 位置：`tests/unit/body_capture_external_poll_stop.test.ts:18-23`（顶层仅 import `stop_body_capture`；三个用例全部走 `stop_body_capture`）
- 问题：AC-001 的「可测试性声明」称全部 AC 可自动测试，但本 diff 自带测试证据只验证 `stop_body_capture` 变体。`stop_body_capture_with_cleanup` 的 stop 语义（先 `stop_poll` 再 await bridge cleanup，见 `body_capture_coordinator.ts:185-187`）无任何用例覆盖。实现经代码核查正确（stop_poll 在 `await deps.get_bridge_config()` 前调用，poll_stopped 已置位，await 期间不可能再写），故非实现缺陷，仅 AC-001 覆盖不完整。
- 建议：补一个用 `stop_body_capture_with_cleanup` 的用例（in-flight resolve 后不写网络事件），断言点与现有 AC-001 用例一致。

### t095_code_f002 - `as typeof coordinator_state` 类型断言仍属多余 hack

- 严重度：minor
- 锚点：类型 hack 未彻底消除；无行为影响。
- 位置：`src/extension/background/body_capture_coordinator.ts:270`
- 问题：`try_external_cdp_bridge` 返回对象字面量结构上可赋值给声明返回类型 `Promise<typeof coordinator_state>`（DOM lib 下 `setTimeout`/`setInterval` 均返回 `number`，`poll_timer` 字段类型一致；其余字段均匹配），断言 `as typeof coordinator_state` 可去除。相较旧版错误的 `as BodyCaptureStartResult` 已属修正（旧断言掩盖了对象含 `poll_timer`/`stop_poll` 的真实形状），但断言本身仍残留。另 `coordinator_state.poll_timer` 声明类型沿用 `ReturnType<typeof setInterval>`（T050 遗留）与实际存的 `setTimeout` 句柄不一致，断言顺带掩盖了该既有不一致。
- 建议：删除断言，让编译器直接校验对象形状；如需保留，将 `poll_timer` 字段类型改为 `ReturnType<typeof setTimeout>` 消除既有不一致。

## 结论

- 前轮 finding 复核：无（首轮）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：文件大小均未达阈值（`body_capture_coordinator.ts` 335 行、测试 142 行）。`start_body_capture` 分支多但本 task 仅新增顶部两行重入停 poll，未新增高复杂度函数。`stop_body_capture`（无 cleanup 变体）生产代码未被调用（仅 `service_worker.ts:630` 调 `stop_body_capture_with_cleanup`），属既有状态非本 task 引入。
- 总体判断：stop 语义实现正确——stop_poll 置 `poll_stopped` 并清最新 timer（闭包变量，重调度后仍指向当前句柄），`poll_once` 写事件前查 `poll_stopped` 防 in-flight 脏写，finally 不再调度，重入 start 先停旧 poll；两 stop 入口与重入路径均无 poll 泄漏。仅余两条 minor，无 blocking。可 PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。代码核查两入口（`stop_body_capture` `body_capture_coordinator.ts:174`、`stop_body_capture_with_cleanup` `:186`）均调 `stop_poll`，且 `poll_once` 写前 `if (poll_stopped) return`（`:243`）；重跑 `npx vitest run tests/unit/body_capture_external_poll_stop.test.ts` 通过，`stop_body_capture` 变体 in-flight 不写已验证。cleanup 变体为代码级核查（见 f001 覆盖缺口）。
- AC-002：`re_verified`。测试 AC-002 推进 2s 断言 poll 调用数与写入数不变，重跑通过；代码核查 `finally` 中 `if (!poll_stopped)` 才重调度（`:252-254`）。
- AC-003：`re_verified`。测试 AC-003 重入后推进 500ms 断言 poll 仅 1 次、写入 2 条，重跑通过；代码核查 `start_body_capture` 顶部先 `coordinator_state?.stop_poll?.()`（`:63`）。
- coverage = 3/3

reviewed_scope: f0fb113ee3274f0f

verdict: PASS

## Round 2 (2026-08-11 03:10 UTC+8)

reviewed_scope: c85a9a88823e2361

### 前轮 finding 复核

- t095_code_f001（minor，AC-001 cleanup 变体缺直接单测）：已消除。`tests/unit/body_capture_external_poll_stop.test.ts` 新增「AC-001b」用例（:96-116）走 `stop_body_capture_with_cleanup`：进入 external 后 `advanceTimersByTimeAsync(500)` 触发 in-flight poll，stop_cleanup 后 `resolve_poll([bridge_event(1)])`，断言 `on_network_request` 未被调用且 `stop_external_cdp` 已调用。重跑测试 4/4 通过。敏感度核查：移除 `body_capture_coordinator.ts:243` 的 `if (poll_stopped) return;` 守卫后该用例必脏写而变红，断言对修复敏感。
- t095_code_f002（minor，`as typeof coordinator_state` 类型断言多余）：已消除。返回对象断言已删除（`body_capture_coordinator.ts:259-270` 无 `as`），`poll_timer` 字段类型已由 `ReturnType<typeof setInterval>` 改为 `ReturnType<typeof setTimeout>`（:39），Round 1 指出的既有类型不一致一并消除。`npx tsc --noEmit` 通过（EXIT=0），对象形状现由编译器直接校验。

### 本轮新发现

0 条。

### 未进表的提示

- 文件大小：`body_capture_coordinator.ts` 336 行、测试文件 159 行，均低于阈值（src 400 / tests 600），无文件膨胀。
- 复杂度：`start_body_capture` 分支多但本 task 仅新增重入停 poll 两行与 in-flight 守卫一行，未新增高复杂度函数，不触发复杂度 finding。
- 范围外观察：`stop_body_capture`（无 cleanup）生产路径仍未被外部调用（既有状态，非本 task 引入），无新增影响。

### AC 复验方式

- AC-001：`re_verified`。代码核查两入口均调 `stop_poll`（`stop_body_capture` `:174`、`stop_body_capture_with_cleanup` `:186`），in-flight 写前守卫 `:243`；重跑测试 4/4 通过，新增 AC-001b 用例直接覆盖 cleanup 变体。
- AC-002：`re_verified`。测试 AC-002 推进 2s 断言 poll 与写入数不变，重跑通过；代码核查 finally `:252-254` 仅在 `!poll_stopped` 时重调度。
- AC-003：`re_verified`。测试 AC-003 重入后推进 500ms 断言 poll 仅 1 次、写入 2 条，重跑通过；代码核查 `start_body_capture` 顶部 `:63` 先停旧 poll。
- coverage = 3/3

### 总体判断

Round 1 两条 minor 均已真修：AC-001b 用例补齐 cleanup 路径直接覆盖，类型断言删除后 tsc 通过且扫描无新问题。当前无未解决 critical / important，可 PASS。

- 系统性 follow-up：无

verdict: PASS
