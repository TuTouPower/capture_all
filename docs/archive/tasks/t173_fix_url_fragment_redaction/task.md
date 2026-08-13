---
tid: "t173"
slug: "fix_url_fragment_redaction"
title: "URL fragment 脱敏"
status: "done"
branch: "t173_fix_url_fragment_redaction"
worktree: ""
review_level: "full"
diff_anchor: "0a5442480a4d64aed8e4e70d1e55e01c4f6043dd"
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

### Round 1 (2026-08-13 19:38 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t173_code_f001|minor|已修|fail-closed 判定细化：route 仅「值泄漏形」（/token/SECRET）触发整体替换，普通路由名 /oauth/token 保形|src/shared/redaction.ts::route_has_credential_value|
|t173_code_f002|minor|已修|redact_url 圈复杂度——抽 redact_relative_url 私有函数|src/shared/redaction.ts:185|
|t173_test_f001|critical|已修|AC-004 未触达 fail-closed——改真实输入（#/token/SECRET?state=x、编码 decode 失败）断言整体 #[REDACTED]；新增 AC-004c 路由名保形|tests/unit/url_fragment_redaction.test.ts::AC-004a/b/c|
|t173_test_f002|minor|已修|AC-003c 补 url_status + 全串相等断言|tests/unit/url_fragment_redaction.test.ts::AC-003c|
|t173_test_f003|minor|已修|AC-005a 补 [REDACTED] 出现断言|tests/unit/url_fragment_redaction.test.ts::AC-005a|

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
- 证据：AC-001 OAuth implicit #access_token 脱敏；AC-002 #/route?token 脱敏；AC-003 普通锚点/无敏感 hash route 保形；AC-004 值泄漏形 fail-closed（整体 #[REDACTED]）+ 路由名保形；AC-005 encoded hash/组合/相对 URL

### Reviewer verdict

`full`：

- Round 1 code：PASS（2 minor）/ test：FAIL（1 critical + 2 minor）
- Round 2 code：FAIL（f003 important 新发现）/ test：PASS
- Round 3 code：PASS / test：PASS

### 结果摘要

URL fragment 结构感知脱敏：hash 可解析为 key=value/`#/route?query` 时按 query 敏感 key 规则脱敏（redact_query_string 复用）；普通锚点与无敏感 hash route 保形；route 值泄漏形（/token/SECRET、/access_token/abc 等）与编码 decode 失败 fail-closed 整体替换；encoded hash（%3D/%3F）解码递归。privacy_redaction.md 语义更新。
