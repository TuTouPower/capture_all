# Agent MCP

本地 AI Agent（Claude Code / Codex）通过 MCP 协议查询 / 控制 Capture All。Bridge + MCP Server 两层。

## 1. 架构

```
AI Agent
  ↕ MCP 协议（stdio / HTTP）
MCP Server（src/agent/mcp/）
  ↕ HTTP POST /mcp/command，可指定 browser_no 路由至特定浏览器
HTTP Bridge（src/agent/bridge/）—— 监听 127.0.0.1，管理多实例
  ↕ HTTP 轮询 GET /extension/command + POST /extension/result
Agent Bridge Client（src/extension/background/agent_bridge_client.ts）
  ↕
Agent Data Queries（src/extension/background/agent_data_queries.ts）
  ↕
IndexedDB
```

## 2. 多实例与自动登记

Bridge 支持多个浏览器扩展同时连接。每个浏览器实例通过 `browser_no`（正整数）唯一标识，在扩展设置页配置。

### 2.1 自动登记（enroll）

扩展启动后自动向 Bridge 发起 enroll（`POST /extension/enroll`），携带 `browser_no` 和 `extension_version`：

1. 扩展首次连接时需通过 `/pair` 页完成本机授权（配对码或浏览器内批准）
2. Bridge 分配 `instance_id` 和 `instance_token`（`ext_` 前缀），返回 `browser_no`
3. 扩展将 `instance_token` 持久化到 `chrome.storage.local`
4. 后续 heartbeat / command / result 均使用 `instance_token` 鉴权
5. 同 `browser_no` 再次 enroll 时，Bridge 删除旧实例及其命令队列，旧 `instance_token` 立即失效（顶替机制）

### 2.2 目标路由

MCP 命令可通过 `browser_no` 或 `target_instance_id` 指定目标浏览器：

- 单个在线实例：自动路由，无需指定
- 多个在线实例：必须指定 `browser_no` 或 `target_instance_id`，否则返回 `TARGET_REQUIRED`
- 仅一个在线时可省略 target，由 Bridge 自动选择

`get_status` 返回 `extensions[]` 数组，包含每个实例的 `instance_id`、`browser_no`、`browser_label`、`online` 状态。

### 2.3 Token 分离

- **MCP token**：Bridge 启动时配置，MCP Server 和 `/mcp/*`、`/cdp/*` 路由使用
- **instance_token**：enroll 时由 Bridge 生成，扩展用于 heartbeat/command/result 端点；Bridge 仅存储 sha256 hash，不保留明文
- 扩展数据端点（heartbeat/command/result）同时接受 MCP token 和 instance_token，优先级：MCP token → instance_token hash 比较
- instance_token 不可访问 `/mcp/*`、`/cdp/*`（返回 401）

### 2.4 /pair 本地授权

Bridge 提供 `/pair` 页面用于本机浏览器授权：

1. Bridge 启动时 `/pair` 页可用（`S0` 模式默认开放；非 S0 需显式开启）
2. 用户打开 `http://127.0.0.1:<port>/pair`，批准 `browser_no`
3. 批准后在配对窗口期内（默认 5 分钟）该 `browser_no` 可 enroll
4. 配对页支持手动输入 `browser_no` 批准，也支持配对码自动匹配
5. 关闭配对窗口后未批准的 `browser_no` 无法 enroll（返回 `PAIRING_REQUIRED`）

## 3. MCP 工具

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

工具参数用 Zod schema 校验（`src/agent/mcp/schemas.ts`）。

## 4. Bridge HTTP 协议

| 端点 | 方法 | 发起方 | 用途 |
|---|---|---|---|
| `/mcp/command` | POST | MCP Server | 发送命令 |
| `/extension/command` | GET | 扩展 | 轮询取命令 |
| `/extension/result` | POST | 扩展 | 回传结果 |
| `/extension/heartbeat` | POST | 扩展 | 在线状态 + extension_version + active_capture_id |
| `/extension/enroll` | POST | 扩展 | 自动登记，返回 instance_id + instance_token + browser_no |
| `/extension/discover` | GET | 扩展 | 本地发现（bridge 版本、enroll 路径，无需 auth） |
| `/health` | GET | 任意 | 健康检查 |
| `/cdp/detect` | POST | 扩展 | 探测外部 CDP 端口 |
| `/cdp/start` | POST | 扩展 | 启动外部 CDP 采集 |
| `/cdp/stop` | POST | 扩展 | 停止外部 CDP 采集 |
| `/cdp/events` | GET | 扩展 | 获取外部 CDP 事件 |

