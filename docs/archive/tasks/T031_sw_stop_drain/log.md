# Task log - T031 sw_stop_drain

## 进展

- 2026-07-19：调整 `src/extension/background/service_worker.ts` `stop_capture_inner` 顺序，按 T028 spike drain 顺序：
  1. 不立即翻 `is_capturing=false`，让 in-flight 回调继续 drain；通过 `capture_state.phase='stopping'` 拒绝新 start/stop 命令。
  2. 先停生产者（keepalive/network/body/cookie/console/exception + 通知 content scripts）。
  3. drain：stop_periodic_flush + flush_all 落库剩余事件。
  4. 翻 is_capturing=false。
  5. 写 stopped_event + update_capture（含 drain 后最终 stats）。
  6. flush stopped_event 入库。
  7. 清空持久化活跃采集状态。

## 关键验证

- 全量：`npm test` 102 文件 / 1136 用例全绿（现有 stop_capture.test.ts 仍通过，验证顺序调整不破坏行为）。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- 不立即翻 is_capturing=false：保持回调入口处理 drain 期事件；capture_state.stopping 已拒绝新 start/stop。
- stopped_event 在 drain 后写入，stats 反映真实采集终点。
- flush_stopped_event 单独步骤确保 stopped_event 入 IndexedDB。

## 验收

- [x] stopped_event 写入发生在 stop_network/stop_body 之后（顺序调整）。
- [x] npm test 全绿。
