---
tid: "t120"
slug: "nav_retry_decouple_export_busy_guard"
title: "导航早退重试解耦 + dashboard 导出防重入"
status: "done"
branch: "t120_nav_retry_decouple_export_busy_guard"
worktree: ""
review_level: "full"
diff_anchor: "ae15ca2565bb592790bbc3fed40c2ea9a95c2201"
depends_on: ""
conflicts_with: ""
note: "p019 onActivated/onUpdated 早退跳重试 + p027 dashboard 导出 busy 保护"
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

### Round 1 (2026-08-11 16:56 UTC+8)

code 路 1 important + 1 minor；test 路 4 minor（与 code 重叠）。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t120_code_f001 | important | 已修 | 防重入粒度改为 (id, format) key Map，批量导出不同 capture 互不拦截；export_busy_guard 用例覆盖 | src/extension/dashboard/dashboard_shared.ts |
| t120_code_f002 | minor | 已修 | 补 onUpdated restricted→normal CDP 重试测试（nav off 不阻断） | tests/unit/nav_retry_decouple.test.ts |
| t120_test_f001 | minor | 已修 | 同 code_f002（onUpdated CDP 重试用例） | tests/unit/nav_retry_decouple.test.ts |
| t120_test_f002 | minor | 已修 | it 命名语义化（nav 侧 4 用例，不再 AC-NNN 撞号） | tests/unit/nav_retry_decouple.test.ts |
| t120_test_f003 | minor | 已修 | export_busy_guard it 命名语义化 | tests/unit/export_busy_guard.test.ts |
| t120_test_f004 | minor | 遗留 | 仅测 archive 格式导出；guard 在 format 分支前与格式无关，扩展为可选 | p030 |

### Round 2 (2026-08-11 17:00 UTC+8)

code 路 1 minor，test 路 1 minor。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t120_code_f003 | minor | 已修 | 补 onActivated console 未激活时 CDP 重试断言 | tests/unit/nav_retry_decouple.test.ts |
| t120_test_f005 | minor | 已修 | nav it AC-003 与 spec AC-003 撞号，语义化命名收敛 | tests/unit/nav_retry_decouple.test.ts |

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t000_code_f001 | critical/important/minor | 已修 | 一句话 | 文件:行 |
| t000_test_f002 | minor | 遗留 | 一句话 | pNNN |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002 nav 早退解耦（onActivated/onUpdated 重试测试）；AC-003 导出防重入（同 key 拦截 + 不同 capture 并行）。`handoff.json` 的 `ac_evidence` 逐条给出引用。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（important f001 防重入粒度过粗，已修）
- Round 1 test：PASS（4 minor，f004 遗留 p030）
- Round 2 code：PASS（minor f003，已修）
- Round 2 test：PASS（minor f005，已修）
- Round 3 code：PASS（0 新 finding）
- Round 3 test：PASS（0 新 finding）

`single`：

- N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

p019 导航早退重试解耦（nav 关闭时 start-send/CDP 重试仍触发）+ p027 dashboard 导出防重入（(id, format) key 粒度）。全量 vitest 128 文件 1362 用例绿，tsc 0 错误。遗留 1 条：p030（非 archive 格式防重入测试扩展）。
