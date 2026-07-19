# Task log - T019 cdp_events_integrity

## 进展

- 2026-07-19：`src/bridge/cdp_handler.ts` 两处修复：
  1. `handle_cdp_events` 改为只移除本次返回的前 MAX_EVENTS_PER_POLL 条 completed，未返回的 completed 保留在 `session.events` 等下次轮询。
  2. `ws.onmessage` CDP response 分支：匹配到 waiting_event 后无论 `msg.result` 还是 `msg.error` 都终结状态。`msg.error` 时设 `response_body_status='cdp_failed'`。

## 关键验证

- 红 -> 绿：bridge_cdp_events.test.ts 2 用例 -> 全红 -> 全绿。
- 全量：`npm test` 94 文件 / 1111 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- 101+ 条事件按 MAX_EVENTS_PER_POLL=100 分批返回；剩余 completed 仍按时间顺序排在 pending 之前（原行为保留）。
- CDP error 与 result.body 缺失同走 `cdp_failed` 终态，下次轮询可被消费。

## 验收

- [x] 101 条 completed 跨两次轮询全部返回（100+1+0）。
- [x] CDP `{id,error}` response 后事件 status='cdp_failed'。
- [x] CDP error 后下次轮询返回该事件。
- [x] npm test 全绿。
