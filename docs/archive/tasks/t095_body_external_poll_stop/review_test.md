# Task review t095（reviewer_focus: 测试）

- task：`t095_body_external_poll_stop`
- spec：`docs/tasks/t095_body_external_poll_stop/spec.md`
- diff_anchor：`f746378110be78b04280a973076239d616eb125d`
- target：`git diff f746378110be78b04280a973076239d616eb125d`
- round：1
- reviewed_at：2026-08-11 03:01 UTC+8

reviewed_scope: f0fb113ee3274f0f

## Findings

### t095_test_f001 - AC-001 未测 stop_body_capture_with_cleanup 变体

- 严重度：minor
- 锚点：AC-001（覆盖扩展，非阻断）
- 位置：`tests/unit/body_capture_external_poll_stop.test.ts:77`（AC-001 用例仅导入 `stop_body_capture`）
- 问题：AC-001 以「或」并列 `stop_body_capture` 与 `stop_body_capture_with_cleanup`，测试只覆盖前者。cleanup 路径的 `stop_poll` 调用（`body_capture_coordinator.ts:186`）无直接负向断言证据。两者共享同一 `stop_poll` 闭包，机制已由被测用例触达，AC 已满足，不阻断。
- 建议：补一个 cleanup 变体用例：进入 external 模式后调 `stop_body_capture_with_cleanup`，in-flight resolve 后断言 `on_network_request` 未调用。

### t095_test_f002 - AC-003 重入仅覆盖 pending-timer 变体

- 严重度：minor
- 锚点：AC-003（覆盖扩展，非阻断）
- 位置：`tests/unit/body_capture_external_poll_stop.test.ts:122`
- 问题：AC-003 用例在首轮 poll 尚未触发（仅 timer 挂起）时重入，验证无双 timer。未覆盖「首轮 poll 已 in-flight 时重入」变体（此时旧闭包 `poll_stopped` 已被置位、in-flight 不得写）。共享机制已在 AC-001 覆盖，不阻断。
- 建议：可选补 case：首次 poll 置 in-flight 后重入 start，旧 in-flight resolve 不写、新 poll 单路。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1，无。
- 改测方向复核：无。本 diff 新增独立测试文件（`body_capture_external_poll_stop.test.ts`），未修改既有测试，无「迁就实现」改测。
- 本轮新发现：2 条 minor，均非阻断。
- 未进表的提示：无。
- 总体判断：三条 AC 均有独立用例且断言对修复敏感（旧实现下红、新实现下绿），mock 仅限系统边界，无危险模式；仅 2 条可选覆盖扩展 minor，可 PASS。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified`。重跑用例 3/3 通过；逐行核对 `body_capture_external_poll_stop.test.ts:77-99`：in-flight poll 挂起后 stop、resolve 事件、`advanceTimersByTimeAsync(0)` 冲刷微任务后断言 `on_network_request` 未调用。移除 `body_capture_coordinator.ts:243` 的 `if (poll_stopped) return;` 守卫后该用例必写事件而变红，断言对修复敏感。
- AC-002：`re_verified`。用例 `test.ts:101-120` 先证正控制（首轮写 1 条），stop 后推进 2000ms 断言 `poll_external_cdp_events` 与 `on_network_request` 调用数均不变。旧实现因 `stop_poll` 未置位、闭包内递归 timer 继续调度而变红。
- AC-003：`re_verified`。用例 `test.ts:122-141` 重入后推进 500ms 断言 poll 仅 1 次、写入 2 条；旧实现双 timer 双写（4 条）变红。重入先停旧 poll（`body_capture_coordinator.ts:63`）被该断言直接覆盖。

coverage = 3 / 3

verdict: PASS

## Round 2 (2026-08-11 03:10 UTC+8)

reviewed_scope: c85a9a88823e2361

### 前轮 finding 复核

- t095_test_f001（minor，AC-001 cleanup 变体未测）：已消除。新增「AC-001b」用例（`body_capture_external_poll_stop.test.ts:96-116`）：进入 external 后推进 500ms 使首轮 poll in-flight，调 `stop_body_capture_with_cleanup`，resolve 后断言 `on_network_request` 未调用且 `stop_external_cdp` 已调用。后一断言为正控制，证明走了 cleanup 分支（`mode === 'external_cdp_bridge'` 且 `external_session_key` 存在）。敏感度核查：移除 `body_capture_coordinator.ts:243` 的 `if (poll_stopped) return;` 则 in-flight resolve 必写事件，用例变红，非恒真断言。
- t095_test_f002（minor，AC-003 重入仅覆盖 pending-timer 变体）：遗留处置合规。in-flight 重入变体的共享机制（poll_stopped 守卫 + stop_poll）已被 AC-001 / AC-001b 用例直接覆盖；AC-003 现有用例验证了无双 timer 双写这一核心不变量，不构成 AC 缺失。已登记 `docs/pending/todo/p008_external_poll_reentry_inflight.md`（来源注明 t095_test_f002），minor 遗留符合处置规范，不阻断。

### 本轮新发现

0 条。

### 改测方向复核

无。本 diff 仅新增测试文件 `body_capture_external_poll_stop.test.ts`（含 Round 2 新增的 AC-001b 用例），未修改任何既有测试，无「迁就实现」改测。

### 未进表的提示

无。

### AC 复验方式

- AC-001：`re_verified`。AC-001（stop 变体）与 AC-001b（cleanup 变体）两用例均验证 in-flight resolve 后不写网络事件，重跑 4/4 通过；逐行核对 `:96-116` 时序（in-flight 挂起 → stop → resolve → 冲刷微任务 → 断言），断言对修复敏感。
- AC-002：`re_verified`。用例推进 2s 断言 `poll_external_cdp_events` 与 `on_network_request` 调用数均不变，先证正控制（首轮写 1 条），重跑通过。
- AC-003：`re_verified`。用例重入后推进 500ms 断言 poll 仅 1 次、写入 2 条，重跑通过。
- coverage = 3/3

### 总体判断

Round 1 两条 minor 处置均合规：f001 以 AC-001b 用例真修，f002 遗留并登记 p008（共享机制已由 AC-001 覆盖）。新增用例无危险模式、断言对修复敏感。当前无未解决 critical / important，可 PASS。

- 系统性 follow-up：p008（in-flight 重入变体增强用例，未开）

verdict: PASS
