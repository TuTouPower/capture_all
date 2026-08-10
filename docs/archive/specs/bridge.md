# Spec — bridge

本地 HTTP Bridge 服务（Node.js）。仅绑定 `127.0.0.1`。`--port` 必须显式指定。

## Token 模型（双 token）

| Token | 来源 | 保护路由 | 存储 |
|-------|------|---------|------|
| MCP token | CLI/env/persisted file(mode 0600)/Bridge 随机生成 | /mcp/* /cdp/* | SHA-256 hash |
| instance_token | Bridge 在 enroll 时为每个扩展实例生成 | /extension/* (与 MCP token 二选一) | SHA-256 hash |

优先级：CLI > env > persisted file > generated。

Token file 权限（T064）：读取前 `stat` 检查 mode；非 0600 尝试 chmod 收紧，失败拒绝读取。写入后显式 chmod 0600。

## 路由

| 路由 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| /health | GET | 无 | 健康检查 |
| /extension/discover | GET | 无 | 扩展发现 Bridge |
| /extension/enroll | POST | MCP token | 扩展登记（browser_label 顶替同 label 旧实例） |
| /extension/heartbeat | POST | instance_token | 心跳（携带 browser_label 同步） |
| /extension/command | GET | instance_token | 扩展拉取命令 |
| /extension/result | POST | instance_token | 扩展回报命令结果 |
| /pair | GET | 无 | 配对窗口（pairing code enroll） |
| /mcp/status | GET | MCP token | Bridge 状态 |
| /mcp/command | POST | MCP token | MCP 工具调用 → 转发到扩展 |
| /cdp/detect | POST | MCP token | 检测外部 CDP 端口 |
| /cdp/start | POST | MCP token | 连接外部 CDP WebSocket |
| /cdp/events | GET | MCP token | 轮询 CDP 网络事件 |
| /cdp/stop | POST | MCP token | 断开外部 CDP |

CORS：`Access-Control-Allow-Origin` 允许扩展 origin；`Allow-Headers` 含 Authorization/Content-Type/X-Capture-All-Instance-Id。

## 命令队列

每个扩展实例独立 `AgentCommandQueue`。

- 命令 ID：进程级全局唯一 `cmd_<counter>_<uuid>`（跨实例不碰撞）。
- `command_owners` 全局 Map<command_id, instance_id>。
- timeout_ms 校验：正整数 + <= 300000（T063）。
- enqueue 后 MCP 侧 await result（默认超时由 command type 决定：full_data 命令 300s，普通 120s）。

### 实例顶替（同 browser_label enroll）

1. 旧实例 `old_queue.cancel_all()`：清理 timer + 命令数组 + pending map，每个命令以 COMMAND_CANCELLED resolve。
2. 清理 `command_owners` 中归属旧实例的条目。
3. `instances.delete(old_id)`。

### heartbeat browser_label 同步（T047）

heartbeat 携带 browser_label，Bridge 显式同步（包括清空为 null）。label 变化时同样顶替同 label 旧实例。

## CDP proxy

Bridge 连接外部 Chrome CDP WebSocket，代理网络事件给扩展：

- `/cdp/start`：精确匹配 tab_url（T061），不退回其他页面。session.connect_error 标记 ws error/close（T062）。
- `/cdp/events`：单次返回前 100 条 completed 事件，未返回的保留在 session.events（T019 不丢）。CDP error response 时事件终态 `cdp_failed`。
- `/cdp/stop`：关闭 ws + 删 session。

## 体积限制

| 路径 | 上限 |
|------|------|
| Bridge JSON body | 1 MiB（`MAX_EXTENSION_RESULT_BODY_BYTES` 外为 1MiB） |
| 扩展结果回传 | 64 MiB（`MAX_EXTENSION_RESULT_BODY_BYTES`） |
| 单条 body 截断 | 100 MB（`MAX_BODY_CAPTURE_BYTES`） |
| CDP events 单次轮询 | 100 条（`MAX_EVENTS_PER_POLL`） |
| max_body_capture_bytes 校验 | Number.isSafeInteger + 0..MAX（T063） |

## 自身流量排除

`is_self_origin_url` 仅排除扩展 origin（`chrome-extension://`）+ 配置的 Bridge origin（`set_self_origin_excludes`）。不笼统排除所有 127.0.0.1/localhost。
