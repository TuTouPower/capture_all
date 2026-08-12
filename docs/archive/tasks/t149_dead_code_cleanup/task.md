---
tid: "t149"
slug: "dead_code_cleanup"
title: "chore: 死代码与孤儿面清理"
status: "done"
branch: "t149_dead_code_cleanup"
worktree: ""
review_level: "single"
diff_anchor: "bd869b3f46b854cb99e3b1ebad51a6652531f781"
depends_on: ""
conflicts_with: ""
note: "intensive-review 聚合：B2-M7 network_context 死代码、B1-L1 prune_stale、B5-M2 devtools_panel 孤儿、B2-M17 FLUSH_BATCH_SIZE 死常量、B4-L5 go 死映射、B4-L6 死分支、B2-L2 双入口、B1-L2 resolve_target._write"
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

### Round 1 (2026-08-12 23:05 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t149_gen_f001|minor|已修|integration_page 测试注释更新（go 映射已删，go('integrations') 直接 set_page）+ 补 set_page 断言|integration_page.test.ts AC-3|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 8 项死代码删除/收敛 + rg 无残留、AC-002 测试按实际处理、AC-003 FLUSH_BATCH_SIZE 规范对齐；见 handoff.json ac_evidence

### Reviewer verdict

`single`：

- Round 1 general：PASS（1 minor 已修）
- Round 2 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 8 处死代码/孤儿面清理：删 network_context.ts、devtools_panel.ts/html、prune_stale no-op、FLUSH_BATCH_SIZE 死常量（+domain.md 对齐）、go 死映射、设置死分支；SW 双入口收敛、resolve_target._write 删参。
