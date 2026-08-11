---
tid: "t115"
slug: "export_save_as_consistency"
title: "统一 export_save_as 消费语义"
status: "done"
branch: "t115_export_save_as_consistency"
worktree: ""
review_level: "single"
diff_anchor: "472509b68683056df8da1bf80d4a2ec09ff19f8d"
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

### Round 1 (2026-08-11 13:21 UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t115_gen_f001 | important | 已修 | 补 Dashboard capture AC-004 接线锚定 3 用例：export_capture 函数体内 flush 先于 read_capture_snapshot、flush 失败 abort、archive/非 archive 两处 download_blob 均传 export_save_as | 测试:t115 测试文件 |
| t115_gen_f002 | important | 已修 | 补非 archive 路径锚定 3 用例：调用方 r?.success 检查中止、SW export_json/jsonl/html/har 命令 flush 先于导出、flush_all 失败经 handle_message catch 返回 success:false | 测试:t115 测试文件 |
| t000_test_f002 | minor | 遗留 | 一句话 | pNNN |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~004 全部由 `tests/unit/t115_export_save_as_consistency.test.ts` 14 用例覆盖（helper 判别矩阵 6 + Popup/日志接线 2 + Dashboard AC-004 锚定 3 + SW 非 archive 锚定 3），黑盒 `npm test` 1335 passed + `tsc --noEmit` 通过

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：N/A（review_level=single）
- Round 1 test：N/A（review_level=single）

`single`：

- Round 1 general：FAIL（f001 important 未修）
- Round 2 general：FAIL（f002 important 未修）
- Round 3 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 全局 export_save_as 在 Popup ZIP、Dashboard 日志、共享 helper picker 分支统一消费；helper 判别矩阵 + 全入口接线（archive/非 archive flush 顺序与 abort 链）14 用例锁定，3 轮审阅闭环。
