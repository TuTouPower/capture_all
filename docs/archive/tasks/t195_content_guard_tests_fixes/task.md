---
tid: "t195"
slug: "content_guard_tests_fixes"
title: "content 采集守卫行为测试与缺陷修复"
status: "done"
branch: "t195_content_guard_tests_fixes"
worktree: ""
review_level: "full"
diff_anchor: "d27f39080c667c03a863c7886d83e8b4424d80e7"
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

## Round 1 处置

| finding_id | severity | verdict | status | 处置说明 |
| --- | --- | --- | --- | --- |
| t195_code_f001 | minor | 待处置 | 已修 | generation 守卫恒真用例删除（行为由 capture_state.test.ts 承载）+ 该文件补「新 start 后旧 gen 失活」行为用例（守卫核心） |
| t195_code_f002 | minor | 待处置 | 已修 | read_clipboard_text null 边界（clipboardData 不可读环境退化双报）注释记录 |
| t195_code_f003 | minor | 待处置 | 已修 | readText 先读后 emit 的代价（读取抛错不再报 read）注释记录 |
| t195_test_f001 | important | 需处置 | 已修 | 同 code f001——恒真断言删除，capture_state 补旧 gen 失活行为用例 |
| t195_test_f002 | minor | 建议 | 已修 | B3-M8 断言锚定 sendResponse(unknown_action_response()) |
| t195_test_f003 | minor | 建议 | 已修 | clipboard read 路径去重行为测试（paste 同内容 + readText 不双报） |
| t195_test_f004 | minor | 建议 | 已修 | AC-001 保险丝正则改 `var SIGNAL = '${SIGNAL}'`（旧内联独特标志，模板展开后无） |

## Round 2 处置

| finding_id | severity | verdict | status | 处置说明 |
| --- | --- | --- | --- | --- |
| t195_test_f005 | minor | 待处置 | 已修 | 残留未使用 import is_active_generation 删除；capture_state.test.ts 末尾补换行 |

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
- 结果：全部满足 / 未满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）；此处写一句话摘要，不复制 AC 正文

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：PASS / FAIL

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 一句话；无额外说明可写「见上」
