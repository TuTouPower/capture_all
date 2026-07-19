# Task plan - T019 cdp_events_integrity

## 步骤

1. 红：新建 `tests/unit/bridge_cdp_events.test.ts`，注入 mock session 调用 `handle_cdp_events`，覆盖 101 条跨轮询 + CDP error 终态。CDP error 路径通过模拟 WebSocket message 处理函数（如导出 internal handler）或在 handle_cdp_start 注入 mock ws 后 emit message。
2. 红：跑测试失败。
3. 绿：
   - `handle_cdp_events`: 用 `to_return = completed.slice(0, MAX)`，然后 `session.events = pending.concat(completed.slice(MAX))`。
   - `ws.onmessage` response 分支：删 `body_seq_to_req_id.delete` 后，若 `waiting_event` 存在但 `msg.result` 不存在（即 `msg.error`），设 `cdp_failed`。
4. 全量 `npm test` + `tsc --noEmit`。
5. log + commit + 归档。

## 风险与回退

- 风险：session.events 保留大量 completed 影响内存。缓解：保持 5 分钟自动清理；MAX_EVENTS_PER_POLL 仍限制单次返回。
- 风险：测试需要 mock WebSocket 与内部 session state。缓解：暴露必要的内部接口或用 WebSocket mock。
- 回退：`git revert <commit>`。