### 4.1 请求体大小限制

- 读取 JSON body 的普通 Bridge POST 端点上限为 1 MiB。
- `POST /extension/result` 因需回传查询结果，独立允许最大 32 MiB。
- 上限按完整序列化 HTTP body 的 UTF-8 字节数计算，包括 `command_id`、`ok`、`data` / `error` 和 JSON 结构开销。
- 超过上限返回 HTTP 413 / `PAYLOAD_TOO_LARGE`。扩展只写入不含 Token、URL、payload、result body 或标识符的脱敏错误日志，并继续后续轮询；当前 MCP 命令仍按原超时语义结束。增大 `timeout_ms` 不会绕过限制。
- 32 MiB 不是推荐结果大小，也不能保证任意采集可通过 `get_all_capture_data` 一次返回。大采集优先使用 `list_records` 分页、`get_record` 单条查询或扩展本地导出。

## 5. 命令队列与超时

- `command_queue.ts` 维护命令队列，每命令有 timeout。
- 当前 Bridge 默认命令超时为 120s；调用方可通过 `timeout_ms` 覆盖。按命令类别区分 15s / 30s / 120s 的目标策略见 `domain.md` §7，尚未在 Bridge 默认配置中自动分流。超时只返回错误，不自动降级。
- 错误码：Bridge 层 `BRIDGE_UNAVAILABLE` / `EXTENSION_OFFLINE` / `COMMAND_TIMEOUT` / `TOKEN_INVALID` / `ORIGIN_NOT_ALLOWED` / `PAYLOAD_TOO_LARGE` / `COMMAND_CANCELLED`；扩展层见 `domain.md` §8。

## 6. 查询参数

大多数 list 端点支持：

| 参数 | 说明 |
|---|---|
| `offset` / `limit` | 分页 |
| `start_time` / `end_time` | 时间范围过滤（相对采集开始的 ms） |
| `order` | `asc` / `desc` |
| `sources` | 按数据源过滤（仅 timeline） |

## 7. 安全边界

- Bridge 只监听 `127.0.0.1`，不绑定 `0.0.0.0` / 公网。
- 浏览器请求只允许格式合法的 `chrome-extension://<extension-id>` Origin；HTTP/HTTPS 页面和 `Origin: null` 返回 403。Node / MCP 等无 Origin 本地客户端允许访问。
- 除 `/health` 和 `/extension/discover` 外所有 API 必须带 token；token 用户提供，禁止硬编码 / 默认值 / 示例值。无效 / 缺失 → 401，校验使用固定长度摘要恒时比较。
- 扩展三大数据端点（heartbeat/command/result）同时支持 MCP token 和 instance_token 鉴权。`resolve_extension_auth` 优先级：MCP token → 注册表中 instance_token sha256 hash 恒时比较。
- MCP 路由（`/mcp/*`、`/cdp/*`）仅校验 MCP token，拒绝 instance_token（401 TOKEN_INVALID）。
- enroll 仅接受本机 loopback（MCP token）或合法 `chrome-extension://` Origin；无 Origin 的远程请求不可 enroll。
- Bridge 仅存储 instance_token 的 sha256 hex hash，不保留明文。enroll 响应是 instance_token 唯一一次可见明文。
- 同 browser_no 再次 enroll 删除旧实例及其命令队列（顶替），保证编号唯一路由。
- Bridge Token 推荐通过 `CAPTURE_ALL_BRIDGE_TOKEN` 环境变量传入，避免出现在进程参数。`--token` 保持兼容，同时提供时 CLI 优先。
- 端口用户配置，禁止硬编码。
- Bridge 不存储日志、不脱敏、不摘要替代详情。
- MCP 不提供删除采集 / 清空数据能力。
- MCP 不自动脱敏 / 摘要 / 过滤——工具层不替模型做数据判断。

## 8. 默认配置

`src/shared/constants.ts` 的 `DEFAULT_USER_CONFIG`：

```typescript
agent_bridge_enabled: true,
agent_bridge_url: 'http://127.0.0.1:17831',  // 占位，实际端口以用户配置为准
agent_bridge_token: '',                       // 必须由用户提供
agent_bridge_poll_interval_ms: 1000,
```

