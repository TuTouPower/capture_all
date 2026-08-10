---
tid: "t093"
slug: "exception_error_event_sink"
title: "fix: runtime exception 写入 error store 而非 console sink"
status: "done"
branch: "t093_exception_error_event_sink"
worktree: ""
review_level: "full"
diff_anchor: "08fe3b7e781b6d749571f283eda61b3c7d62d548"
depends_on: ""
conflicts_with: ""
note: "review_20260811 P0-2 verified"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor/preflight 通过（preflight=PASS）。
- 根因：`exception_capture` 把 RuntimeExceptionData 展开顶层（无 event.data），`start_exception_capture` 的 sender 是 `handle_console_log`（要求 event.data 非空）→ 异常全丢。
- 修复：sender 改为 `handle_event`（统一入口，按 category 'error' 路由 ERROR_EVENTS）。
- TDD：先写 `tests/unit/service_worker_exception_sink.test.ts`（驱动真实 start_capture + CDP 事件 + IndexedDB），start 需 mock storage.onChanged/cookies.onChanged/tabs.sendMessage 后成功；红（ERROR_EVENTS 0 条）→ 修 → 绿。
- 全量 1165 通过，tsc 无错。
- 审阅：code/test 两路 Round 1 均 PASS；3 条 minor 处置为遗留，登记 p003/p004/p005。
- 附带修复：test 报告的 `reviewed_scope` 行带 `- ` 前缀导致 `check_review_status` 判 stale，去掉后 scope=ok。

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

### Round 1 (2026-08-11 02:26 UTC+8)

两路审阅均 PASS（code + test），3 条 minor，逐条处置。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t093_code_f001 | minor | 遗留 | AC-002 断言恒真判别力弱，可改断言 CONSOLE_EVENTS 为空数组 | p003 |
| t093_code_f002 | minor | 遗留 | 测试访问未声明字段，运行时存在仅类型不安全 | p004 |
| t093_test_f001 | minor | 遗留 | debugger mock 未 beforeEach 复位，跨用例泄漏风险 | p005 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003 均有测试证据引用，见 `handoff.json` `ac_evidence`。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

- exception sender 改走统一 handle_event，runtime_exception 落 ERROR_EVENTS；集成测试驱动真实 start_capture + CDP 事件 + IndexedDB 验证三条 AC。
