---
tid: "t154"
slug: "dashboard_misc_fixes"
title: "fix: dashboard/popup 小修复集"
status: "done"
branch: "t154_dashboard_misc_fixes"
worktree: ""
review_level: "single"
diff_anchor: "37cd9f11dd9cbcfcb786d07c3f5fab3693fb6391"
depends_on: ""
conflicts_with: ""
note: "intensive-review 聚合：B4-M4 双转义、B4-M7 删除响应、B4-M14 视图记忆、B4-L2/L3/L4/L7/L9、B4-M6/L1 esc、B5-L1/L4/L5/L7"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 13 项 AC 全部按 review finding 落位实施（intensive-review B4-M4/M7/M14/L2/L3/L4/L7/L9/M6/L1 + B5-L1/L4/L5）。
- AC-006 选在 dashboard_shared 层 `_user_config` 缺省初始化为 DEFAULT_USER_CONFIG（get_user_config() 永不 undefined），比改 init() 分支更根本且可单测。
- AC-012 redact_data 语义取「user_config.redact_data && mask toggle」：设置页关闭脱敏时 popup 不能越过该底重开（消除「toggle 覆盖 user_config」的 finding 根因）。
- AC-010 仅校正 refresh_counts；popup onChanged 竞态（B5-H1）不在本 task 范围，未动。
- 新增 i18n 键 deleteFailed / activeCaptureNoDelete（en/zh）。

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

### Round 1 (2026-08-13 03:13 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t154_gen_f001|minor|已修|AC-003 用例名不副实，改名为实际行为（无当前 detail 时 save no-op）|t154_dashboard_misc.test.ts|
|t154_gen_f002|minor|遗留|dashboard_detail wire_rail_resize/wire_network_resize 清理无测试（代码复核正确），登记 p041|p041|
|t154_gen_f003|minor|遗留|batchDel 中途失败选中残留，登记 p040|p040|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001-013 dashboard/popup 小修复；见 handoff.json ac_evidence

### Reviewer verdict

`single`：

- Round 1 general：PASS（3 minor：f001 已修 + f002/f003 遗留登记）
- Round 2 general：PASS

遗留不在此列出——见 `docs/pending/todo/`（p040/p041），本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- dashboard/popup 13 项小修复：搜索双引号、删除响应检查、open_detail 记忆、start_url scheme 校验、load_captures 防御、非扩展上下文、resize 清理、capture_dur clamp、status 徽章 esc、popup 状态校正/capture_toggles 恢复/配置缺省/stop 失败提示。
