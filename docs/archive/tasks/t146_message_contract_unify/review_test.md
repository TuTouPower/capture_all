# Task review t146（reviewer_focus: 测试）

- task：`t146_message_contract_unify`
- spec：`docs/tasks/t146_message_contract_unify/spec.md`
- diff_anchor：`17cde0df6d476d46f988cfc87dca80fcfc7b96c1`
- target：`git diff 17cde0df6d476d46f988cfc87dca80fcfc7b96c1`
- round：1
- reviewed_at：2026-08-12 21:36 UTC+8

reviewed_scope: 0c11981406c83678

## Findings

### t146_test_f001 - 导出内容解包路径（`r.data`）无行为测试；export_busy_guard mock 仍为旧契约形状（受影响测试遗漏）

- 严重度：important
- 锚点：AC-003「既有 UI 功能（…导出…）行为与修前一致」；可观测行为缺陷——若 SW `data` 未携带导出内容或解包错误，导出将静默产出空文件，无测试可证伪。
- 位置：`src/extension/dashboard/dashboard_shared.ts:333`（`const content = r.data ?? '';`）；`tests/unit/export_busy_guard.test.ts:158`（`resolve_msg({ success: true, json: '{"ok":1}' })`）
- 问题：契约统一后 SW `handle_export` 响应由 `{ success, json|jsonl|html|har }` 改为 `{ success, data: string }`（service_worker.ts `handle_export` 直接返回字符串，经 `wrap_result` 落 `data`）。dashboard_shared 非 archive 分支解包由 `r.json ?? r.jsonl ?? r.html ?? r.har ?? JSON.stringify(r)` 改为 `r.data ?? ''`。这是本 diff 引入的**行为变更**，但唯一触达该分支的测试 `export_busy_guard.test.ts` 未随 diff 更新（任务描述将其列入「受影响 13 个测试」，实际未改）：
  - mock 仍返回旧形状 `{ success: true, json: '{"ok":1}' }`（生产已不产生 `json` 字段），`r.data` 恒为 undefined，`content` 恒为 `''`，导出的 blob 内容为空。
  - 该用例仅断言 export action 单次 + download_blob 调用次数，**不断言导出内容**，因此旧形状 mock 不会导致红灯，测试继续通过，但验证的是生产不再产出的响应形状（假行为）。
  - 结果：`r.data` 携带导出内容这一新契约分支，无论正确与否都无任何测试验证；SW 侧 export_json/export_app_logs 的 `data` 内容同样无行为断言。
- 建议：将 `export_busy_guard.test.ts` json 用例的 mock 更新为新契约形状 `resolve_msg({ success: true, data: '{"ok":1}' })`，并补一条导出内容断言（如 `download_blob` 收到 blob 的文本等于 `data` 内容，或新增 SW `export_json → { success, data: string }` 的契约测试）。

## 结论

- 前轮 finding 复核：无（round 1）
- 改测方向复核：无「迁就实现」的改测。逐一核对 13 个受影响测试，改动均为把发送形状（`{ action, ...extra }` → `{ action, payload }`）与响应解包（`resp.is_capturing` → `resp.data.is_capturing` 等）迁到新契约，且与 SW 实际 `wrap_result` 行为一致，未把旧预期改成当前实现输出；`storage_limit_active_delete` 的 event 发送改为绕过 `send_message` 直调 `on_message_cb` 以保持扁平内部消息形状，语义保留。sw_action_contract 旧 get_capture_data 源码解析测试被更强的行为测试（真实 init_db + SW handler 驱动）替代，属合法替代。
- 本轮新发现：1 条（f001）
- 未进表的提示：范围外观察与可选覆盖扩展——
  1. `popup_immediate_refresh` / `popup_onchanged_race` 为模拟式测试（不 import 真实 popup.ts，自写 `simulate_start_timer` 并断言 mock 收到自身传参），预存风格，本 task 未引入；popup 真实接线由 `popup_export` / `popup_start_timing` 源码锚定兜底。
  2. SW 侧 `list_captures`（返回数组经 `wrap_result` 落 `data`）、`delete_capture`、`load_detail`（dashboard_shared.ts:276 `r.data ?? null`）的真实 data 解包无行为测试，仅 mock 形状一致 + 源码锚定；可扩展但不阻断。
  3. sw_action_contract `SW handles all critical actions` 用例与首条 `UI_ACTIONS` 门禁（every UI_ACTIONS action is handled by SW）重复，纯冗余。
