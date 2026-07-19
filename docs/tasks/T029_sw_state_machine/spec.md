# Task spec - T029 sw_state_machine

## 背景

`src/extension/background/service_worker.ts:267-327,479-558` start/stop 用模块内存 `is_capturing`/`current_capture` 管理状态，无串行化：
- `start_capture` 仅入口检查 `is_capturing`，随后多次 await（query tabs、create_capture），并发 start 可同时通过。
- `stop_capture` 立即翻 `is_capturing=false`，清理期间新 start 可进入，旧 stop 最后 `flush_all()` 可能作用于刚启动的新采集。

按 T028 spike 设计实施状态机。

## 范围

代码/配置：

- 新建 `src/extension/background/capture_state.ts`：
  - `CaptureRuntimeState` 类型 + `get_state()`/`begin_start()`/`begin_stop()`/`run_exclusive()`/`current_generation()`/`is_active_generation()`。
  - 模块单例，`pending_promise` 串行化 start/stop。
- `src/extension/background/service_worker.ts`：
  - start/stop 改用 `run_exclusive` 串行化。
  - `is_capturing`/`current_capture` 等模块变量改为派生自 `get_state()`（或保留兼容性 getter）。
  - 入口 `is_capturing` 检查改为 `get_state().phase === 'capturing'`。
  - begin_start 返回 generation，commit/rollback。

测试：

- `tests/unit/capture_state.test.ts`：
  - 并发 start 串行化：两个 begin_start 第二个被拒绝或排队。
  - stop 期间 start 被拒或排队。
  - generation 单调递增。

文档：

- 无 blueprint 改动。

## 非范围

- 持久化与 SW 重启恢复（T030）。
- stop drain 顺序（T031）。
- start 回滚（T032）。
- listener generation 校验（T033）。
- 清空 current_capture_id/start_time/config（T034）。

## 验收标准

- [ ] 并发 start 两个调用串行化：第二个返回 CAPTURE_ALREADY_RUNNING 或排队。-> 验证：单测。-> 预期：两个 result 不同时 success。
- [ ] stop 期间 start 被拒。-> 验证：单测。-> 预期：stopping 阶段 start 返回 error。
- [ ] generation 单调递增。-> 验证：单测。-> 预期：第二次 begin_start 的 gen > 第一次。
- [ ] `npm test` 全绿。

## 依赖与约束

- 依赖 T028 spike 设计。
- 受影响业务不变量：同一时间只允许一次活跃采集。
- 无数据迁移。
- 无平台限制。
