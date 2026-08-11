# Spec — external body poll 生命周期

`start_body_capture` 的 external CDP bridge 模式通过递归 `setTimeout` 单飞轮询拉取 body 事件，`stop_body_capture` / `stop_body_capture_with_cleanup` 必须真正停止轮询。

## 停止语义

- `coordinator_state` 持有 `stop_poll` 闭包回调（置 `poll_stopped` 并清当前 timer）。
- `stop_body_capture` / `stop_body_capture_with_cleanup` 必须先调用 `stop_poll` 再清状态；cleanup 变体额外调用 `stop_external_cdp` 释放 bridge 会话。
- `poll_once` 在 in-flight resolve 后、写事件前检查 `poll_stopped`，stop 后 in-flight 返回不再写网络事件。
- 重入 `start_body_capture` 前先停旧 poll，避免双闭包双 timer 双写。

## 相关实现

- `src/extension/background/body_capture_coordinator.ts`：轮询生命周期
- `tests/unit/body_capture_external_poll_stop.test.ts`：stop 停止 / in-flight 不写 / 重入无双 poll 测试
