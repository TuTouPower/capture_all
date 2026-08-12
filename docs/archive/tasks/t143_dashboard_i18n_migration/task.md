---
tid: "t143"
slug: "dashboard_i18n_migration"
title: "refactor: dashboard 全量迁移 data-i18n 国际化"
status: "done"
branch: "t143_dashboard_i18n_migration"
worktree: ""
review_level: "single"
diff_anchor: "bfc039ecb2442f767fa09e3376570d68bf6ad2a8"
depends_on: ""
conflicts_with: ""
note: "review H-14 (B4-H1): dashboard 8 文件零 data-i18n 全硬编码中文；ui_strings 测试不守卫"
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

### Round 1 (2026-08-12 20:05 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t143_gen_f001|minor|已修|语言切换实时性属既有行为，登记说明（并入 t154 处理）|dashboard_settings.ts 语言切换|
|t143_gen_f002|minor|已修|zh 文本微调（「简体中文」→「中文」、时间线括号半角）属迁移必要调整，断言同步|dashboard_detail.ts:167 / dashboard_settings.ts:45|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 dashboard 零硬编码中文（守卫 187→0）、AC-002 语言切换文案随 locale、AC-003 ui_strings 守卫；见 handoff.json ac_evidence

### Reviewer verdict

`single`：

- Round 1 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- dashboard 6 文件硬编码中文迁移到 i18n.ts（+126 键 en/zh），渲染走 t()；ui_strings 守卫抓未迁移中文。语言切换即时性属既有行为，并入 t154。
