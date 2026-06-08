# Record All MCP Agent Design

## 目标

把当前浏览器扩展接成本地 AI Agent 工具。Claude Code、Codex 或其他 MCP 客户端可以通过 MCP 控制录制、查看扩展内的数据、按需取完整原始记录，并触发导出。

MVP 不做实时分析。数据保留在浏览器扩展 IndexedDB。分析时 MCP 通过扩展 API 获取数据，不依赖导出文件。

## 总体形态

系统分为四部分：

1. 浏览器扩展
   - 继续负责采集、存储、导出。
   - 新增 bridge client，主动连接本地 bridge。
   - 业务查询由扩展执行，因为原始数据在浏览器 IndexedDB。

2. 本地 HTTP bridge
   - 监听 `127.0.0.1`。
   - 接收 MCP 命令，放入命令队列。
   - 扩展轮询命令并回传结果。
   - 只做传输、鉴权、状态、超时。
   - 不解析业务数据，不脱敏，不摘要替代原始数据，不长期保存日志。

3. MCP server
   - 暴露工具给 Claude Code、Codex 等 Agent。
   - 每个 MCP 工具转发为 bridge 命令。
   - 返回扩展执行结果。
   - 不替模型过滤、删除、摘要或做隐私判断。

4. 使用 skill
   - 名称建议：`record-all-agent`。
   - 说明 MCP API 使用顺序和风险。
   - 不限制模型调用。
   - 模型根据任务自行决定用列表、详情、全量或导出。

## 数据原则

- 原始数据源唯一：浏览器扩展 IndexedDB。
- MCP 分析不通过导出文件。
- MCP 可以触发导出，但导出是独立能力，不是分析前置步骤。
- 默认不脱敏。
- 默认不过滤。
- 默认不摘要替代原始详情。
- 工具开放能力，skill 说明风险，用户和模型决定怎么用。
- 大数据请求失败时返回明确错误，不静默降级。

## MCP API

### 状态

`get_status()`

返回：
- bridge 版本
- bridge URL
- 扩展是否在线
- 扩展版本
- 当前 active session
- pending command 数量

### 录制

`start_recording(tab_id?, label?)`

启动录制。返回 `session_id` 和状态。

`stop_recording(session_id?)`

停止录制。返回 session 状态和计数。

### Session

`list_sessions(offset?, limit?, order?)`

列出录制 session。每个 session 是一次录制容器，包含开始时间、结束时间、页面 URL、标签、数据计数等。

`get_session(session_id)`

返回单个 session 元信息。

### 数据源

`list_data_sources(session_id)`

返回该 session 中有哪些数据源。当前扩展至少包括：

- `record_events`
- `network_requests`
- `console_logs`
- `error_logs`

`record_events` 内部可能包含：

- mouse
- keyboard
- scroll
- dom_change
- navigation
- page_load
- tab_switch
- tab_created
- tab_url_change
- dom_ready
- storage_change
- cookie_change
- fetch_request
- xhr_request

返回示例：

```json
{
    "sources": [
        {
            "source": "record_events",
            "count": 240,
            "time_range": { "start": 0, "end": 93210 },
            "types": ["mouse", "keyboard", "cookie_change"]
        },
        {
            "source": "network_requests",
            "count": 38,
            "time_range": { "start": 120, "end": 90120 },
            "types": ["GET", "POST"]
        }
    ]
}
```

### 通用列表

`list_records(session_id, source, offset?, limit?, start_time?, end_time?, order?)`

返回某个 source 的粗略列表。用于快速浏览第 N 条到第 M 条、按时间范围查、按顺序或倒序查。

返回项统一格式：

```json
{
    "record_id": "network_requests:abc123",
    "source": "network_requests",
    "index": 16,
    "time": 18342,
    "absolute_time": 1710000000000,
    "type": "POST",
    "summary": "POST https://example.com/api/login → 401",
    "preview": {
        "url": "https://example.com/api/login",
        "status": 401,
        "duration": 238
    }
}
```

规则：
- `offset` 从 0 开始。
- `index` 从 1 开始，给模型和用户阅读。
- `time` 是 session 内相对毫秒。
- `absolute_time` 是绝对时间戳。
- `order` 支持 `asc` 和 `desc`，默认 `asc`。
- 粗略列表可以有 preview，但不代表过滤或脱敏。
- 完整数据通过 `get_record` 获取。

### 通用详情

`get_record(session_id, source, record_id)`

返回完整原始记录。详情不截断、不脱敏、不删除字段。

返回示例：

```json
{
    "record_id": "network_requests:abc123",
    "source": "network_requests",
    "data": {}
}
```

### 时间线

