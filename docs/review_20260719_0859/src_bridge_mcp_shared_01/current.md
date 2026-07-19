## 模型依据

继承 default_model，底层实际模型不可观测。

## 范围

依据 `/home/karon/karson_ubuntu/capture_all/docs/review_20260719_0859/MANIFEST.md` 中 `src_bridge_mcp_shared_01` 清单，逐文件、逐段、逐函数审阅以下 11 个文件：

- `src/bridge/cdp_handler.ts`
- `src/bridge/command_queue.ts`
- `src/bridge/config.ts`
- `src/bridge/main.ts`
- `src/bridge/server.ts`
- `src/mcp/client.ts`
- `src/mcp/main.ts`
- `src/mcp/schemas.ts`
- `src/mcp/tools.ts`
- `src/shared/agent_bridge_config.ts`
- `src/shared/body_routing.ts`

审阅标准包括 `CLAUDE.md`、`docs/blueprint/architecture.md`、`docs/blueprint/domain.md`、`docs/blueprint/conventions.md`、`docs/blueprint/decisions.md`，并按需核对已归档协议规格与相关调用方。未运行构建或测试，未修改源码与其他文档。

## 高优先级

### 1. 多实例命令 ID 冲突，导致合法结果被拒绝或归属表被错误清除

- 位置：`src/bridge/command_queue.ts:9-20`（`AgentCommandQueue.next_id` / `enqueue`）；`src/bridge/server.ts:57-58, 399-414, 437-441`（`queues` / `command_owners`）
- 现象：每个实例拥有独立 `AgentCommandQueue`，且每个队列都从 `cmd_1` 开始生成命令 ID；但 `command_owners` 是全局 `Map<string, string>`，仅以 `command_id` 为键。两个实例并发收到首条命令时都会生成 `cmd_1`，后写入者覆盖前者归属。先返回结果的实例可能被判定为“command_id does not belong to this instance”；任一请求完成后又会删除另一条同名命令的归属。
- 影响：多实例路由核心协议不可靠。并发命令可被错误拒绝并最终超时，状态与归属追踪失真；碰撞不只发生一次，每个队列相同序号都会重复碰撞。
- 建议：命令 ID 改为进程级唯一值，例如全局单调序号、`randomUUID()`，或将 `instance_id` 纳入 ID；`command_owners` 继续按全局唯一 ID 索引。补充两个实例并发 enqueue、反序返回结果的行为测试。
- 置信度：高
- 级别：HIGH

### 2. CDP 目标 URL 未匹配时静默连接其他页面

- 位置：`src/bridge/cdp_handler.ts:111-114`（`handle_cdp_start` 目标选择）
- 现象：调用方传入 `tab_url`，精确匹配失败后代码自动退回任意第一个 `page` target 或首个 target，并仍返回 `ok: true`。项目已定义 `target_not_matched` Body 状态，但此处未使用。
- 影响：可能采集错误标签页的 URL、请求头及响应体，造成数据串页和隐私泄露；调用方无法知道外部 CDP 已连接到非目标页面。多窗口、重定向、URL 片段变化或重复页面场景均可能触发。
- 建议：`tab_url` 非空且无匹配时 fail fast，返回明确 `cdp_target_not_found` / `target_not_matched`，禁止退回其他页面；如需宽松匹配，必须使用可解释规则并在响应中显式标记匹配方式。补充“目标不存在时不得连接首个页面”测试。
- 置信度：高
- 级别：HIGH

### 3. 单次轮询超过 100 个已完成 CDP 事件时永久丢弃尾部事件

- 位置：`src/bridge/cdp_handler.ts:311-325`（`handle_cdp_events`）
- 现象：函数先将全部非 pending 事件移出 `session.events`，将 `session.events` 直接替换为仅含 pending 事件，随后才对 completed 执行 `slice(0, MAX_EVENTS_PER_POLL)`。第 101 条及以后已完成事件既未返回，也未放回队列。
- 影响：高流量页面或轮询间隔稍长时发生确定性、静默网络事件丢失，破坏全量采集正确性和证据完整性。
- 建议：只从队列移除本次实际返回的前 100 条；未返回 completed 事件必须保留到下次轮询。可按原顺序分区，或从 `session.events` 中精确删除已发送项。补充 101 条、250 条完成事件跨多次轮询无丢失测试。
- 置信度：高
- 级别：HIGH

