---
tid: "t136"
slug: "ws_frame_relative_time"
title: "fix: ws_frame 相对时间改用真实时间基准"
status: "done"
branch: "t136_ws_frame_relative_time"
worktree: ""
review_level: "full"
diff_anchor: "730b003a26736c230e597554054dff582ba13eb2"
depends_on: ""
conflicts_with: ""
note: "review H-11 (B2-H6): CDP MonotonicTime 秒×1000 减 epoch 起点产出 -1.7e12 负数"
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

### Round 1 (2026-08-12 15:53 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t136_code_f001|important|已修|_ws_frame_relative_time_for_test 改真实符号复用（生产 send_ws_frame 调用 ws_frame_relative_time helper），非平行副本|src/extension/background/network_capture.ts:296-306,348|
|t136_test_f001|important|已修|同上——测试钩子现复用真实函数|tests/unit/t136_ws_frame_relative_time.test.ts|
|t136_test_f002|important|已修|补 AC-003 timeline 负值查询测试（不崩溃、排序正常）|tests/unit/t136_ws_frame_relative_time.test.ts:AC-003|
|t136_test_f003|minor|已修|AC-002 断言补 ws_frame_relative_time 调用（拦 params.timestamp 拼接回归）|tests/unit/t136_ws_frame_relative_time.test.ts:AC-002|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002 相对时间 now-start 语义 + 生产 helper 调用、AC-003 timeline 负值不崩溃；见 handoff.json ac_evidence

### Reviewer verdict

`full`：

- Round 1 code：FAIL（测试钩子平行副本，已改真实复用）
- Round 2 code：PASS
- Round 1 test：FAIL（同 + AC-003 缺测）
- Round 2 test：PASS（f003 残留顺手修）
- Round 3 test：PASS（指纹同步 + f004 正则加固）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- ws_frame 相对时间从 CDP MonotonicTime 秒×1000 减 epoch 起点（巨型负数）改为统一 Date.now() - start_time 基准；真实函数复用 + timeline 负值容错测试。
