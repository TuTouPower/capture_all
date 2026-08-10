# Task spec - T028 spike: SW capture state machine design

## 背景

`src/extension/background/service_worker.ts` 用模块内存变量 `is_capturing`/`current_capture`/`current_capture_id`/`start_time`/`current_config` 管理采集状态，无串行化、SW 重启丢状态。CRITICAL-1/2 + HIGH-3~7 共 6 处缺陷都依赖状态机重构（T029-T033）。

T028 是 spike：输出状态机设计文档，供 T029-T033 实施依据。

## 范围

文档：

- 创建 `docs/spikes/S001_sw_state_machine/report.md`：
  - 目标：定义 SW capture 状态机接口、状态迁移、持久化策略、generation token、与 Bridge/MCP/UI 交互。
  - 输出：`CaptureState` 类型、`capture_state` 模块 API、持久化键、并发约束、回滚策略。
  - 不写实现代码。

## 非范围

- 不改 service_worker.ts 代码（T029-T033 实施）。

## 验收标准

- [ ] `docs/spikes/S001_sw_state_machine/report.md` 含：状态机图（idle/starting/capturing/stopping）、迁移条件、持久化键设计、generation token 规则、与现有消息处理的关系、并发约束、回滚清单。
- [ ] 报告明确"采纳"或"不采纳"。
- [ ] 采纳后报告列出后续 task ID（T029-T033）。
