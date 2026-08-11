# Task review t129（reviewer_focus: 通用）

- task：`t129_split_long_functions`
- spec：`docs/tasks/t129_split_long_functions/spec.md`
- diff_anchor：`9e4e311a8ea206bf6b24e7d0ad2b8395e5be71f2`
- target：`git diff 9e4e311a8ea206bf6b24e7d0ad2b8395e5be71f2`
- round：1
- reviewed_at：2026-08-11 23:24 UTC+8

## Findings

### t129_gen_f001 - start_body_capture 拆分引入不可达 fall-through 分支，且 handle_cdp_failure 的「返回 null」契约从未实现

- 严重度：minor
- 锚点：无 AC 违反；reachable 路径行为等价，无可观测缺陷（分支不可达）。属于结构拆分遗留。
- 位置：`src/extension/background/body_capture_coordinator.ts:105-113`（fall-through）、`:116`（JSDoc）、`:117-157`（handle_cdp_failure）
- 问题：`handle_cdp_failure` 声明返回 `Promise<BodyCaptureStartResult | null>`，JSDoc 称「返回 null 表示调用方继续走通用 bridge」，但函数体 4 条路径全部返回非 null（escalate 恒返回 result、restricted_url/cdp_attach_failed 直接返回对象）。因此 `start_body_capture` 中 `if (outcome)` 恒真，CDP 失败块必然 return，行 98-113 仅在 `active_tab_id === null` 时可达；行 108-111 中 `active_tab_id !== null` 分支（`failure_reason: 'cdp_attach_failed'`、`message: 'CDP attach failed, using fallback hook'`）是死代码。该死分支的 message 少了 `error_msg` 详情（reachable 的「其它 CDP 失败」分支 message 为 `CDP attach failed: ${error_msg}, ...`），若未来某错误分支改为返回 null，会丢失错误详情。
- 建议：二选一——（a）把 `handle_cdp_failure` 返回类型收敛为非空 `BodyCaptureStartResult`，删除 `if (outcome)` 判断与死分支，保留 `active_tab_id === null` 的独立路径；（b）若确实想保留「null → 通用 bridge」契约，让某条错误路径实际返回 null 使分支可达，并修正 message 补回 `error_msg`。

### t129_gen_f002 - prepare_archive_content 返回未消费的 network_with_times 字段

- 严重度：minor
- 锚点：无 AC 违反；dead 返回字段。
- 位置：`src/extension/shared/archive_builder.ts:265`（返回类型声明）、`:308`（返回值）、`:241-242`（调用方解构）
- 问题：`prepare_archive_content` 返回对象含 `network_with_times`，但 `build_archive` 解构时未取该字段（仅用 `capture_with_times/event_lines/console_lines/network_lines/all_body_files`）。该值只在 prepare_archive_content 内部用于生成 network_lines，返回它是拆分时遗留的死字段。
- 建议：从返回类型与 return 字面量中移除 `network_with_times`。

## 结论

- 前轮 finding 复核（Round 1）：无
- 本轮新发现：2 条（均为 minor）
- 未进表的提示：
  - 测试断言更新评估（评审要点第 5 项）：`popup_export.test.ts` 与 `t115_export_save_as_consistency.test.ts` 的源码字符串断言更新合理，非迁就实现。t115 的 flush 顺序语义已随重构移入 `handle_export` helper，新断言（`flush_idx < export_map_idx`）在 helper 内验证 `await flush_all()` 先于 `export_map[format](capture_id)` 调用，语义确实被保留；四类 action 的 case 分派（`handle_export('json'`/`'jsonl'`/`'html'`/`'har'`）也被逐条断言。唯一覆盖变窄点：`export_map` 中 `json→export_json` 等键→函数映射本身未直接断言（tsc 校验键类型但不校验语义映射），属「可补一个 case」类，不阻断。
  - 原代码末尾注释「// Permission or other error — try bridge」是误导性注释：permission 分支在上一 if 已 return，末段仅处理「其它错误」。拆分后 4 类错误分支（Another debugger→bridge→bridge_unavailable；Cannot attach→restricted_url 不试 bridge；permission→bridge→permission_denied；其它→bridge→cdp_attach_failed）与原逻辑逐条一致，无重复 bridge 尝试问题。CDP→bridge→fallback 降级语义等价。
  - build_archive/wire_trace/handle_message 拆分逐行比对行为等价：resolve_body_paths 以拷贝 `network_lines_final` 回写 body_ref 并交付 assemble_zip，与原原地改写等价；wire_trace 三子函数事件监听顺序与闭包捕获一致；handle_export 的 export_map 分派 + flush 前置与原四 case 逐条等价。
- 总体判断：拆分行为等价，AC-001/002/003 全部复验通过；2 条 minor 为结构遗留（死分支、死返回字段），不阻断。
- 系统性 follow-up：无

