# Bridge + MCP 纵向 Intensive Review

- reviewed_at：2026-08-13 11:55 UTC+8
- repository：`/home/karon/karson_ubuntu/capture_all`
- reviewed_commit：`03254fb`
- verdict：**REQUEST CHANGES**
- finding threshold：0（保留所有达到可验证门槛的 Critical / High / Medium / Low / Info 项）

## 1. 范围与方法

### 1.1 主审范围

- Bridge：`src/bridge/command_queue.ts`、`config.ts`、`logger.ts`、`label.ts`、`main.ts`、`cdp_handler.ts`、`server.ts`
- MCP：`src/mcp/client.ts`、`main.ts`、`schemas.ts`、`token_resolver.ts`、`tools.ts`
- 共享契约：`src/shared/protocol.ts`
- 关键调用方：
  - `src/extension/background/agent_bridge_client.ts`
  - `src/extension/background/agent_command_dispatcher.ts`
  - `src/extension/background/agent_data_queries.ts`
  - `src/extension/background/external_cdp_bridge_client.ts`
  - `src/extension/background/body_capture_coordinator.ts`

### 1.2 契约、配置与文档

- `docs/blueprint/conventions.md`
- `docs/blueprint/architecture.md`
- `docs/blueprint/testing.md`
- `docs/blueprint/domain.md`
- `docs/specs_index.md`
- `docs/archive/specs/bridge.md`
- `docs/archive/specs/mcp_server.md`
- `docs/specs/bridge_auto_export_path.md`
- `docs/specs/bridge_cdp_idle_and_bounds.md`
- `docs/specs/agent_result_lifecycle_delivery.md`
- `docs/archive/tasks/t101_bridge_cdp_idle_and_bounds/spec.md`
- `docs/archive/tasks/t137_bridge_output_path_guard/spec.md`
- `docs/archive/tasks/t140_agent_query_cursor_paging/spec.md`
- `.mcp.json.example`
- `.claude/settings.json`
- `README.md`
- `docs/guides/mcp_usage.md`
- `SECURITY.md`

### 1.3 测试审阅

完整或针对性读取 Bridge/MCP 相关 unit 与 E2E，包括：

- `tests/unit/agent_bridge_server.test.ts`
- `tests/unit/t137_bridge_security.test.ts`
- `tests/unit/agent_bridge_queue.test.ts`
- `tests/unit/agent_mcp_client.test.ts`
- `tests/unit/mcp_schema.test.ts`
- `tests/unit/mcp_token_fallback.test.ts`
- `tests/unit/bridge_config_health.test.ts`
- `tests/unit/bridge_cdp_events.test.ts`
- `tests/unit/cdp_session_idle_bounds.test.ts`
- `tests/unit/cdp_handler_redaction.test.ts`
- `tests/unit/t140_resource_budget.test.ts`
- `tests/unit/agent_protocol.test.ts`
- `tests/unit/mcp_project_config.test.ts`
- `tests/e2e/e2e-mcp.spec.ts`
- `tests/e2e/e2e-mcp-full.spec.ts`
- `tests/e2e/e2e-cdp-capture.spec.ts`
- `tests/e2e/e2e-cdp-retry.spec.ts`

### 1.4 历史判断

通过 `git log` 与针对性 `git blame` 区分新引入、修复漂移、预存问题。关键归因：

- CDP 会话 body 预算：`51e0843`（t140，2026-08-12）
- post-open WebSocket close 处理：`d9804d4`（t101，2026-08-11）
- Bridge 启动健康探测：`c6afa690`（2026-07-16）
- MCP status 工具分发：`4ddb94d4` / `eec69857`（2026-06/07）
- MCP strict schema：`325e93b`（2026-08-13）
- Bridge public `close()`：首版 `25ba3e9`（2026-06-05）

### 1.5 验证边界

本轮为只读源码审阅：

- 未运行 unit、E2E、lint、TypeScript 编译或全量验证。
- 未动态连接真实 Chrome/CDP、真实 MCP host。
- 未启动或停止 Bridge，不修改共享运行状态。
- 复现证据为源码可达调用链、状态推演、既有测试反证；动态验证留给父审阅会话统一执行。

## 2. Severity 汇总

| Severity | 数量 |
|---|---:|
| Critical | 0 |
| High | 3 |
| Medium | 4 |
| Low | 4 |
| Info | 2 |

Critical 结论：未发现无需额外前提即可造成任意代码执行、权限突破、全局不可逆数据损坏的 Critical 项。

## 3. Findings

## High

### BM-H001 — 轮询移除已完成 CDP 事件时不递减 `body_bytes`，正常流量会触发错误淘汰

