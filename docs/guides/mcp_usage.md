# MCP 工具使用指南

通过 Claude Code MCP 协议控制采集、查询数据、导出结果。

## 快速开始

1. 构建产物：`npm run build`
2. 在 Chrome 加载 `artifacts/dist/` 扩展。扩展后台默认轮询 `http://127.0.0.1:17831`，首次连接凭 chrome-extension origin 直通 enroll，**无需 Token / 配对码**。Bridge 按到达顺序自动给每个浏览器编号（`1 号` / `2 号` / `3 号` …）；如需自定义备注，到扩展设置里改 `browser_label`。
3. 启动 Bridge：进入本项目的 Claude Code 会话时 SessionStart hook 自动拉起；手动启动用 `node artifacts/bridge/bridge.mjs --port 17831`（`--port` 必须显式；未设 `CAPTURE_ALL_BRIDGE_TOKEN` 时自动生成并持久化到 `$XDG_RUNTIME_DIR/capture-all/bridge_token`，mode 0600）。
4. 复制项目配置：`cp .mcp.json.example .mcp.json`。`.mcp.json` 默认**无需填 Token** —— MCP Server 按 `env > Bridge 持久化文件`自动解析，与 Bridge 对齐。`.mcp.json` 仅供本机使用，不提交到 Git。
5. 重开 Claude Code 会话，确认扩展在线：`get_status`（`extensions[].browser_label` 应见「一」/自定义备注）。
6. 多浏览器时通过 `target_label`（如"1 号"、"2 号"或自定义备注）或 `target_instance_id` 指定目标，单实例无需指定。
7. 开始采集：`start_recording`，结束采集：`stop_recording`。

### 高级：固定 Token / 跨机 pairing

- 想固定 Token：`CAPTURE_ALL_BRIDGE_TOKEN="$(openssl rand -hex 32)" node artifacts/bridge/bridge.mjs --port 17831`，然后在扩展设置和 `.mcp.json` 的 `env.CAPTURE_ALL_BRIDGE_TOKEN` 使用同一值。
- 跨机 / 高安全场景可选 pairing：`POST /pair/open`（需 MCP Token）打开配对窗口，扩展 enroll 时携带 `pairing_code` 走人工确认；loopback 默认不要求。

## 工具列表

### 状态与控制

| 工具 | 说明 | 关键参数 |
|------|------|---------|
| `get_status` | Bridge 版本、扩展在线状态、活跃采集 ID | `timeout_ms` |
| `start_recording` | 启动采集 | `capture_id`（选填,自动生成）, `config` |
| `stop_recording` | 停止当前采集 | — |

### 采集列表

| 工具 | 说明 | 关键参数 |
|------|------|---------|
| `list_captures` | 列出所有采集（分页） | `offset`, `limit`, `order` |
| `get_capture` | 单条采集元信息 | `capture_id` |

### 数据查询

| 工具 | 说明 | 关键参数 |
|------|------|---------|
| `list_data_sources` | 采集的数据源及记录数 | `capture_id` |
| `list_records` | 按数据源列记录 | `capture_id`, `source`, `offset`, `limit`, `start_time`, `end_time`, `order` |
| `get_record` | 单条完整原始记录 | `capture_id`, `source`, `record_id` |
| `get_timeline` | 合并时间线 | `capture_id`, `sources`, `offset`, `limit` |
| `get_timeline_item` | 时间线条目详情 | `capture_id`, `item_id` |
| `get_all_capture_data` | 全量数据（谨慎使用） | `capture_id`, `output_path`（选填） |

### 导出

| 工具 | 说明 | 关键参数 |
|------|------|---------|
| `export_capture` | 导出采集数据 | `capture_id`, `format`（json / jsonl / html / har）, `output_path`（选填）, `include_response_body`（选填，默认 true） |

Bridge 对 `export_capture` / `get_all_capture_data` 自动分流：

- 结果 ≤ 1 MiB：内联返回完整内容
- 结果 > 1 MiB 且未指定 `output_path`：自动写到 `CAPTURE_ALL_EXPORT_DIR`（默认系统临时目录 `capture-all-exports/`），MCP 只回 `{ file_path, size_bytes }`
- 指定 `output_path`：始终写文件

```json
{
  "capture_id": "session-xxx",
  "format": "json",
  "output_path": "/absolute/path/export.json",
  "include_response_body": false
}
```

