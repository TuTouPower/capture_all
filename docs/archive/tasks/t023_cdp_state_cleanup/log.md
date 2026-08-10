# Task log - T023 cdp_state_cleanup

## 进展

- 2026-07-19：`src/extension/background/cdp_handler.ts` 三处清理：
  1. 删除 `cdp_primary_emitted` Set（只写不读）；`WebRequestHandlerState` 同步删除字段。
  2. `handle_loading_finished` 各 emit 完成清理路径同步 `finished_before_stream.delete(req_key)`；orphan 回调也 delete。
  3. `CdpHandlerState` 加 `orphan_timers: Map<string, setTimeout>`；`schedule_orphan_check` 保存句柄，回调触发后 delete；新增 `clear_orphan_timers(state)` 供停止/reset 时清所有 timer。

## 关键验证

- 红 -> 绿：cdp_state_cleanup.test.ts 3 用例 -> 2 红 -> 全绿。
- 全量：`npm test` 98 文件 / 1121 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- cdp_primary_emitted 历史上用于去重，但当前所有 emit 路径都已 cdp_request_meta.delete 自然去重，Set 已无用，删除。
- finished_before_stream 在请求完成 emit 后立即清理，避免长采集期间线性增长与 requestId 重用误判。
- orphan_timers 提供显式 cancel 入口，T025/T035 stop 流程可调用。

## 验收

- [x] 100 请求完成后 finished_before_stream.size === 0。
- [x] cdp_primary_emitted 字段已删（grep 无引用）。
- [x] orphan timer 跟踪句柄，回调触发后清理。
- [x] npm test 全绿。
