---
tid: "t094"
slug: "network_capture_session_key"
title: "fix: 生产 network_capture 使用 session 复合键与子目标 sessionId"
status: "done"
branch: "t094_network_capture_session_key"
worktree: ""
review_level: "full"
diff_anchor: "e34b074aca5823e4b0079666ea26f0a71ebfc142"
depends_on: ""
conflicts_with: ""
note: "review_20260811 P0-3 verified"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor/preflight 通过。
- 根因：production network_capture 用裸 requestId 作 Map/Set 键；子目标 getResponseBody/streamResourceContent 只传 {tabId} 不带 sessionId。
- 修复：复用 cdp_handler.cdp_request_key；CdpRequestMeta 加 session_id；内部键全改复合键；body 命令 target 带 sessionId；schedule_orphan_check 签名加 req_id。
- 既有测试 network_cdp.test.ts 键断言更新为 root: 前缀（本 task 契约变更）。
- Round 1 审阅 FAIL 捕获两处遗漏：send_ws_frame 裸 req_id 查询 ws_connections（important，url 丢失）、AC-002 空循环恒真断言（important，假绿）。均修复。
- 登记 pre-existing 观察：cdp_primary_emitted 死代码（p006）、finished_before_stream 泄漏（p007）。
- Round 2 两路 PASS；全量 1168 通过，tsc 无错。

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

### Round 1 (2026-08-11 02:46 UTC+8)

两路审阅各发现 1-2 条 important/minor，均修复后 Round 2 PASS。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t094_code_f001 | important | 已修 | send_ws_frame 改 req_key 查询，调用点传 req_key | network_capture.ts:304,697,701 |
| t094_test_f001 | important | 已修 | AC-002 补 stream/body 命令存在性断言 | network_capture_session_key.test.ts:181-183 |
| t094_test_f002 | minor | 已修 | AC-003 配置 getResponseBody 响应并断言真实 body | network_capture_session_key.test.ts:196-208 |

### Round 2 (2026-08-11 02:47 UTC+8)

Round 1 三条 finding 全部已修；code + test 均 PASS。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003 均有测试证据引用，见 `handoff.json` `ac_evidence`。

### Reviewer verdict

`full`：

- Round 1 code：FAIL → Round 2 code：PASS
- Round 1 test：FAIL → Round 2 test：PASS

### 结果摘要

- 生产 network_capture 内部 Map/Set 改用 session 复合键，子目标 CDP body 命令带 sessionId；Round 1 审阅发现 send_ws_frame 遗漏（ws_frame url 丢失）与测试假绿断言，均修复后 Round 2 PASS。
