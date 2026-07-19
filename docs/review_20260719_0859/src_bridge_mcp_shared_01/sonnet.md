# Review sonnet — src_bridge_mcp_shared_01

- reviewer：sonnet (model_override_authorized)
- focus：correctness / 安全 / 协议 / 鉴权 / 路由 / 约束
- target：`src/bridge/cdp_handler.ts`、`src/bridge/command_queue.ts`、`src/bridge/config.ts`、`src/bridge/main.ts`、`src/bridge/server.ts`、`src/mcp/client.ts`、`src/mcp/main.ts`、`src/mcp/schemas.ts`、`src/mcp/tools.ts`、`src/shared/agent_bridge_config.ts`、`src/shared/body_routing.ts`（共 11 文件，1944 行）
- target_owner：—
- branch：main
- base_commit：工作区
- head：工作区
- reviewed_at：2026-07-19 08:59 UTC+8

reviewer 对 target 只读，只能写本报告。结论仅适用于上述改动快照。

## Findings

### sonnet_f001 — prune_stale 不删除过期实例，内存泄漏

- 严重度：medium
- 位置：`src/bridge/server.ts:75-81`
- 问题：`prune_stale()` 循环检查过期实例但 `void id` 是空操作，永不删除过期实例。长期运行的 Bridge 进程中 `instances` Map 单调增长。`build_status()` 返回所有历史实例（含 offline），status payload 随时间膨胀。`resolve_target()` 虽只查 online 实例所以功能不受影响，但内存和响应体积持续增长。
- 建议：超过合理阈值（如 1 小时无 heartbeat）后真正删除过期实例及对应 queue，或在 `prune_stale` 中加 `instances.delete(id)`。

---

### sonnet_f002 — CDP session 永不主动清理，events 数组无上限

- 严重度：medium
- 位置：`src/bridge/cdp_handler.ts:39, 286-292`
- 问题：CdpSession 的 5 分钟定时器仅在 session 仍在 Map 中时触发清理。如果 `/cdp/stop` 已被调用（已从 Map 删除），定时器检查 `sessions.get(session_key)` 返回 undefined 后直接跳过，不会关闭 WebSocket。更关键的是，在 5 分钟窗口内高流量场景下 `session.events` 数组无上限，持续增长可能导致内存问题。
- 建议：在 `handle_cdp_stop` 中清除相关定时器（存为 session 属性）；给 `session.events` 加上限（如 `MAX_EVENTS_PER_SESSION = 5000`），超限后 drop 最旧事件或拒绝新事件。

---

### sonnet_f003 — cdp_handler seq 变量同时用于 CDP 命令 ID 和 event seq

- 严重度：low
- 位置：`src/bridge/cdp_handler.ts:133, 173, 210, 224`
- 问题：`seq` 既作为 WebSocket CDP 命令 ID（`ws.send(JSON.stringify({ id: ++seq, ... }))`），又作为 CdpStoredEvent.seq（`seq: ++seq`）。虽然语义上不会导致 bug（event.seq 仅用于排序，不影响 CDP 协议），但变量复用增加阅读混淆。
- 建议：拆分为 `cdp_cmd_seq` 和 `event_seq` 两个独立计数器。

---

### sonnet_f004 — cdp_detect 对 /json/list 请求无超时

- 严重度：low
- 位置：`src/bridge/cdp_handler.ts:61`
- 问题：`handle_cdp_detect` 对 `/json/version` 设置了 AbortController + 3s 超时，但对紧随其后的 `/json/list` 请求没有设置超时。如果 CDP 端点对 version 响应正常但 list 阻塞，Bridge 会无限等待。
- 建议：对 `/json/list` 请求使用相同的 AbortController 或独立超时。

---

### sonnet_f005 — cdp_start 未验证 max_body_bytes 上限

- 严重度：medium
- 位置：`src/bridge/cdp_handler.ts:89-91`
- 问题：`handle_cdp_start` 从请求 body 中取 `max_body_capture_bytes`，未做上限验证。调用方可传入 `Number.MAX_SAFE_INTEGER`，使 `bytes.slice(0, session.max_body_bytes)` 的截断保护形同虚设，CDP 响应体可无限占用内存。
- 建议：增加 `Math.min(max_body_bytes, MAX_BODY_CAPTURE_BYTES)` 约束，与 `MAX_BODY_CAPTURE_BYTES`（100MB）常量对齐。

