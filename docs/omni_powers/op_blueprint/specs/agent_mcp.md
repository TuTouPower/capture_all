# Agent MCP

本地 AI Agent（Claude Code / Codex）通过 MCP 协议查询 / 控制 Capture All。Bridge + MCP Server 两层。

## 1. 架构

```
AI Agent
  ↕ MCP 协议（stdio / HTTP）
MCP Server（src/agent/mcp/）
  ↕ HTTP POST /mcp/command
HTTP Bridge（src/agent/bridge/）—— 监听 127.0.0.1
  ↕ HTTP 轮询 GET /extension/command + POST /extension/result
Agent Bridge Client（src/background/agent_bridge_client.ts）
  ↕
Agent Data Queries（src/background/agent_data_queries.ts）
  ↕
IndexedDB
```

## 2. MCP 工具

| 工具 | 命令 | 说明 |
|---|---|---|
| `get_status` | （bridge 本地） | bridge 版本、扩展在线状态、活跃采集 |
| `start_recording` | `capture.start` | 启动采集，返回 capture_id |
| `stop_recording` | `capture.stop` | 停止采集 |
| `list_captures` | `captures.list` | 列采集记录（分页） |
| `get_capture` | `captures.get` | 单采集元信息 |
| `list_data_sources` | `sources.list` | 采集中的数据源及计数 |
| `list_records` | `data.list` | 按 source 列记录（分页 / 时间过滤 / 排序） |
| `get_record` | `data.get` | 单条完整原始记录 |
| `get_timeline` | `timeline.list` | 合并多 source 时间线（分页） |
| `get_timeline_item` | `timeline.get` | 时间线单项完整数据 |
| `get_all_capture_data` | `capture.get_all_data` | 一次性获取 capture 完整数据 |
| `export_capture` | `capture.export` | 触发 JSON / JSONL / HTML / HAR 导出 |

兼容别名（旧命名，映射同命令）：`list_sessions` / `get_session` / `get_all_session_data` / `export_session`。

工具参数用 Zod schema 校验（`src/agent/mcp/schemas.ts`），替代 passthrough。

## 3. Bridge HTTP 协议

| 端点 | 方法 | 发起方 | 用途 |
|---|---|---|---|
| `/mcp/command` | POST | MCP Server | 发送命令 |
| `/extension/command` | GET | 扩展 | 轮询取命令 |
| `/extension/result` | POST | 扩展 | 回传结果 |
| `/extension/heartbeat` | POST | 扩展 | 在线状态 + extension_version + active_capture_id |
| `/health` | GET | 任意 | 健康检查 |
| `/cdp/detect` | POST | 扩展 | 探测外部 CDP 端口 |
| `/cdp/start` | POST | 扩展 | 启动外部 CDP 采集 |
| `/cdp/stop` | POST | 扩展 | 停止外部 CDP 采集 |
| `/cdp/events` | GET | 扩展 | 获取外部 CDP 事件 |

## 4. 命令队列与超时

- `command_queue.ts` 维护命令队列，每命令有 timeout。
- 超时策略（见 `domain.md` §7）：查询 30s / 全量 120s / 导出 120s / start/stop 15s。超时只返回错误，不自动降级。
- 错误码：Bridge 层 `BRIDGE_UNAVAILABLE` / `EXTENSION_OFFLINE` / `COMMAND_TIMEOUT` / `TOKEN_INVALID` / `COMMAND_CANCELLED`；扩展层见 `domain.md` §8。

## 5. 查询参数

大多数 list 端点支持：

| 参数 | 说明 |
|---|---|
| `offset` / `limit` | 分页 |
| `start_time` / `end_time` | 时间范围过滤（相对采集开始的 ms） |
| `order` | `asc` / `desc` |
| `sources` | 按数据源过滤（仅 timeline） |

## 6. 安全边界

- Bridge 只监听 `127.0.0.1`，不绑定 `0.0.0.0` / 公网。
- 所有 API 必须带 token；token 用户提供，禁止硬编码 / 默认值 / 示例值。无效 / 缺失 → 401。
- 端口用户配置，禁止硬编码。
- Bridge 不存储日志、不脱敏、不摘要替代详情。
- MCP 不提供删除采集 / 清空数据能力。
- MCP 不自动脱敏 / 摘要 / 过滤——工具层不替模型做数据判断。

## 7. 默认配置

`src/shared/constants.ts` 的 `DEFAULT_USER_CONFIG`：

```typescript
agent_bridge_enabled: true,
agent_bridge_url: 'http://127.0.0.1:17831',  // 占位，实际端口以用户配置为准
agent_bridge_token: '',                       // 必须由用户提供
agent_bridge_poll_interval_ms: 1000,
```

Bridge 默认启用。用户必须在设置页填入 token 后才能实际通信。

## 8. 关键文件

- `src/agent/bridge/main.ts` — Bridge 服务入口（`npm run bridge`）。
- `src/agent/bridge/server.ts` — HTTP 服务器。
- `src/agent/bridge/command_queue.ts` — 命令队列。
- `src/agent/bridge/config.ts` — Bridge 配置。
- `src/agent/bridge/cdp_handler.ts` — 外部 CDP 处理。
- `src/agent/mcp/main.ts` — MCP Server 入口（`npm run mcp`）。
- `src/agent/mcp/client.ts` — Bridge MCP 客户端。
- `src/agent/mcp/schemas.ts` — Zod schema。
- `src/agent/mcp/tools.ts` — 工具注册 + 命令映射。
- `src/agent/shared/protocol.ts` — 命令协议类型（10 个命令）。
- `src/background/agent_bridge_client.ts` — 扩展侧轮询客户端。
- `src/background/agent_command_dispatcher.ts` — 命令分发。
- `src/background/agent_data_queries.ts` — 数据查询。
- `src/shared/agent_bridge_config.ts` — Bridge 配置类型。