- severity：High
- confidence：98/100
- perspectives：P2 Correctness/Lifecycle、P3 Protocol/Spec、P4 Performance/Resource、P7 Test Quality
- location：
  - `src/bridge/cdp_handler.ts:389-392`
  - `src/bridge/cdp_handler.ts:419-445`
  - `tests/unit/t140_resource_budget.test.ts:37-70`
- contract：t140 `AC-009`（聚合预算正确约束驻留 body）与 `AC-010`（预算内常规流量完整性不降级）
- history：**t140 新引入**。`body_bytes` 计数来自 `51e0843`；既有轮询删除逻辑未随计数器加入而更新。

#### 复现证据 / 调用链

1. `Network.getResponseBody` 成功后，`session.body_bytes += ...`，随后执行 `enforce_body_budget(session)`：`src/bridge/cdp_handler.ts:389-392`。
2. `/cdp/events` 把最多 100 条 completed 事件放入 `to_return`，随后直接重建 `session.events = pending.concat(remaining_completed)`：`src/bridge/cdp_handler.ts:430-445`。
3. 被返回、已从 `session.events` 移除的事件 body 字节未从 `session.body_bytes` 扣除。
4. 因此 `body_bytes` 不再代表当前驻留内存，而是接近会话累计捕获量。

确定性状态推演（测试 cap 100 bytes）：

- A body 80 bytes：`body_bytes=80`；poll 返回并删除 A，但计数仍为 80。
- B body 30 bytes：计数变 110；当前实际驻留仅 B=30 bytes。
- C body 30 bytes：计数变 140，事件数组 `[B,C]`；预算循环错误淘汰 B，计数仍为 110，数组只剩 C。
- 坏结果：实际驻留仅 30 bytes、远低于 100 bytes，B 仍被静默丢弃；计数还保持超限，后续事件继续被误淘汰。

现有 `t140_resource_budget` 测试只直接构造简化 session 并调用内部 helper，未经过生产 `/cdp/events` 路径，因此无法发现轮询后的账本漂移：`tests/unit/t140_resource_budget.test.ts:45-70`。

#### 影响

- 常规轮询本身会把会话推入“永久虚假超预算”状态。
- 后续网络响应 body 或完整网络事件被错误淘汰，采集数据不完整。
- 这是核心采集功能可观察数据丢失，不只是内存统计偏差。

#### Critical/High 证伪

- 已检查是否有 poll 后重算或扣减：`handle_cdp_events` 无任何 `body_bytes` 更新。
- 已检查计数是否仅作日志：计数直接控制 `enforce_body_budget` 淘汰。
- 已检查是否需要异常输入：不需要；任意累计返回 body 超过 200MB 后都会触发，测试小 cap 可稳定复现。
- 未升 Critical：影响限定于外部 CDP body 捕获会话，不破坏 IndexedDB 既有数据，也不构成权限突破。

#### 修复建议

- 在从 session 移除 `to_return` 前，按 UTF-8 实际存储长度扣减每条非 null `response_body`。
- 更稳妥方案：封装唯一 `remove_event`，统一负责数组移除、body 账本和关联映射清理，禁止多个路径各自维护计数。
- 新增生产路径回归：MockWebSocket 完成 body → `/cdp/events` poll → 再写 body，断言预算内事件全部返回且 `body_bytes` 只统计当前驻留事件。

### BM-H002 — 事件数与 body 预算淘汰不区分 pending，响应回来后请求永久消失

- severity：High
- confidence：94/100
- perspectives：P2 Correctness/Lifecycle、P3 Protocol/Spec、P4 Performance/Resource、P7 Test Quality
- location：
  - `src/bridge/cdp_handler.ts:63-89`
  - `src/bridge/cdp_handler.ts:344-372`
  - `src/bridge/cdp_handler.ts:419-445`
  - `tests/unit/t140_resource_budget.test.ts:45-70`
- contract：
  - t140 `AC-009` 要求按既定策略“丢弃最旧/标记 too_large”限制 body，而非删除无 body pending 请求。
  - archived Bridge spec `src/bridge` CDP proxy 条款要求未返回事件保留，completed 分页不丢。
- history：**混合来源**。event-count 淘汰来自 t101；body-budget 淘汰来自 t140 `51e0843`。t140 扩大并常态化该失败场景。

#### 复现证据 / 调用链

1. `push_bounded` 超事件数上限时无条件 `session.events.shift()`：`src/bridge/cdp_handler.ts:66-75`。
2. `enforce_body_budget` 超 body 预算时同样无条件 shift 最旧事件：`src/bridge/cdp_handler.ts:81-89`。
3. 两处均不检查 `response_body_status`。最旧事件可以是等待 `Network.getResponseBody` 的 `pending` 请求。
4. `Network.loadingFinished` 把 CDP command id → request id 保存在闭包 `body_seq_to_req_id`：`src/bridge/cdp_handler.ts:344-355`。
5. command response 到达时仅在 `session.events` 中查 pending event：`src/bridge/cdp_handler.ts:368-372`。若前面已淘汰，`waiting_event` 为 undefined，映射删除，且不产生失败终态事件。
6. `/cdp/events` 只能返回仍在数组内的非 pending 事件：`src/bridge/cdp_handler.ts:430-445`。被移除请求永久不可见。

