# Task log — T004 mcp_relocate

## 记录

### 2026-07-19 Phase 3b 执行

- `git mv src/agent/mcp src/mcp`；`rmdir src/agent`（src/agent/ 至此清空）。
- `src/mcp/*` 内部 2 处 `../../shared/` → `../shared/`（client.ts + tools.ts）。
- 批量改引用：
  - `tests/{agent_mcp_client, mcp_schema, export_large_fix, package_metadata}.test.ts`：`src/agent/mcp/` → `src/mcp/`
  - `package.json`：`mcp` 与 `build:mcp` 脚本
  - `AGENTS.md`：`npm run mcp` 命令描述

### 关键验证

- `npx tsc --noEmit`：No errors found。
- `npm test`：90 文件 / 1079 测试全绿。
- `npm run build`：bridge.mjs 46.6K、mcp.mjs 1.1M 正确生成。
- `grep -rn 'agent/mcp'`：无残留。

### 完结

- 范围内全部完成；`src/agent/` 已删。
- 未派 review subagent（与 T003 同模式，三重验证已足够）。
