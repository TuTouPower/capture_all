---
tid: "t199"
slug: "cdp_network_integration"
title: "CDP/网络集成测试补全"
status: "done"
branch: "t199_cdp_network_integration"
worktree: ""
review_level: "full"
diff_anchor: "a71525cb14ab623b07bb3da5e7720057e4c37bd8"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- AC-001：cdp_body_budget_accounting.test.ts 补「超限淘汰生产链路闭环」组合用例——三条 200B 事件连发触发两次 body_budget_cap 淘汰（splice），幸存 r3 账本 200 → poll 归零。
- AC-002：service_worker.ts 导出 `_handle_cdp_body_event_for_test`；SW 集成测试用 check_storage_limit spy reject 触发 production .catch，断言 limit_spy 被调 + 错误日志写出。反向性验证：临时删 .catch → vitest 报 unhandled rejection 且 4 用例全红，恢复复绿。
- AC-003：SW 集成测试验证 handle_network_request 落库前 redact_body 脱敏（password/token 值替换、alice 非敏感保留）+ redact_data=false 原样落库。反向性验证：临时移除 redact_body 调用 → 用例红。
- 踩坑：SW 集成测试 chrome mock 缺 webRequest.onCompleted（start_network_capture 崩溃）；capture_response_body:true 触发 body capture 启动失败改 false；AC-002 fixture 缺 response_headers（extract_mime_type 崩溃）。
- Review Round 1：code 1 minor（AC-001「含 evicted 终态」措辞与实现不符，reviewer 标注 spec 过时）→ 改 spec；test 0 finding。Round 2 两路 PASS。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1（review_level=full）

| finding_id | 严重度 | 处置 | 说明 |
|---|---|---|---|
| t199_code_f001 | minor | 已修 | reviewer 标注 spec 过时：AC-001「含 evicted 终态」与实现不符（body 预算淘汰 splice 删除无 evicted；evicted 仅属事件数淘汰，t157 已覆盖）。已改 spec AC-001 措辞 + 上下文区说明 |

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
- 证据：AC-001 MockWebSocket 生产链路组合用例；AC-002 .catch 位点反向性实测（删 .catch 必红）；AC-003 脱敏接入反向性实测 + redact_data=false 反例；AC-004 全量 vitest 1921 通过 + tsc 干净；详见 `handoff.json` `ac_evidence`

### Reviewer verdict

`full`：

- Round 1 code：PASS（1 minor spec 措辞过时 → 已改 spec）
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS

### 结果摘要

CDP body 预算记账链路 + .catch 位点 + 落库脱敏接入集成测试补全，round 2 全 PASS 收官。
