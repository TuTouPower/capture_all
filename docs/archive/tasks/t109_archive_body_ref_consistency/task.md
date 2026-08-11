---
tid: "t109"
slug: "archive_body_ref_consistency"
title: "fix: archive body 去重后回写 JSONL body_ref"
status: "done"
branch: "t109_archive_body_ref_consistency"
worktree: ""
review_level: "full"
diff_anchor: "7de7117b9b169548962b4d5dba368bc97a079d19"
depends_on: ""
conflicts_with: ""
note: "review_20260811 P1-12"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor/preflight 通过。
- 根因：body 去重改名后未回写 JSONL body_ref，引用指向旧名。
- 修复：final_seq 按出现序回写（含首现遮蔽场景）。
- 3 轮审阅修 off-by-one swap + 遮蔽冲突；突变验证判别力。
- 全量 1236 通过，tsc 无错。

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

### Round 1 (2026-08-11 08:10 UTC+8)

code FAIL（f001 critical off-by-one）；test FAIL（f001 critical swap）。

### Round 2 (2026-08-11 08:11 UTC+8)

code FAIL（f003 important 遮蔽冲突 + f002 minor）；test FAIL（f004 important）。

### Round 3 (2026-08-11 08:12 UTC+8)

code PASS / test PASS。处置：

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t109_code_f001 | critical | 已修 | final_seq 回写按出现序消费，2/3-way 冲突 ref 指向各自文件 | archive_builder.ts |
| t109_code_f002 | minor | 已修 | spec AC-001 措辞更新（去重改名保留两文件） | spec.md |
| t109_code_f003 | important | 已修 | final_seq 含首现遮蔽，req_2 自然路径二次改名回写 | archive_builder.ts |
| t109_test_f001 | critical | 已修 | f001 判别测试（不同内容 ref 指向各自文件） | 测试 |
| t109_test_f004 | important | 已修 | f003 遮蔽测试（req×2+req_2 第三条指向 req_2_2） | 测试 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002 均有测试证据引用，见 `handoff.json` `ac_evidence`。

### Reviewer verdict

`full`：

- Round 1 code：FAIL → Round 2 code：FAIL → Round 3 code：PASS
- Round 1 test：FAIL → Round 2 test：FAIL → Round 3 test：PASS

### 结果摘要

- body 冲突改名后 final_seq 按出现序回写 body_ref（2/3-way + 遮蔽场景），每条记录指向自身最终文件；突变验证判别力。
