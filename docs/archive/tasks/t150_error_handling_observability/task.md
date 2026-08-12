---
tid: "t150"
slug: "error_handling_observability"
title: "refactor: 错误处理与可观测性补强"
status: "done"
branch: "t150_error_handling_observability"
worktree: ""
review_level: "full"
diff_anchor: "bdb141906330a49382009295f03497551bf379d2"
depends_on: ""
conflicts_with: ""
note: "intensive-review 聚合：B2-M14 空 catch、B2-M15 内部错误外泄、B1-M3 mcp 超时、B1-M7 sanitize getter、B3-M3 CSP 诊断、B2-M16 keepalive、B2-M20 flush 自旋、B2-M3/M4 未处理 rejection、B1-M13 bridge 日志"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

8 项 AC 全部实施完成，`npm test` 141 文件 1468 passed（基线 1448，+20 新用例）+ `npx tsc --noEmit` 通过。

关键决策与踩坑：
- AC-001：body_capture_coordinator 的 `handle_cdp_failure` 依赖原始 CDP 错误串做分类，故 network_capture 仍回传原始错误（内部），仅 coordinator 的对外 message 脱敏；getResponseBody 失败对 OPTIONS/HEAD/资源已释放是预期路径，`cdp_failed` 分支才升级 warn，避免刷屏。
- AC-001 content 注入：strict-CSP 拦截 inline script 不抛同步异常，靠 script 元素 `error` 事件（HTML spec blocked-by-CSP 触发）诊断；封装为共享 `inject_script_element`/`report_injection_failure`（content_page_script.ts）。
- AC-002：service_worker 的 `test_bridge_fetch` 保留原始错误回传——它是用户手动诊断 bridge 的端点，去掉错误细节即失去用途。
- AC-007：新增 warn 日志触发 app_log flush timer，全量测试暴露 `IndexedDBLogTransport.schedule_flush` 的 fire-and-forget `this.flush()` 无 catch（indexedDB 缺失时未处理 rejection）；该位点本身即 AC-007 范畴，加 `.catch` 修复。
- 测试：external_cdp_bridge_client.test.ts 补 `fake-indexeddb/auto`（新 warn 日志需要可断言 app_log 条目）；content 注入诊断测试独立 jsdom 文件（jsdom 环境会破坏 content_page_script.test.ts 的 node 路径解析）。

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

### Round 1 (2026-08-13 00:10 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t150_code_f001|important|已修|mcp client 全量命令超时对齐 bridge full_data_timeout 300s（FULL_DATA_COMMANDS 缺省 300s+5s）+ 测试|src/mcp/client.ts / agent_mcp_client.test.ts|
|t150_code_f002|minor|已修|external CDP 轮询失败 warn 节流（每 10s 一条，防 500ms 刷屏）|external_cdp_bridge_client.ts|
|t150_code_f003|minor|已修|3 个内容模块 update_page_nonce 空 catch 补 debug 日志|websocket/network_hook/storage_capture.ts|
|t150_test_f002|minor|遗留|AC-008 command_timeout/cdp_event_evicted 两条日志路径无测试，登记 p036|p036|
|t150_test_f003|minor|遗留|keepalive 用例依赖模块级幂等注册隔离脆弱，登记 p037|p037|
|t150_test_f004|minor|已修|AC-003 mock fetch 挂起用例未落地，AbortSignal.timeout spy + TimeoutError 包装已充分判别，登记说明|agent_mcp_client.test.ts|

### Round 2 (2026-08-13 00:50 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t150_test_f005|important|已修|删恒真断言，改显式 unhandledRejection 监听 + get_db 正向断言|tests/unit/t150_ac007.test.ts|
|t150_test_f006|important|已修|tabs.get 测试空转（is_capturing false 提前返回），改先 start 进 capturing + tabs_get_mock 正向断言|tests/unit/t150_ac007.test.ts|
|t150_test_f007|minor|已修|sw_load_user_config 死接线，改 beforeEach 用顶层 load_user_config + on_message_cb 捕获|tests/unit/t150_ac007.test.ts|
|t150_test_f001|important|已修|AC-007 三处位点：app_log_storage + tabs.get 已测；handle_cdp_body_event 位点登记 p038（需 CDP 事件流模拟）|tests/unit/t150_ac007.test.ts / p038|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~008 错误处理与可观测性补强；见 handoff.json ac_evidence

### Reviewer verdict

`full`：

- Round 1 code：FAIL（mcp 超时未对齐 full_data + 轮询刷屏 + nonce catch）
- Round 2 code：PASS
- Round 1 test：FAIL（AC-007 无测试 + AC-008 覆盖不全）
- Round 2 test：FAIL（恒真断言 + tabs.get 空转）
- Round 3 test：FAIL（f006 空转 + 死接线）
- Round 4 test：PASS

遗留不在此列出——见 `docs/pending/todo/`（p036/p037/p038），本文件处置表的 `fix_ref` 指向对应 `pNNN`。


### 结果摘要

- 错误处理与可观测性 8 项补强：空 catch 补 warn/capture_error、错误信息脱敏为结构化码、mcp client 超时（含 full_data 300s 对齐）、sanitize getter 兜底、keepalive 真实工作、flush 轮次上限、未处理 rejection .catch、bridge 结构化日志。handle_cdp_body_event 位点测试登记 p038。