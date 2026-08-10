# Spec — SW 启动 cleanup_stale 与 start 互斥

SW 冷启动时 `cleanup_stale_capture_state` 清理陈旧 active capture 持久键，须与 `start_capture` / `stop_capture` 互斥，避免清掉刚启动的 live 采集。

## 互斥语义

- `cleanup_stale_capture_state` 经 `capture_state.run_exclusive` 与 start/stop 串行执行。
- 锁内检查 `capture_state.get_state().phase !== 'idle'`：有 live capturing（start 已先完成）时跳过清理。
- 无 live capturing 且仅有陈旧 active 键时，cleanup 将陈旧 capture 终态化（`status: completed`）并清除 active 键。

## 相关实现

- `src/extension/background/service_worker.ts`：`cleanup_stale_capture_state`（导出供测试）
- `src/extension/background/capture_state.ts`：`run_exclusive` 串行化
- `tests/unit/cleanup_start_mutex.test.ts`：AC-001 互斥保留 / AC-002 陈旧清理回归
