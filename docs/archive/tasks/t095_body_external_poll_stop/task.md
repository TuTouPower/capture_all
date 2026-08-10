---
tid: "t095"
slug: "body_external_poll_stop"
title: "fix: external body 轮询 stop 真正停止且不跨 capture 脏写"
status: "done"
branch: "t095_body_external_poll_stop"
worktree: ""
review_level: "full"
diff_anchor: "f746378110be78b04280a973076239d616eb125d"
depends_on: ""
conflicts_with: ""
note: "review_20260811 P0-4 verified"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor/preflight 通过。
- 根因：try_external_cdp_bridge 闭包有 stop() 置 poll_stopped，但 stop_body_capture* 只 clear 初始 timer 不调 stop()；递归 setTimeout 继续调度、in-flight 继续写。
- 修复：coordinator_state 加 stop_poll 闭包；stop_body_capture/with_cleanup 调 stop_poll；重入 start 前停旧 poll；poll_once 写事件前查 poll_stopped。
- TDD：mock external_cdp_bridge_client + network_capture，fake timers 驱动；3 红 → 修 → 4 绿（含 Round 1 后补的 cleanup 变体）。
- Round 1 审阅 4 条 minor：2 修 1 覆盖 1 遗留（p008）。
- 顺带修类型：poll_timer 类型改 ReturnType<typeof setTimeout>，去 as typeof coordinator_state 断言。
- Round 2 两路 PASS；全量 1172 通过，tsc 无错。

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

### Round 1 (2026-08-11 03:07 UTC+8)

两路审阅均 PASS，4 条 minor；2 条本 task 修复，1 条已覆盖，1 条遗留登记。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t095_code_f001 | minor | 已修 | 补 AC-001b cleanup 变体用例 | body_capture_external_poll_stop.test.ts |
| t095_code_f002 | minor | 已修 | 删类型断言，poll_timer 类型改 ReturnType<typeof setTimeout> | body_capture_coordinator.ts |
| t095_test_f001 | minor | 已修 | 同 code f001，AC-001b 已覆盖 cleanup 路径 | body_capture_external_poll_stop.test.ts |
| t095_test_f002 | minor | 遗留 | AC-003 in-flight 重入变体，共享机制已覆盖 | p008 |

### Round 2 (2026-08-11 03:08 UTC+8)

Round 1 三条已修 + 一条遗留；code + test 均 PASS。

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

- 一句话；无额外说明可写「见上」

- 一句话；无额外说明可写「见上」
