# Review — src_bridge_mcp_shared_01 / haiku

- reviewer：haiku
- focus：correctness / 安全 / 协议 / 鉴权 / 路由 / 约束
- target：`src_bridge_mcp_shared_01` 清单（11 文件，1944 行）
- target_owner：tutoupower
- branch：`main`
- base_commit：`12a55bb`
- head：工作区
- reviewed_at：2026-07-19 08:59 UTC+8

reviewer 对 target 只读，只能写本报告。结论仅适用于上述改动快照。

## Findings

### r01_f001 — `prune_stale` 空实现导致内存泄漏

- 严重度：critical
- 位置：`src/bridge/server.ts:75-82`
- 问题：`prune_stale` 函数体内仅有一个 `void id;` 无操作语句和注释，不实际删除任何过期实例。`list_online` 虽在逻辑上过滤出在线实例，但 `instances` Map 持续增长，永不清理断线超过 `EXTENSION_TTL_MS` 的旧条目。`build_status`（line 144）使用 `[...instances.values()]` 遍历全量（含过期实例），导致每次 `/mcp/status` 响应体积随运行时间线性增长。
- 建议：在 `prune_stale` 中实际删除 `now - inst.seen_at > EXTENSION_TTL_MS` 的条目（或至少保留最近 N 条，其余移入单独的 dead 列表）。若产品预期保留离线实例用于 UI 展示，应将 `build_status` 中的全量遍历改为仅在线实例（与 `extensions` 数组定义一致）。
- 置信度：high

### r01_f002 — `AgentCommandQueue.resolve()` 对未知 command_id 抛异常

- 严重度：high
- 位置：`src/bridge/command_queue.ts:51`
- 问题：`resolve()` 在 `this.pending.get(result.command_id)` 返回 `undefined` 时直接 `throw new Error(...)`。此异常在 `server.ts:413` 的 `/extension/result` 处理路径上未被 try-catch 包裹，会穿透到顶层 `catch`（line 486），返回 500 而非明确的业务错误码。扩展发送重复 result 或 stale command_id 时会导致服务端 500。
- 建议：将 `throw` 替换为 `return`（或抛 `BridgeHttpError` 并携带适当错误码如 `INVALID_QUERY`），让调用方返回结构化错误响应。
- 置信度：high

### r01_f003 — `is_bridge_healthy` 无超时控制

- 严重度：high
- 位置：`src/bridge/config.ts:126-133`
- 问题：`fetch` 调用未使用 `AbortController` 或 `AbortSignal.timeout()`。若目标端口有进程监听但不响应 HTTP（如非 HTTP 服务），此调用将阻塞至操作系统 TCP 超时（可能数十秒）。`create_bridge_server` 的 `listen()` 本身会先于 `health` 检查完成端口绑定，但 `main.ts:16` 的健康检查被用于判断"是否已有实例在监听"，阻塞过久会严重影响启动体验。
- 建议：给 `fetch` 添加 `AbortSignal.timeout(3000)` 或使用 `AbortController` 与 `setTimeout` 组合（参考 `cdp_handler.ts:54` 的 `CDP_DETECT_TIMEOUT_MS` 模式）。
- 参考实现：`src/bridge/cdp_handler.ts:54` 的 `AbortController` + `setTimeout`。
- 置信度：high

### r01_f004 — `handle_cdp_start` 错误信息泄露内部细节

- 严重度：high
- 位置：`src/bridge/cdp_handler.ts:296`
- 问题：catch 块中 `message: String(e)` 将原始异常信息直接返回给 MCP 客户端。如果 `fetch` 或 `WebSocket` 抛出包含文件路径、堆栈信息或系统细节的异常，这些会泄露到外部。虽然 Bridge 仅监听 127.0.0.1，但 MCP 客户端（AI Agent）不应接触到服务端内部实现细节。
- 建议：返回通用错误信息（如 `Failed to start CDP capture`），原始异常记录到日志系统（`app_logs`）。
- 置信度：medium

### r01_f005 — `handle_cdp_start` 从不采集请求体

