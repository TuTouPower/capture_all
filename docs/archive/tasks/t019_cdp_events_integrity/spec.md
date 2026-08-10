# Task spec - T019 cdp_events_integrity

## 背景

`src/bridge/cdp_handler.ts` 两个正确性缺陷：

1. `handle_cdp_events:311-325` 先把全部 completed 事件移出 `session.events`（保留 pending），随后才 `completed.slice(0, MAX_EVENTS_PER_POLL)`。第 101+ 条 completed 事件既未返回也未放回，永久丢失。高流量页面或轮询间隔稍长时发生静默网络事件丢失。
2. `ws.onmessage` line 241-269：收到 CDP command response 后立即 `body_seq_to_req_id.delete(msg.id)`，但仅在 `waiting_event && msg.result` 时更新状态。CDP 返回 `{id, error}`（如 `No resource with given identifier`、`No stream` 等）时事件保持 `response_body_status: 'pending'`，且映射已删，后续无法完成，事件永久 pending。

## 范围

代码/配置：

- `src/bridge/cdp_handler.ts`：
  - `handle_cdp_events` 改为只移除本次实际返回的前 `MAX_EVENTS_PER_POLL` 条 completed 事件，未返回的 completed 留在 `session.events` 等下次轮询。
  - `ws.onmessage` CDP response 分支：匹配到 waiting_event 后无论 `msg.result` 还是 `msg.error` 都终结状态。`msg.error` 时设 `response_body_status='cdp_failed'`。

测试：

- `tests/unit/cdp_handler_redaction.test.ts` 同文件或新建 `tests/unit/bridge_cdp_handler.test.ts`：
  - 101 条 completed 事件跨两次轮询全部返回，不丢失。
  - CDP error response 后事件 status='cdp_failed' 且下次轮询可返回（非 pending）。

文档：

- 无 blueprint 改动。

## 非范围

- 不改 `handle_cdp_start` 的 WebSocket 等 open 行为（T062 处理）。
- 不改 `MAX_EVENTS_PER_POLL` 常量值。
- 不改 CDP target 严格匹配（T061 处理）。

## 验收标准

- [ ] 101 条 completed 事件首次轮询返回 100 条、第二次返回 1 条，零丢失。-> 验证：单测。-> 预期：两次 events 总数 = 101。
- [ ] CDP `{id, error}` response 后 waiting_event.response_body_status === 'cdp_failed'。-> 验证：单测。-> 预期：'cdp_failed'。
- [ ] CDP error 后事件可被下次轮询返回（非 pending 残留）。-> 验证：单测。-> 预期：handle_cdp_events events 包含该事件。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：网络事件不丢失；CDP error 有明确终态。
- 无数据迁移。
- 无平台限制。
