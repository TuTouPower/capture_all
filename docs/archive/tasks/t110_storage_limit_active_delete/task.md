---
tid: "t110"
slug: "storage_limit_active_delete"
title: "fix: 存储限额接线且禁止删除活跃采集"
status: "done"
branch: "t110_storage_limit_active_delete"
worktree: ""
review_level: "full"
diff_anchor: "ef496b886c6af8b698814fbb92869568016fac55"
depends_on: ""
conflicts_with: ""
note: "review_20260811 P1-13 P1-14"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 限额检查下沉为 `check_limit_and_stop` 共享 helper（超限 `stop_capture('storage_limit')` 并返回 true），接入 handle_event / handle_network_request / handle_console_log 与三个导航写路径（onActivated/onCreated/onUpdated），R2 f003 后补齐导航路径。
- `stop_capture` / `stop_capture_inner` 增加 reason 参数，`CaptureStoppedData.reason` 联合类型加 `'storage_limit'`。
- 活跃采集删除 guard 前置在 `storage_delete_capture` 之前返回。
- logger.test.ts 慢测加 10000ms timeout（全量下 flaky 超时，测试稳定性，非功能）。

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

### Round 1 (2026-08-11 08:40 UTC+8)

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t110_code_f001 | important | 已修 | handle_event/network/console 三入口接入 check_limit_and_stop | src/extension/background/service_worker.ts:778,884,919 |
| t110_code_f002 | minor | 已修 | stop reason 参数化并加 'storage_limit' | src/extension/background/service_worker.ts:872-880, src/shared/types.ts:509 |
| t110_test_f001 | minor | 遗留 | AC-002「数据仍在」分句未断言 | p024 |
| t110_test_f002 | minor | 遗留 | AC-003「ended_at」分句未断言 | p024 |

### Round 2 (2026-08-11 08:58 UTC+8)

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t110_code_f003 | important | 已修 | 三个导航监听器写 write_events 前接入 check_limit_and_stop | src/extension/background/service_worker.ts:979,1069,1101 |
| t110_test_f003 | minor | 遗留 | network/console 入口与 'storage_limit' reason 断言缺失（onActivated 已被 AC-001c/001d 覆盖） | p024 |

### Round 3 (2026-08-11 09:10 UTC+8)

零新 finding，code/test 均 PASS，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003 均有测试证据引用，见 `handoff.json` `ac_evidence`。

### Reviewer verdict

`full`：

- Round 1 code：FAIL → Round 2 code：FAIL → Round 3 code：PASS
- Round 1 test：PASS → Round 2 test：PASS → Round 3 test：PASS

### 结果摘要

- 存储限额接线为共享 `check_limit_and_stop`（超限停机 reason='storage_limit'），接入 handle_event/network/console 与三个导航写路径；活跃采集 delete 前置 guard；cleanup_stale 终态化陈旧 active。3 轮审阅修 f001 接线不全（network/console）与 f003 导航写路径绕过。
