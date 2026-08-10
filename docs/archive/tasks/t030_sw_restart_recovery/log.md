# Task log - T030 sw_restart_recovery

## 进展

- 2026-07-19：`src/extension/background/service_worker.ts` SW 重启活跃采集恢复：
  - start_capture_inner：成功后写持久化键 `active_capture_id`/`active_capture_start_ms`/`active_capture_config`/`active_capture_generation`。
  - stop_capture_inner：清理前清空这些键。
  - cleanup_stale_capture_state：读新键（+ 旧键向后兼容），残留则 `update_capture` 标 completed + ended_at + duration；若仅 active_capture_id 无完整 record 则按 id 加载并终态化；最后清空所有键。

## 关键验证

- 红 -> 绿：service_worker_stale_cleanup.test.ts 5 用例（含新增 active_capture_id 读取） -> 全绿。
- 全量：`npm test` 102 文件 / 1136 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- 持久化键 4 个：capture_id + start_ms + config + generation（与 capture_state 内部字段对齐）。
- cleanup 兼容旧键（is_capturing/current_capture）保证平滑迁移。
- 仅做 CaptureRecord 终态化与状态清理，不重连生产者（产品语义：重启视为采集中止）。

## 验收

- [x] start_capture 成功后持久化键被写（storage_set 含 active_capture_id）。
- [x] stop_capture 后键被清。
- [x] cleanup 读取 active_capture_id 残留时清空 + 终态化。
- [x] npm test 全绿。
