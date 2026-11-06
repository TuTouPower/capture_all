# Task spec + log - T046 result_delivery_retry

## 背景

`src/extension/background/agent_bridge_client.ts:150-167,303-315` 扩展 dispatch 后 send_result 失败只写限频日志，不重试；Bridge 已从队列移除命令，最终 COMMAND_TIMEOUT。副作用命令（capture.start/stop）调用方收到超时但已生效。

## 范围

- 新增 `send_result_with_retry`：最多 3 次，退避 0/500/1000ms；4xx（非 429）不重试。
- 调用点用 send_result_with_retry 替代 send_result。

## 验收

- [x] send_result 失败时重试最多 3 次。
- [x] 4xx 非 429 立即抛错不重试。
- [x] npm test 全绿。

## 进展

- 2026-07-19：send_result_with_retry 实现；agent_bridge_client.test.ts 推进 fake timers 让重试完成。

## 决策

- Bridge 端幂等确认（按 command_id）未实现（需 Bridge 配合）；本 task 仅扩展端重试。
- 重试期间不暂停 fetch_command（暂停会引入复杂同步），但 send_result_with_retry 阻塞 loop 下一次 iteration，实际效果近似串行。
