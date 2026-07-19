# Task log - T028 spike: SW capture state machine design

## 进展

- 2026-07-19：输出 spike report（report.md），定义 SW capture 状态机：
  - 5 阶段（idle/starting/capturing/stopping/rolling_back）。
  - CaptureRuntimeState 类型与 capture_state 模块 API（begin_start/begin_stop/run_exclusive/current_generation/is_active_generation）。
  - 持久化键设计（active_capture_id/start_ms/config/generation）。
  - generation token 规则（每次 begin_start 递增，listener 入口捕获，await 后校验）。
  - 并发约束（run_exclusive 串行化 start/stop）。
  - 回滚清单与 stop drain 顺序。

## 关键验证

- spike 决策：采纳。
- 后续 task：T029-T033 按 spike 设计实施。

## 决策

- spike 不写代码，仅输出设计文档。
- T029-T033 分别对应：状态机+串行化、持久化+SW 重启、stop drain、start 回滚、listener generation。

## 验收

- [x] spike report 含状态机图、API、持久化键、generation token、并发约束、回滚清单、stop drain 顺序。
- [x] 采纳决策与后续 task ID。
