---
tid: "t100"
slug: "privacy_logger_stack_redact_url"
title: "privacy: Logger stack 脱敏且 redact_url 相对 URL fail-closed"
status: "done"
branch: "t100_privacy_logger_stack_redact_url"
worktree: ""
review_level: "full"
diff_anchor: "e47d501b5e19cce4e486003830950beff707bebc"
depends_on: ""
conflicts_with: ""
note: "review_20260811 P1-2 P1-15"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor/preflight 通过。
- 根因：Error.stack 只截断不脱敏；redact_url 对无法 new URL 的串 fail-open 泄露 query。
- 修复：redact_url 手动拆 query/fragment、key decode、值内嵌 URL 递归；logger stack 走 sanitize_string、正则支持相对 query（key=value 形态）。
- Round 1 code FAIL（critical 嵌套 URL 泄露、important 可选链误匹配）→ 修 + 补回归用例。
- 全量 1204 通过，tsc 无错。
- 遗留：三元含 = 误匹配（p017）、相对嵌套值不递归（p018）。

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

### Round 1 (2026-08-11 05:06 UTC+8)

code FAIL（f001 critical 嵌套 URL 泄露 + f002 important 可选链误匹配 + f003/f004 minor）；test PASS。

### Round 2 (2026-08-11 05:07 UTC+8)

code PASS / test PASS；新增 f005/f006 minor。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t100_code_f001 | critical | 已修 | 手动路径 param 值内嵌绝对 URL 递归脱敏 | redaction.ts |
| t100_code_f002 | important | 已修 | bare-query 要求 key=value 形态排除可选链/三元 | logger.ts |
| t100_code_f003 | minor | 已修 | 自产 stack 走 sanitize_string | logger.ts |
| t100_code_f004 | minor | 已修 | key 先 decode、拆分 fragment | redaction.ts |
| t100_code_f005 | minor | 已修 | 仅递归实际脱敏才置 redacted | redaction.ts |
| t100_code_f006 | minor | 遗留 | 三元含 = 仍误匹配（启发式权衡） | p017 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003 均有测试证据引用，见 `handoff.json` `ac_evidence`。

### Reviewer verdict

`full`：

- Round 1 code：FAIL → Round 2 code：PASS → Round 3 code：PASS
- Round 1 test：PASS

### 结果摘要

- redact_url 支持相对/无法 parse 的 query 脱敏（不 fail-open），Logger Error.stack 与自产 stack 走脱敏；3 轮审阅修 critical 嵌套 URL 泄露 + important 可选链误匹配。
