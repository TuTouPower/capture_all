# src_bridge_mcp 全量审阅报告

- reviewed_at: 2026-08-11 01:30 UTC+8
- scope: 当前文件状态（非 diff）
- files: 11

## Findings

### f001 - CDP session 固定 5 分钟强制销毁，非 inactivity
- 严重度：important
- 位置：`src/bridge/cdp_handler.ts:305-312`
- 问题：注释写「Auto-cleanup after 5 minutes of inactivity」，实现是 `setTimeout(..., 5 * 60 * 1000)` 自 `start` 起绝对计时，且不根据 poll/events 刷新。录制超过 5 分钟时：WS 被 `close`、`sessions` 删除；扩展侧继续 `poll_external_cdp_events` 得到 404/`ok:false`，后续 response body 静默丢失，无错误码区分「session 过期」。
- 建议：按 last_activity（events poll / CDP message）滑动续期；或显式 `expires_at` 并在 `/cdp/events` 返回 `SESSION_EXPIRED`；`stop` 时 `clearTimeout`。
- 置信度：高

### f002 - auto 导出路径 `format` 未净化，可逃逸 `CAPTURE_ALL_EXPORT_DIR`
- 严重度：important
- 位置：`src/bridge/server.ts:764-776`；触发点 `src/bridge/server.ts:493-496`；schema `src/mcp/schemas.ts:123`（`format: z.string()` 无枚举）
- 问题：`resolve_auto_output_path` 只净化 `capture_id`，`format` 原样拼进文件名：`join(dir, \`${safe_id}.${format}\`)`。当 `export_capture` 结果 > 1MiB 且未传 `output_path` 时，`format: "../../.ssh/authorized_keys"`（或含 `..` 段的字符串）经 `path.join` 规范化后写出到导出根目录之外。文档（`docs/guides/mcp_usage.md`）声明 auto 路径落在 `CAPTURE_ALL_EXPORT_DIR`，边界被突破。
- 建议：`format` 白名单 `json|jsonl|html|har`；auto 路径仅允许 basename，且 `realpath` 后必须仍在 `default_export_dir()` 下。
- 置信度：高

### f003 - CDP WebSocket 连接失败不可观测
- 严重度：important
- 位置：`src/bridge/cdp_handler.ts:149-153`（异步 connect）、`293-301`（写 `connect_error`）、`314`（在 open 前即 `ok:true`）、`320-365`（events 不返回 `connect_error`）
- 问题：`handle_cdp_start` 在 `new WebSocket(...)` 后立即返回 `{ ok: true, session_key }`，不 await open。`onerror`/`onclose` 写入 `session.connect_error`，但 `/cdp/events` 与任何 API 均不暴露该字段。目标 WS URL 失效、Chrome 拒绝、握手失败时：调用方长期拿到空 `events` 且 `ok:true`（session 仍在 map），直到 f001 超时删除。
- 建议：start 等待 open（带超时）失败则 `ok:false`；或 events 响应附带 `connect_error` / `ws_state`，`connect_error != null` 时返回明确错误码。
- 置信度：高

### f004 - CDP `events` 与 `body_seq_to_req_id` 无上限，可内存膨胀
- 严重度：important
- 位置：`src/bridge/cdp_handler.ts:136-147`、`166-187`、`233-244`、`335-346`
- 问题：
  1. `session.events` 只在 poll 时移走 **非 pending** 且每轮最多 100 条；`response_body_status === 'pending'` 的条目（未收到 loadingFinished、或 `getResponseBody` 无回包）永久滞留。
  2. `body_seq_to_req_id` 仅在对应 `msg.id` 回包时 delete；CDP 无响应则 Map 只增不减。
  高流量页 + 长 session（或 5 分钟内持续 pending）可导致 Bridge 进程 RSS 上升；无背压、无丢弃策略、无指标。
- 建议：单 session 事件上限（超限丢最旧并标记 `dropped`）；pending 超时置 `cdp_failed`；`body_seq_to_req_id` 条目带 deadline。
- 置信度：高

### f005 - `/cdp/start` 与 detect 的 `/json/list` 无超时
- 严重度：important
- 位置：`src/bridge/cdp_handler.ts:53-64`（version 有 3s abort，**list 无**）、`106-108`（start 全程无 abort）
- 问题：`handle_cdp_detect` 在 version 成功后对 `http://127.0.0.1:${port}/json/list` 裸 `fetch`；`handle_cdp_start` 同样无 `AbortSignal`。本机端口被半开服务占用、或 CDP 卡住时，对应 HTTP 请求 handler 永久挂起（占着连接与 async 上下文）。扩展侧 start 有 10s 客户端超时，但 Bridge 侧请求与潜在 WS 资源仍可能泄漏到 f001 清理点。
- 建议：所有 CDP HTTP 探测统一 `AbortSignal.timeout(CDP_DETECT_TIMEOUT_MS)`；start 连接阶段整体 deadline。
- 置信度：高

