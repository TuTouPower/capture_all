# Task spec — T003 bridge_relocate

## 背景

`docs/refactor_plan.md` §4.4：`src/agent/bridge/*` → `src/bridge/`。Bridge 是独立产品（HTTP 服务器 + 命令队列 + CDP），按 §4.1 依赖方向应与 extension / mcp 平级，不应嵌在 `src/agent/` 下。

## 范围

- `git mv src/agent/bridge src/bridge`
- 调整 `src/bridge/*` 内部对 `src/shared/` 的相对路径（`../../shared/` → `../shared/`）
- 同步改引用 `src/agent/bridge/**` 的位置：
  - `tests/{agent_bridge_queue,agent_bridge_server,agent_bridge_config,agent_mcp_client,cdp_handler_redaction,export_large_fix,package_metadata,e2e-mcp,e2e-mcp-full}.test.ts/spec.ts`
  - `package.json` 的 `bridge` 与 `build:bridge` 脚本
  - `AGENTS.md` 命令描述
- `tests/package_metadata.test.ts` 对 `build:bridge` 脚本的字符串断言同步更新
- 跑 `npm test` 与 `npm run build` 全绿

## 非范围

- mcp 搬家（T004）
- extension surfaces 搬家（T005）
- 删除空 `src/agent/`（合入 T005 收尾后）

## 验收标准

- [ ] `src/bridge/` 存在；`src/agent/bridge/` 不存在
- [ ] 无残留 `agent/bridge` import / 脚本 / 文档引用
- [ ] `npm test` 全绿（含 `tests/package_metadata.test.ts`）
- [ ] `npm run build` 全绿；`artifacts/bridge/bridge.mjs` 正确生成

## 依赖与约束

- T002 已完成（protocol 已在扁平 `src/shared/`）。
- 不变量：bridge 仅绑 `127.0.0.1`；token 模型不变；bridge.mjs 产物路径不变。