- `output_path`：Bridge 将导出内容写入本地文件，MCP 只返回 `{ file_path, size_bytes }`
- `include_response_body: false`：省略 `network_requests[].response_body`（HAR 省略 `entries[].response.content.text`），体积通常从几十 MB 降到 1MB 量级
- `get_all_capture_data` 也支持 `output_path` / 自动分流，行为同上

### 数据源

`list_records` 的 `source` 参数：

| 值 | 内容 |
|------|------|
| `user_action_events` | 鼠标、键盘、滚动、窗口大小 |
| `navigation_events` | 页面导航、标签切换、可见性 |
| `network_requests` | HTTP 请求（URL、方法、状态码、耗时） |
| `console_events` | console.log/warn/error |
| `error_events` | 未捕获异常 |
| `storage_changes` | localStorage / sessionStorage 变更 |
| `cookie_changes` | Cookie 增删改 |

### timeout_ms

所有工具支持 `timeout_ms` 参数（单位 ms）。

- 普通命令默认 `command_timeout_ms` = 120s
- `export_capture` / `get_all_capture_data` 默认 `full_data_timeout_ms` = 300s
- 显式传入的 `timeout_ms` 始终优先

### 结果大小限制

- `timeout_ms` 只控制等待时间，不会绕过请求体大小限制
- Bridge 普通 JSON 请求体上限为 1 MiB；`/extension/result` 回传上限为 64 MiB
- 上限按完整 JSON HTTP body 的 UTF-8 字节数计算
- 超过 64 MiB 时 Bridge 向扩展返回 HTTP 413 / `PAYLOAD_TOO_LARGE`，扩展写入脱敏错误日志；当前 MCP 调用仍会等待命令超时
- 大采集优先：
  1. `export_capture`（>1 MiB 自动写文件；可显式传 `output_path`）
  2. `include_response_body: false`（瘦身）
  3. `list_data_sources` → `list_records` 分页 → `get_record`
  4. 扩展 Dashboard 本地导出
- 自动导出目录：环境变量 `CAPTURE_ALL_EXPORT_DIR`；未设置时用系统临时目录下的 `capture-all-exports/`

## 采集配置

`start_recording` 的 `config` 参数：

```json
{
  "capture_console": true,
  "capture_network": true,
  "mouse_precision": "clicks",
  "keyboard_capture_mode": "shortcuts",
  "capture_input_values": true,
  "capture_request_body": false,
  "capture_response_body": false,
  "max_body_capture_bytes": 1048576,
  "redact_sensitive_headers": true,
  "redact_url_query": true,
  "redact_data": true,
  "sample_rate_ms": 50
}
```

| 字段 | 说明 | 可选值 |
|------|------|-------|
| `mouse_precision` | 鼠标采集精度 | `clicks` / `clicks_scroll_drag` / `full_trajectory` |
| `keyboard_capture_mode` | 键盘采集模式 | `none` / `shortcuts` / `all` |
| `capture_input_values` | 是否采集输入框内容 | `true` / `false` |
| `capture_request_body` | 是否采集请求 body | `true` / `false` |
| `capture_response_body` | 是否采集响应 body | `true` / `false` |
| `redact_data` | 是否脱敏 | `true` / `false` |

## 安全

- Bridge 仅绑定 `127.0.0.1`,不暴露公网
- 浏览器请求只允许格式合法的 `chrome-extension://` Origin；Node / MCP 等无 Origin 本地客户端保持可用
- Token 由用户提供或 Bridge 安全随机生成，禁止硬编码，无效 token → 401；Bridge 使用恒时摘要比较
- 推荐通过 `CAPTURE_ALL_BRIDGE_TOKEN` 启动 Bridge，避免 Token 出现在进程参数；兼容的 `--token` 参数会将 Token 暴露在本机进程参数列表中，仅用于受控兼容场景
- MCP Token（Bridge 启动 Token）：`.mcp.json` 与 Bridge 使用同一 Token，供 MCP Server 访问 `/mcp/*`、`/cdp/*` 路由
- instance_token（扩展实例 Token）：enroll 时由 Bridge 自动生成（`ext_` 前缀），扩展自动获取并用于 heartbeat/command/result 端点；Bridge 仅存储 sha256 hash。用户无需手动粘贴到扩展或 `.mcp.json`
- 兼容模式：扩展设置中手动填入 MCP Token 的旧方式仍可使用，但不推荐；自动登记（enroll + browser_label）为首选路径
- MCP 不提供删除采集 / 清空数据功能
- MCP 不自动脱敏 / 摘要 — 工具层不替模型判断
