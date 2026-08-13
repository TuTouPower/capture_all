---
tid: "t176"
slug: "fix_output_path_contract"
title: "output_path 契约与首次目录 500 修复"
status: "done"
branch: "t176_fix_output_path_contract"
worktree: ""
review_level: "full"
diff_anchor: "9b9df37746fa4cd3279a1db8c9cb27330e5d348f"
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

### Round 1 (2026-08-13 20:15 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t176_code_f001|minor|已修|schema refine 补 Windows 根相对（\foo）与 drive-relative（C:foo）拒绝|src/mcp/schemas.ts:16|
|t176_test_f001|important|已修|AC-003 补断言：嵌套父目录被创建（stat isDirectory），旧实现不创建会红|tests/unit/output_path_contract.test.ts:AC-003|

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
- 证据：AC-001 指南相对路径示例；AC-002 base 不存在创建成功；AC-003 嵌套父目录创建 + 再校验；AC-004 绝对/../symlink/schema 拒绝不退化；AC-005 四类测试

### Reviewer verdict

`full`：

- Round 1 code：PASS（1 minor）/ test：FAIL（1 important）
- Round 2 code：PASS / test：PASS

### 结果摘要

output_path 契约落地：`safe_output_path` mkdir(base) 前置（解决 ENOENT→500）+ 嵌套父目录创建后 realpath 再校验（symlink 逃逸窗口闭合）；MCP schema 相对路径校验（禁绝对/../Windows 根相对/drive-relative）；指南契约更新（相对路径示例 + file_path 绝对解释）。t137 防护不退化。
