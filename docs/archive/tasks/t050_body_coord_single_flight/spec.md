# Task spec + log - T050 body_coord_single_flight

## 背景

`body_capture_coordinator.ts:232-248` 500ms `setInterval(async)` 不等前一次，网络延迟超间隔时并发；停止后已在途请求仍执行 `deps.on_network_request` 无 lifecycle 校验。

## 范围

- 改为递归 setTimeout 单飞；poll_in_flight 守护；poll_stopped 标记停止。
- stop_body_capture/stop_body_capture_with_cleanup 同时 clearInterval + clearTimeout（兼容新旧）。

## 验收

- [x] 单飞轮询。
- [x] stop 后 timer 清。
- [x] npm test 全绿。

## 进展

- 2026-07-19：实施。
