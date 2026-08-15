---
tid: "t201"
slug: "bridge_instance_persistence"
title: "Bridge 实例状态持久化,重启不丢浏览器识别"
status: "done"
branch: "t201_bridge_instance_persistence"
worktree: ""
review_level: "full"
diff_anchor: "2773813bed85a06347775688033769095051232a"
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

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

### Round 1 (2026-08-16 01:06 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t201_test_f001|important|已修|补 persist 产物文件级断言:读回文件断言含 token_hash 无明文 + stat mode 0600|tests/unit/bridge_registry_refactor.test.ts|
|t201_test_f002|important|已修|补 default_instances_file_path 具体路径断言(XDG) + parse_bridge_cli_args env 读取断言,去自证式期望|tests/unit/agent_bridge_config.test.ts|
|t201_test_f003|minor|已修|补双实例(零配置+标号)组合恢复断言 size/label|tests/unit/bridge_registry_refactor.test.ts|
|t201_test_f004|minor|已修|补缺失文件(ENOENT)load 分支断言 instances.size===0|tests/unit/bridge_registry_refactor.test.ts|
|t201_test_f005|minor|已修|persist 等待改轮询文件存在,去固定 sleep flake|tests/unit/bridge_registry_refactor.test.ts|
|t201_code_f001|minor|已修|7a 收尾阶段补 mcp_usage/deployment 文档|docs/guides/mcp_usage.md, docs/guides/deployment.md|
|t201_code_f002|minor|遗留|load_persisted 畸形条目无字段守卫,pre-existing 非本 diff 引入|p053|

### Round 2 (2026-08-16 01:12 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t201_code_f003|minor|已修|处置表 f002 fix_ref 改指 p053,畸形条目 follow-up 已有跟踪载体|docs/pending/todo/p053_instances_file_load_no_field_guard.md|
|t201_code_f004|minor|已修|处置表 f001 状态改「遗留/Finalization」,与实际相符|task.md 处置表|
|t201_test_f006|minor|已修|wait_for_file 轮询改「内容可解析/非空」,避免 create/truncate 间隙读到空串|tests/unit/bridge_registry_refactor.test.ts|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足 / 未满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）；此处写一句话摘要，不复制 AC 正文

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：PASS / FAIL

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 一句话；无额外说明可写「见上」
