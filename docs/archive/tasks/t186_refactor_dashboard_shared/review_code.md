# Task review t186（reviewer_focus: 代码）

- task：`t186_refactor_dashboard_shared`
- spec：`docs/tasks/t186_refactor_dashboard_shared/spec.md`
- diff_anchor：`dcbf2b75f714be2249504c29a53f3cc6e699047e`
- target：`git diff dcbf2b75f714be2249504c29a53f3cc6e699047e`
- round：1
- reviewed_at：2026-08-13 23:33 UTC+8
reviewed_scope: b91d23478efa3164

## Findings

### t186_code_f001 - 既有测试 dashboard_timeline_marker 未迁移 router 接线，vitest 套件退出码 1

- 严重度：important
- 锚点：AC-001（既有 dashboard 相关测试通过）+ AC-003（测试不再依赖共享模块单例；每例接线）
- 位置：`tests/unit/dashboard_timeline_marker.test.ts:331`（`lanes.dispatchEvent(new PointerEvent('pointerdown'…))`）→ `src/extension/dashboard/dashboard_detail.ts:724`（normal lanes 拖拽路径 `router.render_content()`；marker seek 路径同因，`:711`）
- 问题：router 语义从「未接线 no-op」改为「未接线抛错」（AC-002，符合 spec），但 `dashboard_timeline_marker.test.ts` 未做任何接线迁移（diff 未触及该文件，也没有 `wire_dashboard_router` 调用）。该文件 `wire_detail()` 渲染 trace 后派发 `pointerdown`，事件 handler 内 `router.render_content()` 抛 `Error: dashboard router not wired: call wire_dashboard_router() at entry before rendering`。vitest 记为 unhandled error（「This might cause false positive tests」），全量 `npm test`（vitest run，`docs/blueprint/testing.md` 定义的 `{test_cmd}`）实测 **191 文件 / 1817 用例全绿但退出码 1**（`FULL_EXIT=1`），门禁失败。修复前该事件路径的行为也失真：旧代码此调用是 no-op 静默执行，现在直接抛异常，测试不再等价覆盖原路径。t154 已示范正确迁移方式（beforeEach 显式 wire），本文件漏迁移。
- 建议：在 `dashboard_timeline_marker.test.ts` 的渲染前置步骤（如各用例或顶层 setup）调用 `wire_dashboard_router({ go: vi.fn(), render_content: vi.fn(), render_shell: vi.fn(), open_detail: vi.fn(), is_tl_dragging: vi.fn(() => false) })`（参考 `tests/unit/t154_dashboard_misc.test.ts` beforeEach 写法），并确认 `npm test` 退出码归零、无 unhandled error。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：1 条（t186_code_f001）
- 未进表的提示：
  - 文件过大：`src/extension/dashboard/dashboard_detail.ts` 829 行（≥800 阈值；本 task 净增 2 行，anchor 时已 827 行）。按要求不进 finding 表，仅提示；未发现过大直接导致的可观测缺陷。
  - 复杂度：无本 task 新增函数达阈值。`load_detail` / `export_capture` 为既有逻辑原样搬移（CC 不变）；router 包装函数单层转发。
  - 范围外观察（分层小瑕疵）：`dashboard_data.ts:8-12` 从 `dashboard_format.ts` 导入 `is_extension` / `logger`，数据模块依赖格式模块的常量，分层方向略倒置；功能无影响，属组织偏好，未进表。
  - spec 描述张力：契约区范围行称 `dashboard_format.ts` 为「纯函数」，但 `dashboard_format.ts:43-45` `capture_name` 经 `get_user_config()` 读取模块级状态（既有行为原样搬移，头注释已声明）。判断为描述性范围行 vs 实现细节的轻偏离，按技术约束规则不出 blocking，建议同步 spec 措辞或保留现状说明。
  - 测试结构提示：`dashboard_shared_split.test.ts:20-37` 的「未 wire 抛错」断言依赖同文件内用例顺序（wire 用例在其后）；vitest 单文件内顺序确定，当前稳定，未进表。
