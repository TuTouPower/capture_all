# Task review t197（reviewer_focus: 代码）

- task：`t197_dashboard_ui_interactions`
- spec：`docs/tasks/t197_dashboard_ui_interactions/spec.md`
- diff_anchor：`d188458404aafa22f7560a0e99a4c44358d18c18`
- target：`git diff d188458404aafa22f7560a0e99a4c44358d18c18`
- round：1
- reviewed_at：2026-08-14 04:45 UTC+8

## Findings

### t197_code_f001 - normal-lane 拖拽清理 guard 与 marker 分支模式不一致（冗余防御）

- 严重度：minor
- 锚点：代码质量「死代码与重复 / 控制流」；非 AC 违反
- 位置：`src/extension/dashboard/dashboard_detail.ts:748-751`（对比 marker 分支 704-710）
- 问题：normal-lane 拖拽新增 `let drag_active = true` + `if (!drag_active) return; drag_active = false;` guard。`finish_lane` 只绑定在 pointerup/pointercancel/lostpointercapture/blur 上，首次调用即移除全部 listener，后续任何事件都不可能再次触发该闭包，故 `drag_active` 在逻辑上恒为 true，是无行为作用的冗余防御；同一文件 marker 分支（`finish_marker`，704-710）无此 guard 且行为正确（t189 已验证）。两分支清理模式不一致，后续维护需分辨「为什么一个分支有 guard 一个没有」。
- 建议：删掉 `drag_active` 两行，与 marker 分支保持一致的 removeEventListener-only 模式；或若坚持防御，两分支统一补上。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：1 条（全部 minor，无 blocking）
- 未进表的提示：
  - 文件过大：`src/extension/dashboard/dashboard_detail.ts` 865 行（实现源码 ≥800 阈值；本 task 净增 ~7 行）。提示拆分，未达出 finding 条件（未见由过大直接导致的可观测缺陷）。
  - 测试侧观察（移交 test reviewer）：AC-002 测试为源码字符串断言（`readFileSync` + `toMatch(/selected\.delete\(id\)/)`，见 `tests/unit/dashboard_ui_interactions.test.ts:81-89`），非行为测试；AC-003 两条测试含 `if (!handle) return;` 静默跳过（102、118 行），元素缺失时直接 pass。两者归 test review 范畴，此处仅提示。
  - 行为说明（非缺陷）：normal-lane 拖拽期间 inspector 关闭从「pointerdown 立即渲染」改为「拖拽结束统一渲染」，拖拽过程中旧 inspector 视觉残留至 pointerup——这是 spec 范围区「pointerdown 不再直接调 render_content()」的批准设计，非偏离。
  - 回归观察：全量 `vitest run tests/unit` 首次 1 条失败（`tests/unit/logger.test.ts:313` flush 超时断言 `elapsed < 5*50+200`），属时间敏感型 flaky；立即重跑 201 files / 1907 tests 全绿。该测试与本 task 改动无关，未归因。
  - 范围外：diff 仅触及 `dashboard_captures.ts` / `dashboard_detail.ts` / 新增测试 / task.md，无与 t197 无关的模块改动。
- 总体判断：AC-001/002/004 实现正确、回归全绿，仅 1 条 minor（冗余防御 + 分支模式不一致），无未解决 critical/important，可 PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001（空白区拖拽 `_tl_dragging` + 结束清理 + 轮询不打断）：`re_verified`。查证 `dashboard_detail.ts:743` normal-lane pointerdown 置 `_tl_dragging = true`，`finish_lane`（749-758）四事件统一清理并 `router.render_content()`；`dashboard.ts:145` 轮询 `!router.is_tl_dragging()` 保护。重跑 `dashboard_ui_interactions.test.ts` AC-001 两条用例绿。
- AC-002（批量删除失败后 selected 不含已删成功项）：`re_verified`。查证 `dashboard_captures.ts:178-188`：循环内 `resp.success` 检查之后 `selected.delete(id)`，失败路径 `return` 前未清空，成功全路径 `selected.clear()`；Set 迭代中删除当前项安全。测试为字符串断言（有效性归 test reviewer），实现侧独立核对成立。
- AC-003（resize pointercancel/mouseleave 清理）：`re_verified`（实现侧）。查证清理实现已存在于 `dashboard_detail.ts:567-568`（rail）与 614-615（network）：`pointercancel` 与 `document mouseleave` 均解绑；本 task 仅补测试，测试断言质量归 test reviewer。
- AC-004（新增测试全绿 + 无回归）：`re_verified`。重跑 `npx vitest run tests/unit`：201 files / 1907 tests passed（首次 1 条 logger flaky 超时，重跑通过，见上）。

