# Spec — mcp_server

MCP 服务端：stdio JSON-RPC，转发工具调用到 Bridge → 扩展。

## 工具集（17 个）

15 个映射到 AgentCommandType 的工具 + 2 个独立处理（get_status / list_browsers）：

| 工具 | Agent 命令 | 说明 |
|------|-----------|------|
| get_status | —（直接 Bridge status） | Bridge 状态 + 在线扩展列表 |
| list_browsers | —（从 status 提取） | 在线浏览器实例列表 |
| start_recording | capture.start | 启动采集 |
| stop_recording | capture.stop | 停止采集 |
| list_captures | captures.list | 采集列表（分页） |
| get_capture | captures.get | 采集元数据 |
| list_sessions | captures.list | 别名 |
| get_session | captures.get | 别名 |
| list_data_sources | sources.list | 数据源摘要 |
| list_records | data.list | 数据列表（分页） |
| get_record | data.get | 单条详情 |
| get_timeline | timeline.list | 时间线（分页） |
| get_timeline_item | timeline.get | 时间线条目 |
| get_all_capture_data | capture.get_all_data | 全量数据（分页聚合 PAGE_SIZE=5000） |
| get_all_session_data | capture.get_all_data | 别名 |
| export_capture | capture.export | 导出（json/jsonl/html/har） |
| export_session | capture.export | 别名 |

## 路由参数

| 参数 | 说明 |
|------|------|
| target_label | 按 browser_label 路由 |
| target_instance_id | 按 instance_id 路由 |

多实例未指定目标 → `TARGET_REQUIRED`。显式 label 匹配多个在线实例 → `TARGET_AMBIGUOUS`。

## AgentCommandType（11 种）

```
capture.start / capture.stop / captures.list / captures.get
sources.list / data.list / data.get
timeline.list / timeline.get
capture.get_all_data / capture.export
```

## 错误码

| 错误码 | 说明 |
|--------|------|
| BRIDGE_UNAVAILABLE | Bridge 不可达 |
| EXTENSION_OFFLINE | 扩展离线 |
| COMMAND_TIMEOUT | 命令超时 |
| TOKEN_INVALID | token 无效/不匹配 |
| COMMAND_CANCELLED | 实例顶替导致取消 |
| CAPTURE_NOT_FOUND | 采集不存在（新码，别名 SESSION_NOT_FOUND） |
| CAPTURE_ALREADY_RUNNING | 已有活跃采集（新码，别名 RECORDING_ALREADY_RUNNING） |
| NO_ACTIVE_CAPTURE | 无活跃采集（新码，别名 NO_ACTIVE_RECORDING） |
| SOURCE_NOT_FOUND | 数据源不存在 |
| RECORD_NOT_FOUND | 记录不存在 |
| INVALID_QUERY | 参数无效 |
| EXPORT_FAILED | 导出失败 |
| STORAGE_READ_FAILED | 存储读取失败 |
| PAYLOAD_TOO_LARGE | 数据超限 |
| ORIGIN_NOT_ALLOWED | origin 不允许 |
| TARGET_REQUIRED | 多实例未指定目标 |
| TARGET_NOT_FOUND | 目标实例不存在 |
| TARGET_AMBIGUOUS | 显式 label 非唯一 |
| LABEL_DUPLICATE | label 冲突 |
| PAIRING_REQUIRED | 需配对 |

错误码别名映射（T057）：SESSION_NOT_FOUND → CAPTURE_NOT_FOUND、RECORDING_ALREADY_RUNNING → CAPTURE_ALREADY_RUNNING、NO_ACTIVE_RECORDING → NO_ACTIVE_CAPTURE。旧码兼容至 v2.0。

## dispatcher 错误处理

- 未知命令类型 → `INVALID_QUERY`（不返回 ok:true data:undefined）。
- start_capture 失败时按 error 文本区分 RECORDING_ALREADY_RUNNING vs STORAGE_READ_FAILED（不一律覆盖）。
- offset/limit：非负整数 + limit 上限 100000（T048）。

## MCP 不做的事

- 不自动脱敏。
- 不自动摘要。
- 不自动过滤。
- 不提供删除/清空。
