---
tid: "t114"
slug: "nested_query_redaction"
title: "修复嵌套 query 脱敏泄露"
status: "done"
branch: "t114_nested_query_redaction"
worktree: ""
review_level: "full"
diff_anchor: "1c8f570c56af0758afa0ecb6604e3cdc8da8eefa"
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

### Round 1 (2026-08-11 12:56 UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id | severity | status | rationale | fix_ref |
|------------|----------|--------|-----------|---------|
| t114_code_f001 | important | 已修 | 深度超限改 fail-closed：redact_url 超 MAX_DEPTH 返回 redacted，redact_nested_value 超限整体置 [REDACTED]，7 层链不泄露（实测 no-leak） | 源码:redaction.ts |
| t114_code_f002 | minor | 已修 | 接线回归补全：extension network_capture（WS frame / CDP primary url 2 例）、external CDP Bridge（request/response 1 例） | 测试:t114/network/cdp_handler_redaction |
| t114_code_f003 | minor | 已修 | absolute 分支 allow_encoded=false 只做 plain 检测，双编码行为与相对分支一致（captured），单编码触发；s002/d002 结论修订为「absolute 分支经 URLSearchParams 预解码后不重复解码」 | 源码:redaction.ts |
| t114_code_f004 | minor | 已修 | 补 protocol-relative 外层、嵌套空值敏感 key 用例 | 测试:t114 测试文件 |
| t114_test_f001 | important | 已修 | 接线级覆盖补全（同 code f002）：network/WS/bridge 族嵌套 query 用例 | 测试:t114/network/cdp_handler_redaction |
| t114_test_f002 | minor | 已修 | 补 protocol-relative 外层用例 | 测试:t114 测试文件 |
| t114_test_f003 | minor | 已修 | 补 MAX_DEPTH 守卫用例（7 层链触达 fail-closed） | 测试:t114 测试文件 |
| t114_code_f005 | minor | 已修 | 递归时 encoded 命中子串已解码，allow_encoded 继承语义修正；第二层双编码 absolute/相对分支行为一致（均 captured），单编码仍触发 | 源码:redaction.ts |
| t114_code_f006 | minor | 已修 | 顶层守卫改 fail-closed（超限返回 [REDACTED]+redacted）且阈值统一 `>=`，直接传超限 depth 不泄露明文不谎报状态 | 源码:redaction.ts |
| t114_test_f004 | minor | 已修 | bridge response-only 新建分支非 AC 缺口（request 先到路径已覆盖），dormant 8 处继承 helper 修复；补 f005/f006 行为一致性用例 3 个 | 测试:t114 测试文件 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~004 全部由 `tests/unit/t114_nested_query_redaction.test.ts`（30 用例）+ `t114_form_entry_redaction.test.ts`（2 用例）+ `cdp_handler_redaction.test.ts` 接线用例覆盖，黑盒 `npm test` 1322 passed + `tsc --noEmit` 通过

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（f001 important 未修）
- Round 1 test：FAIL（f001 important 未修）
- Round 2 code：PASS（f005/f006 minor 新增）
- Round 2 test：PASS（f004 minor 新增）
- Round 3 code（指纹回写）：PASS
- Round 3 test（指纹回写）：PASS

`single`：

- Round 1 general：N/A（review_level=full）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- redact_url 对非敏感参数值内嵌 query 递归脱敏（单层解码、MAX_DEPTH=5 fail-closed、absolute/相对分支编码语义一致），form/network/WS/Logger/bridge 接线族回归闭环，6 轮审阅通过（code 3 / test 3）。
