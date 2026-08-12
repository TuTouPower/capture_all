---
tid: "t130"
slug: "keyboard_password_guard"
title: "fix: keyboard 采集对 password 输入框置空击键"
status: "done"
branch: "t130_keyboard_password_guard"
worktree: ""
review_level: "full"
diff_anchor: "4cf960b1918f8eb0dc5572dc692c41fb2fdccd19"
depends_on: ""
conflicts_with: ""
note: "review H-4 (B3-H1): keyboard_capture 无 password 守卫，redact_data=false 时明文密码击键入库"
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

### Round 1 (2026-08-12 13:33 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t130_code_f001|important|已修|shadow DOM 场景改用 event.composedPath() 判明实际目标，补 shadow 测试；等待 code reviewer 复核|src/extension/content/keyboard_capture.ts:60-65|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002 password 击键不采集（keydown/keyup + shadow DOM 场景），AC-003 非密码框行为不变；见 handoff.json ac_evidence

### Reviewer verdict

`full`：

- Round 1 code：FAIL（f001 shadow DOM 明文泄漏，已修）
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- keyboard_capture 增加 password 输入框守卫（composedPath 判明 shadow DOM 实际目标），password 击键值永不采集，不受 redact_data 影响；10 用例全绿。