- 严重度：medium
- 位置：`src/bridge/cdp_handler.ts:136-141`
- 问题：WebSocket 连接建立后仅发送 `Network.enable`，未发送 `Network.setRequestInterception` 或对 loadingFinished 事件的 `Network.getRequestBody`。所有 CDP 捕获的网络事件的 `request_body_status` 永远为 `'not_enabled'`，`request_body` 永远为 `null`。与扩展端 `network_capture.ts` 支持请求体采集不对称。
- 建议：在 `ws.onopen` 中追加 `Network.getRequestBody` 调用逻辑（参考 `loadingFinished` → `getResponseBody` 模式），或在 CDP `/cdp/detect` 或 `/cdp/start` 响应中注明 CDP 路径不支持请求体采集。
- 置信度：high

### r01_f006 — `capture_config_schema.passthrough()` 静默吞掉拼写错误

- 严重度：medium
- 位置：`src/mcp/schemas.ts:28-42`
- 问题：`capture_config_schema` 以及所有 MCP 工具 schema 均使用 `.passthrough()`，允许任意额外字段通过校验。若 AI 调用 `start_recording` 时传 `capture_console: treu`（拼写错误），此字段不会触发 Zod 校验失败，而是被静默传入 payload 最终被扩展端忽略（或产生未定义行为）。这违背 fail-fast 原则。
- 建议：对所有 schema 使用 `.strict()` 替代 `.passthrough()`，或至少在关键 schema（`start_recording_schema`、`capture_config_schema`）上使用 `.strict()`。若需兼容未来扩展字段，可逐 schema 评估。
- 置信度：high

### r01_f007 — `export_capture_schema` 的 `format` 字段无枚举约束

- 严重度：medium
- 位置：`src/mcp/schemas.ts:123`
- 问题：`format: z.string()` 接受任意字符串。不支持的 format 值会穿透 Zod 校验传到扩展端才报错。延迟报错增加排查成本，错误信息可能不精确。
- 建议：改为 `z.enum(['json', 'csv', 'har'])` 或从 `body_routing.ts`/protocol 导出合法值集。若未来需扩展 format，新值加入枚举即可。
- 置信度：medium

### r01_f008 — `write_result_to_file` 无路径收容检查

- 严重度：medium
- 位置：`src/bridge/server.ts:735-749`
- 问题：当 MCP 客户端传入显式 `output_path`（line 444），`write_result_to_file` 直接将其传给 `writeFile`，未校验路径是否在允许的目录范围内。MCP 客户端是受信的本地进程，但若 MCP 客户端被攻陷或配置错误，可写入任意文件系统路径。
- 建议：校验 `output_path` 的解析后绝对路径是否位于 `default_export_dir()` 或用户配置的导出目录子树内。若不在，返回 `INVALID_QUERY` 错误。
- 置信度：medium

### r01_f009 — MCP token 可伪装任意 instance_id 访问扩展端点

- 严重度：medium
- 位置：`src/bridge/server.ts:555`
- 问题：`resolve_extension_auth` 中 MCP token 通过校验后返回 `instance_id: read_instance_id(request)`，不做任何 instance_id 与 token 的绑定校验。持 MCP token 者可伪造任意 `x-capture-all-instance-id` header，以任何已注册实例身份发送 heartbeat 或提交 command result。虽然 MCP token 本身即为完全受信凭证，但在多用户或多 Agent 场景下，一个 MCP token 持有者可干扰其他用户的扩展实例。
- 建议：文档中明确标注 MCP token 的信任边界等同于本地 root；若未来需隔离，可引入 per-agent token 派生机制。当前本地单用户场景下风险可控。
- 置信度：medium

### r01_f010 — `/mcp/command` 派发写命令时不校验目标实例的 active_capture_id

- 严重度：medium
- 位置：`src/bridge/server.ts:423-431`
- 问题：`resolve_target` 仅校验实例存在性与路由歧义，不检查目标实例是否有活跃采集。`capture.stop` 可发给未在采集的实例，`capture.export` 可发给从未进行过对应 capture 的实例。虽然最终扩展端会返回错误（如 `NO_ACTIVE_CAPTURE`），但增加了一次往返延迟和 Bridge 端不必要的排队开销。
- 建议：对 `WRITE_COMMANDS`（stop/export/get_all_data），在 `resolve_target` 中增加可选的 `active_capture_id` 检查，提前 reject 明显无效的请求。或将此职责完全交给扩展端，但在 Bridge 文档中标注。
- 置信度：medium

### r01_f011 — `extract_result_content` 对循环引用不设防

