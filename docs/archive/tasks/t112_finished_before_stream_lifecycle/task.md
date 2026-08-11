---
tid: "t112"
slug: "finished_before_stream_lifecycle"
title: "修复 finished_before_stream 生命周期泄漏"
status: "done"
branch: "t112_finished_before_stream_lifecycle"
worktree: ""
review_level: "full"
diff_anchor: "a424a8adaf63a5ca288f75ff5a72bb1ec9d65f6f"
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

### Round 1 (2026-08-11 11:42 UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t112_code_f001 | important | 已修 | orphan 回调早退路径提前清理 marker（network_capture.ts:832 / cdp_handler.ts:849），事件被 handle_completed 消费后 3s 兜底仍清理 | 源码:network_capture.ts |
| t112_code_f002 | minor | 已修 | responseReceived 流式分支补 config.capture_response_body guard，注释与实际一致 | 源码:network_capture.ts:501 |
| t112_code_f003 | minor | 已修 | 复制实现双点维护为 spec 明确允许选项；修复已同步两处并各自补断言，消除重复留作后续 | spec 允许选项 |
| t112_test_f001 | important | 已修 | AC-004 测试补 register_session，子 session 事件确被路由（body 命令 100/50 断言） | 测试:t112 测试文件 |
| t112_test_f002 | important | 已修 | 新增 cdp_handler 复制实现 describe，直驱 handle_cdp_event 断言 marker 清理（4 用例） | 测试:t112 测试文件 |
| t112_test_f003 | important | 已修 | 新增 deferred 完整解析用例，构造 deferred entry 后 loadingFinished 走 try_resolve_deferred 真路径 | 测试:t112 测试文件 |
| t112_test_f004 | important | 已修 | 补 cdp_handler 直驱 2 用例：SSE streaming 完成 emit 后清理、deferred 完整解析终态清理（覆盖 :380/:830 删除点） | 测试:t112 测试文件 |
| t112_test_f005 | important | 已修 | 补多候选 deferred 兜底用例，覆盖 cdp_handler:842 兜底删除点 | 测试:t112 测试文件 |
| t112_test_f006 | important | 已修 | 补生产 network_capture 多候选 deferred 兜底用例，覆盖 network_capture:822 兜底删除点 | 测试:t112 测试文件 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~004 全部由 `tests/unit/t112_finished_before_stream_lifecycle.test.ts` 18 用例覆盖（含 root/子 session、普通/SSE/失败/逆序/deferred/orphan 各终态），黑盒 `npm test` 1266 passed + `tsc --noEmit` 通过

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（f001 important 未修）
- Round 1 test：FAIL（f001~f003 未修）
- Round 2 code：PASS
- Round 2 test：FAIL（f004 未修）
- Round 3 test：FAIL（f005 未修）
- Round 4 test：FAIL（f006 未修）
- Round 5 test：PASS
- Round 3 code（指纹回写）：PASS

`single`：

- Round 1 general：N/A（review_level=full）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 生产 network_capture 与复制 cdp_handler 的 finished_before_stream 全终态清理补齐，18 用例覆盖 root/子 session 全部终态，5 轮审阅闭环（code 3 轮 / test 5 轮，末轮全 PASS）。
