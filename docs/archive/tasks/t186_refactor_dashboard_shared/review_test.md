# Task review t186（reviewer_focus: 测试）

- task：`t186_refactor_dashboard_shared`
- spec：`docs/tasks/t186_refactor_dashboard_shared/spec.md`
- diff_anchor：`dcbf2b75f714be2249504c29a53f3cc6e699047e`
- target：`git diff dcbf2b75f714be2249504c29a53f3cc6e699047e`
- round：1
- reviewed_at：2026-08-13 23:35 UTC+8
reviewed_scope: b91d23478efa3164

## Findings

### t186_test_f001 - dashboard_timeline_marker.test.ts 未适配 AC-002 接线，unhandled 异常使 `npm test` 红灯（exit 1）

- 严重度：important
- 锚点：AC-001（重构后既有 dashboard 相关测试通过）；危险模式「掩盖失败」（事件监听器内未处理异常被吞，测试仍绿，Vitest 明示可能 false positive）
- 位置：`tests/unit/dashboard_timeline_marker.test.ts:331`（`lanes.dispatchEvent(new PointerEvent('pointerdown', ...))`）→ 触发 `src/extension/dashboard/dashboard_detail.ts:724` `router.render_content()` 抛 `dashboard router not wired`
- 问题：AC-002 把未接线 router 调用从静默 no-op 改为抛错后，实现侧只给 `t154_dashboard_misc.test.ts` 补了 `wire_dashboard_router`，漏掉 `dashboard_timeline_marker.test.ts`。该文件「lane pointer seek uses the track overlay geometry」测试对 `tlLanes` 派发真实 pointerdown，处理器在 `dashboard_detail.ts:724` 调 `router.render_content()` 抛错。异常发生在 jsdom 事件监听器内不向测试传播，测试仍绿，但：
  1. 全量 `npx vitest run`（即 `npm test`）报告 `Test Files 191 passed / Tests 1817 passed / Errors 1 error`，**退出码 1**——测试门禁红灯，AC-001「既有 dashboard 相关测试通过」的证据不成立；
  2. Vitest 输出明确警告 unhandled error「might cause false positive tests」；
  3. 724 行抛出后，handler 后续 `window.addEventListener('pointermove'/'pointerup')` 未注册，该测试的拖拽续动路径在测试环境被静默截断（本次断言恰好不受影响，属侥幸）。
- 建议：在 `dashboard_timeline_marker.test.ts` 的 `load_module()`/beforeEach 中与 t154 同法调用 `wire_dashboard_router`（注入 inert callbacks，`is_tl_dragging: () => false`），消除 unhandled 异常，恢复 `npm test` 绿色。

## 结论

- 前轮 finding 复核（Round 1 首轮）：无
- 改测方向复核：无「迁就实现」的改测。
  - `t154_dashboard_misc.test.ts` 新增 `wire_dashboard_router({ go: vi.fn(), ... })`：AC-002 契约变更（未接线抛错）下的合法适配，注入的 inert mock 与旧 no-op 行为等价（`del_capture` 成功路径的 `router.render_content()`、`open_detail` 尾部 `router.render_shell()` 原就是 no-op），未改变断言语义，不属于实现驱动测试。
  - `archive_entry` / `entry_unification` / `export_utils` / `t115_export_save_as_consistency` 四处源码断言仅把锚定路径 `dashboard_shared.ts` → `dashboard_data.ts`（实现随拆分迁移），断言正则本身未变，逐一实查仍匹配迁移后代码（`dashboard_data.ts:6,7` import build_archive/download_blob；t115 的 flush→read_capture_snapshot 顺序在 `dashboard_data.ts:118-120` 保持）。
  - 无删测试 / 无 `.skip`/`.only` / 无注释断言 / 无 `@ts-ignore`/eslint-disable。
- 本轮新发现：1 条（important）
- 未进表的提示：
  - AC-002「wire 后调用转发」仅验证 `go`/`render_content` 两个回调；`render_shell`/`open_detail` 的转发与未 wire 抛错未测。五个方法共享 `require_router()` 机制，属可选扩展，不阻断。
  - `dashboard_shared_split.test.ts` 的未 wire 抛错断言依赖文件内声明顺序（wire 测试先跑则红）；vitest 默认按声明顺序、无 shuffle，属脆弱性提示，非缺陷。
  - `dashboard_shared_split.test.ts:53` 用 `readFileSync(...).length > 100` 作模块存在性证据，弱但后继有实质 regex 断言支撑，不单独出 finding。
- 总体判断：AC-002/003/004 的专项测试与既有测试调整方向正确，但 AC-001 行为 gate 因 `dashboard_timeline_marker.test.ts` 漏接线导致 `npm test` 红灯（exit 1），存在未解决 important，FAIL。
- 系统性 follow-up：无（修复即本 finding 处置，不构成独立 task）。

