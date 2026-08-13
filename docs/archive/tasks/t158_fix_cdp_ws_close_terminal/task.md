---
tid: "t158"
slug: "fix_cdp_ws_close_terminal"
title: "CDP WebSocket 关闭后终态化 session"
status: "done"
branch: "t158_fix_cdp_ws_close_terminal"
worktree: ""
review_level: "full"
diff_anchor: "4b5716a652ffcaee6a00a94fcceea5db909b4750"
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

### Round 1 (2026-08-13 14:34 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t158_code_f001|important|已修|terminal session 泄漏：terminate_session 设 terminal TTL（5 分钟）自动 destroy 兜底；coordinator terminal 分支主动调 stop_external_cdp|src/bridge/cdp_handler.ts:117; src/extension/background/body_capture_coordinator.ts:278|
|t158_code_f002|minor|已修|coordinator 非 terminal 失败 warn 加 10s 节流（与 client 侧同口径）|src/extension/background/body_capture_coordinator.ts:300|
|t158_code_f003|minor|已修|terminal 保留 evicted_events 不清空，410 合并返回（不静默消失）|src/bridge/cdp_handler.ts:410 分支|
|t158_test_f001|important|已修|client 网络错误回归补测试：fetch reject → 上抛（AC-003d）|tests/unit/cdp_client_terminal_error.test.ts:61|
|t158_test_f002|minor|已修|补 401 鉴权失败 case（AC-003c）|tests/unit/cdp_client_terminal_error.test.ts:53|
|t158_test_f003|minor|已修|AC-005 断言 socket.close 调用 + terminal TTL 自动回收（advance 5min → 404）|tests/unit/cdp_ws_close_terminal.test.ts:88|

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
- 证据：AC-001/002/005 由 `cdp_ws_close_terminal.test.ts`（MockWebSocket：410 + error.code、pending→cdp_failed 可观察、WS/timer/映射清理 + TTL 回收）；AC-003 由 `cdp_client_terminal_error.test.ts`（410/404/401/网络错误分类）；AC-004 由 `body_capture_terminal_fallback.test.ts`（停 poll + 状态 failed + stop_external_cdp 释放 + 非 terminal 重试不回归）

### Reviewer verdict

`full`：

- Round 1 code：FAIL（1 important + 2 minor）
- Round 1 test：FAIL（1 important + 2 minor）
- Round 2 code：PASS
- Round 2 test：PASS

### 结果摘要

CDP WS post-open close 不再静默：建连后安装运行态 onclose 终态化 pending（cdp_failed）+ terminal TTL 自动回收；/cdp/events 410 + 结构化错误（d007）；client 404/410/网络错误抛分类错误不再降空数组；coordinator terminal 停 poll + 状态 failed + 主动释放 session，非 terminal 维持重试。