确定性状态推演（body cap 100 bytes）：

- A：pending、无 body。
- B：已回写 120-byte body，数组 `[A,B]`、`body_bytes=120`。
- `enforce_body_budget` 首先 shift A；A 无 body，计数仍为 120；数组只剩 B，循环因 `events.length > 1` 退出。
- 坏结果：A 请求元数据永久丢失，预算仍超限，B 也未按注释所称“最旧带 body 事件”处理。

事件数 cap 满时也可直接淘汰 pending，形成同一终态缺失。

#### 影响

- 高并发、慢响应或大 body 场景下静默丢失完整请求记录，不只是省略 body。
- `body_seq_to_req_id` 与 session event 生命周期分离，淘汰后只能丢弃迟到结果。
- Bridge 日志只有淘汰计数，无法指出哪个 request 被删除、是否 pending。

#### Critical/High 证伪

- 已检查淘汰注释是否与实现一致：注释声称“丢最旧带 body 事件”，实现无筛选。
- 已检查迟到响应能否重建事件：不能；response handler 只更新现存 waiting event。
- 已检查 poll 是否可返回被淘汰元数据：不能；唯一来源是 `session.events`。
- 未升 Critical：需要达到事件数或 body 预算，影响限定于当前 CDP 会话采集完整性。

#### 修复建议

- body 预算只选择最旧、已终态且确有 `response_body` 的事件；不得用 pending 元数据偿还 body 预算。
- 若只剩当前超大 body、无法通过淘汰降到预算，保留请求元数据，把当前 body 置 null 并标 `too_large`。
- event-count 淘汰若必须删除 pending，先生成可返回终态（如 `cdp_failed` / `evicted`），并清理对应 command 映射。
- 将 `body_seq_to_req_id` 纳入 session 生命周期；destroy/evict 时显式清理。
- 测试必须走 MockWebSocket 生产路径，覆盖 pending 位于最旧位置、迟到 body response、事件数 cap 与 body cap 交叉场景。

### BM-H003 — CDP WebSocket 建连后关闭不会终态化 session，扩展永久保持“active”并静默停止 body 捕获

- severity：High
- confidence：96/100
- perspectives：P2 Correctness/Lifecycle、P5 Error Handling/Observability、P7 Test Quality
- location：
  - `src/bridge/cdp_handler.ts:224-264`
  - `src/bridge/cdp_handler.ts:409-413`
  - `src/extension/background/external_cdp_bridge_client.ts:139-166`
  - `src/extension/background/body_capture_coordinator.ts:242-281`
- history：**预存**，`ws.onclose` 当前行为来自 `d9804d4`（t101）。当前 active/backlog task 关键词扫描未发现等价承接。

#### 复现证据 / 调用链

1. `ws.onopen` 将 `session.cdp_ws = ws` 并 resolve `ws_connect='ok'`：`src/bridge/cdp_handler.ts:235-240`。
2. 同一个 `ws.onclose` 在建连后仍只设置 `session.connect_error='WebSocket closed'` 并再次调用已 settled Promise 的 `resolve('failed')`：`src/bridge/cdp_handler.ts:247-251`。
3. post-open close 不调用 `destroy_session`，不把 pending 事件终态化，也不向 `/cdp/events` 暴露 session failure。
4. session 已在 `sessions` 中并启动 5 分钟 idle TTL：`src/bridge/cdp_handler.ts:409-411`。
5. `/cdp/events` 对该 session 继续返回 HTTP 200 `{ok:true, events:[]}`。
6. 即使 TTL 后 session 变 404，扩展 client 把所有非 2xx 统一变成空数组：`src/extension/background/external_cdp_bridge_client.ts:154-165`。
7. coordinator 每 500ms 永久重排下一次 poll，不依据 session failure 切换 fallback：`src/extension/background/body_capture_coordinator.ts:247-265`；返回状态一直是 `external_cdp_bridge / active`：`:270-280`。

可复现操作：MockWebSocket `onopen` → `/cdp/start` 成功 → 触发 `onclose` → 连续调用 `/cdp/events`。预期应暴露终态并降级；实际为最多 5 分钟 200 空数组，随后 404 仍被扩展转换为空数组，采集模式不变。

#### 影响

- Chrome tab 关闭、远端调试端口重启、Chrome 崩溃或 WebSocket 中断后，外部 body 捕获静默永久停止。
- UI/状态仍宣称 external CDP active，用户无法区分“页面无请求”和“采集链已死亡”。
- pending 请求没有失败终态，导致数据完整性与诊断同时缺失。

