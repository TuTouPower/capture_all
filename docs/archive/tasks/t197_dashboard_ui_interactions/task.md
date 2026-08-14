---
tid: "t197"
slug: "dashboard_ui_interactions"
title: "Dashboard UI 交互缺陷与清理测试"
status: "done"
branch: "t197_dashboard_ui_interactions"
worktree: ""
review_level: "full"
diff_anchor: "d188458404aafa22f7560a0e99a4c44358d18c18"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 实现：normal-lane 拖拽分支（`wire_lane_pointerdown`）pointerdown 置 `_tl_dragging=true`，不再直接 `router.render_content()`，改 finish_lane 统一清理 + 刷新（AC-001）；batchDel 循环内成功项即时 `selected.delete(id)`（AC-002）；新增 resize 清理测试（AC-003）。
- 测试首版 3 败：`window.dispatchEvent(pointercancel)` 未触发 finish——排查发现测试内残留 `vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)`，把后续 `window.dispatchEvent` 全吞掉，删后全绿（同款模式在 timeline_marker 测试可用，属测试 bug 非实现 bug）。
- Review Round 1 test FAIL（3 important）：f001 network resize 测试 vacuous（缺 `set_dt_tab('network')`，`if (!handle) return` 静默过）；f002 AC-002 源码文本断言非行为测试；f003 AC-001 无中间 render 断言。全部改为硬断言/行为级测试后黑盒全绿。code 路 1 minor（drag_active guard 冗余）已删。
- Round 2 overall PASS；1 条 minor（t197_test_f005 rail 解绑断言受 MIN_W 钳制不敏感）遗留，登记 p050。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1（review_level=full）

| finding_id | 严重度 | 处置 | 说明 |
|---|---|---|---|
| t197_test_f001 | important | 已修 | network resize 测试加 `set_dt_tab('network')` 使 `.dt-insp-handle` 渲染，`if (!handle) return` 改硬断言 `expect(handle).toBeTruthy()`；rail 守卫同改硬断言 |
| t197_test_f002 | important | 已修 | AC-002 改行为级测试：mock `send_ui_message` + `confirm`，挂 DOM 派发 `#batchDel` click，断言 `get_selected()` 不含已删成功项；删源码文本断言 |
| t197_test_f003 | important | 已修 | AC-001 pointerdown 后加 `expect(render_content).not.toHaveBeenCalled()`；pointercancel 后 `toHaveBeenCalledTimes(1)` |
| t197_test_f004 | minor | 已修 | rail 测试补 listener 解绑断言：cancel 后派发 mousemove 断言宽度不变 |
| t197_code_f001 | minor | 已修 | 删除 normal-lane `drag_active` guard，与 marker 分支一致的 removeEventListener-only 清理模式 |

### Round 2（review_level=full）

| finding_id | 严重度 | 处置 | 说明 |
|---|---|---|---|
| t197_test_f005 | minor | 遗留 | rail 解绑断言受 MIN_W=160 钳制（jsdom rect=0）不敏感，建议取值移出钳制区（clientX 300+）。overall 已 PASS，AC-003 active 清理已验证，不影响 AC 覆盖。登记 p050 |

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修|一句话|文件:行|
|t000_test_f002|minor|遗留|一句话|pNNN|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003 有 jsdom 行为测试（`tests/unit/dashboard_ui_interactions.test.ts`，6 用例），AC-004 全量 vitest 1908 通过 + tsc 干净；详见 `handoff.json` `ac_evidence`

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL（3 important + 1 minor，全部已修）
- Round 2 code：PASS
- Round 2 test：PASS（1 minor 遗留 → p050）

### 结果摘要

三处 dashboard UI 交互缺陷修复 + 清理测试补齐，round 2 全 PASS 收官。
