# Task log - T032 sw_start_rollback

## 进展

- 2026-07-19：`src/extension/background/service_worker.ts` start_capture_inner 拆分为 start_capture_inner（外层 try/catch + 回滚）+ start_capture_inner_impl（原实现）。catch 中调 stop_capture_inner() 逆序清理已启动的子系统（已含 drain 流程），返回失败。

## 关键验证

- 全量：`npm test` 102 文件 / 1136 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- 回滚直接调 stop_capture_inner：复用 T031 drain 流程，避免重复实现清理逻辑。
- stop_capture_inner 内部已用 run_stop_step 容错，单步失败不阻塞其他清理。
- 不引入"已完成步骤"显式清单：drain 顺序由 stop_capture_inner 决定，部分未启动的子系统其 stop 函数幂等（已通过 is_capturing/phase 守卫）。

## 验收

- [x] start_capture_inner_impl 抛错时 stop_capture_inner 被调（catch 块）。
- [x] catch 后 capture_state 通过 start_handle.rollback() 回 idle（start_capture 已在 T029 包裹）。
- [x] npm test 全绿。
