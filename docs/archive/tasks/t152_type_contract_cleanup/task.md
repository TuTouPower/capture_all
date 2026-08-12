---
tid: "t152"
slug: "type_contract_cleanup"
title: "refactor: 类型契约谎言与状态漂移清理"
status: "done"
branch: "t152_type_contract_cleanup"
worktree: ""
review_level: "full"
diff_anchor: "a5d21b1d8615f445993a1d1f73192d6aab8f6f5d"
depends_on: ""
conflicts_with: ""
note: "intensive-review 聚合：B1-M5 absolute、B1-M6 locale 双轨、B2-M8 store 混存、B3-M1 payload 顶层、B4-M1/M2 时间列、B4-M3 event_kind、B2-M2/M13 id 冲突、B1-L8/L9 工具统一、B1-L12 passthrough、B1-L13 负相对时间、B3-L2 request_id"
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

### Round 1 (2026-08-13 02:06 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t152_code_f001|important|已修|AC-004 回归：storage_changes 查询分支改读 event.data 内 StorageChangeData（type/summary/preview 三处）+ 回归测试|agent_data_queries.ts / agent_data_queries.test.ts|
|t152_code_f002|minor|已修|ws_message/ws_frame summary/preview url 读 data.ws_url（base 事件 url=''，Round 1 summary + Round 2 preview）|agent_data_queries.ts network summary/preview|

### Round 2 (2026-08-13 02:14 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t152_code_f003|minor|已修|storage_changes 旧顶层形记录（无 data 键）fallback 读 record 自身，防升级后旧 capture 查询崩溃|agent_data_queries.ts storage 三处|

### Round 3 (2026-08-13 02:16 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t152_code_f004|minor|已修|补 ws_message 真实落库形（data 内 ws_url）summary/preview 用例 + storage 旧顶层形 fallback 用例|t152_network_ws_type_route.test.ts / agent_data_queries.test.ts|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001-010 类型契约清理；见 handoff.json ac_evidence

### Reviewer verdict

`full`：

- Round 1 code：FAIL（storage 查询回归 f001）
- Round 2 code：PASS
- Round 3 code：PASS
- Round 4 code：PASS
- Round 1 test：PASS（2 minor 已修）
- Round 2 test：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 类型契约谎言清理 10 项：删 detail_time_display_mode 'absolute'、locale 单一来源、network store ws_frame 查询按 type 路由、storage/ws payload 移 event.data、时间列读真实字段、event_kind 对齐、id 统一 crypto.randomUUID、MCP schemas strict/strip、get_relative_time clamp。
