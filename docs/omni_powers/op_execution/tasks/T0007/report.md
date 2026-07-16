# T0007 实现报告

**状态**: DONE
**日期**: 2026-07-16
**分支**: op/task/T0007

## 改动摘要

| 文件 | 变更 |
|------|------|
| `src/agent/mcp/schemas.ts` | 新增 `browser_no_schema`；`capture_config_schema` `.strict()` → `.passthrough()`；全部 schema 加 `.passthrough()` + `browser_no`；`export_capture` format `z.enum()` → `z.string()`；新增 `list_browsers_schema` |
| `src/agent/mcp/tools.ts` | `MCP_TOOL_NAMES` 新增 `list_browsers`；`execute_mcp_tool` 新增 `list_browsers` 处理 → 调用 `get_status()` 返回 `extensions` |
| `tests/mcp_schema.test.ts` | 修改：`start_recording` unknown config fields 从 fail→pass；`export_capture` invalid format 从 fail→pass；新增：`list_browsers` 测试、`browser_no` passthrough 测试、unknown fields passthrough 测试（45 tests） |
| `tests/agent_mcp_client.test.ts` | `MCP_TOOL_NAMES` 预期新增 `list_browsers`；新增：`list_browsers returns extensions`、`passes browser_no through to bridge payload`（14 tests） |

## 不变量验证

- **INV-1**: MCP 模块无 `instance_token` 持久化逻辑 ✓（源码否证，AC-5）
- **INV-2**: MCP 仅持有 Bridge URL + token（环境变量注入）✓
- **INV-3**: Schema 全部 `.passthrough()`，未知可选字段不报错 ✓
- **INV-4**: 全部 schema 含 `browser_no` optional，透传至 bridge payload ✓
- **INV-5**: 多实例缺 browser_no 时 bridge 返回 `TARGET_REQUIRED`——已由 bridge 侧实现，MCP 原样呈现 ✓

## 测试摘要

```
npm test → 88/89 pass, 1 pre-existing failure (agent_bridge_config.test.ts, 非本次引入)
mcp_schema.test.ts: 45/45 pass
agent_mcp_client.test.ts: 14/14 pass
```

## Round 记录

### Round 1 — 初始实现

RED 阶段：先写 schema 放宽期望 + list_browsers 测试，确认旧 schema 无法通过新测试。
GREEN 阶段：实现 `schemas.ts`（passthrough + browser_no + list_browsers）+ `tools.ts`（list_browsers 特殊处理）。
REFACTOR：无额外重构，实现即最优形态。