`get_timeline(session_id, sources?, offset?, limit?, start_time?, end_time?, order?)`

合并多个 source 的粗略记录，按时间排序。默认 `sources` 为全部可用 source。

返回项使用同一套粗略格式，并带 `record_id`。模型可先看时间线，再用 `get_timeline_item` 或 `get_record` 查看详情。

`get_timeline_item(session_id, item_id)`

按时间线项 ID 返回完整记录。本质上等价于按 source 和 record_id 调 `get_record`，但方便模型从时间线继续深挖。

### 全量

`get_all_session_data(session_id)`

一次性获取完整 session 数据。返回：

```json
{
    "session": {},
    "sources": {
        "record_events": [],
        "network_requests": [],
        "console_logs": [],
        "error_logs": []
    }
}
```

规则：
- 不强制分页。
- 不自动摘要。
- 不自动脱敏。
- 不自动降级为列表。
- 太大、超时或浏览器读取失败时返回明确错误。
- 模型可自行改用 `list_records` 和 `get_record`。

### 导出

`export_session(session_id, format)`

触发扩展导出。`format` 支持现有导出能力，例如 `jsonl` 和 `har`。

规则：
- MCP 可以操作导出。
- 导出会生成文件，skill 中说明风险。
- 分析流程不依赖导出文件。
- 不提供从导出文件分析的 MVP 工具。

## Bridge HTTP 协议

### MCP 到 bridge

`POST /mcp/command`

请求：

```json
{
    "command_id": "cmd_123",
    "type": "records.list",
    "payload": {}
}
```

bridge 写入命令队列，并等待扩展结果或超时。

### 扩展到 bridge

`GET /extension/command`

扩展轮询获取下一条命令。

`POST /extension/result`

扩展回传命令结果：

```json
{
    "command_id": "cmd_123",
    "ok": true,
    "data": {}
}
```

失败：

```json
{
    "command_id": "cmd_123",
    "ok": false,
    "error": {
        "code": "SESSION_NOT_FOUND",
        "message": "Session not found",
        "details": {}
    }
}
```

`POST /extension/heartbeat`

扩展上报在线状态、版本、active session。

`GET /health`

bridge 健康检查。

## 命令映射

- `get_status` → bridge 本地状态
- `start_recording` → `recording.start`
- `stop_recording` → `recording.stop`
- `list_sessions` → `sessions.list`
- `get_session` → `sessions.get`
- `list_data_sources` → `sources.list`
- `list_records` → `records.list`
- `get_record` → `records.get`
- `get_timeline` → `timeline.list`
- `get_timeline_item` → `timeline.get`
- `get_all_session_data` → `session.get_all_data`
- `export_session` → `session.export`

## 配置

端口由用户配置，不固定。

Bridge 配置：

```json
{
    "host": "127.0.0.1",
    "port": 17831,
    "token": "<token>",
    "command_timeout_ms": 30000,
    "full_data_timeout_ms": 120000
}
```

扩展配置：

```json
{
    "bridge_url": "http://127.0.0.1:17831",
    "bridge_token": "<same-token>",
    "poll_interval_ms": 1000
}
```

MCP 配置：

```json
{
    "bridge_url": "http://127.0.0.1:17831",
    "bridge_token": "<same-token>"
}
```

规则：
- 用户可以自己设置端口。
- 工具可以自动找空闲端口，但必须显示给用户。
- 实施前按项目约定读取 `~/karson_ubuntu/user_config_backup/ports.yaml` 避免冲突。
- 只允许监听 `127.0.0.1`。
- 不绑定 `0.0.0.0`。

## Token

- 所有 bridge API 都要求 token。
- token 由用户填写，或工具随机生成后展示给用户复制。
- 不使用弱默认 token。
- 不把 token 提交到 git。
- 扩展配置页填写 bridge URL 和 token。
- MCP 配置填写同一 bridge URL 和 token。

## 错误码

Bridge 层：

- `BRIDGE_UNAVAILABLE`
- `EXTENSION_OFFLINE`
- `COMMAND_TIMEOUT`
- `TOKEN_INVALID`
- `COMMAND_CANCELLED`

扩展层：

- `SESSION_NOT_FOUND`
- `SOURCE_NOT_FOUND`
- `RECORD_NOT_FOUND`
- `INVALID_QUERY`
- `RECORDING_ALREADY_RUNNING`
- `NO_ACTIVE_RECORDING`
- `EXPORT_FAILED`
- `STORAGE_READ_FAILED`
- `PAYLOAD_TOO_LARGE`

超时策略：

