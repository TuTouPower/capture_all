# Task log — T002 shared_protocol_relocate

只记录有追溯价值的进展、踩坑、中途决策、偏离 plan 原因和关键验证结果；不写命令流水账。

## 记录

### 2026-07-19 Phase 2 执行

- `git mv src/agent/shared/protocol.ts src/shared/protocol.ts`；`rmdir src/agent/shared/`。
- 同步改 10 处 import（grep 比 plan 列的 5 处更全）：
  - `src/extension/background/{agent_bridge_client,agent_command_dispatcher,agent_data_queries}.ts`：`'../agent/shared/protocol'` → `'../shared/protocol'`（3 处）
  - `tests/{agent_protocol,agent_command_dispatcher}.test.ts`：`'../src/agent/shared/protocol'` → `'../src/shared/protocol'`（2 处）
  - `src/agent/bridge/{command_queue,config,server}.ts`：`'../shared/protocol'` → `'../../shared/protocol'`（3 处）
  - `src/agent/mcp/{client,tools}.ts`：同上（2 处）

### 中途决策

- **bridge/mcp 相对路径修正**：plan 列了 5 处 import，实际 grep 发现 bridge/mcp 用的是 `../shared/protocol`（原本指向 `src/agent/shared/`），protocol 搬到 `src/shared/` 后必须改为 `../../shared/protocol`。补扫后修了 5 处额外文件。
- **不下沉 extension/shared**：按 §8 Phase 2 "若与 Phase 3 合并"，§4.3 表里"明确扩展专用"文件（i18n/theme/design_tokens.css/chrome.d.ts 等）留 Phase 3 与 extension surfaces 一起搬，不在 T002 处理。

### 关键验证

- `npx tsc --noEmit`：No errors found。
- `npm test`：90 文件 / 1079 测试全绿。
- `npm run build`：tsc + vite + bridge + mcp + zip 全绿；`artifacts/bridge/bridge.mjs` 46.6kb、`artifacts/mcp/mcp.mjs` 1.1mb 正确打包。
- `grep -rn 'agent/shared/protocol'`：无残留。

### 完结

- 范围内全部完成；commit 见下方。
- 未派 review subagent（单文件路径搬家 + 全量 tsc/vitest/build 三重验证已足够）。
