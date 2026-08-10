# Task review t094（reviewer_focus: 代码）

- task：`t094_network_capture_session_key`
- spec：`docs/tasks/t094_network_capture_session_key/spec.md`
- diff_anchor：`e34b074aca5823e4b0079666ea26f0a71ebfc142`
- target：`git diff e34b074aca5823e4b0079666ea26f0a71ebfc142`
- round：1
- reviewed_at：2026-08-11 02:45 UTC+8
- reviewed_scope: e5741eda376b0ff6

## Findings

### t094_code_f001 - send_ws_frame 用裸 requestId 查 ws_connections，复合键改造遗漏致 ws_frame url 丢失

- 严重度：important
- 锚点：范围「生产 `network_capture` 内部 Map/Set 使用 session 复合键」改造不完整（遗漏裸 requestId 键使用）；可观测行为缺陷（ws_frame.url 数据丢失）
- 位置：`src/extension/background/network_capture.ts:330`（内部查询）；调用点 `:697`、`:701`；对照写入点 `:675`
- 问题：`webSocketCreated` 写 `ws_connections.set(req_key, conn)`（`:675`），而 `webSocketFrameSent`/`webSocketFrameReceived` 调用的 `send_ws_frame(req_id, 'sent'|'received', params)` 内部仍为 `const conn = ws_connections.get(req_id)`（`:330`）。复合键改造后根 session 键为 `root:${req_id}`、子 session 键为 `${sessionId}:${req_id}`，裸 `req_id` 查不到任何条目 → `conn` 恒为 `undefined` → `frame_url = redact_url(conn?.url || '', ...).url` 恒为空串。改造前 `ws_connections` 以裸 `req_id` 为键，该查法可命中，故为本任务引入的回归。旁路文件 `cdp_handler.ts:628/654` 同路径已用 `send_ws_frame(req_key, req_id, ...)` + `state.ws_connections.get(req_key)`，可作正确性对照。
- 建议：`send_ws_frame` 签名改为 `(req_key, req_id, direction, params)`，内部用 `ws_connections.get(req_key)`；`:697`/`:701` 调用点传入 `req_key`（`ws_connection_id`/外部字段仍用 `req_id`）。与旁路 `cdp_handler.ts` 保持同构。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：1 条（important）
- 未进表的提示：
  - 文件过大（降级规则，仅列路径与行数）：`src/extension/background/network_capture.ts` 1206 行（base 已超 800 阈值，本任务净增 70）；`src/extension/background/cdp_handler.ts` 892 行（旁路文件，本任务仅 +1 接口字段）。
  - 范围内观察（minor，非缺陷，不阻断）：`CdpRequestMeta.session_id` 字段在 `:463`/`:490` 写入但全文无读取点，当前仅作信息冗余；不影响 AC。
  - 范围外观察（非本任务引入，仅提示）：`cdp_primary_emitted` Set 只写（add）不读，pre-existing 死代码；流式路径 `finished_before_stream.add(req_key)`（`:535`）在 `:539` 分支 emit 后未删除，pre-existing 每 SSE 请求泄漏一字符串——与 spec 风险区「cleanup 路径泄漏」相关但非本次复合键改造引入，未扩大。
- 总体判断：复合键改造主体完整——CDP 各 Map/Set（cdp_request_meta / cdp_body_results / cdp_primary_emitted / streaming_requests / finished_before_stream / ws_connections / _deferred_cdp_index / stream_buffer）写入与读取一致，子目标 getResponseBody/streamResourceContent target 已带 sessionId，对外 request_id 保留原 CDP requestId，deferred/orphan/correlator 键语义一致（find_cdp_candidates 返回 req_key，try_resolve_deferred 按 req_key 消费，_deferred_cdp_index 双向一致）。但 `send_ws_frame` 遗漏裸键查询，导致所有 ws_frame sent/received 事件 url 字段丢失（important 未解决），FAIL。
- AC 复验方式：
  - AC-001：`re_verified` — 重跑 `npx vitest run tests/unit/network_capture_session_key.test.ts tests/unit/network_cdp.test.ts`（23 passed）；用例断言同 requestId 双 session 的 meta 均保留且两事件均写入。
  - AC-002：`re_verified` — 用例断言 streamResourceContent 与 getResponseBody 的 sendCommand target 均含 `sessionId === SESSION_A`；通过。
  - AC-003：`re_verified` — 用例断言根 session 输出 `request_id === 'req_root'` 且 response_body_status 已定义；通过。
  - coverage = re_verified / 总 AC 数 = 3/3
