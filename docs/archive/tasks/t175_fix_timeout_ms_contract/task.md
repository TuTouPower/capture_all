---
tid: "t175"
slug: "fix_timeout_ms_contract"
title: "timeout_ms 契约统一"
status: "done"
branch: "t175_fix_timeout_ms_contract"
worktree: ""
review_level: "full"
diff_anchor: "b2e8a14495abd15835a10ac7b6917d63ac71ffe9"
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

### Round 1 (2026-08-13 20:04 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t175_code_f001|minor|已修|domain 超时表 start/stop 15s→120s（对齐 command_timeout_ms）|docs/blueprint/domain.md:138|
|t175_code_f002|minor|已修|client.ts 旧注释「固定 10s」→ 30s 可配置|src/mcp/client.ts:7|
|t175_code_f003|minor|已修|server.ts 注释/错误消息引用 MAX_COMMAND_TIMEOUT_MS（去字面 300000）|src/bridge/server.ts:987|
|t175_test_f001|minor|已修|删 AC-002a 冗余 spyOn(globalThis, 'AbortSignal') 死代码|tests/unit/timeout_ms_contract.test.ts:AC-002a|

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
- 证据：AC-001 Zod 300001 拒绝（max MAX_COMMAND_TIMEOUT_MS）；AC-002 get_status/list_browsers timeout_ms=1 → AbortSignal.timeout(1)；AC-003 默认值一致（client 30/120/300s = Bridge = domain 表 = 指南）；AC-004 schema→tool→client 参数链路测试

### Reviewer verdict

`full`：

- Round 1 code：PASS（3 minor）/ test：PASS（2 minor）

### 结果摘要

timeout_ms 契约统一：`MAX_COMMAND_TIMEOUT_MS=300000` 共享常量（MCP Zod max + Bridge 校验复用）；get_status/list_browsers 真正传 timeout_ms 至 client（默认 30s 对齐 domain 查询类）；domain 超时表统一（全量/导出 300s、普通命令 120s、start/stop 120s、上限行）；指南补 get_status 默认。send_command 超时逻辑未动。