- 查询类：默认 30s。
- 全量类：默认 120s。
- 导出类：默认 120s。
- start/stop：默认 15s。
- 超时只返回错误，不自动降级、不自动分页、不自动摘要。

## 安全边界

这些边界只保护本地通道，不替模型做数据判断：

- bridge 只监听 `127.0.0.1`。
- 所有请求必须 token。
- 不提供任意 URL 请求能力。
- 不提供任意文件读取能力。
- 不提供删除 session 或清空数据能力。
- 网页不能直接调用 bridge。
- `export_session` 说明会触发浏览器导出。
- start/stop 会改变扩展录制状态，skill 中说明风险。

明确不做：

- 不默认脱敏。
- 不默认过滤。
- 不默认摘要替代原始数据。
- 不删除字段。
- 不把隐私判断写死在工具层。

## 使用 skill 设计

Skill 名称建议：`record-all-agent`。

内容应包括：

1. 推荐探索顺序
   - `get_status()`
   - `list_sessions()`
   - `list_data_sources(session_id)`
   - `get_timeline(session_id, limit=20)`
   - `list_records(session_id, source, offset, limit)`
   - `get_record(session_id, source, record_id)`
   - 必要时 `get_all_session_data(session_id)`
   - 用户需要文件时 `export_session(session_id, format)`

2. API 风险说明
   - `start_recording` 和 `stop_recording` 会改变录制状态。
   - `get_all_session_data` 可能返回大量数据，可能超时或爆上下文。
   - headers、cookies、body 可能包含敏感信息。
   - `export_session` 会生成文件。
   - 列表 API 只返回粗略 preview，详情要用 `get_record`。

3. 决策原则
   - skill 只说明能力和风险。
   - 不禁止模型调用。
   - 模型根据用户任务自行决定调用哪个 API。

## MVP 不做

- 实时分析。
- WebSocket/SSE。
- 从导出文件分析。
- 采集策略控制。
- 浏览器自动化。
- 请求重放。
- 删除 session。
- 清空所有日志。
- 本地长期保存原始日志副本。

## 未来范围

### 采集策略控制

未来可以增加：

- `get_capture_config`
- `set_capture_config`

可控制 body、cookie、storage、event 类型、域名过滤。风险是会影响后续录制完整性。

### 浏览器动作控制

未来可以增加：

- `open_tab`
- `navigate`
- `click`
- `type`
- `replay_request`

风险是会改变网页状态，可能提交表单或触发真实请求。

### 实时模式

未来可以增加：

- `subscribe_timeline`
- `watch_errors`

可用 SSE、WebSocket 或短轮询。风险是长连接、流量大、上下文爆。

### 数据删除

未来可以增加：

- `delete_session`
- `clear_all_sessions`

风险是不可逆，必须用户确认。

## 实施拆分

1. bridge + mock extension
   - 命令队列
   - token 校验
   - 超时
   - heartbeat

2. MCP server
   - 注册全部 MCP 工具
   - 参数校验
   - 转发 bridge 命令

3. 扩展 bridge client
   - 配置页增加 bridge URL/token/poll interval
   - 轮询命令
   - 执行 session/source/record/timeline/export 命令
   - 回传结果

4. 扩展数据查询
   - 稳定 `record_id`
   - `list_data_sources`
   - `list_records`
   - `get_record`
   - `get_timeline`
   - `get_all_session_data`

5. 使用 skill
   - 写 `record-all-agent`
   - 说明 API 和风险

## 测试策略

- Bridge 单测：命令队列、token、超时、heartbeat。
- MCP 单测：工具参数转发、错误透传。
- 扩展单测：source 统计、records list/get、timeline 合并排序、全量数据。
- E2E：启动 bridge，模拟扩展 heartbeat，MCP `get_status`，命令往返。
- 浏览器验证：扩展连接 bridge 后，录制、列 session、查 timeline、查 record、触发导出。

## 验收标准

MVP 完成后：

- Agent 可通过 MCP `get_status()` 看到 bridge 和扩展在线。
- Agent 可 `start_recording` 和 `stop_recording`。
- Agent 可 `list_sessions` 找到录制。
- Agent 可 `list_data_sources(session_id)` 看到所有可用 source。
- Agent 可 `get_timeline(... offset, limit)` 看任意区间粗略时间线。
- Agent 可 `list_records(source, offset, limit)` 看任意 source 的粗略列表。
- Agent 可 `get_record(record_id)` 取完整原始数据。
- Agent 可 `get_all_session_data` 一次取完整 session。
- Agent 可 `export_session` 触发导出。
- 分析不依赖导出文件。
- bridge 不存日志、不脱敏、不摘要替代详情。
- 大数据失败时明确报错，不静默降级。