---

### sonnet_f006 — handle_cdp_events 返回 completed 事件后丢弃截断

- 严重度：low
- 位置：`src/bridge/cdp_handler.ts:315-324`
- 问题：completed 事件被收集后 `session.events = pending`，丢弃了超过 `MAX_EVENTS_PER_POLL` 的 completed 事件。在高流量场景下，未被 poll 到的 completed 事件永久丢失。
- 建议：将未返回的 completed 事件保留回 `session.events`（pending 列表），或改用 ring buffer。

---

### sonnet_f007 — command_queue.resolve 超时竞态抛异常

- 严重度：medium
- 位置：`src/bridge/command_queue.ts:50-51`
- 问题：如果 extension 响应和 timeout 同时触发，timeout handler 先调用 `this.pending.delete(command_id)`，随后 `resolve(result)` 发现 pending 为空抛出 `Unknown command_id` 异常。Bridge server 未对此路径做 catch，异常会导致 500 响应。虽然概率低（毫秒级竞态），但在高延迟网络下可能频繁出现。
- 建议：`resolve()` 方法在 pending 为空时静默返回而非 throw，或在 `server.ts` 的 `/extension/result` handler 中 catch 此错误返回 200（结果已丢失但不应报错给 extension）。

---

### sonnet_f008 — 不一致超时默认值：server vs domain docs

- 严重度：low
- 位置：`src/bridge/config.ts:36` vs `docs/blueprint/domain.md:118-122`
- 问题：`config.ts` 中 `command_timeout_ms` 默认 120000（2 分钟），`full_data_timeout_ms` 默认 300000（5 分钟）。`domain.md` 规定查询类 30s、全量/导出类 120s、start/stop 15s。实际默认值远大于文档值。Bridge server 中 `FULL_DATA_COMMANDS` 和 `WRITE_COMMANDS` 分组也与文档分类不完全对应（文档将 start/stop 单独归类为 15s）。
- 建议：统一代码默认值与 domain.md 规范，或在 domain.md 中注明"此处为建议值，实际默认由 config.ts 定义"。

---

### sonnet_f009 — domain.md 超时分类与 FULL_DATA_COMMANDS 不一致

- 严重度：low
- 位置：`src/bridge/server.ts:47-53` vs `docs/blueprint/domain.md:118-122`
- 问题：domain.md 将 `capture.export` 归为"导出类（120s）"、`capture.start`/`capture.stop` 归为 15s。代码中 `FULL_DATA_COMMANDS` 包含 `capture.export` 和 `capture.get_all_data`（正确），但 start/stop 在 `WRITE_COMMANDS` 中与 export/get_all_data 同组，实际超时走 `command_timeout_ms`（120s），远超 domain.md 的 15s 规范。
- 建议：为 start/stop 命令添加独立超时常量或在 server 中按文档分类分别处理。

---

### sonnet_f010 — MCP tools 命名 "recording" 与 domain 术语 "capture" 冲突

- 严重度：suggestion
- 位置：`src/mcp/tools.ts:10-11`、`src/mcp/schemas.ts:53, 60`
- 问题：MCP 工具名使用 `start_recording`/`stop_recording`，而 domain.md 核心术语明确规定"禁止 record / 录制 / 记录作产品术语"。虽然 domain.md 本身也将这两个名字列在 MCP 工具表中（说明是有意的历史兼容），但与禁用术语规则存在表面矛盾，容易在新代码中产生错误引用。
- 建议：在 domain.md MCP 工具表中明确标注 `start_recording`/`stop_recording` 为"历史命名保留，非产品文案"，避免歧义。

---

### sonnet_f011 — list_browsers 未出现在 domain.md MCP 工具表

- 严重度：suggestion
- 位置：`src/mcp/tools.ts:27`、`docs/blueprint/domain.md:31-47`
- 问题：`list_browsers` 在 `MCP_TOOL_NAMES` 中列出、在 `schemas.ts` 中有对应 schema，在 `tools.ts` 中有特殊处理逻辑（调用 `client.get_status()` 后提取 extensions），但 domain.md 的 MCP 工具表完全未提及此工具。
- 建议：在 domain.md MCP 工具表中补充 `list_browsers` 条目。

---

### sonnet_f012 — protocol.ts 中 deprecated 错误码名称与 domain.md 不一致