### 4. `Network.getResponseBody` 返回 CDP error 时事件永久 pending

- 位置：`src/bridge/cdp_handler.ts:241-268`（CDP command response 分支）
- 现象：收到命令响应后立即删除 `body_seq_to_req_id`，但仅在 `waiting_event && msg.result` 时更新状态。CDP 以 `{ id, error }` 返回失败时，事件保持 `response_body_status: 'pending'`，且映射已删除，后续无法再完成。
- 影响：常见的 body 不可用、缓存、资源已释放等 CDP 错误会让整条网络事件永远不被 `/cdp/events` 返回；会持续占用 session 内存直到五分钟清理，并造成静默数据缺失。
- 建议：匹配到等待事件后，无论成功或失败都终结状态；`msg.error` 设置为 `cdp_failed`，无合法 body 也设置明确失败状态。必要时记录受控错误原因，但不得泄露敏感 body。补充 CDP error response 测试。
- 置信度：高
- 级别：HIGH

## 中低优先级

### 5. 顶替同 label 实例时直接删除队列，未取消正在等待的 MCP 命令

- 位置：`src/bridge/server.ts:285-294`（同 label 顶替）；`src/bridge/command_queue.ts:22-38`（pending promise）；`src/bridge/server.ts:437-441`（等待结果）
- 现象：同 `browser_label` enroll 顶替旧实例时，代码直接 `queues.delete(id)`。旧队列中已排队或已取走命令对应 promise、timer 仍存活，无法由新实例完成，只能等原超时；已定义 `COMMAND_CANCELLED` 错误码但未使用。
- 影响：重启或顶替期间，MCP 调用最长阻塞 120/300 秒后才返回 `COMMAND_TIMEOUT`，错误语义不准确；旧 queue 通过 timer/promise 闭包继续存活，增加短期资源占用。
- 建议：为 `AgentCommandQueue` 增加 `cancel_all()`，清理 timer、命令数组和 pending map，并立即以 `COMMAND_CANCELLED` resolve；删除实例前调用，同时清理对应 `command_owners`。
- 置信度：高
- 级别：MEDIUM

### 6. 外部 CDP body 上限未做边界校验，可绕过 100 MB 硬限制

- 位置：`src/bridge/cdp_handler.ts:87-95, 118-129, 254-263`（`max_body_capture_bytes`）；`src/mcp/schemas.ts:28-42`（`capture_config_schema`）
- 现象：`handle_cdp_start` 接受任意 number 作为 `max_body_capture_bytes`，未要求整数、非负、有限值，也未限制到 `MAX_BODY_CAPTURE_BYTES`。MCP schema 只设 `.min(0)`，同样没有 `.max(MAX_BODY_CAPTURE_BYTES)`。直接调用 `/cdp/start` 可传负数或超过 100 MB 的值。
- 影响：超过硬上限时可能把超大响应体保存在内存，造成 Bridge 内存压力；负数会进入 `bytes.slice(0, session.max_body_bytes)`，产生非预期截断结果。违反“单条 body 截断 100 MB 永远生效”约束。
- 建议：在 HTTP 边界校验 `Number.isSafeInteger` 且范围为 `0..MAX_BODY_CAPTURE_BYTES`；MCP Zod schema 同步 `.max(MAX_BODY_CAPTURE_BYTES)`。无效值返回 `INVALID_QUERY`，不要静默接受。
- 置信度：高
- 级别：MEDIUM

### 7. `/cdp/start` 在 WebSocket 尚未连接成功时即报告成功

- 位置：`src/bridge/cdp_handler.ts:131-140, 275-296`（WebSocket 建立与返回）
- 现象：创建 `WebSocket` 后立即将 session 写入 map 并返回 `ok: true`，未等待 `open`、未设置连接超时。随后若触发 `error` / `close`，只把 `cdp_ws` 设为 null，调用方仍认为外部 CDP 模式启动成功。
- 影响：BodyCaptureCoordinator 可能停止降级并进入一个实际不可用的采集模式，之后轮询持续返回空数据，造成响应体缺失且无明确启动错误。
- 建议：`handle_cdp_start` 等待 `open` 或 error/timeout 后再返回；仅连接成功且 `Network.enable` 得到成功响应后建立有效 session。失败时删除 session 并返回 `cdp_start_failed`。
- 置信度：高
- 级别：MEDIUM

