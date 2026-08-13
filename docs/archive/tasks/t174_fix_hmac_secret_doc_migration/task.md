---
tid: "t174"
slug: "fix_hmac_secret_doc_migration"
title: "HMAC secret 泄露面修正与 spec 同步"
status: "done"
branch: "t174_fix_hmac_secret_doc_migration"
worktree: ""
review_level: "full"
diff_anchor: "8d3b5d53fbb67f9bf43e4f6ebe88d3c4d1af759c"
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

### Round 1 (2026-08-13 19:53 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t174_code_f001|important|已修|websocket_capture.ts:35 残留无条件宣称——注释补「普通页面」限定 + ADR-020 边界|src/extension/content/websocket_capture.ts:35|
|t174_code_f002|minor|已修|spec generate_secret 描述改 crypto.getRandomValues 32B hex（实际实现）|docs/specs/content_postmessage_nonce.md|
|t174_test_f001|important|已修|AC-004 补 websocket 通道扫描（三通道闭合）|tests/unit/hmac_secret_doc_migration.test.ts::AC-004a|
|t174_test_f002|minor|已修|AC-001 拒绝规则锚定补畸形/不匹配|tests/unit/hmac_secret_doc_migration.test.ts::AC-001|

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
- 证据：AC-001 spec combined 契约（nonce + per-start secret + per-message HMAC + canonical payload + 拒绝规则 + 威胁模型边界）；AC-002 注入注释残余风险（ADR-020 + executeScript 不采纳 s007/d009）；AC-003 三通道 + HMAC/nonce 测试回归；AC-004 三通道注释普通页面限定

### Reviewer verdict

`full`：

- Round 1 code：FAIL（1 important + 1 minor）/ test：FAIL（1 important + 1 minor）
- Round 2 code：PASS / test：PASS

### 结果摘要

HMAC secret 文档/注释迁移：content_postmessage_nonce.md 更新为 combined 契约（nonce + per-start secret + per-message HMAC，含 canonical payload、拒绝规则、生命周期、ADR-020 威胁模型边界）；三通道注入注释统一「普通页面限定 + 残余风险」，不再宣称可对抗观察注入过程的页面；executeScript func,args 迁移经 spike 评估不采纳（需 scripting 权限 + 页面级对抗仍可观察，s007/d009）。