- 严重度：low
- 位置：`src/shared/protocol.ts:27,29`
- 问题：`AgentErrorCode` 中仍包含 `SESSION_NOT_FOUND` 和 `RECORDING_ALREADY_RUNNING`、`NO_ACTIVE_RECORDING`，而 domain.md 错误码表使用 `CAPTURE_NOT_FOUND`、`CAPTURE_ALREADY_RUNNING`、`NO_ACTIVE_CAPTURE`。虽然 @deprecated 存在，但两套错误码并存增加混淆风险。Bridge server 未使用 deprecated 名称，但其他模块可能引用。
- 建议：确认无活跃引用后移除 deprecated 错误码，或在 protocol.ts 中标注具体迁移路径。

---

### sonnet_f013 — /extension/enroll 验证跳过 pairing 检查的 S0 条件

- 严重度：medium
- 位置：`src/bridge/server.ts:269`
- 问题：当 `config.dev_mode` 为 true（`is_s0 = true`）时，`/extension/enroll` 跳过 pairing 检查。但 `dev_mode` 不在 `AgentBridgeConfig` 的必填字段中，且未在 config.ts 的 CLI 解析中暴露。如果外部进程意外传入 `dev_mode: true`，所有扩展 enroll 将无需配对。此路径的安全边界不清晰。
- 建议：`dev_mode` 应有独立的显式启用机制（如 `--dev-mode` CLI flag + env var），而非仅靠配置对象传入。

---

### sonnet_f014 — resolve_auto_output_path 的 capture_id 路径遍历

- 严重度：medium
- 位置：`src/bridge/server.ts:721-733`
- 问题：`resolve_auto_output_path` 用 `capture_id.replace(/[^a-zA-Z0-9._-]/g, '_')` 做 sanitize，但未处理 `..` 序列。如果 `capture_id` 为 `../../etc/passwd`，经过 replace 后变为 `.._.._.._etc_passwd`（安全）。但如果为 `..`，替换后仍为 `..`（点和连字符被保留），拼接后路径为 `<dir>/../.json`。虽然 `..` 作为 capture_id 的可能性极低且被 `capture_id` schema 的 `min(1)` 约束，但 sanitize 逻辑未显式防护。
- 建议：在 sanitize 后增加 `if (safe_id === '.' || safe_id === '..') safe_id = 'export'` 兜底。

---

### sonnet_f015 — is_authorized 对空 Authorization header 的行为

- 严重度：low
- 位置：`src/bridge/server.ts:527-536`
- 问题：当请求无 `Authorization` header 时，`request.headers.authorization` 为 `undefined`。`createHash('sha256').update(undefined || '')` 使用空字符串计算 hash，然后与 `Bearer <token>` 的 hash 做 `timingSafeEqual`。功能正确（返回 false），但如果 `token` 恰好为空字符串（不应发生，config.ts 要求非空），两者 hash 相同会导致认证绕过。当前受 config.ts 保护，但防御深度不足。
- 建议：在 `is_authorized` 开头显式检查 `if (!request.headers.authorization) return false`，或确认 config 层不会允许空 token 通过。

---

### sonnet_f016 — agent_bridge_config.ts 允许 localhost 但 server 绑定 127.0.0.1

- 严重度：suggestion
- 位置：`src/shared/agent_bridge_config.ts:75` vs `src/bridge/server.ts:501`
- 问题：extension 端的 `parse_local_bridge_url` 允许 `localhost` 和 `127.0.0.1`，但 Bridge server 只绑定 `127.0.0.1`。当用户配置 `http://localhost:xxxx` 时，DNS 解析通常指向 `127.0.0.1`（IPv4）或 `::1`（IPv6）。若系统优先解析 IPv6，fetch 将连接 `[::1]` 而非 `127.0.0.1`，导致连接失败。这是个潜在的跨平台兼容性问题。
- 建议：在 extension 配置验证中将 `localhost` 规范化为 `127.0.0.1`，或在 domain.md 中明确记录此限制。

---

### sonnet_f017 — body_routing safe_request_id 将点号替换为下划线

- 严重度：suggestion
- 位置：`src/shared/body_routing.ts:119`
- 问题：`safe_request_id` 的正则 `/[^a-zA-Z0-9._-]/g` 保留了点号，这本身正确。但如果 request_id 包含连续点号（如 `..`）或特殊格式，拼接到文件路径时可能产生意外结果。与 sonnet_f014 类似的路径安全考量。
- 建议：与 sonnet_f014 一起统一做路径安全审查。