- 总体判断：1 条未解决 important（f001），导出内容行为契约无测试覆盖。
- AC 复验方式：
  - AC-001（请求 { action, payload }，响应 { success, data?, error? }）：`re_verified`。sw_action_contract 行为测试驱动真实 SW handler 断言 get_capture_data 成功（`data.capture_id` 匹配、data 不含 events/network_requests/console_logs 数组）与失败（`{ success: false, error }`）两种形状；13 个受影响测试均按新形状断言。
  - AC-002（共享请求/响应类型，UI 不再依赖 any）：`re_verified`。`src/shared/message_contract.ts` 定义 UI_ACTIONS / UiRequest / UiResponse / send_ui_message；grep 确认 popup/dashboard 全部经 send_ui_message，仅 content_script 扁平内部消息（event / app_log_batch）与 logger 批量日志保留裸调用（契约明文豁免）；sw_action_contract 以 UI_ACTIONS 作门禁，SW 单一 switch 全覆盖（20 个 case，含 18 个 UI_ACTIONS）。
  - AC-003（既有 UI 行为与修前一致）：`re_verified`（部分）。13 个受影响测试语义保留；但导出内容解包路径（f001）无测试覆盖。
  - AC-004（conventions.md 与实际一致）：`trust_prior`。文档一致性无法自动验证，依赖 doc 审阅证据。
  - coverage = 3 / 4
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-12 21:52 UTC+8)

reviewed_scope: 473601e072ebbbcc

### 前轮 finding 复核

- **t146_test_f001（important）— 已修**。核实 `tests/unit/export_busy_guard.test.ts` 相对 Round 1 的新增改动（该文件为 Round 2 才进入 diff）：
  - beforeEach 默认 `send_message_impl` 改为对 `export_json` / `export_har` 返回 `{ success: true, data: JSON.stringify({ exported: msg.action }) }`，其余 action 仍 `{ success: true }` —— 契约形状对齐新 `handle_export` 响应。
  - json 防重入用例：`resolve_msg` 由旧形状 `{ success: true, json: '{"ok":1}' }` 改为 `{ success: true, data: '{"ok":1}' }`，新增 `expect(await blob_arg.text()).toBe('{"ok":1}')` —— 直接断言下载 blob 内容来自 `r.data`，`r.data ?? ''` 解包路径获行为覆盖（原缺口）。
  - har 串行用例：新增 `expect(await blob_arg.text()).toBe(JSON.stringify({ exported: 'export_har' }))`，覆盖非 archive 分支 data 解包。
  - 未引入 `.skip` / `.only` / `@ts-ignore` / 弱化断言；新增断言强于原仅计数断言。`blob.text()` 为 Node 原生支持；`download_blob.mock.calls[0][0]` 在 `beforeEach` `vi.clearAllMocks()` 下指向当次 blob，时序正确。

### 改测方向复核

无「迁就实现」的改测。f001 修复是把 mock 迁到新契约响应形状 + 新增内容断言，属补行为覆盖，非把旧预期改成当前实现输出。

### 本轮新发现

0 条（f001 已消除）。

### 未进表的提示

- SW 侧 `handle_export` 响应形状（`{ success, data: string }`）仍无直接断言：`dashboard_export_flush_saveas` 走真实 SW handler 但未捕获响应、仅断言 flush/export 调用。f001 已由调用方 blob 内容断言闭环（SW `data` → `r.data` → blob 全链行为可证伪），此条为可选加强，非阻断。
- Round 1 其余非阻断提示（list_captures/load_detail data 解包无行为测试、popup 模拟式测试、critical-actions 用例冗余）维持原判，不重复。

### 总体判断

f001 已消除，无未解决 critical / important；剩余仅可选覆盖扩展。Round 2 PASS。

### AC 复验方式（Round 2）

- AC-001：`re_verified`。Round 1 基础上新增 export 响应 `{ success, data }` 的调用方行为断言（blob 内容来自 data）。
- AC-002：`re_verified`。维持 Round 1 判断（类型化 send_ui_message + UI_ACTIONS 门禁）。
- AC-003：`re_verified`。导出内容解包路径现获行为覆盖，13 个受影响测试语义保留。
- AC-004：`trust_prior`。文档一致性依赖 doc 审阅证据。
- coverage = 3 / 4

verdict: PASS
