---
tid: "t184"
slug: "refactor_bridge_server"
title: "Bridge server 路由拆分"
status: "done"
branch: "t184_refactor_bridge_server"
worktree: ""
review_level: "full"
diff_anchor: "0375202077e2b59ad857ab5b287a8240ce5db84f"
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

## Round 1 处置

| finding_id | severity | verdict | status | 处置说明 |
| --- | --- | --- | --- | --- |
| t184_code_f001 | minor | 待处置 | 已修 | 路由分发恢复旧严格 URL 匹配语义（原样 request.url：pair 4 端点精确、command 兼容 `?` 前缀、mcp/cdp 前缀 + handler 内精确匹配），边界输入状态码/认证行为与重构前一致（AC-004） |
| t184_code_f002 | minor | 待处置 | 已修 | 删除 registry.ts 死代码 `export type { AgentCommandType }` 及对应 import |
| t184_code_f003 | minor | 待处置 | 已修 | `BRIDGE_VERSION` 移入 config.ts 单一来源（server /health 与 registry build_status 共用），消除双份 |
| t184_test_f001 | minor | 待处置 | 已修 | remove_instance 断言改函数体作用域（replace/sweep 体内 `this.remove_instance(id)`）+ 标题修正（cancel_all 直接 clear 不经过） |

## Round 2 处置

| finding_id | severity | verdict | status | 处置说明 |
| --- | --- | --- | --- | --- |
| t184_code_f001 | minor | 修不彻底 | 已修 | 分发改 method+URL 联合匹配（pair 4 端点 / extension 4 端点带 method），错误 method 请求落入 else 认证兜底 → 未认证 401（与重构前一致） |
| t184_test_f002 | minor | 待处置 | 已修 | sweep 作用域断言后边界改 `\n    remove_instance`（get_or_create_queue 锚点位于目标之前导致退化） |

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t000_code_f001|critical/important/minor|已修|一句话|文件:行|
|t000_test_f002|minor|遗留|一句话|pNNN|

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
