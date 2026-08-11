---
tid: "t096"
slug: "bridge_auto_export_path"
title: "security: Bridge auto 导出 format 路径净化防目录逃逸"
status: "done"
branch: "t096_bridge_auto_export_path"
worktree: ""
review_level: "full"
diff_anchor: "4fd96ee173d1d567e5e38856000df49824f30d18"
depends_on: ""
conflicts_with: ""
note: "review_20260811 P0-5 verified"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor/preflight 通过。
- 根因：resolve_auto_output_path 对 format 原样拼进 join(dir, id.format)，恶意 format 可逃逸 EXPORT_DIR。
- 修复：format 白名单 `^[a-zA-Z0-9]{1,16}$`，非法回退 json。
- TDD：3 例真实 HTTP+fs 测试（逃逸/合法/realpath）；红（逃逸写失败）→ 修 → 绿。
- Round 1 审阅 4 条 minor：helper 死参数 + 循环 server 泄漏、outside_dir 死断言、覆盖窄；3 修 1 遗留（p009）。
- Round 2 两路 PASS；全量 1175 通过，tsc 无错。

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

### Round 1 (2026-08-11 03:26 UTC+8)

两路审阅均 PASS，4 条 minor；3 修 1 遗留。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t096_code_f001 | minor | 已修 | helper 去死参数，try/finally 内 server.close | agent_bridge_server.test.ts |
| t096_test_f001 | minor | 已修 | 删 outside_dir 死断言 | agent_bridge_server.test.ts |
| t096_test_f002 | minor | 已修 | helper 内关闭自身 server 修循环泄漏 | agent_bridge_server.test.ts |
| t096_test_f003 | minor | 遗留 | AC-002 format 覆盖窄，同白名单无缺口 | p009 |

### Round 2 (2026-08-11 03:27 UTC+8)

Round 1 三条已修 + 一条遗留；code + test 均 PASS，无新 finding。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003 均有测试证据引用，见 `handoff.json` `ac_evidence`。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

- resolve_auto_output_path 对 format 加白名单正则校验，非法回退 json；3 例真实 HTTP+fs 测试覆盖逃逸/合法/realpath。
