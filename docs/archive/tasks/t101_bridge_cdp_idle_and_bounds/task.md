---
tid: "t101"
slug: "bridge_cdp_idle_and_bounds"
title: "fix: Bridge CDP idle TTL、事件有界与 HTTP 超时"
status: "done"
branch: "t101_bridge_cdp_idle_and_bounds"
worktree: ""
review_level: "full"
diff_anchor: "146b0de9b400daa17ffd75a5a91dcbbb268a9620"
depends_on: ""
conflicts_with: ""
note: "review_20260811 P1-3 P1-4"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor/preflight 通过。
- 根因：CDP session 固定 5 分钟墙钟误杀长采集；events 无上限；detect/start 的 /json/list 与 WS 建立无超时。
- 修复：idle TTL（touch_session 活动刷新）、push_bounded 有界 + _eviction_count 指标、/json/list AbortController 超时、WS connect onopen/超时竞速。
- Round 1 code FAIL（WS 无超时）+ test FAIL（AC-002 假绿 250<5000）→ 修 + cap 注入。
- 既有 bridge_cdp_events / cdp_handler_redaction 测试适配 start onopen 时序。
- 全量 1210 通过，tsc 无错。

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

### Round 1 (2026-08-11 05:37 UTC+8)

code FAIL（f001 important WS 无超时 + f002/f003 minor）；test FAIL（f001 important AC-002 假绿）。

### Round 2 (2026-08-11 05:38 UTC+8)

code PASS / test PASS；新增 f004/f005/f002 minor。

### Round 3 (2026-08-11 05:39 UTC+8)

code PASS / test PASS；f004/f005/f002 修。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t101_code_f001 | important | 已修 | WS connect onopen/超时竞速，超时返回失败 | cdp_handler.ts |
| t101_code_f002 | minor | 已修 | _eviction_count 指标计数 | cdp_handler.ts |
| t101_code_f003 | minor | 已修 | _set_max_session_events_for_test 注入 cap | cdp_handler.ts |
| t101_code_f004 | minor | 已修 | 超时分支 close ws 防孤儿连接 | cdp_handler.ts |
| t101_code_f005 | minor | 已修 | ws_connect 三态区分 timeout/failed 文案 | cdp_handler.ts |
| t101_test_f001 | important | 已修 | AC-002 换 cap=10 触发真淘汰三重断言 | cdp_session_idle_bounds.test.ts |
| t101_test_f002 | minor | 已修 | 删残留 console.log | cdp_session_idle_bounds.test.ts |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003 均有测试证据引用，见 `handoff.json` `ac_evidence`。

### Reviewer verdict

`full`：

- Round 1 code：FAIL → Round 2 code：PASS → Round 3 code：PASS
- Round 1 test：FAIL → Round 2 test：PASS

### 结果摘要

- CDP session 固定墙钟改 idle TTL（活动刷新）；events 有界 + 淘汰指标；detect/start 的 /json/list 与 WS 建立加超时。3 轮审阅修 WS 无超时与 AC-002 假绿。
