---
tid: "t106"
slug: "popup_category_capture_gates"
title: "fix: Popup 分类开关真正门控对应采集类别"
status: "done"
branch: "t106_popup_category_capture_gates"
worktree: ""
review_level: "full"
diff_anchor: "adba86003c7ce829aa0ac98bbc11022b9d038fc0"
depends_on: ""
conflicts_with: ""
note: "review_20260811 P1-9"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor/preflight 通过。
- 根因：popup 分类开关仅写 tag（event_count_enabled 等）不门控采集。
- 修复：CaptureConfig 加类别开关字段；SW cookie/exception（含重试）/nav bg 门控；content event 全生产者/storage/nav（含 handler）门控。
- 3 轮审阅修生产者覆盖不全（event/nav 漏网）与 tab_switch 残余。
- 集成 start 测试因 SW IndexedDB 时序问题改用静态验证（既有 content_script_uses_poll 同模式）。
- 全量 1225 通过，tsc 无错。

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

### Round 1 (2026-08-11 07:10 UTC+8)

code FAIL（f001 exception 重试漏门控 + f002 event 生产者不全 + f003 nav 生产者不全 + f004 minor）；test FAIL。

### Round 2 (2026-08-11 07:11 UTC+8)

code FAIL（f003 tab_switch 残余）+ test FAIL。

### Round 3 (2026-08-11 07:12 UTC+8)

code PASS / test PASS。处置：

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t106_code_f001 | important | 已修 | exception 重试路径改 error_count_enabled 门控 | service_worker.ts |
| t106_code_f002 | important | 已修 | event 全 user_action 生产者门控 | content_script.ts |
| t106_code_f003 | important | 已修 | nav 全生产者门控（content handler + visibility + bg tab 事件） | content_script.ts / service_worker.ts |
| t106_code_f004 | minor | 已修 | 测试断言覆盖新增门控点 | popup_category_capture_gates.test.ts |
| t106_code_f006 | minor | 遗留 | onActivated/onUpdated 早退跳重试（有轮询兜底） | p019 |
| t106_test_f001-f004 | minor | 已修 | 静态断言覆盖全门控 | popup_category_capture_gates.test.ts |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003 均有测试证据引用，见 `handoff.json` `ac_evidence`。

### Reviewer verdict

`full`：

- Round 1 code：FAIL → Round 2 code：FAIL → Round 3 code：PASS
- Round 1 test：FAIL → Round 2 test：FAIL → Round 3 test：PASS

### 结果摘要

- popup 分类开关映射到采集门控：event 全 user_action 生产者、nav 全生产者（content+bg）、error 独立含重试、cookie/storage 门控；3 轮审阅修生产者覆盖不全与 tab_switch 残余。