- 严重度：medium
- 位置：`src/bridge/server.ts:712`
- 问题：`data?.content` 不存在时执行 `JSON.stringify(data ?? {})`。若 `data` 包含循环引用（虽然不太可能出现在当前协议中），`JSON.stringify` 会抛出 `TypeError`，此异常在 `/mcp/command` 路径上没有专门 catch，最终返回通用 500 错误。
- 建议：包裹 `JSON.stringify` 调用，对 `TypeError` 做降级处理（如返回 `{ raw: 'unserializable' }`），或使用安全的序列化工具。
- 置信度：low

### r01_f012 — CDP session 5 分钟固定超时，不影响活跃会话

- 严重度：low
- 位置：`src/bridge/cdp_handler.ts:286-292`
- 问题：CDP session 创建后 5 分钟无条件清理，不论 session 是否仍在被轮询（`/cdp/events`）。若扩展端轮询间隔超过 5 分钟，session 将被意外删除。
- 建议：在 `handle_cdp_events` 访问 session 时刷新 `created_at` 或单独记录 `last_poll_at`，清理定时器检查"距上次轮询超过 5 分钟"而非"距创建超过 5 分钟"。
- 置信度：low

### r01_f013 — `mcp/main.ts` 无优雅关闭

- 严重度：low
- 位置：`src/mcp/main.ts:34`
- 问题：进程未注册 `SIGINT` / `SIGTERM` 处理器。MCP 客户端断开 stdio 连接时，进程依赖默认行为终止，不会主动调用 `server.close()`。MCP SDK 的 `StdioServerTransport` 通常在 stdin 关闭时自行清理，但未显式处理可能导致资源泄漏（极少）。
- 建议：添加 `process.on('SIGINT', ...)` 和 `process.on('SIGTERM', ...)` 调用 `server.close()` 后 `process.exit(0)`。
- 置信度：low

### r01_f014 — `normalize_agent_bridge_config` 空 token 静默禁用 Bridge

- 严重度：suggestion
- 位置：`src/shared/agent_bridge_config.ts:26`
- 问题：`agent_bridge_enabled: config.agent_bridge_enabled && token.length > 0` — 当用户设置 `agent_bridge_enabled: true` 但 token 为空时，不报错而是静默禁用。用户可能困惑为何 Bridge 不工作。
- 建议：token 为空且 enabled 为 true 时，记录 warning 日志或在 UI 上显示提示。保持静默禁用作为降级策略是合理的，但应让用户可感知。
- 置信度：low

### r01_f015 — `BridgeMcpClient` 无重试逻辑

- 严重度：suggestion
- 位置：`src/mcp/client.ts:11-26`
- 问题：`get_status` 和 `send_command` 在网络瞬时故障时直接抛异常给 MCP 调用方。本地 HTTP 服务极少出现瞬时故障，但 Bridge 重启期间可能出现 `ECONNREFUSED`。
- 建议：对 `ECONNREFUSED` 和 `ECONNRESET` 类错误做有限重试（如 3 次间隔 200ms），其他错误直接抛出。
- 置信度：low

## 结论

清单包含 11 文件共 1944 行，覆盖 Bridge HTTP 服务、MCP 服务端、CDP 桥接、命令队列、鉴权路由和 body 路由模块。

**高风险项**：
- `prune_stale` 空实现导致实例 Map 持续膨胀（memory leak），`/mcp/status` 响应体积线性增长。
- `AgentCommandQueue.resolve()` 对未知 command_id 抛异常，扩展发送重复 result 会导致 500。
- `is_bridge_healthy` 无超时控制，阻塞启动流程。

**中等风险项**：
- CDP 路径不支持请求体采集，与扩展端能力不对称。
- MCP schema 全部 `.passthrough()` 导致参数拼写错误被静默吞掉。
- `write_result_to_file` 无路径收容检查，理论上可写入任意路径。
- MCP token 可伪装任意 instance_id（虽在单用户本地场景下风险可控）。

**低风险/建议项**：
- CDP session 固定 5 分钟超时、错误信息泄露、优雅关闭缺失、重试缺失等。

整体架构合理：鉴权分层（MCP token vs instance_token）、路由分离（`/mcp/*` vs `/extension/*` vs `/cdp/*`）、恒时比较。主要问题集中在资源泄漏和错误处理健壮性，建议优先修复 critical/high 级问题。
