---
tid: "t142"
slug: "stop_restore_page_hooks"
title: "fix: stop 后还原注入脚本改写的页面 API"
status: "done"
branch: "t142_stop_restore_page_hooks"
worktree: ""
review_level: "full"
diff_anchor: "51e0843c0bff79665b8d2e166edc584b7da11f22"
depends_on: ""
conflicts_with: ""
note: "review H-13 (B3-H4): stop 仅删 message_listener，fetch/XHR/localStorage/WebSocket 永久改写且持续读 body"
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

### Round 1 (2026-08-12 19:23 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t142_code_f001|minor|已修|restore 移到 state.end 之前无条件调用（状态丢失时 MAIN world hook 仍残留）|network_hook.ts/websocket_capture.ts/storage_capture.ts stop|
|t142_code_f002|minor|已修|storage restore 复用 page_script_restore 模板（收敛单模板）|storage_capture.ts restore_page_script|

### Round 2 (2026-08-12 19:28 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t142_test_f001|important|已修|AC-001 改用 eval 执行注入脚本 + restore 验证真实 hook 安装/还原（jsdom 不执行 appendChild 注入）|tests/unit/t142_stop_restore_page_hooks.test.ts:AC-001|
|t142_test_f002|important|已修|补 ws eval 安装 + restore 还原行为断言|tests/unit/t142_stop_restore_page_hooks.test.ts:ws|
|t142_test_f003|important|已修|补 storage restore 结构断言（page_script_restore('storage') + localStorage/sessionStorage 还原语句）|tests/unit/t142_stop_restore_page_hooks.test.ts:storage|
|t142_test_f004|important|已修|AC-003 改 try/catch 结构断言（删恒真不抛错）|tests/unit/t142_stop_restore_page_hooks.test.ts:AC-003|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 eval 行为级验证 hook 安装/还原 + stop 接线断言、AC-002 采集中不变、AC-003 降级；见 handoff.json ac_evidence

### Reviewer verdict

`full`：

- Round 1 code：PASS（2 minor 已修）
- Round 2 code：PASS
- Round 1 test：FAIL（恒真/零接线）
- Round 2 test：FAIL（stop 接线未断言）
- Round 3 test：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- stop 时经 page_script_restore 注入还原脚本，还原 network_hook（fetch/XHR）、websocket（WebSocket）、storage（localStorage/sessionStorage）改写的页面 API；restore 无条件调用（状态丢失时 MAIN world hook 不残留）。
