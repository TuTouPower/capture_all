---
tid: "t137"
slug: "bridge_output_path_guard"
title: "security: bridge 本地攻击面收敛（output_path + enroll 顶替）"
status: "done"
branch: "t137_bridge_output_path_guard"
worktree: ""
review_level: "full"
diff_anchor: "336d88dd4ea11dcd24d15ab2b62150362d99b673"
depends_on: ""
conflicts_with: ""
note: "intensive-review 合并：H-1 output_path 任意写 + H-2 伪造 origin 顶替实例"
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

### Round 1 (2026-08-12 17:38 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t137_code_f001|important|已修|heartbeat label 顶替补 origin 绑定防护（与 enroll 对齐，伪造 origin 不删真实实例）|src/bridge/server.ts:412-435|
|t137_code_f002|important|已修|safe_output_path 改 realpath 收敛解析符号链接，穿越校验真实路径|src/bridge/server.ts:832-870|
|t137_code_f003|minor|已修|capture_id 三目超长行格式化回退|src/bridge/server.ts:811|
|t137_test_f001|important|已修|AC-008 改 token heartbeat 判别（原 enroll 重入判别假绿）|tests/unit/t137_bridge_security.test.ts:AC-008|
|t137_test_f002|important|已修|补符号链接穿越测试（realpath 收敛拒绝）|tests/unit/t137_bridge_security.test.ts:AC-002b|
|t137_test_f003|minor|已修|AC-002 改 safe_output_path 函数级验证（相对路径通过）|tests/unit/t137_bridge_security.test.ts:AC-002|
|t137_test_f004|minor|已修|补 AC-004 无 Origin 重 enroll 403 用例|tests/unit/t137_bridge_security.test.ts:AC-004|

### Round 3 (2026-08-12 17:55 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t137_test_f005|important|已修|补 AC-008b heartbeat 伪造 origin label 顶替判别用例|tests/unit/t137_bridge_security.test.ts:AC-008b|
|t137_code_f004|important|已修|heartbeat 顶替校验改用被认证实例自身 origin_extension_id（无 Origin 不可绕过）|src/bridge/server.ts:416|
|t137_code_f005|important|已修|safe_output_path base 先 realpath（macOS /tmp symlink 不误拒）|src/bridge/server.ts:838-839|
|t137_code_f006|minor|已修|safe_output_path 函数首行折叠格式化|src/bridge/server.ts:832|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001-008 覆盖 output_path 路径穿越防护（含符号链接）与 enroll/heartbeat 伪造 origin 顶替防护（token 判别）；见 handoff.json ac_evidence

### Reviewer verdict

`full`：

- Round 1 code：FAIL（heartbeat 未防护 + 符号链接绕过）
- Round 2 code：FAIL（无 Origin heartbeat 绕过 + base realpath 不对称）
- Round 3 code：PASS
- Round 1 test：FAIL（AC-008 假绿）
- Round 2 test：FAIL（heartbeat 顶替无判别用例）
- Round 3 test：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- bridge 本地攻击面收敛：output_path 经 realpath 收敛防路径穿越/符号链接任意写；enroll 与 heartbeat 的 instance_id/label 顶替均校验 Origin 扩展 ID 绑定（s003 spike 结论 d004），伪造 origin 无法顶替真实实例。
