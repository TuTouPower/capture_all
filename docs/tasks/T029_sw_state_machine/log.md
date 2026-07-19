# Task log - T029 sw_state_machine

## 进展

- 2026-07-19：按 T028 spike 设计实施：
  - 新建 `src/extension/background/capture_state.ts`：CaptureRuntimeState 类型 + get_state/begin_start/begin_stop/run_exclusive/current_generation/is_active_generation。模块单例，pending_promise 串行化。
  - `src/extension/background/service_worker.ts`：start_capture/stop_capture 用 run_exclusive 包裹串行化；begin_start 返回 commit/rollback 句柄；begin_stop 进入 stopping 阶段。

## 关键验证

- 红 -> 绿：capture_state.test.ts 5 用例覆盖 run_exclusive 串行化、begin_start generation 递增 + commit、begin_stop stopping、rollback 回 idle、is_active_generation 过期判别。全绿。
- 全量：`npm test` 102 文件 / 1135 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- capture_state 模块单例，service_worker 通过 run_exclusive 串行化入口。
- is_capturing 模块变量保留作为派生兼容（其他模块仍读它）；capture_state.phase 作为权威状态。
- stop_capture_inner 保留原实现（含 T031 stop drain 顺序待优化）。
- start_capture_inner 保留原实现（含 T032 回滚待优化）。

## 验收

- [x] run_exclusive 串行化：p1 完成后 p2 才执行。
- [x] begin_start 递增 generation + commit 进入 capturing。
- [x] begin_stop 进入 stopping，commit 回 idle。
- [x] rollback 回 idle 清空。
- [x] is_active_generation 过期 generation 返回 false。
- [x] npm test 全绿。
