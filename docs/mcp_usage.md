# MCP 工具使用指南

通过 Claude Code MCP 协议控制采集、查询数据、导出结果。

## 快速开始

1. 构建产物：`npm run build`
2. 复制项目配置：`cp .mcp.json.example .mcp.json`
3. 将 `.mcp.json` 中 `<YOUR_BRIDGE_TOKEN>` 替换为扩展设置中的 Bridge Token。`.mcp.json` 仅供本机使用，不提交到 Git。示例启动脚本通过 Claude Code 注入的 `CLAUDE_PROJECT_DIR` 定位构建产物，不依赖当前工作目录
4. 使用同一 Token 启动 Bridge：`CAPTURE_ALL_BRIDGE_TOKEN='<你的 Token>' node artifacts/bridge/bridge.mjs --port 17831 &`。兼容参数 `--token` 仍可用；同时配置时 `--token` 优先
5. 重开 Claude Code 会话，确认扩展在线：`get_status`
6. 开始采集：`start_recording`，结束采集：`stop_recording`
7. 查看结果：`list_captures` → `get_all_capture_data`

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
| `get_all_capture_data` | 全量数据（谨慎使用） | `capture_id` |

### 导出

| 工具 | 说明 | 关键参数 |
|------|------|---------|
| `export_capture` | 导出采集数据 | `capture_id`, `format`（json / jsonl / html / har） |

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

所有工具支持 `timeout_ms` 参数（单位 ms）。大采集建议加到 60000-120000。

### 结果大小限制

- `timeout_ms` 只控制等待时间，不会绕过请求体大小限制
- Bridge 普通 JSON 请求体上限为 1 MiB；`/extension/result` 回传上限为 32 MiB
- 上限按完整 JSON HTTP body 的 UTF-8 字节数计算
- 超过 32 MiB 时 Bridge 向扩展返回 HTTP 413 / `PAYLOAD_TOO_LARGE`，扩展写入脱敏错误日志；当前 MCP 调用仍会等待命令超时
- 大采集优先使用 `list_data_sources` → `list_records` 分页 → `get_record` 获取单条完整数据，或使用扩展本地导出

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
- Token 由用户提供，禁止硬编码，无效 token → 401；Bridge 使用恒时摘要比较
- 推荐通过 `CAPTURE_ALL_BRIDGE_TOKEN` 启动 Bridge，避免 Token 出现在进程参数；兼容的 `--token` 参数会将 Token 暴露在本机进程参数列表中，仅用于受控兼容场景；扩展设置、Bridge 和 `.mcp.json` 必须使用同一 Token
- MCP 不提供删除采集 / 清空数据功能
- MCP 不自动脱敏 / 摘要 — 工具层不替模型判断
