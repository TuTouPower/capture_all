---
tid: "t146"
slug: "message_contract_unify"
title: "refactor: 三端消息契约统一为 {action,payload?}/{success,data?,error?} 并共享类型"
status: "done"
branch: "t146_message_contract_unify"
worktree: ""
review_level: "full"
diff_anchor: "17cde0df6d476d46f988cfc87dca80fcfc7b96c1"
depends_on: ""
conflicts_with: ""
note: "review H-17 (B5-M1 横切): 扁平字段/裸数组与文档约定漂移，依赖 any 无类型共享"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- 基线：npm test 138 files/1443 tests passed + tsc clean（含 1 个基线既有 unhandled error：popup_onchanged_race 在 jsdom 无 indexedDB 的 app_log flush）。
- 共享契约：新建 `src/shared/message_contract.ts`，定义 `UI_ACTIONS`（SW case 门禁清单）、`UiRequest`/`UiResponse`、`UiPayloadMap`/`UiDataMap`（各 action 请求/响应类型映射）与 `send_ui_message<A>(action, payload)`。devtools 实际复用 dashboard.html，无独立 sendMessage 面，无需改动。
- SW 响应包装：`wrap_result` 归一化——操作型结果（`{success:false,error}`）上抛为顶层错误，成功把结果放 `data`；纯数据（状态/数组/capture/导出内容）直接包 `data`。get_status 的 `sender.tab.id` 权威 tab_id 保留；content→SW 的 `event`/`app_log_batch` 保持扁平不套 payload。
- 踩坑：`send_ui_message` 初版为 `async` 函数，额外微任务层导致 export_busy_guard 的 in-flight 时序假设失效（guard-blocked 第二次调用先恢复、首次 flush 尚未落快照）。改为非 async 直接返回 sendMessage promise 后恢复原时序。已加注释防回退。
- get_capture_data 改为返回原始 CaptureRecord（元数据），data 下无 events/network_requests/console_logs，防 64MB 大载荷回传。
- 测试：12 个 SW-invoking/UI 测试的 send_message helper 从 `{action, ...payload}` 改 `{action, payload}`；event 发送保持扁平；get_status 断言解包 `data`。sw_action_contract 重写为「UI_ACTIONS 全被 SW case 覆盖」+ get_capture_data 行为契约（{success,data:capture} 且无全量事件字段）。
- 验证：npm test 138 files/1444 tests passed + npx tsc --noEmit exit 0。

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

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

### Round 1 (2026-08-12 21:39 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t146_code_f001|minor|已修|UiResponse 非判别联合，调用点 ?? 兜底（运行时无缺陷，保持）|message_contract.ts|
|t146_code_f002|minor|已修|wrap_result 以 'success' in result 判定（当前无 success 键纯数据，保持）|service_worker.ts wrap_result|
|t146_test_f001|important|已修|export_busy_guard mock 更新为新契约 {success,data} + 导出内容断言（json/har）|export_busy_guard.test.ts|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001-004 三端消息契约统一（{action,payload}/{success,data?,error?} + 共享类型 + 文档一致）；见 handoff.json ac_evidence

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL（export_busy_guard mock 契约陈旧）
- Round 2 code：PASS
- Round 2 test：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 三端消息契约统一：新增 message_contract.ts 共享类型（18 action 映射 + send_ui_message），SW handler 全 case 统一 {success,data?,error?} 响应，popup/dashboard 改 send_ui_message 解包 data，conventions.md 对齐。export_busy_guard 补导出内容断言。