#### Critical/High 证伪

- 已检查 onclose 是否在成功连接后被替换：未替换。
- 已检查 `connect_error` 是否被 `/cdp/events` 读取：未读取。
- 已检查 404 是否触发扩展 fallback：client 吞成 `[]`，coordinator 不变更模式。
- 已检查 idle TTL 是否构成恢复：TTL 只删除 session，扩展仍继续空轮询，不恢复。
- 未升 Critical：只影响外部 CDP body 捕获路径，基础网络元数据仍可能由其他采集路径存在。

#### 修复建议

- 建连成功后安装运行态 `onclose/onerror`：把所有 pending 事件终态化为 `cdp_failed`，标 session terminal reason，关闭并清理 WS/timer。
- `/cdp/events` 返回明确 terminal 状态或 410 + 结构化错误。
- `poll_external_cdp_events` 不得把 404/410/鉴权失败统一降为空数组；向 coordinator 抛出可分类错误。
- coordinator 收到 terminal failure 后停止 poll，并切到 fallback hook 或明确更新失败状态。
- 新增 post-open close、error、TTL 后 poll、fallback 切换测试。

## Medium

### BM-M001 — Bridge public `close()` 不取消 pending command，也不销毁 CDP sessions

- severity：Medium
- confidence：91/100
- perspectives：P2 Correctness/Lifecycle、P4 Performance/Resource、P5 Error Handling
- location：
  - `src/bridge/server.ts:52-69`
  - `src/bridge/server.ts:597-603`
  - `src/bridge/command_queue.ts:19-87`
  - `src/bridge/cdp_handler.ts:45,92-99`
  - `tests/unit/agent_bridge_server.test.ts:755-779`
- history：**预存**。public close 来自首版；`cancel_all` 注释已明确“server close 时调用”，但实际未调用。

#### 复现证据 / 调用链

- `queues`、`command_owners` 是 `create_bridge_server` 闭包状态：`src/bridge/server.ts:52-55`。
- public `close` 仅执行 `server.close(callback)`：`src/bridge/server.ts:599-602`。
- 一个 `/mcp/command` handler 可正在 await queue result；timeout 上限 300000ms。未取消时 active HTTP connection 会让 close 等到结果或超时。
- `AgentCommandQueue.cancel_all()` 已能清 timer、pending、commands 并返回 `COMMAND_CANCELLED`：`src/bridge/command_queue.ts:71-87`，但 close 路径未遍历调用。
- CDP sessions 为模块全局 Map，仅 `/cdp/stop`、idle timer 等路径销毁；server close 不触达：`src/bridge/cdp_handler.ts:45,92-99`。
- 现有测试在调用 public close 前先用内部 `_server.closeAllConnections()` 强拆连接：`tests/unit/agent_bridge_server.test.ts:771-778`，因此绕过了需要验证的 public close 行为，也未断言 queue timer/session WS 被释放。

#### 影响

- 进程内关闭、测试 teardown、嵌入式重启可阻塞到命令 timeout（最长约 5 分钟）。
- outbound CDP WebSocket 与 idle timer 可在 HTTP server 关闭后继续存活，阻止进程退出或污染下一次实例。
- pending command 没有确定 `COMMAND_CANCELLED` 终态。

#### 修复建议

- public close 开始时遍历 `queues.values()` 调 `cancel_all()`，清 `command_owners`/instances。
- 从 cdp_handler 导出 `destroy_all_sessions()`，close 时关闭所有 WS、timer、映射。
- 之后再 `closeIdleConnections`/`server.close`；必要时定义有界 graceful timeout。
- 测试只调用 public close，不预先 `closeAllConnections`；断言快速完成、请求收到 `COMMAND_CANCELLED`、WS close、timer 清理。

### BM-M002 — `get_status` / `list_browsers` 声明的 `timeout_ms` 被分发层静默忽略

- severity：Medium
- confidence：100/100
- perspectives：P3 Protocol/Spec、P5 Error Handling、P6 Docs/Config、P7 Test Quality
- location：
  - `src/mcp/schemas.ts:46-52`
  - `src/mcp/tools.ts:33-41`
  - `src/mcp/client.ts:7-25`
  - `docs/guides/mcp_usage.md:87-93`
  - `tests/unit/agent_mcp_client.test.ts:103-112`
  - `tests/unit/mcp_schema.test.ts:249-255`
- history：**预存**。get_status 分发来自 `4ddb94d4`，list_browsers 来自 `eec69857`；2026-08-13 strict schema 只拒绝未知键，未修参数消费。

#### 复现证据 / 调用链

