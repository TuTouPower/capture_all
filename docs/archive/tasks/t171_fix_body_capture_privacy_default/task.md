---
tid: "t171"
slug: "fix_body_capture_privacy_default"
title: "body 采集默认值隐私化与脱敏边界"
status: "done"
branch: "t171_fix_body_capture_privacy_default"
worktree: ""
review_level: "full"
diff_anchor: "9d9a0f34ff67782abc55377e9648bdea051d8916"
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

### Round 1 (2026-08-13 19:02 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t171_code_f001|important|已修|response_preview 未脱敏（原始 body 前缀明文）——落库前同样 redact_body|src/extension/background/service_worker.ts:1088|
|t171_code_f002|important|已修|preview 阈值误用 max_body_capture_bytes（100MB 含完整原文）——改 inline_text_max_bytes；preview_summary 改长度-only（无 preview 字段）|src/extension/background/service_worker.ts:1084; src/shared/body_redaction.ts:31|
|t171_code_f003|important|已修|multipart file part（filename）未跳过——任何 filename 均降级|src/shared/body_redaction.ts:is_sensitive_multipart|
|t171_code_f004|minor|已修|is_sensitive_key 词边界匹配（不误伤 author/tokenizer）|src/shared/body_redaction.ts:19|
|t171_code_f005|minor|已修|解析失败改长度摘要（[body_redacted:len=N]，无静态 [REDACTED]）|src/shared/body_redaction.ts:43,62|
|t171_code_f006|minor|已修|PRIVACY.md 同步 body 默认关 + MIME 脱敏边界|PRIVACY.md:19,27|
|t171_test_f001|important|已修|PRIVACY.md 同步 + public_docs 补 PRIVACY 断言|tests/unit/public_docs.test.ts:145|
|t171_test_f002|important|已修|preview 恒真断言修复——断言不含 preview=/binary/secret-token 子串|tests/unit/body_redaction.test.ts:55|
|t171_test_f003|minor|遗留|handle_network_request 接入无集成测试——单测覆盖算法 + 接入点 12 行无分支胶水，建议后续补集成|p048|

### Round 2 (2026-08-13 19:03 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t171_code_f007|minor|已修|README/body_redaction 头注释改「长度摘要」（长度-only 实现）|README.md; src/shared/body_redaction.ts:1|
|t171_code_f008|minor|已修|is_sensitive_key 加数字后缀匹配（password2 类确认字段），`\\d` 防 JS 转义吞反斜杠|src/shared/body_redaction.ts:29|

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
- 证据：AC-001 默认 false（常量 + UI/MCP opt-in）；AC-002 body_redaction form-urlencoded/JSON 敏感 key 脱敏；AC-003 不可解析降级长度摘要；AC-004 导出独立剥离 request/response body/preview；AC-005 README/PRIVACY 同步

### Reviewer verdict

`full`：

- Round 1 code：FAIL（3 important + 3 minor）/ test：FAIL（2 important + 1 minor）
- Round 2 code：PASS（f007/f008 minor 新发现）/ test：PASS
- Round 3 code：PASS（f008 确认 + f007 注释残留定位）

### 结果摘要

Body 采集隐私默认落地：capture_request_body/response_body 默认 false（UI/MCP 显式 opt-in）；redact_data 时 `redact_body` 在 handle_network_request 落库前按 MIME 敏感 key 脱敏（form-urlencoded/JSON 词边界匹配 password/token/api_key 等，含数字后缀；multipart file part 与不可解析二进制降级长度摘要，不落盘完整原文；response_preview 同步脱敏）；导出新增 include_request_body/include_preview 独立剥离；README/PRIVACY 文档同步。decisions 024。