- 系统性 follow-up：无（ws bug 应在 t094 内修复；finished_before_stream 流式泄漏如需治理可另立 task）。

verdict: FAIL

## Round 2 (2026-08-11 02:50 UTC+8)

reviewed_scope: 5393042f23c2ae52

## Findings

本轮无新增 finding。

## 结论

- 前轮 finding 复核（Round 2，以 diff 为准）：
  - t094_code_f001（important）— **已消除**。`send_ws_frame` 签名改为 `(req_key, req_id, direction, params)`（`src/extension/background/network_capture.ts:304`），内部查询改为 `ws_connections.get(req_key)`（`:330`），两个调用点 `:697`/`:701` 均已传 `req_key`；对外字段 `ws_connection_id` 仍用 `req_id`（`:333`）。与旁路 `cdp_handler.ts` 同构（`:628` 签名、`:654` `state.ws_connections.get(req_key)`）。全量扫描确认无其他遗漏裸 requestId 键使用：内部 8 个集合（`cdp_request_meta` / `cdp_body_results` / `cdp_primary_emitted` / `streaming_requests` / `finished_before_stream` / `ws_connections` / `_deferred_cdp_index` / `stream_buffer`）的 get/set/add/delete/has 全部以 `req_key` 为键；`Network.webSocketFrameError` 路径 `:705` 亦已用 `get(req_key)`。`stream_buffer` 的 `on_flush` 回调参数（`network_capture.ts:192` 形参名 `request_id`）实为传入的 `req_key`（`append(req_key, …)` / `force_flush(req_key)` 直通，`stream_buffer.ts:51/96`），查询语义正确，仅参数名略误导，非缺陷。
- 本轮新发现：0 条。
- 未进表的提示：
  - 文件过大（降级规则，仅列路径与行数）：`src/extension/background/network_capture.ts` 1206 行（base 已超 800 阈值）；`src/extension/background/cdp_handler.ts` 892 行（旁路，本任务仅 +1 接口字段）。
  - 范围外观察（minor，非本任务引入）：f001 同类回归（ws_frame url 丢失）无单测直接断言 frame `url` 字段，根会话 websocket_capture.test.ts 仅断言 direction/payload/ws_connection_id；此覆盖缺口属 test reviewer 职责，建议其补充 url 断言以防复合键回归。`cdp_primary_emitted` 只写不读、`ws_handler.ts` 空 import、流式 `finished_before_stream` 每 SSE 泄漏一字符串均为 pre-existing，非本次引入。
  - 范围内观察（minor，非缺陷）：`CdpRequestMeta.session_id`（`cdp_handler.ts:86`）在 `:463`/`:490` 写入但无读取点，当前仅信息冗余，不影响 AC。
- 总体判断：f001 修复正确且唯一遗漏点已闭环，其余 Map/Set 复合键改造完整、子目标 body 命令带 sessionId、对外 request_id 保留原值；无未解决 critical / important。
- AC 复验方式：
  - AC-001：`re_verified` — 重跑 `npx vitest run tests/unit/network_capture_session_key.test.ts tests/unit/network_cdp.test.ts tests/unit/network_capture.test.ts tests/unit/websocket_capture.test.ts tests/unit/cdp_state_cleanup.test.ts`（5 文件 131 passed）；AC-001 用例断言双 session 同 requestId 的 meta 均保留且两事件均写入。
  - AC-002：`re_verified` — AC-002 用例断言 streamResourceContent 与 getResponseBody 的 sendCommand target 均含 `sessionId === SESSION_A`；通过。
  - AC-003：`re_verified` — AC-003 用例断言根 session 输出 `request_id === 'req_root'`、`response_body_status === 'captured'`；通过。
  - coverage = re_verified / 总 AC 数 = 3/3
- 系统性 follow-up：无（ws url 测试覆盖缺口建议由 test reviewer 在 t094 内补，或登记 follow-up）。

verdict: PASS