- 两个工具 schema 都公开接受 `timeout_ms`：`src/mcp/schemas.ts:46-52`。
- `execute_mcp_tool` 对两者直接调用 `client.get_status()`，没有读取 `call.arguments`：`src/mcp/tools.ts:33-41`。
- `BridgeMcpClient.get_status()` 固定使用 10000ms：`src/mcp/client.ts:11,20-25`。
- 指南声明“所有工具支持 timeout_ms”且“显式传入始终优先”：`docs/guides/mcp_usage.md:87-93`。

可观察输入：`get_status({timeout_ms:1})` 或 `list_browsers({timeout_ms:1})`。实际 AbortSignal 仍为 10000ms。现有 client 测试反而固定断言 10s；schema 测试只证明参数被接受，没有端到端断言参数生效。

#### 影响

- 调用方无法按工具契约设置快速失败界限。
- Bridge 挂起时 agent 可能比声明多等待近 10 秒。
- 参数被静默接受比显式拒绝更难诊断。

#### 修复建议

二选一：

1. `BridgeMcpClient.get_status(timeout_ms = 10000)`，tools 读取并传递参数；list_browsers 同步。
2. 若产品决定固定 10s，则从 schema、工具描述和指南删除该参数。

新增 MCP tool 分发测试，spy `AbortSignal.timeout` 并从 `execute_mcp_tool` 输入验证 1ms/5000ms 确实到达 client。

### BM-M003 — 官方 MCP 指南的导出路径示例必失败，64MiB 故障说明也已反转

- severity：Medium
- confidence：99/100
- perspectives：P3 Protocol/Spec、P6 Docs/Config
- location：
  - `docs/guides/mcp_usage.md:54-71`
  - `docs/guides/mcp_usage.md:95-106`
  - `src/bridge/server.ts:504-508,537-548,817-848`
  - `src/extension/background/agent_bridge_client.ts:321-348`
  - `tests/unit/t137_bridge_security.test.ts:59-97`
- history：**代码修复后文档漂移**。原指南为 2026-07 文本；路径约束由 t137 引入，64MiB 扩展侧预检由 t140 引入。

#### 复现证据

1. 指南示例给出绝对路径 `"/absolute/path/export.json"`：`docs/guides/mcp_usage.md:60-66`。
2. Bridge 现在在 target 解析前调用 `safe_output_path`，绝对路径解析到 export dir 外会返回 `INVALID_QUERY`：`src/bridge/server.ts:504-508,841-844`。
3. t137 测试明确断言 `/etc/cron.d/evil` 等绝对路径被拒：`tests/unit/t137_bridge_security.test.ts:66-79`。
4. 指南还称超过 64MiB 后 Bridge 返回 413、MCP 等待超时：`docs/guides/mcp_usage.md:97-100`。
5. 当前扩展在发送前估算，改写为小型 `PAYLOAD_TOO_LARGE` AgentCommandResult 并投递：`src/extension/background/agent_bridge_client.ts:321-345`。MCP 应收到结构化失败结果，不再等待原命令超时。

#### 影响

- 用户复制官方唯一导出示例即失败。
- 排查大结果时会依据错误的 413/超时模型定位，忽略实际结构化错误。
- 文档误导触达核心 MCP 导出路径，故高于普通文字瑕疵。

#### 修复建议

- 示例改为 export dir 内相对路径，如 `"output_path":"exports/export.json"`，或更直接使用 `"output_path":"export.json"`。
- 明确路径相对 `CAPTURE_ALL_EXPORT_DIR`，拒绝绝对路径、`..` 与 symlink escape。
- 更新 64MiB 条目：扩展侧将超限结果改写为 `PAYLOAD_TOO_LARGE`，Bridge 正常接收该小结果；说明原命令副作用不可回滚。

### BM-M004 — 启动探测把目标端口任意 HTTP 2xx 服务误判为 Capture All Bridge

- severity：Medium
- confidence：96/100
- perspectives：P3 Protocol/Spec、P5 Error Handling/Observability、P6 Docs/Config、P7 Test Quality
- location：
  - `src/bridge/main.ts:14-19`
  - `src/bridge/config.ts:160-171`
  - `.claude/settings.json:28-34`
  - `src/bridge/server.ts:42-43`
- history：**预存**。main/config 判断来自 `c6afa690`；2026-08-13 仅补 3s timeout，未增加身份校验。

#### 复现证据 / 调用链

- `is_bridge_healthy` 对 `${bridge_url}/health` 只返回 `response.ok`：`src/bridge/config.ts:163-170`。
- main 看到 true 就打印“capture-all bridge already listening”并正常退出：`src/bridge/main.ts:14-19`。
- SessionStart hook 也只检查 `/health` HTTP code 200：`.claude/settings.json:33`。
- 无响应 JSON 产品标识、bridge version、特征 header 或 token challenge 校验。

可观察输入：在配置端口运行任意服务，使 `/health` 返回 200。随后启动 Bridge。实际结果不是明确 `EADDRINUSE` 或“端口被非 Capture All 服务占用”，而是静默宣称 Bridge 已运行并退出；后续 MCP 对错误服务调用失败。