### AC 复验方式

- AC-001：`re_verified` — reviewer 实跑全量 `npx vitest run`：191 文件/1817 测试全过但 `Errors 1 error`、**退出码 1**；dashboard 相关子集复跑同样 exit 1（见 f001）。
- AC-002：`re_verified` — 实跑 `dashboard_shared_split.test.ts` 通过；`dashboard_shared.ts:24-28` `require_router()` 抛错逻辑、`dashboard.ts:98` 入口接线实查。
- AC-003：`re_verified` — 实跑 AC-003 三例通过；`dashboard_state.ts` `create_dashboard_state`/`reset_dashboard_state` 独立实例语义实查。
- AC-004：`re_verified` — 实跑 AC-004 源码断言通过；三模块实查（state 无 `send_ui_message`、data 无 `render_/innerHTML`、format 无模块级 `let`、shared 为 `export *` façade），`npx tsc --noEmit` 通过。

coverage = 4 / 4

verdict: FAIL

## Round 2 (2026-08-13 23:37 UTC+8)

### 前轮 finding 复核

- **t186_test_f001（important）— 已消除**：处置为 `tests/unit/dashboard_timeline_marker.test.ts:47-51` 首个 describe 的 beforeEach 补 `wire_dashboard_router`（inert callbacks，`is_tl_dragging: () => false`，行为 ≡ 旧 no-op）。复核结果：
  - `npx vitest run tests/unit/dashboard_timeline_marker.test.ts`：33/33 通过，exit 0，无 Errors（file exit=0）；
  - 全量 `npx vitest run`（`npm test`）：191 文件 / 1817 测试全通过，**无 Errors，退出码 0**（full exit=0），AC-001 门禁恢复绿色；
  - unhandled error 栈已消失，`dashboard_detail.ts:724` `router.render_content()` 在测试环境不再抛错，拖拽续动监听注册完整恢复。
  - 处置为合法适配（inert mock ≡ 旧 no-op 语义），非「迁就实现」；未引入 `.skip`/`.only`/断言弱化/注释断言等危险模式。

### 改测方向复核

无「迁就实现」的改测；本轮唯一测试改动即 f001 处置（wire 注入），方向与 t154 一致。

### 本轮新发现

0 条。

### 未进表的提示

- f001 处置依赖跨 describe 的模块级 `_router` 状态延续：wire 只加在文件首个 describe（`render_trace marker data-event-idx`）的 beforeEach，后续 describe（含实际派发 pointerdown 的「lane pointer seek」测试）靠 vitest 按声明顺序执行 + 无模块重置才生效；注释「每例显式 wire」与实际落点略有出入。若未来重排/删改首个 describe，后续测试会再现 unhandled error（届时 exit 1 可见，非静默）。属健壮性/注释微瑕，非阻断，不建议单独处置。

### AC 复验方式（Round 2）

- AC-001：`re_verified` — 本轮 reviewer 实跑全量 `npx vitest run`：191 文件 / 1817 测试全通过、无 Errors、退出码 0。
- AC-002/003/004：`re_verified` — 本轮未改动相关实现与专项测试，沿用 Round 1 复验结论（专项测试实跑通过）。

coverage = 4 / 4

verdict: PASS
reviewed_scope: c0c6d9266f01c014

## Round 3 (2026-08-13 23:39 UTC+8)

### 前轮提示复核

- **Round 2 未进表提示（wire 跨 describe 状态依赖）— 已消除**：wire 提升至 `tests/unit/dashboard_timeline_marker.test.ts:44-50` 文件级顶层 `beforeEach`（describe 外，覆盖全部 describe），注释「不依赖跨 describe 状态残留」与实现一致。跨 describe 顺序/状态依赖不复存在；inert mock 内容未变（≡ 旧 no-op 语义）。

### 复核结果

- `npx vitest run tests/unit/dashboard_timeline_marker.test.ts`：33/33 通过，exit 0，无 Errors（file exit=0）；
- 全量 `npx vitest run`（`npm test`）：191 文件 / 1817 测试全通过，**无 Errors，退出码 0**（full exit=0），AC-001 门禁绿色；
- 无 `.skip`/`.only`、断言弱化、删测试、静默错误等新危险模式；本轮改动仅移动 wire 落点。

### 改测方向复核

无「迁就实现」的改测。

### 本轮新发现

0 条。

### 未进表的提示

无。

### AC 复验方式（Round 3）

- AC-001：`re_verified` — 本轮 reviewer 实跑全量 `npx vitest run`：191 文件 / 1817 测试全通过、无 Errors、退出码 0。
- AC-002/003/004：`re_verified` — 相关实现与专项测试未变，沿用 Round 1 复验结论。

coverage = 4 / 4

verdict: PASS
reviewed_scope: ccac640b05411617
