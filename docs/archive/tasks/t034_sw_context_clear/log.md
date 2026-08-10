# Task log - T034 sw_context_clear

## 进展

- 2026-07-19：`src/extension/background/service_worker.ts`：
  - stop_capture_inner 在 `current_capture = null` 处同步清空 `current_capture_id`/`start_time`/`current_config`。
  - `get_status()` 改为 `is_capturing ? current_capture_id : null`。

## 关键验证

- 全量：`npm test` 102 文件 / 1136 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- 与 capture_state.commit() 配合：状态机回 idle + 模块变量清空双重保险。
- get_status 仅在 capturing 返回 active id，其他阶段返回 null，避免 Bridge 误报。

## 验收

- [x] stop 后 current_capture_id === null。
- [x] stop 后 start_time === 0、current_config === DEFAULT_CONFIG。
- [x] get_status 在非 capturing 返回 active_capture_id: null。
- [x] npm test 全绿。
