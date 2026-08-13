---
tid: "t170"
slug: "fix_cdp_ws_url_allowlist"
title: "CDP WebSocket URL 限制到请求 loopback 端口"
status: "done"
branch: "t170_fix_cdp_ws_url_allowlist"
worktree: ""
review_level: "full"
diff_anchor: "053eb1d8a9f9755b2f1fef827c3857ca2c9e4cf3"
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

### Round 1 (2026-08-13 18:45 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t170_code_f001|minor|已修|端口校验严格化：port 空（默认 80）也拒绝（须等于请求 port）|src/bridge/cdp_handler.ts:639|
|t170_test_f001|important|已修|AC-001b 改非标准路径 fixture + 断言构造为 127.0.0.1 标准 URL（判别「构造 vs 信任 discovery」）|tests/unit/cdp_ws_url_allowlist.test.ts:69|
|t170_test_f002|minor|已修|补 fragment 拒绝测试（AC-003d）+ 默认端口拒绝（AC-003e）|tests/unit/cdp_ws_url_allowlist.test.ts:143|

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
- 证据：AC-001/001b 放行 + 构造 URL 断言（判别不信任 discovery）；AC-002 远端 host 拒绝；AC-003a/b/c/d/e 不同端口/wss/userinfo/fragment/默认端口拒绝；AC-004 畸形 URL/空 id 拒绝

### Reviewer verdict

`full`：

- Round 1 code：PASS（1 minor）/ test：FAIL（1 important + 1 minor）
- Round 2 code：PASS / test：PASS

### 结果摘要

CDP WebSocket URL allowlist 落地：`safe_cdp_ws_url` 校验 ws: + loopback host + 端口等于请求 port + 拒 credentials/fragment/畸形 URL，校验后用 target ID 自行构造 `ws://127.0.0.1:{port}/devtools/page/{id}`（不信任 discovery authority）；拒绝路径 400 `cdp_invalid_ws_url` 不建 session/WS。architecture.md 记录契约。
