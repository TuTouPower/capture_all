# Task spec — T002 shared_protocol_relocate

## 背景

`src/agent/shared/protocol.ts` 是三端（extension / bridge / mcp）共用的线协议类型定义，按 `docs/refactor_plan.md` §4.2 / §4.3 / §4.4，跨产品共用文件应放扁平 `src/shared/`。当前路径 `src/agent/shared/` 暗示属于 agent 专属，与 §4.1 依赖方向（三产品 → src/shared）不符。

## 范围

- `git mv src/agent/shared/protocol.ts src/shared/protocol.ts`
- 同步改 5 处 import（`src/background/agent_bridge_client.ts`、`src/background/agent_command_dispatcher.ts`、`src/background/agent_data_queries.ts`、`tests/agent_protocol.test.ts`、`tests/agent_command_dispatcher.test.ts`）
- 删除空目录 `src/agent/shared/`
- 跑 `npm test` 与 `npm run build` 全绿

## 非范围

- §4.3 表里"明确扩展专用"文件下沉到 `src/extension/shared/`（与 Phase 3 合并）
- 新建 `kernel/` `domain/` 子树（D3 决策已否决）
- src/agent/{bridge,mcp} 搬家（Phase 3）

## 验收标准

- [ ] `src/shared/protocol.ts` 存在；`src/agent/shared/` 不存在
- [ ] 无残留 `agent/shared/protocol` import
- [ ] `npm test` 全绿
- [ ] `npm run build` 全绿

## 依赖与约束

- T001 已完成（Phase 0 文档骨架）。
- 不变量：bridge / mcp 仍可 import `src/shared/protocol`；扩展 background 仍可用 protocol 类型。