### 8. 持久化 token 文件未验证或修复权限

- 位置：`src/bridge/config.ts:81-95, 103-123`（`load_bridge_token_file` / `persist_bridge_token` / `resolve_bridge_token`）
- 现象：新建文件时传入 mode `0600`，但读取已有 token 文件前不检查权限；`writeFile(..., { mode: 0o600 })` 对已存在文件也不会保证收紧原权限。若文件被预创建为组/其他用户可读，Bridge 会直接信任并使用其中 token。
- 影响：本机多用户或错误部署环境中，MCP token 可能被其他用户读取，进而访问 MCP/CDP 路由及采集数据。与生成 token 文件 mode `0600` 安全约束不完全一致。
- 建议：读取前 `stat` 并拒绝或修复非 `0600` 权限；写入后显式 `chmod(0o600)`。更稳妥方案为排他创建临时文件、设置权限后原子 rename，避免预创建窗口。
- 置信度：中高
- 级别：MEDIUM

### 9. Bridge 直连命令接口接受无效 timeout

- 位置：`src/bridge/server.ts:787-808`（`validate_command_request`）；`src/bridge/server.ts:434-439`；`src/bridge/command_queue.ts:22-34`
- 现象：HTTP 边界仅检查 `timeout_ms` 类型为 number，未检查有限、整数、正数或合理上限；随后用 `body.timeout_ms || default_timeout` 处理。负数为 truthy，会让 `setTimeout` 近乎立即触发；小数和极大值也直接进入 Node timer。MCP schema 虽限制正整数，但 Bridge API 自身仍未满足边界校验要求。
- 影响：已鉴权调用方或协议偏差可制造立即超时、timer 溢出警告或与声明策略不一致的行为，降低协议稳定性。
- 建议：Bridge 端独立校验 `Number.isSafeInteger(timeout_ms) && timeout_ms > 0`，并设置明确最大值；不要依赖 MCP 层校验。
- 置信度：高
- 级别：LOW

## 建议

1. 优先修复全局命令 ID、CDP 目标匹配、轮询 100 条丢失、CDP error 永久 pending 四项，并增加行为测试。
2. 将 Bridge 所有 HTTP 输入视为独立安全边界：端口、timeout、body 上限、字符串长度均在 Bridge 再校验，不依赖 MCP Zod 或扩展调用方。
3. 为 `AgentCommandQueue` 明确生命周期接口：`enqueue`、`take_next`、`resolve`、`cancel_all`；实例顶替和 server close 均走取消流程。
4. CDP session 增加显式状态机（connecting / active / failed / stopped），只有 active 才向调用方报告启动成功；所有请求最终进入非 pending 终态。
5. 为 `/cdp/events` 增加批量边界测试，验证事件总数、顺序及跨轮询完整性。

## 不确定项

### 1. CORS 预检是否会阻止扩展发送实例 ID header

- 位置：`src/bridge/server.ts:514-525`；相关调用方 `src/extension/background/agent_bridge_client.ts` 使用 `X-Capture-All-Instance-Id`
- 现象：`Access-Control-Allow-Headers` 只列出 `Authorization, Content-Type`，未包含 `X-Capture-All-Instance-Id`。扩展对 `/extension/command` 与 `/extension/result` 会发送该自定义 header。
- 影响：若当前 Chrome 扩展跨域 fetch 路径执行标准 CORS preflight，自定义 header 未获允许会导致浏览器阻断命令轮询或结果回传；但 Chrome MV3 在具备 host permissions 时对扩展跨源请求的具体 CORS 行为可能绕过常规页面限制。
- 建议：用真实 MV3 扩展环境验证 preflight；若可复现，将 `X-Capture-All-Instance-Id` 加入 allow headers。该修改低风险，但本次只读审阅不作代码变更。
- 置信度：中
- 级别：LOW