#### 影响

- 常见端口碰撞导致 Bridge 无法启动，错误信息与根因相反。
- hook 可能长期不拉起真正 Bridge，MCP 初始化表现为鉴权/路由/JSON 错误。
- 运维诊断成本高，但不造成安全越权，故 Medium。

#### 修复建议

- `/health` 返回稳定产品标识与版本，例如 `{ok:true, service:"capture-all-bridge", bridge_version:"0.1.0"}`。
- `is_bridge_healthy` 校验 status、Content-Type、完整标识；解析失败视为端口冲突，不视为已运行。
- main 对“端口有 2xx 非本服务”输出明确错误并非零退出。
- SessionStart hook 复用同一探测脚本，避免 shell 逻辑漂移。
- 新增“任意 200 服务不算健康”的 config/main 测试。

## Low

### BM-L001 — CORS allow-headers 缺实例认证头，违反 Bridge spec

- severity：Low
- confidence：78/100
- perspectives：P1 Security/Privacy、P3 Protocol/Spec、P7 Test Quality
- location：
  - `src/bridge/server.ts:616-625`
  - `src/extension/background/agent_bridge_client.ts:338-345`
  - `docs/archive/specs/bridge.md:34`
  - `tests/unit/agent_bridge_server.test.ts:249-269`
- history：**预存，且上一轮已知**。上轮 `review_20260812_1249/b1_core.md` 的 B1-M8 已报告，当前仍存在。

Bridge spec 明确要求 `Allow-Headers` 含 `X-Capture-All-Instance-Id`，实际只返回 `Authorization, Content-Type`。扩展结果等请求实际发送该自定义头。当前 Chrome extension host permission 环境可能不触发标准网页同等限制，因此不判 Medium/High；但标准 CORS preflight 若声明该头，浏览器会因响应未许可而阻止后续请求。现有测试把缺失行为固化为预期。

修复：补 `X-Capture-All-Instance-Id`，测试请求头也包含该字段并断言响应允许；继续保持 origin allowlist。

### BM-L002 — MCP Zod schema 未表达 Bridge/dispatcher 已知边界，向 agent 暴露必失败调用

- severity：Low
- confidence：95/100
- perspectives：P3 Protocol/Spec、P6 Maintainability、P7 Test Quality
- location：
  - `src/mcp/schemas.ts:3-9,84-106,122-129`
  - `src/bridge/server.ts:939-943`
  - `src/extension/background/agent_command_dispatcher.ts:156-168,195-231`
  - `tests/unit/mcp_schema.test.ts:211-225`
- history：**预存**。2026-08-13 strict schema 修复未知键透传，但未收敛字段值域。

已知分叉：

- MCP `timeout_ms` 只要求正整数；Bridge 要求 `<=300000`。
- MCP `limit` 只要求正整数；dispatcher 对相关查询限制 `<=100000`。
- MCP `export_capture.format` 接受任意 string；dispatcher 只接受 `json/jsonl/html/har`。
- MCP `source/sources` 接受任意 string；dispatcher 最终才返回 source/查询错误。

`mcp_schema.test.ts:223-225` 甚至显式固化 `csv` 通过 schema。结果不会越权或产生错数据，但工具 schema 失去 agent 输入引导与前置错误价值，失败被推迟到 Bridge/extension 往返之后。

修复：复用共享常量，把 enum、上限写入 Zod；错误在 MCP schema 层直接返回。更新 passthrough 测试为非法值拒绝测试。

### BM-L003 — extension 返回 `AgentCommandResult.ok=false` 时 MCP 响应仍缺 `isError:true`

- severity：Low
- confidence：72/100
- perspectives：P3 Protocol、P5 Error Handling
- location：
  - `src/mcp/client.ts:39-49`
  - `src/mcp/main.ts:33-43`
  - `src/bridge/server.ts:536-553`
- history：**预存**。

Bridge 对 extension 的 domain failure（HTTP 200、body `{ok:false,error:...}`）按正常 HTTP response 返回。MCP client 因 `response.ok` 直接返回该对象，registerTool 始终只设置 text content，不设置 MCP `isError:true`。因此 MCP 协议层把工具失败表示为成功文本，调用 agent 必须自行解析嵌套 JSON 的 `ok:false`。

影响取决于 MCP host 是否自动依据 `isError` 驱动重试/错误展示，尚未用真实 host 动态验证，因此 confidence 与 severity 均降低。修复：当结果符合 `AgentCommandResult` 且 `ok===false` 时返回 `{isError:true, content:[...]}`；保留结构化 code/message。补 SDK client integration 测试验证错误分类。

### BM-L004 — t140 要求更新的长期限制表仍缺 CDP 会话 200MB body 预算

