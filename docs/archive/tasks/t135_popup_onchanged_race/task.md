---
tid: "t135"
slug: "popup_onchanged_race"
title: "fix: popup stop 完成态不被 storage.onChanged 竞态覆盖"
status: "done"
branch: "t135_popup_onchanged_race"
worktree: ""
review_level: "full"
diff_anchor: "10d59918eeb5b1031d8ed0a4e06e7c2bf42f2e6e"
depends_on: ""
conflicts_with: ""
note: "review H-12 (B5-H1, 2aaeec9 新增): onChanged 监听无法区分自写/外部写入，stop 完成态时序性被 ready 覆盖"
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

### Round 1 (2026-08-12 14:43 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t135_code_f001|important|已修|setTimeout(0) 复位与 onChanged 派发时序解耦，改为 storage 键 SELF_WRITE_KEY 确定性识别自写，监听消费后跳过|src/extension/popup/popup.ts:34,382,413,489-500|
|t135_test_f001|important|已修|结构测试更新为 token 方案断言（SELF_WRITE_KEY 写入 + 监听消费跳过 + 外部路径保留）|tests/unit/popup_onchanged_race.test.ts|
|t135_test_f002|minor|已修|消除固定字符窗口切片与死代码，改为定位 '});' 截取完整监听块|tests/unit/popup_onchanged_race.test.ts:34-63|
|t135_test_f003|minor|已修|AC-003 补监听变更键筛选断言（area + is_capturing/current_capture）|tests/unit/popup_onchanged_race.test.ts:52-63|

### Round 4 (2026-08-12 15:08 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t135_test_f005|minor|已修|AC-002 补 state 转 capturing 断言（外部变更后 load_state 置 capturing）|tests/unit/popup_onchanged_race.test.ts:141-160|
|t135_test_f006|minor|已修|测试触发 start_timer 的 setInterval 在 afterEach 清理，防定时器泄漏|tests/unit/popup_onchanged_race.test.ts:afterEach|
|t135_test_f007|minor|已修|AC-001 补最终态 saved 断言（stop 后 render 完成态）|tests/unit/popup_onchanged_race.test.ts:AC-001|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 真实 stop 链路终态 saved、AC-002 外部同步保留、AC-003 无关键不触发；见 handoff.json ac_evidence

### Reviewer verdict

`full`：

- Round 1 code：FAIL（setTimeout 时序不可靠，已改 token 方案）
- Round 2 code：PASS
- Round 1 test：FAIL（结构断言不可证）
- Round 2 test：FAIL（token 方案未闭环）
- Round 3 test：FAIL（手动注入 key 绕过生产接线）
- Round 4 test：PASS（真实 stop 链路 + 消费验证）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- popup 自写 storage 带 SELF_WRITE_KEY 标记，onChanged 监听确定性识别自写并消费跳过，消除 stop 完成态被竞态覆盖；外部 MCP/SW 变更仍同步。行为测试走真实 stop 链路。