---

### sonnet_f018 — MCP server 版本硬编码

- 严重度：suggestion
- 位置：`src/mcp/main.ts:16`
- 问题：`new McpServer({ name: 'capture-all', version: '0.1.0' })` 版本号硬编码，与 `package.json` 中的版本可能不同步。Bridge 版本 `BRIDGE_VERSION` 同样硬编码在 `server.ts:40`。
- 建议：从 `package.json` 读取版本号，或在构建时注入。

---

### sonnet_f019 — command_queue pending_count 不计真实 pending 数

- 严重度：low
- 位置：`src/bridge/command_queue.ts:62-64`
- 问题：`pending_count()` 返回 `this.commands.length`（未被 take_next 取走的命令数），而非 `this.pending.size`（已入队但未 resolve 的命令数）。语义上 `pending_count` 更应反映"等待响应的命令数"，但当前只反映"等待 extension poll 的命令数"。`build_status` 中用此值展示 pending_commands，可能误导 AI Agent。
- 建议：确认语义意图。若要展示"等待响应"的命令数，改为 `return this.pending.size`；若当前行为正确，在注释中说明。

---

### sonnet_f020 — Bridge 未对 CDP 路由的请求体做大小限制

- 严重度：low
- 位置：`src/bridge/server.ts:461-483`
- 问题：CDP 路由（`/cdp/detect`、`/cdp/start`、`/cdp/stop`）的 `read_json` 调用使用默认 `MAX_JSON_BODY_BYTES`（1MB）。这是合理的。但 CDP 路由处理函数内部将 body 直接透传给 handler，未对特定字段（如 `tab_url`、`port`）做长度校验。
- 建议：影响极低，仅建议在 `handle_cdp_start` 中对 `tab_url` 做合理长度限制。

---

### sonnet_f021 — MCP 工具 schema 中 format 字段无枚举约束

- 严重度：suggestion
- 位置：`src/mcp/schemas.ts:123`
- 问题：`export_capture_schema` 中 `format: z.string()` 未做枚举约束。AI Agent 可传入任意字符串作为导出格式（如 `"csv"`、`"xlsx"`），实际支持的格式由 extension 端决定。无 schema 约束意味着 MCP 层不会提前拒绝无效格式，错误将在执行阶段才返回。
- 建议：将 `format` 改为 `z.enum(['json', 'html', 'har', ...])` 或至少 `z.string().min(1)` 以匹配已知格式。

---

### sonnet_f022 — MCP 工具 get_status 和 list_browsers 无 schema 中 timeout_ms 约束一致性

- 严重度：suggestion
- 位置：`src/mcp/schemas.ts:45-51`、`src/mcp/tools.ts:34-41`
- 问题：`get_status_schema` 和 `list_browsers_schema` 定义了 `timeout_ms`，但 `execute_mcp_tool` 中对这两个工具直接调用 `client.get_status()`，没有传入 timeout。MCP schema 允许传 timeout 但实际被忽略。
- 建议：要么从 schema 中移除 `timeout_ms`（更诚实），要么在 `BridgeMcpClient.get_status` 中支持 timeout（通过 AbortController）。

## 结论

本批 11 文件覆盖 Bridge 核心（server + cdp_handler + config + command_queue）、MCP 层（client + server + tools + schemas）、shared 配置与 body 路由。整体架构清晰，鉴权分层（MCP token vs instance_token）设计正确，timing-safe 比较、token hash 存储、127.0.0.1 绑定等安全基础设施到位。

**关键风险点**：
1. **内存管理**（sonnet_f001, f002）：prune_stale 不清理 + CDP events 无上限，长期运行进程存在内存泄漏风险。
2. **竞态与异常处理**（sonnet_f007）：command_queue 的超时竞态可能导致 500 错误。
3. **超时规范偏离**（sonnet_f008, f009）：代码默认值与 domain.md 规范存在显著差距，需对齐。
4. **dev_mode 安全边界**（sonnet_f013）：skip pairing 的条件缺乏显式控制。
5. **输出路径安全**（sonnet_f014）：capture_id sanitize 对 `..` 的防护不完整。

无 critical 级别问题。建议优先处理 medium 级别的内存管理、竞态处理和 dev_mode 边界问题。其余为文档对齐和代码健壮性改进。
