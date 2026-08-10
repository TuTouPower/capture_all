# Task spec — T004 mcp_relocate

## 背景

`docs/refactor_plan.md` §4.4：`src/agent/mcp/*` → `src/mcp/`。MCP 是独立产品（MCP Server + 工具 schema + Bridge HTTP 客户端），按 §4.1 依赖方向应与 extension / bridge 平级。`src/agent/` 在 T003 后只剩 `mcp/`，T004 完成后 `src/agent/` 可删。

## 范围

- `git mv src/agent/mcp src/mcp`
- `src/mcp/*` 内部 `../../shared/` → `../shared/`（client + tools 共 2 处）
- 同步改引用：
  - `tests/{agent_mcp_client,mcp_schema,export_large_fix,package_metadata}.test.ts`
  - `package.json` 的 `mcp` 与 `build:mcp` 脚本
  - `AGENTS.md` 命令描述
- 删除空目录 `src/agent/`
- 跑 `npm test` 与 `npm run build` 全绿

## 非范围

- extension surfaces 搬家（T005）
- manifest / _locales 迁 src/extension/（T005）

## 验收标准

- [ ] `src/mcp/` 存在；`src/agent/` 不存在
- [ ] 无残留 `agent/mcp` import / 脚本 / 文档引用
- [ ] `npm test` 全绿（含 `tests/package_metadata.test.ts`）
- [ ] `npm run build` 全绿；`artifacts/mcp/mcp.mjs` 正确生成

## 依赖与约束

- T003 已完成（bridge 已搬到 `src/bridge/`）。
- 不变量：MCP 不直接依赖 bridge 源码（§4.1）；token / 安全边界不变。
