---
tid: "t177"
slug: "fix_protocol_runtime_validation"
title: "AgentCommandResult 运行时校验与 stop 语义"
status: "done"
branch: "t177_fix_protocol_runtime_validation"
worktree: ""
review_level: "full"
diff_anchor: "79e6f7075ec1e3509704c7b9cd39cf97e544faa5"
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

### Round 1 (2026-08-13 20:45 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t177_code_f001|important|已修|AC-002 恒真断言（AGENT_ERROR_CODES.toContain 冒充）→ 补 AC-002b：ok:false + 合法 error code 真实 POST → 200|tests/unit/result_runtime_validation.test.ts::AC-002b|
|t177_code_f002|minor|遗留|dispatcher success:false 分支 status:'idle' 谎报——真实 handler 恒 success:true（run_stop_step 吞错），分支不可达|p049|
|t177_code_f003|minor|已修|enqueue_command 固定 50ms sleep → 轮询取命令（防慢机 flaky）|tests/unit/result_runtime_validation.test.ts::enqueue_command|
|t177_test_f001|important|已修|stop 幂等测试补 success:false 判别（旧实现 throw NO_ACTIVE_CAPTURE 红）|tests/unit/agent_command_dispatcher.test.ts::t177 stop 失败|
|t177_test_f002|minor|已修|恒真断言改 AC-002b 行为验证|tests/unit/result_runtime_validation.test.ts::AC-002b|
|t177_test_f003|minor|已修|enqueue 轮询替代 sleep|tests/unit/result_runtime_validation.test.ts::enqueue_command|

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
- 证据：AC-001 四类畸形 result → 400 INVALID_QUERY + pending 未丢（同 command_id 合法 result 仍 200）；AC-002 合法 result/合法 error code 投递；AC-003 stop 幂等（空闲成功 capture_id null，NO_ACTIVE_CAPTURE 删除）；AC-004 测试

### Reviewer verdict

`full`：

- Round 1 code：FAIL（1 important + 2 minor）/ test：FAIL（1 important + 2 minor）
- Round 2 code：PASS / test：PASS

### 结果摘要

/extension/result 运行时校验落地（validate_result_body：plain object/command_id/ok boolean/合法 AgentErrorCode/ok:true 无 error/ok:false 必 error，失败 400 不 resolve）；AGENT_ERROR_CODES 值数组与类型 union 同步；stop 幂等（空闲态成功 + capture_id null，NO_ACTIVE_CAPTURE 契约删除，domain.md 同步）；登记 p049（stop success:false 分支不可达）。
