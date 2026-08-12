# Task review t130（reviewer_focus: 代码）

- task：`t130_keyboard_password_guard`
- spec：`docs/tasks/t130_keyboard_password_guard/spec.md`
- diff_anchor：`4cf960b1918f8eb0dc5572dc692c41fb2fdccd19`
- target：`git diff 4cf960b1918f8eb0dc5572dc692c41fb2fdccd19`
- round：1
- reviewed_at：2026-08-12 13:31 UTC+8

## Findings

### t130_code_f001 - shadow DOM 内 password 输入框击键仍明文入库，password 不变量未闭合

- 严重度：important
- 锚点：AC-001；domain.md:97 不变量「type=password input 永远不被采集」
- 位置：`src/extension/content/keyboard_capture.ts:59-61`（`is_password_input`）、`:76`（`masked` 判定）
- 问题：守卫只检查 `event.target`。`KeyboardEvent` 是 composed 事件；当 `type=password` 输入框位于 shadow root（开放或闭合均可）内时，document 级 `keydown`/`keyup` 监听器收到的 `event.target` 被 DOM 事件 retarget 为 shadow host，而非内部 input。`is_password_input(event.target)` 返回 false，`masked` 回落 `config.redact_data`。复现：shadow root 内放 `<input type=password>`，聚焦输入 `s`，`keyboard_capture_mode=all` + `redact_data=false` → `events[0].data.key === 's'`、`key_status='captured'`，密码明文入库。即修复目标（review H-4）在 shadow DOM 配置下仍存在。项目内无其他 `composedPath` 使用（`grep composedPath src/ tests/` 为空），说明现有采集管线均依赖 `event.target`。
- 建议：改为基于 `event.composedPath()` 判定，路径中任一元素满足 `HTMLInputElement && type === 'password'` 即 masked（`composedPath()` 不受 closed shadow 遮蔽，现代浏览器与 jsdom 均支持）；keydown/keyup 同一函数路径自动覆盖。

## 结论

- 前轮 finding 复核（Round 1）：无。
- 本轮新发现：1 条。
- 未进表的提示：
  - 文件过大：`keyboard_capture.ts` 114 行、`keyboard_capture.test.ts` 131 行，均低于阈值（实现 400 / 测试 600），不出项。
  - 复杂度：`build_key_event` 手算 CC≈5（1 基数 + is_capturing + shortcut 守卫含 `&&` + `masked` 的 `||` 分支），`is_password_input` CC=1，均低于所有阈值，不出项。
  - 范围外观察：`masked` 语义由「redact」扩展为「redact 或 password」，但对外可观测输出（key/code=null、key_status='masked'）与 spec 一致，无需区分来源，不出项。
- AC 复验方式：
  - AC-001：`re_verified`。代码 `masked = config.redact_data || is_password_input(event.target)`（:76）使 password 输入时 key/code=null、key_status='masked'，事件仍发送（spec 允许「置 masked 或不发事件」）；单测「password 输入框 + all 模式 + redact_data=false 时 key/code 仍不采集」断言 key/code null + key_status masked（以读断言与代码追踪验证，未运行测试套件）。
  - AC-002：`re_verified`。同一用例在 `redact_data=false` 下断言 key/code null；代码路径 `false || true = true`。
  - AC-003：`re_verified`。单测「非密码 input 在 redact_data=false 时行为不变」断言 text 输入 key='a'、key_status='captured'；`is_password_input` 对 text/tel/email 统一返回 false，masked 回落 `redact_data`，行为与修前一致。
  - `coverage = re_verified / 3 = 100%`
- 总体判断：常见路径（非 shadow DOM）实现正确、改动最小、3 条 AC 均有测试锚定；但 f001（important）未解决——shadow DOM 配置下 password 不变量仍被绕过、密码明文入库，本 task 在修复前不可信。
- 系统性 follow-up：无（单点实现缺陷，无跨 task 基础设施缺口）。

reviewed_scope: cecef0889a5180a5

verdict: FAIL

## Round 2 (2026-08-12 13:35 UTC+8)

### 前轮 finding 复核

- t130_code_f001（important，shadow DOM 内 password 击键明文入库）→ **已消除**，以 diff 与代码/测试实证为准，不采信处置表自称：
  1. 代码：`src/extension/content/keyboard_capture.ts:60-63` `is_password_input` 改用 `event.composedPath()[0]` 取实际目标；生产调用点 `build_key_event`（:78）在 listener 内部执行，此时 `composedPath()` 返回完整事件路径，`[0]` 为最深实际目标。
  2. jsdom 实证 retarget 真实发生：shadow 内 `<input type=password>` 触发 keydown 冒泡至 document，listener 收到的 `event.target === host`（retarget），listener 内 `composedPath()[0] === input`。守卫判定在 listener 内，能绕过 retarget 取到真实 input。
  3. 实测 `npx vitest run tests/unit/keyboard_capture.test.ts` → 10 passed（含新增 shadow 用例：key null、key_status='masked'）。
  4. Chrome 规范语义：`composedPath()` 不受 shadow retarget 遮蔽，`[0]` 恒为实际目标；修复在真实浏览器有效（推理验证）。

### 本轮新发现

无 blocking finding。

### 未进表的提示

- shadow 场景元数据（`target_selector`/`target_xpath`/`target_tag`/`target_input_type`，:101-104）仍由 `event.target` 派生，指向 host 而非实际 input。与修前行为一致，非本 task 引入回归，AC 未要求 metadata，范围外不记 finding；后续如需精确元数据建议统一取 `composedPath()[0]`。
- 文件行数：`keyboard_capture.ts` 117、`keyboard_capture.test.ts` 151，低于阈值。
- 复杂度：`is_password_input` CC=1，`build_key_event` CC≈5，低于阈值。

### AC 复验方式（Round 2）

- AC-001：`re_verified`。实测运行测试套件 10/10 通过；非 shadow 与 shadow 两种场景 password 输入均断言 key/code null + key_status='masked'；代码追踪 masked 路径成立。
- AC-002：`re_verified`。`redact_data=false` 下 password 用例断言 key null；代码 `config.redact_data(false) || is_password_input(true)` → masked。
- AC-003：`re_verified`。text input 用例断言 key='a'、key_status='captured'，测试套件通过；`composedPath()[0]` 非 shadow 场景等于 `event.target`，行为与修前一致。
- `coverage = re_verified / 3 = 100%`

### 总体判断

f001 修复正确且测试锚定（含 shadow 场景），无新 blocker，无未解决 critical/important，仅 minor 级观察（结论段提示，不进 finding 表）。

reviewed_scope: c941cccd916efc93

verdict: PASS
