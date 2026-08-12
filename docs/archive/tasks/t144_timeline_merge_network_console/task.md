---
tid: "t144"
slug: "timeline_merge_network_console"
title: "fix: 详情页时间线并入 network/console 与增量渲染"
status: "done"
branch: "t144_timeline_merge_network_console"
worktree: ""
review_level: "single"
diff_anchor: "1098bc356e1846128b180fdb530a37c168801dba"
depends_on: ""
conflicts_with: ""
note: "intensive-review 合并：H-15 三轨恒空 + H-16 2s 整页重渲染竞态"
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

### Round 1 (2026-08-12 20:39 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t144_gen_f001|important|已修|console 落库复制 event.relative_time_ms（ConsoleEventData 加字段 + service_worker 写路径）|types.ts:389 / service_worker.ts:952|
|t144_gen_f002|critical|已修|ws 网络记录补 relative_time（created_ts - start_time），merge 兜底不再用 epoch start_time_ms|network_capture.ts:282 / dashboard_shared.ts merge|
|t144_gen_f003|important|已修|minimap 拖拽置 _tl_dragging（pointerdown/finish_drag）|dashboard_detail.ts wire_minimap_drag|
|t144_gen_f004|minor|已修|合并事件补 absolute_time（network 用 start_time_ms ISO）|dashboard_shared.ts merge|
|t144_gen_f005|minor|已修|签名加 network/console 数组长度（就地更新可检测）|dashboard.ts detail_snapshot_signature|

### Round 2 (2026-08-12 20:45 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t144_gen_f006|important|已修|webRequest 与 CDP primary 路径 data 补 relative_time（event.relative_time_ms）|network_capture.ts build_network_event / build_cdp_primary_network_event|
|t144_gen_f007|minor|遗留|空白区 playhead 拖拽保护缺失，登记 p035|p035|

### Round 3 (2026-08-12 20:51 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t144_gen_f008|important|已修|fallback_hook 路径 data 补 relative_time（get_relative_time(capture_start_epoch_ms)）|network_hook.ts build_network_data|

### Round 4 (2026-08-12 20:55 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t144_gen_f009|important|已修|merge 兼容两种落库形状：content hook CaptureEvent 顶层 relative_time_ms（f008 的 data.relative_time 不被读）；补 CaptureEvent 形状用例|dashboard_shared.ts merge / t144 测试 AC-001e|

### Round 5 (2026-08-12 20:59 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t144_gen_f010|minor|已修|merge data 归一化（content hook 形状 e.data 是 CaptureEvent，data.data 才是 NetworkRequestData）|dashboard_shared.ts merge data|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001-006 merge 并入 + 轨道/计数 + 增量渲染 + 拖拽保护，AC-007 既有测试；见 handoff.json ac_evidence

### Reviewer verdict

`single`：

- Round 1 general：FAIL（console/ws 时间缺失等 5 finding）
- Round 2 general：FAIL（f006 webRequest/CDP 时间缺失）
- Round 3 general：FAIL（f008 fallback 时间缺失）
- Round 4 general：FAIL（f009 content 形状）
- Round 5 general：FAIL（f010 data 嵌套）
- Round 6 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 时间线并入 network/console 事件（merge_detail_events 兼容两种落库形状），rail 计数激活；网络相对时间在全部采集路径持久化（webRequest/CDP primary/ws/fallback/content hook）；轮询增量渲染 + 拖拽保护。f007 空白区拖拽遗留 p035。