Bridge 默认启用。用户必须在设置页填入 token 后才能实际通信。

## 9. 关键文件

- `src/agent/bridge/main.ts` — Bridge 服务入口（`npm run bridge`）。
- `src/agent/bridge/server.ts` — HTTP 服务器。
- `src/agent/bridge/command_queue.ts` — 命令队列。
- `src/agent/bridge/config.ts` — Bridge CLI/环境变量配置。
- `src/agent/bridge/cdp_handler.ts` — 外部 CDP 处理。
- `src/agent/mcp/main.ts` — MCP Server 入口（`npm run mcp`）。
- `src/agent/mcp/client.ts` — Bridge MCP 客户端。
- `src/agent/mcp/schemas.ts` — Zod schema。
- `src/agent/mcp/tools.ts` — 工具名 → AgentCommandType 映射。
- `src/agent/shared/protocol.ts` — AgentCommandType / AgentCommandResult / AgentStatus 类型。
- `src/extension/background/agent_bridge_client.ts` — 扩展侧轮询客户端（export `start_bridge_client`, `stop_bridge_client`, `is_bridge_client_running`）。
- `src/extension/background/agent_command_dispatcher.ts` — 命令分发。
- `src/extension/background/agent_data_queries.ts` — 数据查询。
- `src/shared/agent_bridge_config.ts` — Bridge 配置类型。

## 10. 构建产物

### 10.1 esbuild 单文件

`npm run build` 额外生成：

| 产物 | 命令 | 说明 |
|------|------|------|
| `artifacts/bridge/bridge.mjs` | `npm run build:bridge` | Bridge 独立可运行文件 |
| `artifacts/mcp/mcp.mjs` | `npm run build:mcp` | MCP Server 独立可运行文件 |

两个产物均为 esbuild bundled ESM，不依赖 tsx 和 node_modules。部署只需复制 `.mjs` 到目标机器，`node bridge.mjs` 直接运行。

Bridge 必须持续运行在后台（扩展通过轮询 Bridge 获取命令）。MCP Server 按需启动（Claude Code 自动管理其生命周期）。

### 10.2 Claude Code MCP 注册

项目根目录提供 `.mcp.json.example`。复制为只供本机使用的 `.mcp.json`，填入与 Bridge 相同的 MCP Token：

```json
{
  "mcpServers": {
    "capture-all": {
      "command": "node",
      "args": [
        "-e",
        "const { resolve } = require('node:path'); const { pathToFileURL } = require('node:url'); const project_dir = process.env.CLAUDE_PROJECT_DIR || process.cwd(); import(pathToFileURL(resolve(project_dir, 'artifacts/mcp/mcp.mjs')).href);"
      ],
      "env": {
        "CAPTURE_ALL_BRIDGE_URL": "http://127.0.0.1:17831",
        "CAPTURE_ALL_BRIDGE_TOKEN": "<YOUR_BRIDGE_TOKEN>"
      }
    }
  }
}
```

`.mcp.json` 已加入 `.gitignore`，禁止提交真实 Token 或本机绝对路径。启动脚本在 MCP 子进程中读取 Claude Code 注入的 `CLAUDE_PROJECT_DIR`，不依赖 Claude Code 当前工作目录。

用户流程（自动登记，推荐）：

1. `npm run build`
2. 在扩展设置页为每个浏览器实例分配唯一 `browser_no`（如 1、2、3）
3. `CAPTURE_ALL_BRIDGE_TOKEN='<你的 Token>' node artifacts/bridge/bridge.mjs --port 17831 &`（后台持续运行；兼容参数 `--token` 同时存在时优先）
4. 复制 `.mcp.json.example` 为 `.mcp.json`，填入与步骤 3 相同的 MCP Token
5. 扩展自动向 Bridge 登记（enroll），获取 `instance_token`；首次需通过 `/pair` 页批准
6. 重开 Claude Code 会话，MCP 工具自动加载
7. 对话中通过 `browser_no` 指定目标浏览器，调用 `start_recording`、`list_captures`、`list_records` 等 MCP 工具

兼容方式（手动粘贴 Token，单浏览器）：
1. 在扩展设置中填入与 Bridge 相同的 MCP Token，扩展以传统 Token 模式连接
2. `.mcp.json` 填入同一 Token；无需设置 `browser_no`
