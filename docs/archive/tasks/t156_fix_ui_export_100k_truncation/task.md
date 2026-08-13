---
tid: "t156"
slug: "fix_ui_export_100k_truncation"
title: "修复 UI 与 ZIP 导出 100000 条静默截断"
status: "done"
branch: "t156_fix_ui_export_100k_truncation"
worktree: ""
review_level: "full"
diff_anchor: "4f6368f8d12565cf352fd5692f4626b72f939d5b"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-13 13:44 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t156_code_f001|minor|已修|fetch_all_records 补 fetcher 隐式契约注释（单批≤limit、offset 单调不重不漏）|src/extension/shared/paged_reader.ts:11|
|t156_test_f001|minor|已修|补 fetcher reject 传播测试，防共享 helper 吞错回归|tests/unit/paged_reader.test.ts:56|
|t156_test_f002|minor|已修|AC-005 断言改为不锁返回结构形状，仅断言全量返回无静默截断|tests/unit/capture_data_reader.test.ts:127|

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t000_code_f001|critical/important/minor|已修|一句话|文件:行|
|t000_test_f002|minor|遗留|一句话|pNNN|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/005 由 `capture_data_reader.test.ts` + `paged_reader.test.ts`（100001 条分页 fixture 全量返回、offset 序列 `[0,5000,...,100000]`、limit 恒 5000）；AC-003/004 由 `capture_archive_count.test.ts`（build_archive manifest counts.events=100001、merge_detail_events 条数=统计值，均 >100000）

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 复核（minor 处置后）：code PASS / test PASS（维持）

### 结果摘要

统一全量分页 helper（`src/extension/shared/paged_reader.ts`）落地，`read_capture_snapshot` 弃固定 100000 截断改分页耗尽，exporter/agent_data_queries 收敛共享实现；ZIP 与详情不再入口相关截断。遗留 export_app_logs 固定 100000 疑点登记 p045。
