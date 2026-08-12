---
tid: "t133"
slug: "html_export_embed_escape"
title: "fix: HTML 导出 JSON 嵌入转义含撇号/控制符并补回灌测试"
status: "done"
branch: "t133_html_export_embed_escape"
worktree: ""
review_level: "full"
diff_anchor: "d5421189251ad6a703c4d478d84d0e9a2618428b"
depends_on: ""
conflicts_with: ""
note: "review C1 (B2-C1): escape_for_html_embed 漏 ' 与 n，JSON.parse 嵌入被击穿；exporter.test 只断言 toContain 不回灌"
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

### Round 1 (2026-08-12 14:20 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t133_code_f001|minor|已修|删除对 JSON.stringify 输入恒 no-op 的控制符替换，注释改为准确归因（反斜杠翻倍 + 单引号 + U+2028/29）|src/shared/escape.ts:3-20|
|t133_test_f001|important|已修|extract_embedded_json 改用 new Function 走真实 JS 字面量解码，pre-fix 缺陷（' / \n 未转义）抛 SyntaxError 捕获回归|tests/unit/exporter.test.ts:185-191|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003 回灌验证（单引号/换行/</script> 注入均可 parse），AC-004 用 new Function 真实字面量解码；见 handoff.json ac_evidence

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL（f001 回灌解码假绿，已修）
- Round 2 code：PASS
- Round 2 test：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- escape_for_html_embed 补反斜杠/单引号/U+2028-29 转义，HTML 导出内嵌 JSON 不再被撇号/换行击穿；回灌测试改走真实 JS 字面量解码消除假绿。
