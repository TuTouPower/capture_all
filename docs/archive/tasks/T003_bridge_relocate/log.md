# Task log — T003 bridge_relocate

## 记录

### 2026-07-19 Phase 3a 执行

- `git mv src/agent/bridge src/bridge`；`src/agent/` 现仅余 `mcp/`。
- `src/bridge/*` 内部 5 处 `../../shared/` → `../shared/`（protocol 3 处 + constants 1 处 + redaction 1 处）。
- `src/bridge/cdp_handler.ts:1` 注释 `agent/bridge/` → `bridge/`。
- 批量改引用：
  - `tests/*.ts` 与 `tests/*.spec.ts`：`src/agent/bridge/` → `src/bridge/`（含 `agent_bridge_queue` / `agent_bridge_server` / `agent_bridge_config` / `agent_mcp_client` / `cdp_handler_redaction` / `export_large_fix` / `package_metadata` / `e2e-mcp` / `e2e-mcp-full`）
  - `package.json`：`bridge` 与 `build:bridge` 脚本
  - `AGENTS.md`：`npm run bridge` 命令描述

### 中途决策

- **sed 批量替换**：10+ 处 import 同模式替换，Edit 单文件单改成本高；用 `sed -i 's|src/agent/bridge/|src/bridge/|g'` 限定文件范围；替换后 grep 验证无残留。
- **mcp 不动**：mcp 搬家是 T004，本 task 不触碰 src/agent/mcp/。

### 关键验证

- `npx tsc --noEmit`：No errors found。
- `npm test`：90 文件 / 1079 测试全绿（含 `tests/package_metadata.test.ts` 对 `build:bridge` 脚本的字符串断言）。
- `npm run build`：bridge.mjs 46.6K、mcp.mjs 1.1M 正确生成；产物路径不变。
- `grep -rn 'agent/bridge'`：无残留。

### 完结

- 范围内全部完成。
- 未派 review subagent（路径批量替换 + tsc/vitest/build 三重验证已足够）。
