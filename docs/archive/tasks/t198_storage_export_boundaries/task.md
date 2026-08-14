---
tid: "t198"
slug: "storage_export_boundaries"
title: "存储/导出边界校验与断言补全"
status: "done"
branch: "t198_storage_export_boundaries"
worktree: ""
review_level: "full"
diff_anchor: "87ad5a883819d82dfa48a8b7de7dba7f70941b18"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- AC-001：`list_captures` limit 归一化——`!Number.isFinite(limit)` → 全量（NaN/±Infinity 不静默空）、`Math.max(1, Math.floor(limit))`（负数/0 → 1、小数向下取整）。测试 4 用例（undefined/正整数、负数/0、小数、NaN）。
- AC-002：exporter 补 total_size_kb 断言——回灌内嵌 JSON 后 TextEncoder 字节数与展示值一致（fixture 含中文锁定字节语义）。
- AC-003：`convert_bridge_event_to_request` 加 export，3 用例（正常 1500、回拨 clamp 0、相等边界 0）。
- AC-004：storage_keyset 补 dom_data 路由断言——写 dom_data 事件后按类别与 store 名双查锚定 USER_ACTION_EVENTS。
- Review Round 1 两路 PASS、3 minor（AC-002 toBeGreaterThan(0) 脆弱、NaN 用例区分度、fixture 全 ASCII）；修前两项，第三项修不彻底（字节差 20B 不足）转遗留 p051。Round 2 两路 PASS。

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
| t198_code_f001 | minor | 已修 | AC-002 去掉 `toBeGreaterThan(0)`（依赖 mock ≥512B 脆弱），保留 `<span>${expected_kb} KB</span>` 一致性断言 |
| t198_code_f002 | minor | 已修 | NaN 用例造 2 条记录断言 length=2，区分「全量」与「clamp 到 1」 |
| t198_test_f001 | minor | 遗留 | fixture 加中文但字节差仅 20B，round 后仍同值，字符计数口径回归不红。登记 p051（有效修复需 >512B 字节差） |

### Round 2（review_level=full）

| finding_id | 严重度 | 处置 | 说明 |
|---|---|---|---|
| t198_test_f001 | minor | 遗留 | Round 2 test reviewer 复核「修不彻底」：中文 fixture 字节差 20B 不足，round 后同值。overall 已 PASS，登记 p051 |

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
- 证据：AC-001/003/004 行为测试（fake-indexeddb/转换单测），AC-002 exporter 回灌断言；AC-005 全量 vitest 1916 通过 + tsc 干净；详见 `handoff.json` `ac_evidence`

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS

### 结果摘要

存储/导出边界校验与断言补全，round 2 全 PASS 收官。

### 结果摘要

- 一句话；无额外说明可写「见上」