- severity：Low
- confidence：100/100
- perspectives：P3 Spec Compliance、P6 Docs/Maintainability
- location：
  - `docs/archive/tasks/t140_agent_query_cursor_paging/spec.md:92-94`
  - `docs/blueprint/domain.md:108-125`
  - `src/bridge/cdp_handler.ts:51-53`
- history：**t140 finalization 漏项**。

`t140` 明确要求 finalization 时在 `domain.md` 限制表补会话 body 预算。实现已有 `MAX_SESSION_BODY_BYTES=200MB`，但长期真相表只列单条 body、CDP poll 等限制，没有会话聚合预算。该缺口会让后续维护者不知道 200MB 行为契约，也不利于发现 BM-H001/H002 账本和淘汰语义。

修复：在 `domain.md` 增加 CDP session body aggregate 200MB、计数口径、超限策略；修复 H001/H002 后再写准确策略，避免固化当前错误实现。

## Info

### BM-I001 — Bridge 主实现文件已超过实现源码 800 行提示阈值

- severity：Info
- confidence：100/100
- location：`src/bridge/server.ts`（993 行）
- history：预存，非本轮 diff 增量判断。

`server.ts` 同时承载路由、认证、实例生命周期、命令队列编排、CORS、输入解析、导出路径与文件写盘。文件大小本身不作为 blocking finding；BM-M001 等生命周期漏清理显示职责集中已增加跨状态收尾遗漏风险。建议后续按 router/auth/instance/export/lifecycle 拆分，不与当前 bug 修复混做。

### BM-I002 — Bridge server unit test 已超过测试源码 1200 行提示阈值

- severity：Info
- confidence：100/100
- location：`tests/unit/agent_bridge_server.test.ts`（2064 行）
- history：预存。

测试覆盖面广是优势，但 teardown、CORS、导出、队列、配对、实例管理混在单文件，已出现 `closeAllConnections()` 绕过 public close 语义的测试可信问题。建议按路由/生命周期/安全/导出拆分 fixture 与 suite。纯行数问题不阻断。

## 4. 七视角覆盖

### P1 — Security / Privacy

检查：loopback bind、MCP/instance 双 token、hash 比较、CORS、enroll、输出路径、敏感配置、错误信息。

- 新增 finding：BM-L001（CORS 契约缺口）。
- 已确认 t137 `safe_output_path` 使用词法 + realpath 收敛，绝对路径、`..`、symlink escape 均有测试。
- MCP token 与 instance token 分离，token hash + `timingSafeEqual` 实现方向正确。
- 本 bundle 未发现新的 High/Critical 任意文件写、远程监听或 token 明文硬编码问题。

### P2 — Correctness / Lifecycle

检查：CDP session 状态机、pending/terminal 转换、queue 生命周期、server shutdown、跨层错误状态。

- High：BM-H001、BM-H002、BM-H003。
- Medium：BM-M001。
- 主要系统性风险为“状态容器分散但删除/关闭路径未统一”：`session.events`、`body_bytes`、`body_seq_to_req_id`、queues、command_owners、WebSocket/timer 各自维护。

### P3 — Protocol / Spec Compliance

检查：Bridge archived spec、t101/t137/t140、MCP schemas、dispatcher 边界、HTTP/MCP error shape、文档参数契约。

- High：BM-H001/H002 违反 t140 完整性与预算语义。
- Medium：BM-M002（公开参数无效）、BM-M003（官方指南漂移）、BM-M004（health 身份语义缺失）。
- Low：BM-L001、BM-L002、BM-L003、BM-L004。

### P4 — Performance / Resource Bounds

检查：事件数、body 聚合字节、poll batch、timeout、timer/WS、导出内联阈值、关闭资源。

- t140 已从“无聚合上限”改进为 200MB cap，但 BM-H001/H002 使预算实现反而可能丢常规事件。
- BM-M001 显示 shutdown 未闭合 timer/WS/queue。
- 单次 poll 100、session event 5000、HTTP body 1MiB、extension result 64MiB 均有明确常量。

### P5 — Error Handling / Observability

检查：结构化日志、HTTP status/domain error 转换、AbortSignal、CDP disconnect、health probe、poll failure。

- BM-H003：运行态 WS failure 不可观察。
- BM-M002：timeout 参数静默忽略。
- BM-M004：错误端口被误报为“已运行”。
- BM-L003：domain failure 未映射 MCP error bit。
- Bridge 已新增 stderr 结构化 warning，CDP 淘汰、连接失败、解析失败相比上轮明显改善。

### P6 — Maintainability / Docs / Config

检查：模块职责、共享常量、文档与代码、`.mcp`/Claude hook、文件规模。

- BM-M003、BM-L004：文档漂移。
- BM-L002：边界常量在 MCP/Bridge/dispatcher 多层重复且不一致。
- BM-I001/I002：实现与测试文件规模提示。
- `.claude/settings.json` health 判定与 `is_bridge_healthy` 重复，已经产生同一误判。