- 总体判断：职责拆分与 router 显式接线实现等价、AC-002/AC-004 达成；但 router 语义变更导致一个既有 dashboard 测试文件未迁移，`npm test` 退出码非零（AC-001 门禁层失败、AC-003 迁移不完整），存在未解决 important，FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001（重构后功能行为与页面表现不变；既有测试通过）：`re_verified`。生产行为：对旧 `dashboard_shared.ts` 与新三模块做归一化逐函数等价对比（63 个导出全在，`set_dt_view` zoom 联动 / `set_dt_zoom` / `get_dt_zoom_window_pct` / `save_dt_memory` / `get_dt_memory` / `debounce` / `load_detail` / `detail_counts_advanced` / `export_capture` / `merge_detail_events` 等逻辑逐句一致，仅 `_x`→`_state.x` 路径更名），`npx tsc --noEmit` 通过，`npx vite build` 通过（dashboard bundle 正常，无 star-export 冲突）。测试通过：全量 `npm test` 191 文件 / 1817 用例断言全绿，但套件退出码 1（f001 的唯一 unhandled error），故本条在门禁层面未达。
- AC-002（router 未接线抛明确错误）：`re_verified`。读代码：`dashboard_shared.ts:22-29` `require_router()` 未接线抛错、`router.*` 全部经其转发；`dashboard_shared_split.test.ts:20-27` 断言 `/router not wired/` 通过；`dashboard.ts:97-103` 入口一次性 `wire_dashboard_router` 接线。
- AC-003（测试不依赖共享模块单例的 import/执行顺序）：`re_verified`（部分）。`create_dashboard_state` / `reset_dashboard_state` 独立实例断言通过（`dashboard_shared_split.test.ts:41-58`）；`t154_dashboard_misc.test.ts` beforeEach 显式 wire + 复位。缺口即 f001：`dashboard_timeline_marker.test.ts` 未迁移，仍隐式依赖旧 no-op 单例行为。
- AC-004（状态/数据/格式化职责分离）：`re_verified`。三个新模块存在、`dashboard_shared.ts` 退化为 façade（仅 star re-export + router），`dashboard_shared_split.test.ts:67-89` 断言通过；`dashboard_state.ts` 无 `send_ui_message`、`dashboard_data.ts` 无渲染、`dashboard_format.ts` 无模块级可变状态；tsc + vite build 佐证。

coverage = 4 / 4

verdict: FAIL

## Round 2 (2026-08-13 23:37 UTC+8)

### t186_code_f001 复核（处置确认）

- 结果：**已消除**。`tests/unit/dashboard_timeline_marker.test.ts:8,47-52` beforeEach 补 `wire_dashboard_router`（inert callbacks，同 t154 做法）。
- 实证：`npx vitest run tests/unit/dashboard_timeline_marker.test.ts` → 33 tests passed，EXIT=0，无 Errors；全量 `npm test`（vitest run）→ 191 文件 / 1817 用例 passed，FULL_EXIT=0，日志无 unhandled error 且「router not wired」匹配数 0。Round 1 的退出码 1 已归零。
- 注：wire 落点在文件第 1 个 describe 的 beforeEach，其余 describe 实际依赖模块级 `_router` 单例在文件内先被写入而顺带获得接线（见 f002）。

### t186_code_f002 - timeline_marker 的 wire 仅覆盖首个 describe，跨 describe 依赖模块单例残留

