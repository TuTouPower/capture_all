---
tid: "t140"
slug: "agent_query_cursor_paging"
title: "perf: 大数据量路径资源预算与分页（agent 查询 + CDP body + 64MiB 结果）"
status: "done"
branch: "t140_agent_query_cursor_paging"
worktree: ""
review_level: "full"
diff_anchor: "7daf059d0b98bd82ca5ff1dfe0a43a18d512303f"
depends_on: ""
conflicts_with: ""
note: "intensive-review 合并：H-6 查询整载 O(n²) + H-7 64MiB 上限扩展侧缺失 + H-20 CDP body 总量无上限"
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

### Round 1 (2026-08-12 18:46 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t140_code_f001|critical|已修|Buffer.byteLength 在 MV3 SW 未定义，改 TextEncoder 估算|src/extension/background/agent_bridge_client.ts:327|
|t140_code_f002|critical|已修|body 字节预算 no-op（push_bounded 调用处 body 恒 null），改在 getResponseBody 回写处更新 body_bytes 并 enforce_body_budget 淘汰|src/bridge/cdp_handler.ts:79-90,369-380|
|t140_code_f003|minor|已修|send_result 超限分支与正常路径 fetch 重复，重构统一 payload|src/extension/background/agent_bridge_client.ts:321-351|

### Round 2 (2026-08-12 19:01 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t140_code_f004|minor|已修|too_large body 记账口径统一（增量用存储后长度 min(bytes, max_body_bytes)）|src/bridge/cdp_handler.ts:386-387|
|t140_code_f005|minor|已修|删死导出 _push_bounded_for_test（测试改用 enforce）|src/bridge/cdp_handler.ts:65|
|t140_test_f001|critical|已修|64MiB 测试改行为级（fetch spy 断言 POST body 为 PAYLOAD_TOO_LARGE）|tests/unit/t140_resource_budget.test.ts:AC-005|
|t140_test_f002|important|已修|补 cursor 分页行为测试（fake-indexeddb 跨页不丢不重 + 无 getAll）|tests/unit/t140_resource_budget.test.ts:AC-002/004|
|t140_test_f003|minor|遗留|body 预算生产记账链路集成测试未补（enforce 单测已覆盖核心淘汰）；登记 p034|p034|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001-004 cursor 分页（行为+无 getAll）、AC-005 64MiB 行为测试、AC-009/010 body 预算；见 handoff.json ac_evidence

### Reviewer verdict

`full`：

- Round 1 code：FAIL（Buffer MV3 + body 预算 no-op + 重复 fetch）
- Round 2 code：PASS
- Round 1 test：FAIL（64MiB 假绿 + cursor 零覆盖 + body 记账）
- Round 2 test：PASS（f003 minor 遗留 p034）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- agent 查询改 IDB cursor 直接分页（消除每页 O(n) 整载）；扩展侧 64MiB 结果预算（超限改写 PAYLOAD_TOO_LARGE）；bridge CDP body 总字节预算（getResponseBody 回写记账 + 超限淘汰）。f003 body 记账集成测试遗留 p034。