### P7 — Test Quality / Coverage

检查：测试是否触达生产路径、失败分支、异步时序、mock 边界、E2E 覆盖。

关键缺口：

- t140 body budget 测试直接调用内部 helper、构造缺字段 session，未触达 WebSocket → body response → poll 生产链；因此漏掉 BM-H001/H002。
- CDP 测试有 MockWebSocket 基础设施，但未覆盖“onopen 后 onclose/onerror”与扩展 fallback，漏掉 BM-H003。
- close 测试先强制 `closeAllConnections()`，绕过 public close 应负责的队列取消，漏掉 BM-M001。
- MCP schema 与 client 各自测试，但缺 `execute_mcp_tool` 参数到 AbortSignal 的纵向断言，漏掉 BM-M002。
- health 测试只验证 `response.ok` 布尔，未放入“错误服务也返回 200”的碰撞 fixture，漏掉 BM-M004。

未发现 `.skip` / `.only`、恒真断言、删除断言等本轮 diff 型危险模式；本轮不是 task diff review，不据预存测试结构制造 blocking finding。

## 5. Critical / High 交叉证伪总结

| Finding | 证伪尝试 | 结论 |
|---|---|---|
| BM-H001 | 搜索 poll 后扣减/重算、确认计数是否仅日志 | 无扣减；计数直接驱动淘汰，成立 |
| BM-H002 | 检查淘汰是否筛 completed/body、迟到 response 是否重建事件 | 无筛选、无重建，成立 |
| BM-H003 | 检查 post-open handler 替换、`connect_error` 消费、404 fallback、TTL 恢复 | 四条恢复路径均不存在，成立 |

未发现符合 Critical 门槛的项。三项 High 均为核心采集数据丢失或静默功能失效，且有确定输入/状态/坏结果；不依赖代码风格判断。

## 6. Strengths

- Bridge 强制 loopback host，配置层拒绝非 `127.0.0.1`，收窄攻击面。
- MCP/instance 双 token 分离；只保存 SHA-256 hash，比较使用 `timingSafeEqual`。
- t137 输出路径防护同时处理绝对路径、`..` 与 symlink realpath escape，且在 target resolution 前提前拒绝。
- `AgentCommandQueue` 使用进程级计数 + UUID，timeout 双向清理；`cancel_all` 语义清晰且返回结构化 `COMMAND_CANCELLED`。
- MCP client 已用 `AbortSignal.timeout`，普通命令与 full-data 默认 timeout 分开，修复了上一轮无限等待问题。
- MCP schemas 已 `.strict()`，未知顶层字段不再静默透传；嵌套 capture config 明确 strip。
- CDP session 已有 idle TTL、event-count cap、body aggregate cap、结构化 eviction warning；方向正确，当前缺陷集中在账本与终态选择。
- 扩展 64MiB 预检避免把超限 JSON 发到 Bridge，并返回结构化 `PAYLOAD_TOO_LARGE`。
- Bridge 日志已覆盖命令 timeout、CDP connect failure、event eviction、message parse failure，比上一轮可观测性明显提升。
- Bridge/MCP unit 与 E2E 基础设施覆盖广，已有 MockWebSocket、真实 HTTP server、schema、token、项目配置测试，可直接承载本报告回归用例。

## 7. 未覆盖与后续验证建议

未覆盖：

- 真实 Chrome remote debugging 连接中断、tab close、Chrome restart。
- 真实 MCP host 对 `isError` 的行为差异。
- 高并发 5000 event 与 200MB body 的进程 RSS/GC 实测。
- Bridge graceful shutdown 在不同 Node 版本的 socket 行为。
- 非关键 extension 模块；只读了 Bridge/MCP 调用链相关文件。

父会话建议优先执行的定向验证：

1. 新增/运行 CDP 生产路径测试：body poll 记账、pending eviction、post-open close。
2. public close 测试：不调用 `_server.closeAllConnections()`，设置短 timeout，断言 `COMMAND_CANCELLED` 与快速关闭。
3. MCP tool 参数纵向测试：`execute_mcp_tool({timeout_ms:1})` 到 `AbortSignal.timeout(1)`。
4. health collision 测试：临时 HTTP server `/health=200` 但无产品标识，Bridge 应明确拒绝误判。
5. 修复后再跑 Bridge/MCP unit、相关 E2E、TypeScript 编译与 lint。

## 8. 最终判断

Bridge/MCP 安全基线与资源上限较上一轮显著改善，但 CDP 聚合预算实现存在两个可确定触发的数据丢失缺陷，WebSocket 运行态断线又无终态或 fallback。三项 High 直接影响外部 CDP 核心采集完整性与可用性，当前不应按 clean 状态放行。