### AC 复验方式

| AC | 类别 | 证据 |
|----|------|------|
| AC-001（4 函数拆分后各自 <80 行） | re_verified | 逐函数行号计数：build_archive 23 行、wire_trace 27 行、handle_message 67 行、start_body_capture 60 行；提取子函数 prepare_archive_content 50 / resolve_body_paths 59 / build_counts 18 / build_manifest 17 / assemble_zip 41 / make_update_playhead 16 / wire_lane_pointerdown 63 / wire_minimap_drag 59 / handle_cdp_failure 41 / escalate_to_bridge_or_fallback 15，全部 <80 |
| AC-002（行为不变，相关测试全绿） | re_verified | `npm test` 全量通过：131 文件 1379 用例全绿（含 archive_builder / archive_body_ref_consistency / body_capture_external_poll_stop / t115 / popup_export 等覆盖），并逐函数比对原实现分支语义等价 |
| AC-003（`npm test` 全绿 + `npx tsc --noEmit` 通过） | re_verified | 本人执行 `npx tsc --noEmit` exit 0；`npm test` 1379/1379 通过 |

coverage = 3 / 3

reviewed_scope: 191dab12b877629e

verdict: PASS

## Round 2 (2026-08-11 23:33 UTC+8)

reviewed_scope: 0d1ff6c2198489c0

### 前轮 finding 复核

- **t129_gen_f001（minor，已修）**：`handle_cdp_failure` 返回类型已收敛为 `Promise<BodyCaptureStartResult>`（`src/extension/background/body_capture_coordinator.ts:112-117`），4 条路径全部返回非空终态：'Another debugger' → `escalate_to_bridge_or_fallback` 恒返回；'Cannot attach' → restricted_url 对象直接返回；permission → `escalate_to_bridge_or_fallback` 恒返回；其它 CDP 失败 → bridge 失败后返回 `cdp_attach_failed` fallback 对象。`start_body_capture` 中 `if (outcome)` 判断与 `active_tab_id !== null` 内的 `cdp_attach_failed` 死分支已删除，CDP 失败块收敛为 `coordinator_state = await handle_cdp_failure(...)` + `return build_result()`（行 91-92）；`active_tab_id === null` 独立路径（bridge → fallback_hook）保留于行 95-108。删除死分支不改变可达行为：死分支 message 'CDP attach failed, using fallback hook' 无 error_msg，而可达路径（handle_cdp_failure 其它失败分支）message 为 `CDP attach failed: ${error_msg}, ...`，与原 pre-t129 内联逻辑（含 error_msg 详情）逐条等价。4 类错误分派顺序与 bridge 尝试时机一致。**已消除**。
- **t129_gen_f002（minor，已修）**：`prepare_archive_content` 返回类型（`src/extension/shared/archive_builder.ts:262-269`）与 return 字面量（行 307）已移除 `network_with_times`；`network_with_times` 降级为内部局部变量（行 279），仅用于行 297 循环生成 network_lines，无死返回字段残留。唯一调用方 build_archive（行 241-242）解构本就未取该字段。grep 确认 `network_with_times` 无其它引用。**已消除**。

### 本轮新发现

- 0 条。f001 修复后 `handle_cdp_failure` 类型收敛干净，无残留死分支；f002 移除彻底。检查点：start_body_capture 行数 55 行、handle_cdp_failure 41 行、build_archive 23 行、prepare_archive_content 49 行，均 <80（AC-001）；service_worker / dashboard_detail / 测试文件无 Round 2 侧改动，拆分行为与 Round 1 一致。

## 结论

- 前轮 finding 复核：f001 已消除、f002 已消除（以代码/diff 核实，非采信 task.md 处置表）
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：两条 minor 均真修，无未解决 critical / important
- 系统性 follow-up：无

### AC 复验方式

| AC | 类别 | 证据 |
|----|------|------|
| AC-001（4 函数拆分后各自 <80 行） | re_verified | 修复后计数：build_archive 23、wire_trace 27、handle_message 67、start_body_capture 55，提取子函数含 handle_cdp_failure 41 / escalate_to_bridge_or_fallback 15 / prepare_archive_content 49 等，全部 <80 |
| AC-002（行为不变，相关测试全绿） | re_verified | `npm test` 全量通过：131 文件 1379 用例全绿；f001/f002 修复逐路径比对原逻辑行为等价 |
| AC-003（`npm test` 全绿 + `npx tsc --noEmit` 通过） | re_verified | 本人执行 `npx tsc --noEmit` exit 0；`npm test` 1379/1379 通过 |

coverage = 3 / 3

reviewed_scope: 0d1ff6c2198489c0

verdict: PASS
