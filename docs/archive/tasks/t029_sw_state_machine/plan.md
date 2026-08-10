# Task plan - T029 sw_state_machine

## 步骤

1. 红：新建 tests/unit/capture_state.test.ts 覆盖 3 项验收。
2. 红：跑测试失败。
3. 绿：
   - 新建 capture_state.ts：单例模块，CaptureRuntimeState 类型 + API。
   - run_exclusive 用 Promise 链串行化。
   - service_worker.ts: start_capture/stop_capture 用 run_exclusive 包裹；is_capturing 改为派生 getter。
4. 全量 npm test + tsc --noEmit。
5. log + commit + 归档。

## 风险与回退

- 风险：现有 service_worker 测试期望 is_capturing 字面值。缓解：保持模块变量作为派生。
- 风险：run_exclusive 改变 stop 时序。缓解：仔细 review stop 流程。
- 回退：`git revert <commit>`。
