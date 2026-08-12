---
tid: "t126"
slug: "extract_page_script_template"
title: "refactor: extract shared page script template"
status: "done"
branch: "t126_extract_page_script_template"
worktree: ""
review_level: "full"
diff_anchor: "77c9d91bb1fbcbf8e31ce838343a35fa16f96db8"
depends_on: ""
conflicts_with: "t124"
note: "审阅发现:network_hook 与 websocket_capture build_page_script 同构"
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

### Round 1 (2026-08-12 13:20 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t126_code_f001|minor|已修|spec 过时：post 发送逻辑因 nonce/payload 非同构未整段抽取，共享收敛到 guard+preamble；spec 上下文区补决策记录|spec.md:测试策略|
|t126_test_f001|minor|已修|AC-001 断言锚定 import 行，改为锚定 `page_script_reinstall_guard(` 调用形式|tests/unit/content_page_script.test.ts:59-60|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 结构断言测试、AC-002 既有行为测试 56 用例、AC-003 npm test 1383 全绿 + tsc 通过；详见 handoff.json ac_evidence

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

`single`：

- Round 1 general：PASS / FAIL

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 抽取 network_hook 与 websocket_capture 注入脚本同构片段为 content_page_script.ts 共享模板（还原守卫 + 头部声明），行为不变全绿；storage_capture 第三处同构位点登记 p033。
