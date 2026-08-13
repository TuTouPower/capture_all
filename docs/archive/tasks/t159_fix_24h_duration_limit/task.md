---
tid: "t159"
slug: "fix_24h_duration_limit"
title: "执行 24 小时采集上限"
status: "done"
branch: "t159_fix_24h_duration_limit"
worktree: ""
review_level: "full"
diff_anchor: "82f2ae38bc799a20bac6016d56cde9d0000dd6b1"
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

### Round 1 (2026-08-13 15:05 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t159_code_f001|minor|已修|arm 检测 runtime.lastError 回退 timer；disarm clear rejection 处理|src/extension/background/duration_limit.ts:36|
|t159_code_f002|minor|已修|cleanup 恢复分支加 rec.status==='capturing' 守卫，防 completed 采集复活|src/extension/background/service_worker.ts:150|
|t159_code_f003|minor|已修|抽 build_capture_stopped_event 共用（stop 主路径 + 过期终态化）|src/extension/background/service_worker.ts:270|
|t159_test_f001|important|已修|集成测试补 reason 断言：AC-003 write_events reason=max_duration；新增 AC-001 alarm 到期主链（invoke onAlarm → stop reason max_duration）|tests/unit/duration_limit_sw_integration.test.ts:120,163|
|t159_test_f002|minor|已修|AC-005 单测改名 AC-001d，删除先装后卸死代码|tests/unit/duration_limit.test.ts:72|

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t000_code_f001|critical/important/minor|已修|一句话|文件:行|
|t000_test_f002|minor|遗留|一句话|pNNN|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/005 由 `duration_limit.test.ts`（arm when=now+24h、disarm、fallback timer）+ 集成 AC-001（onAlarm → stop reason max_duration）；AC-003/004 由 `duration_limit_sw_integration.test.ts`（deadline 已过终态化 reason + 清键 / 未过重建 alarm）；AC-005 由 MAX_SESSION_DURATION_MS 生产引用 + reason 可达断言

### Reviewer verdict

`full`：

- Round 1 code：PASS（3 minor）
- Round 1 test：FAIL（1 important + 1 minor）
- Round 2 code：FAIL（f004 新发现 1 important）
- Round 2 test：PASS
- Round 3 code：PASS
- Round 3 test：FAIL（test_f003 断言层级假绿 1 important）
- Round 4 test：PASS

### 结果摘要

24h 时长上限落地执行：start 持久化截止时间 + 注册 chrome.alarms（MV3），到期 stop_capture('max_duration')；SW 重启截止已过立即终态化（reason max_duration）、未过恢复运行态重建 alarm；stop 清 alarm 与 deadline 键；domain.md 同步执行机制。
