---
tid: "t169"
slug: "fix_enroll_origin_auth"
title: "extension enroll 首次认证不依赖可伪造 Origin"
status: "done"
branch: "t169_fix_enroll_origin_auth"
worktree: ""
review_level: "full"
diff_anchor: "a631e0030d4ba8225a161f25ef1665b1af77a154"
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

### Round 1 (2026-08-13 17:55 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t169_code_f001|important|已修|AC-003 断链：bridge 启动自动 open pairing（pairing_auto_open 默认 true）+ instances 持久化（instances_file）重启恢复|src/bridge/server.ts:60|
|t169_code_f002|minor|已修|mcp_usage.md / README 同步 t169 语义|docs/guides/mcp_usage.md; README.md|
|t169_code_f003|minor|已修|pairing code 一次性消费（成功 enroll 后关闭）|src/bridge/server.ts:374|
|t169_test_f001|important|已修|client T091 断言 /pair/status 调用 + enroll body 带 pairing_code|tests/unit/agent_bridge_client.test.ts:764|
|t169_test_f002|minor|已修|t137 AC-008 evil enroll 补 token（label 顶替分支判别性恢复）|tests/unit/t137_bridge_security.test.ts:199|
|t169_test_f005|minor|遗留|pairing 路径 enroll 后 heartbeat 无直接断言（AC-003b heartbeat 为 token 路径）|p046|

### Round 2 (2026-08-13 17:55 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t169_code_f004|important|已修|instances_file/pairing_auto_open 生产入口接线（parse_bridge_config + cli env）|src/bridge/config.ts|
|t169_code_f005|minor|遗留|auto-open 窗口过期无续期——接受为已登记风险（扩展轮询重试 + MCP 可再 /pair/open）|p047|
|t169_code_f006|minor|已修|agent_bridge_config.ts 注释同步 t169|src/shared/agent_bridge_config.ts:26|
|t169_test_f003|minor|已修|测试名改「T091 (t169): ... pairing code from open window succeeds」|tests/unit/agent_bridge_server.test.ts:1642|
|t169_test_f006|minor|已修|AC-003b close 后等待落盘（防持久化竞态 flaky）|tests/unit/t137_bridge_security.test.ts:262|
|t169_test_f004|minor|已修|dev_mode 测试名改「S0 dev_mode allows extension enroll with mcp token」|tests/unit/agent_bridge_server.test.ts:1532|

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
- 结果：全部满足
- 证据：AC-001 伪造 Origin 无凭据 401（t137 t169 AC-001）；AC-002 MCP token 首次 enroll + heartbeat（t137 t169 AC-002 / AC-003b）；AC-003 启动自动 open pairing + 扩展自动取 code 零配置 enroll（AC-003a）+ instances 持久化重启恢复；AC-004 伪造 Origin 401 测试

### Reviewer verdict

`full`：

- Round 1 code：FAIL（1 important + 2 minor）/ test：FAIL（1 important + 4 minor）
- Round 2 code：FAIL（f004 important）/ test：PASS
- Round 3 code：PASS / test：PASS

### 结果摘要

首次 enroll 认证模型落地：Origin 不再作主凭据（形状可伪造），首次登记要求 MCP token 或有效 pairing code（/pair/open 持 token 打开）；零配置由安全分发承接——bridge 启动自动 open pairing（pairing_auto_open）+ 扩展自动读 /pair/status 取 code + code 一次性消费；已绑定实例持久化（instances_file）bridge 重启恢复不中断；重 enroll 保持 t137 origin 绑定校验。decisions 023（supersede 018 origin 直通）。
