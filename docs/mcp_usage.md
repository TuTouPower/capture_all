# MCP 工具使用指南

通过 Claude Code MCP 协议控制采集、查询数据、导出结果。

## 快速开始

1. 启动 Bridge：`node artifacts/bridge/bridge.mjs --port 17831 --token <你的token> &`
2. 确认扩展在线：`get_status`
3. 开始采集：`start_recording`，结束采集：`stop_recording`
4. 查看结果：`list_captures` → `get_all_capture_data`

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
- Token 由用户提供，禁止硬编码，无效 token → 401
- MCP 不提供删除采集 / 清空数据功能
- MCP 不自动脱敏 / 摘要 — 工具层不替模型判断