### f006 - Bridge 启动「已在监听」误判：只看 `/health` HTTP 200
- 严重度：important
- 位置：`src/bridge/main.ts:16-18`；`src/bridge/config.ts:143-149`
- 问题：`is_bridge_healthy` 对 `${bridge_url}/health` 任意 `response.ok` 即视为本 Bridge 已运行并 `return`，不校验响应 body、不校验 token、不校验 `bridge_version`。同端口其他服务若对 `/health` 返回 200，或旧/异 token 的 Bridge 已占用端口：新进程静默退出，用户看到 “already listening”，MCP 随后 `TOKEN_INVALID` / 行为不符，无明确诊断。
- 建议：校验 JSON `{ ok: true }` 且可选用 token 打 `/mcp/status`；失败则打印冲突说明而非直接当作成功。
- 置信度：高

### f007 - `create_bridge_server().close` 不取消命令队列与超时 timer
- 严重度：important
- 位置：`src/bridge/server.ts:546-549`；队列 timer 于 `src/bridge/command_queue.ts:32-43`；`cancel_all` 已实现于 `73-87` 但 close 未调用
- 问题：`close` 仅 `server.close()`。进行中的 `enqueue` 仍持有 `setTimeout` 与未 settle 的 Promise（`/mcp/command` await）。单元/e2e 大量 `create_bridge_server` + `close` 时：handle 未清可拖住进程退出、或 close 后 timer 仍 fire 触碰已拆状态。label 顶替路径会 `cancel_all`，进程关闭路径不会。
- 建议：`close` 内对 `queues` 全部 `cancel_all()`，清空 `command_owners` / `instances`，并关闭残余 CDP sessions。
- 置信度：高

### f008 - 命令超时后迟到的 `/extension/result` 使 `resolve` 抛错变 500
- 严重度：minor
- 位置：`src/bridge/command_queue.ts:56-60`；`src/bridge/server.ts:457`
- 问题：timeout 已从 `pending` 删除并 `COMMAND_TIMEOUT` resolve 后，扩展再 POST result → `resolve` throw `Unknown command_id` → 外层 catch 500 `BRIDGE_UNAVAILABLE`。属可预期竞态，但扩展侧看到 500 而非幂等 200/`COMMAND_TIMEOUT`，易误判 Bridge 故障。
- 建议：未知 `command_id` 返回 200 `{ ok: true, ignored: true }` 或 409 明确码，不抛异常。
- 置信度：高

### f009 - MCP `get_status` / `list_browsers` 忽略 `timeout_ms`，且 client fetch 无超时
- 严重度：minor
- 位置：`src/mcp/tools.ts:34-41`；`src/mcp/client.ts:10-25`；schema 仍声明 `timeout_ms`（`src/mcp/schemas.ts:45-51`）
- 问题：schema 与工具文档允许 `timeout_ms`，但 `get_status`/`list_browsers` 不使用；`BridgeMcpClient` 所有 `fetch` 无 `AbortSignal`。Bridge 卡住时 MCP stdio 工具调用永久挂起，与 command 路径可配超时不一致。
- 建议：client 层统一默认 timeout + 透传 `timeout_ms`；status 路径同样遵守。
- 置信度：高

### f010 - `pending_count` 只统计未 `take` 的队列长度
- 严重度：minor
- 位置：`src/bridge/command_queue.ts:89-91`；展示于 `src/bridge/server.ts:153-158`
- 问题：`pending_count()` 返回 `commands.length`。扩展已 `take_next`、尚未 `/extension/result` 的 in-flight 命令在 `pending` Map 中但不计入。`/mcp/status` 的 `pending_commands` 在「命令已下发、等待执行结果」阶段显示 0，排障时低估负载。
- 建议：返回 `this.pending.size`（或分 `queued` / `in_flight`）。
- 置信度：高

## 结论
- 本轮 finding：0 critical / 7 important / 3 minor
- 总体判断：鉴权主路径（loopback 绑定、MCP Bearer timing-safe、instance_token hash、CDP 仅 127.0.0.1）整体成立；主要风险在 CDP 会话生命周期/可观测性/资源上限，以及 auto 导出 `format` 路径逃逸与 Bridge 启动健康检查误判。
- 未进表提示：
  - 显式 `output_path` 任意路径写入：产品文档有意支持绝对路径，本轮按设计不记 finding；若威胁模型要求最小写权限，需另开决策收紧。
  - T091 loopback enroll 仅靠可伪造的 `Origin`：与「本机同用户可读 token 文件」同权级，记入已知模型，不单列。
  - `seq` 复用于 CDP command id 与 event.seq：顺序语义混乱但当前 poll 不依赖 seq 排序。

verdict: FAIL
