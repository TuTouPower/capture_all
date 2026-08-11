---
tid: "t103"
slug: "network_stop_deferred_timers"
title: "fix: stop 时清理 network deferred/orphan timer"
status: "done"
branch: "t103_network_stop_deferred_timers"
worktree: ""
review_level: "full"
diff_anchor: "bc6207db0c640c1465bcc7f7dea40f572d013e1d"
depends_on: ""
conflicts_with: ""
note: "review_20260811 P1-6"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor/preflight 通过。
- 根因：stop 未清 deferred/orphan timer，跨采集串写。
- 修复：stop 清 deferred timer + reverse index；getResponseBody 迟到回调用 capture_id 快照挡（Round 2 发现布尔挡 stop→restart 失效，改身份比较）。
- 全量 1215 通过，tsc 无错。

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

### Round 1 (2026-08-11 06:20 UTC+8)

code FAIL（f001 important orphan timer 未取消）；test PASS（AC-001/002 判别力实证）。

### Round 2 (2026-08-11 06:21 UTC+8)

code FAIL（f001 布尔挡 stop→restart 失效）；test FAIL（AC-002b 零判别力）。

### Round 3 (2026-08-11 06:22 UTC+8)

code PASS / test PASS。处置：

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t103_code_f001 | important | 已修 | getResponseBody 回调改 capture_id 快照比较，防 stop→restart 跨写 | network_capture.ts |
| t103_test_f001 | important | 已修 | AC-002b 武装 orphan handler + 推进 4s，突变验证判别力 | network_stop_deferred_timers.test.ts |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002 均有测试证据引用，见 `handoff.json` `ac_evidence`。

### Reviewer verdict

`full`：

- Round 1 code：FAIL → Round 2 code：FAIL → Round 3 code：PASS
- Round 1 test：PASS

### 结果摘要

- stop 清 deferred timer + reverse index；getResponseBody 迟到回调用 capture_id 快照挡 stop→restart 跨写；AC-002b 武装 handler 突变验证判别力。
