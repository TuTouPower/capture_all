# Task plan - T028 spike: SW capture state machine design

## 步骤

1. 读 `service_worker.ts`、`storage.ts`、`body_capture_coordinator.ts` 等关键状态持有模块。
2. 输出 spike report：状态机 + API + 持久化键 + generation token + 并发约束 + 回滚清单 + stop drain 顺序。
3. 报告标注采纳与后续 task（T029-T033）。
4. log + commit + 归档（spike report 随 task 归档）。

## 风险与回退

- 风险：spike 决策可能调整。缓解：T029-T033 实施时如发现设计缺陷再补 spike 修订。
- 回退：spike 不改代码，无回滚成本。
