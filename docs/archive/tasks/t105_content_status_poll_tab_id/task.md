---
tid: "t105"
slug: "content_status_poll_tab_id"
title: "fix: content status poll 使用本 tab id 不串台"
status: "done"
branch: "t105_content_status_poll_tab_id"
worktree: ""
review_level: "full"
diff_anchor: "287a251b6f01ed4b03daf156740134b5c6a618f0"
depends_on: ""
conflicts_with: ""
note: "review_20260811 P1-8"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor/preflight 通过。
- 根因：get_status 响应 tab_id 用 current_capture.tab_id（启动 active tab），多 tab 串台。
- 修复：handle_message 接收 sender，get_status tab_id 用 sender.tab.id 权威优先。
- Round 1 test FAIL（AC-001 场景未复现 + AC-002 未验证）→ 补真实采集场景 + 契约测试。
- 全量 1222 通过，tsc 无错。

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

### Round 1 (2026-08-11 06:53 UTC+8)

code PASS；test FAIL（f001 important AC-001 场景未复现 + f002 important AC-002 未验证）。

### Round 2 (2026-08-11 06:54 UTC+8)

code PASS / test PASS。处置：

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t105_test_f001 | important | 已修 | AC-001b 真实 start_capture（tab 7）+ sender.tab=5 断言，突变验证判别力 | status_poll_sender_tab.test.ts |
| t105_test_f002 | important | 已修 | AC-002 降为消息契约（content on_active 用 resp.tab_id 静态扫描） | status_poll_sender_tab.test.ts |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002 均有测试证据引用，见 `handoff.json` `ac_evidence`。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL → Round 2 test：PASS

### 结果摘要

- get_status 按 sender.tab.id 权威回填 tab_id，多 tab 串台根因消除；AC-001b 真实采集场景突变验证，AC-002 契约覆盖。