- 严重度：minor
- 锚点：AC-003（测试不依赖共享模块单例 / 执行顺序）意图；f001 修复结构
- 位置：`tests/unit/dashboard_timeline_marker.test.ts:47`（wire 仅在 describe「render_trace marker data-event-idx」beforeEach）
- 问题：wire 只加在文件第 1 个 describe（:47）的 beforeEach；其余 6 个 describe 未接线，其中含 Round 1 实际报错的 describe「trace view DOM: marker click chain」（:235，其 beforeEach :236 无 wire）。该 describe 的 pointerdown 用例（:331）当前能过，仅因 `_router` 是模块级单例、文件内按定义序先被第 1 个 describe 写入——即跨 describe 隐式执行顺序依赖。vitest 文件内顺序确定、本轮套件全绿；但若 describe 重排（:235 的 describe 前移）或对其用例 `it.only` 隔离运行，将复现「router not wired」unhandled error 与退出码 1（Round 1 已实证该路径可触发）。
- 建议：把 `wire_dashboard_router` 提升至文件级（describe 外）beforeEach，或至少补到实际派发 pointer 事件的 describe（:236）beforeEach，使每例独立自足，消除对模块单例写入顺序的依赖。

## 结论（Round 2）

- 前轮 finding 复核：f001 已消除（实证见上）；f002 为本轮新发现。
- 本轮新发现：1 条（t186_code_f002，minor）。
- 未进表的提示：无新增（文件过大 / 复杂度 / 范围外观察同 Round 1）。
- 总体判断：f001 处置充分，全量套件退出码 0、无 Errors；本轮仅余 minor（wire 覆盖面结构性提示），无未解决 critical / important → PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001：`re_verified` —— 全量 `npm test` 191 文件 / 1817 用例通过，FULL_EXIT=0、无 Errors（Round 1 退出码 1 已归零）。
- AC-002：`re_verified` —— 承 Round 1（require_router 抛错 + 断言通过）；本轮未改动该实现。
- AC-003：`re_verified`（部分）—— 承 Round 1；f001 缺口已补，但 f002 提示 wire 覆盖面仍依赖文件内顺序（minor，非阻断）。
- AC-004：`re_verified` —— 承 Round 1；本轮未改动实现模块。

coverage = 4 / 4

reviewed_scope: c0c6d9266f01c014

verdict: PASS

## Round 3 (2026-08-13 23:45 UTC+8)

### t186_code_f002 复核（处置确认）

- 结果：**已消除**。wire 从 describe 内 beforeEach 提升至文件级（顶层）`beforeEach`：`tests/unit/dashboard_timeline_marker.test.ts:44-49`，位于所有 describe 之外，覆盖全部 7 个 describe；describe 内重复的 wire（原 :47）已移除，无重复接线。
- 实证：`npx vitest run tests/unit/dashboard_timeline_marker.test.ts` → 33 tests passed，EXIT=0；全量 `npm test`（vitest run）→ 191 文件 / 1817 用例 passed，FULL_EXIT=0，无 Errors、「router not wired」匹配 0。跨 describe 顺序依赖已消除——每例在文件级 beforeEach 独立接线，不再依赖首个 describe 先行写入模块单例。
- 复核未发现修复引入的新问题（本轮仅改该测试文件，无实现层改动）。

## 结论（Round 3）

- 前轮 finding 复核：f002 已消除（实证见上）；f001 已在 Round 2 确认消除，本轮未回退。
- 本轮新发现：0 条。
- 未进表的提示：无新增（文件过大 / 复杂度 / 范围外观察同 Round 1）。
- 总体判断：f001 / f002 均已处置并经实证归零，全量套件退出码 0、无 Errors、无未解决 critical / important → PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-001：`re_verified` —— 全量 `npm test` 191 文件 / 1817 用例通过，FULL_EXIT=0、无 Errors。
- AC-002：`re_verified` —— 承 Round 1（require_router 抛错 + 断言）；本轮无实现改动。
- AC-003：`re_verified` —— f002 修复后文件级 beforeEach 使每例独立接线，不再依赖执行顺序；结合 Round 1 的 factory 隔离断言与 t154 迁移，测试侧迁移完整。
- AC-004：`re_verified` —— 承 Round 1；本轮无实现改动。

coverage = 4 / 4

reviewed_scope: ccac640b05411617

verdict: PASS
