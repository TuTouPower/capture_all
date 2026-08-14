---
tid: "t200"
slug: "test_isolation_contract"
title: "测试隔离与契约确认"
status: "done"
branch: "t200_test_isolation_contract"
worktree: ""
review_level: "full"
diff_anchor: "c04c71da3340b990555c1ea866e37f4bc98aaada"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- AC-001：keepalive.test.ts 隔离加固——每用例 `vi.resetModules()` + 动态 import，模块级 `listener_registered` 幂等标志随重载回到初始态；chrome mock 每用例重建、`on_alarm_listener` 闭包重新捕获。验证：4 用例全量绿 + 逐个 `-t` 单跑绿 + `--sequence.shuffle` 重排绿。
- AC-002：p049 核实——`stop_capture`（service_worker.ts:792）空闲态直接 `{success:true}`；`stop_capture_inner` 全路径恒 success:true（所有 step 经 run_stop_step catch 仅 log）；异常 rethrow 经 `to_agent_error` 转错误响应。dispatcher 的 success:false 分支实际不可达，结论：**保留防御**（接口类型允许 success:false，移除会与接口语义脱节）+ 语义注释，行为已有 t177 用例覆盖（success:false → idle）。
- AC-003：全量 vitest 1921 通过 + tsc 干净，无回归。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1（review_level=full）

零 finding（code PASS / test PASS）。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修|一句话|文件:行|
|t000_test_f002|minor|遗留|一句话|pNNN|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 keepalive 隔离重构（resetModules + 动态 import，单用例/重排均绿）；AC-002 p049 结论落定（保留防御 + 注释，t177 用例覆盖）；AC-003 全量 vitest 1921 + tsc 干净；详见 `handoff.json` `ac_evidence`

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

测试隔离加固 + stop 分支契约确认，round 1 全 PASS 收官。