coverage = 4 / 4

reviewed_scope: 8a5760f2b72fd55c

verdict: PASS

## Round 2 (2026-08-14 04:50 UTC+8)

### 前轮 finding 复核

- **t197_code_f001**（minor，normal-lane 拖拽 `drag_active` guard 冗余）：**已消除**。以当前 `git diff d188458...` 与代码为准核实：`src/extension/dashboard/dashboard_detail.ts:740-762` normal-lane 分支现为纯 removeEventListener 清理 + `_tl_dragging = false` + `router.render_content()`，无 `drag_active` 任何残留；与 marker 分支（704-732）清理模式一致，且 747-748 行注释已同步说明「首次调用即移除全部 listener」的语义。处置表「已修」标注与代码现状一致（不采信自述，以代码为准）。

### 本轮新发现

0 条。

自 Round 1 以来的新增 diff 仅：生产代码删除 `drag_active` 两行并更新注释（f001 修复）、task.md 处置表与 front matter（流程文件）、测试文件按 test reviewer finding 重写（test 范畴，代码侧无 mock 关键副作用 / 无恒真断言等 anti-pattern）。生产代码无其他变动。

### 7 视角扫描（确认已扫过，未命中）

- 规格合规：AC-001/002/003/004 实现均未变（除 f001 修复），无新增偏离、无范围外模块改动（diff 仍仅 dashboard_detail.ts / dashboard_captures.ts / 新增测试 / task.md）。
- 安全：diff 触及路径（pointerdown 处理、batchDel）无外部输入拼接/执行、无渲染面、无凭证落盘或进日志。
- 契约/类型：无公开签名/配置键变更；无校验缺口。
- 性能/资源：无循环查库、无新 IO；AC-002 循环内 `selected.delete(id)`（dashboard_captures.ts:186）为 Set 迭代中删除当前项，JS 语义安全、不跳过后续项、O(1)。
- 架构/可维护性：normal-lane 与 marker 分支同构，无新重复或死代码。
- 健壮性/可观测：无空 catch / 静默吞错引入；失败路径 alert + load + render 语义保持（第 1 轮已验）。
- 测试/文档/规格：AC-003 两条测试已改硬断言（`expect(handle).toBeTruthy()`）且 network 用例补 `set_dt_tab('network')`，不再静默跳过——修复有效。

### 未进表的提示

- 文件过大：`src/extension/dashboard/dashboard_detail.ts` 863 行（实现源码 ≥800 阈值）。本 task 本轮净减 2 行（删 guard），未继续堆大，维持提示不 upgrade。
- 复杂度：无函数达 CC≥15；normal-lane 分支与 marker 分支同构，无新增分支。
- 范围外观察：无。

### AC 复验方式

- AC-001（空白区拖拽 `_tl_dragging` + 结束清理 + 轮询不打断）：`re_verified`。查证 `dashboard_detail.ts:743`（pointerdown 置位）、749-756（finish_lane 四事件统一清理 + `_tl_dragging = false`）；重跑 `tests/unit/dashboard_ui_interactions.test.ts` AC-001 两条用例绿（6 tests passed）。
- AC-002（批量删除失败后 selected 不含已删成功项）：`re_verified`。查证 `dashboard_captures.ts:178-188`：成功路径 `selected.delete(id)` 即时移除，失败路径 return 前不残留成功项；行为级测试（124-150 行，mock SW 首项成功次项失败）断言 `get_selected()` 后绿。
- AC-003（resize pointercancel/mouseleave 清理）：`re_verified`。rail 用例含解绑行为断言（cancel 后再 move 宽度不变，188-191 行）；network 用例补 tab 渲染 + 硬断言（194-208 行）。重跑通过。
- AC-004（新增测试全绿 + 无回归）：`re_verified`。`npx vitest run tests/unit`：201 files / 1907 tests passed；上轮 flaky 的 `logger.test.ts` flush 断言本次亦通过。

coverage = 4 / 4

reviewed_scope: 5bd6d493a4d5e42a

verdict: PASS
