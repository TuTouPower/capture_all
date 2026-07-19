# 审阅报告：src_bridge_mcp_shared_01（opus）

- 审阅人：opus
- 范围：`MANIFEST.md` 中 `src_bridge_mcp_shared_01` 11 个文件，1944 行
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
- 模式：只读全量审阅
- 检查维度：correctness、安全、协议、鉴权、路由、项目硬约束
- 引用规范：`file:line`

## 总体结论

核心鉴权与 token 分离约束实现正确，loopback 绑定、token 优先级、恒时比较到位。但存在若干实质问题：MCP 路径写入功能存在任意路径写入风险、`dev_mode` 配置链断裂、bridge 服务端完全缺失日志、CDP session 无内存边界、类型一致性漏洞。共发现 1 critical、3 high、6 medium、5 low。

---

## 问题列表

### opus_f001 — MCP `output_path` 任意路径写入

- 位置：`src/bridge/server.ts:444-453`
- 类别：安全 / 最小特权
- 级别：critical
- 置信度：高

**问题**：`mcp/command` 处理 `capture.export` / `capture.get_all_data` 时，若 `body.payload.output_path` 是非空字符串，直接传入 `write_result_to_file` → `writeFile(output_path, content, 'utf-8')`。整个路径未做任何规范化、目录白名单或 traversal 校验。

**影响**：MCP token 持有者（包括所有持有 `CAPTURE_ALL_BRIDGE_TOKEN` 的进程与用户）可写入主机上 bridge 进程有权限的任意路径：
- 覆盖用户文件（`../../../home/user/.ssh/authorized_keys`、`~/.bashrc` 等）。
- 写入 cron 目录实现持久化（`/etc/cron.d/`，若权限允许）。
- 写入 bridge 工作目录覆盖源码或配置。

CLAUDE.md 明确"生成物放 `artifacts/`，不入版本库"；`domain.md`/`decisions.md` 强调 loopback 信任但未授权任意写入。当前实现违反最小特权。

**建议**：
1. 拒绝 `output_path` 含 `..` 段、绝对路径前缀，或在 bridge 侧强制拼接到固定导出根目录（`default_export_dir()`）下，并对 `realpath` 结果校验仍位于根内。
2. 默认拒绝客户端 `output_path`，仅允许通过新参数 `output_filename`（纯文件名，不含路径）指定。
3. 写入前 `access(target, W_OK)` + 目录归属校验。

**下一步**：用户裁定。若认为 MCP token 持有者等同 root 信任，至少需在文档明确该假设；否则按建议 1 收敛。

---

### opus_f002 — `dev_mode` 配置链断裂，生产永不进入 S0

- 位置：`src/bridge/config.ts:14-38`、`src/bridge/server.ts:64`、`src/bridge/server.ts:269`、`src/shared/protocol.ts:65`
- 类别：协议 / 鉴权 / 正确性
- 级别：high
- 置信度：高

**问题**：`AgentBridgeConfig.dev_mode?: boolean` 是协议字段，server.ts 用 `is_s0 = Boolean(config.dev_mode)` 决定 `/extension/enroll` 是否跳过 pairing。但 `parse_bridge_config(raw)` 的 `RawBridgeConfig` 接口不含 `dev_mode`，且函数返回对象未拷贝该字段——`raw.dev_mode` 永远丢失。`parse_bridge_cli_args` 也未解析任何 CLI/env 开关。

**影响**：
1. 生产路径（`bridge/main.ts`）的 `is_s0` 恒为 `false`，S0 分支成为仅测试可达代码（`tests/unit/agent_bridge_server.test.ts:1501` 通过直接构造对象绕过 `parse_bridge_config` 测试 S0）。
2. 文档 `docs/archive/.../T0009/report.md` 描述的"S0 开关 `dev_mode=true` 恢复旧行为（dev 用）"在生产无可达路径，文档与现实不符。
3. 测试 AC-1 通过 ≠ 生产可用，掩盖了配置缺口。

**建议**：
1. 在 `RawBridgeConfig` 增加 `dev_mode?: boolean`。
2. `parse_bridge_config` 显式拷贝 `raw.dev_mode ?? false`。
3. `parse_bridge_cli_args` 支持 `--dev-mode` 或读 `CAPTURE_ALL_DEV_MODE` env，并在启动日志中显式提示"DEV MODE 启用，pairing 被绕过"。
4. 若 S0 在生产不应启用，考虑删除该分支与对应协议字段，简化心智模型。

**下一步**：用户裁定 S0 在生产是否需要可达。

---

### opus_f003 — bridge 服务端全量缺失日志

- 位置：`src/bridge/server.ts`（整个文件 851 行）
- 类别：约束 / 可观测性
- 级别：high
- 置信度：高

**问题**：CLAUDE.md 全局约定明确"日志优先，禁止 print / console.log 调试输出"，项目 `shared/logger.ts` 提供 `Logger`。但 `server.ts` 中鉴权失败、pairing 开关、enroll 顶替实例、命令超时、CDP 路由错误、JSON 解析失败、文件写入失败——均无任何 logger 调用，仅通过 HTTP 响应码返回错误。

**影响**：
1. 生产排障无线索：token 失败不知来源 IP、UA；enroll 顶替不知新旧 instance_id。
2. `cdp_handler.ts` 的 `ws.onerror`、`ws.onclose`、`catch {}` 完全吞异常。
3. 违反项目硬约束与全局编码规范。

**建议**：
1. 引入 `Logger('bridge/server')`、`Logger('bridge/cdp')`。
2. 关键事件落日志：`TOKEN_INVALID`（含 origin、path，不含 token）、`/pair/open|close`、`enroll` 顶替（label、新旧 instance_id）、`COMMAND_TIMEOUT`（command_id、type）、CDP session 生命周期、JSON 解析失败。
3. 异常分支 `catch (e) { logger.warn('...', { err: String(e) }); }` 替代空 `catch {}`。

**下一步**：按事件清单补充日志。

---

### opus_f004 — CDP session events 与 seq 映射无界增长

- 位置：`src/bridge/cdp_handler.ts:39`、`src/bridge/cdp_handler.ts:134`、`src/bridge/cdp_handler.ts:153-211`、`src/bridge/cdp_handler.ts:231`
- 类别：correctness / 资源
- 级别：high
- 置信度：高

**问题**：
1. `session.events: CdpStoredEvent[]` 无上限。流量大的页面（自动播放视频、长轮询、WebSocket 帧等）可在 5 分钟生命周期内积累成千上万条事件，单进程内存不受控。
2. `body_seq_to_req_id: Map<number, string>` 仅在收到 CDP 响应时 `delete(msg.id)`。若 CDP 因连接中断、target 切换、getResponseBody 永不响应，对应 entry 永久驻留，直到 5 分钟 session 过期 Map 才随闭包释放。
3. `MAX_EVENTS_PER_POLL = 100` 只限制单次 `/cdp/events` 返回数量；未消费的 completed 事件仍堆积在 `session.events`。

**影响**：长时间运行的 bridge + 高流量页面 → 内存膨胀，极端情况 OOM。多 session 并发放大风险。

**建议**：
1. `CdpSession` 增加 `max_events` 容量（如 5000），超出时丢弃最旧 pending 事件并记日志。
2. `body_seq_to_req_id` 增加上限（如 1000）与超时清理（10s 未响应删除并标 event 为 `cdp_failed`）。
3. `/cdp/events` 调用后未取走的事件达到阈值时告警。

**下一步**：实现上限并补充单测。

---

### opus_f005 — `BodyCaptureStatus` 类型不一致，cdp_handler 使用未定义的 `'pending'`

- 位置：`src/bridge/cdp_handler.ts:30-33`、`src/bridge/cdp_handler.ts:165`、`src/bridge/cdp_handler.ts:202`、`src/bridge/cdp_handler.ts:246`、`src/bridge/cdp_handler.ts:316`、`src/shared/types.ts:591-605`
- 类别：correctness / 类型
- 级别：medium
- 置信度：高

**问题**：`CdpStoredEvent.response_body_status` / `request_body_status` 在 cdp_handler 中声明为 `string`，绕过 `BodyCaptureStatus` 联合类型。运行期使用 `'pending'` 作为初始态——`BodyCaptureStatus` 联合中无此值（仅有 `'not_enabled' | 'captured' | 'failed' | 'too_large' | 'unsupported' | 'unsupported_binary' | 'opaque_response' | 'cdp_failed' | 'fallback_unavailable' | 'target_not_matched' | 'permission_denied' | 'partial' | 'streaming' | 'redacted'`）。

**影响**：
1. 类型系统失去保护，未来若将 `CdpStoredEvent.response_body_status` 改为 `BodyCaptureStatus`，编译会立即失败。
2. `request_body_status` 初始值 `'not_enabled'` 属合法枚举值，但 cdp_handler 永不修改它——CDP 桥根本不采集 request body，字段应省略或显式标注"始终 not_enabled"。
3. 外部消费方（如 dashboard、exporter）若按 `BodyCaptureStatus` 字面量对比，遇到 `'pending'` 会落入 default 分支，行为未定义。

**建议**：
1. `BodyCaptureStatus` 增加 `'pending'`，或改用独立的 `CdpEventStatus` 类型并显式导出。
2. `CdpStoredEvent` 字段用准确类型（`CdpEventStatus` 而非宽 `string`）。
3. 移除冗余 `request_body` / `request_body_status`，CDP 路径根本不采集。

**下一步**：类型修正 + 单测覆盖。

---

### opus_f006 — `resolve_target` 的 `_write` 参数完全未使用

- 位置：`src/bridge/server.ts:89`、`src/bridge/server.ts:425`
- 类别：correctness / 代码清晰度
- 级别：medium
- 置信度：高

**问题**：`resolve_target(payload, _write)` 第二参数下划线前缀表明已知不用。`WRITE_COMMANDS` 与 read commands 走完全相同的目标解析。`WRITE_COMMANDS` Set 本身也没有任何消费者。

**影响**：
1. 阅读者会误以为 write 路径有额外校验（如阻止写入到 offline instance、或对 `capture.start` 强制 `target_instance_id`）。
2. 若未来需要差异化（例如 `capture.start` 不允许 `target_label` 模糊匹配），现有签名会静默绕过。

**建议**：
1. 删除 `_write` 参数与 `WRITE_COMMANDS` Set（若确无差异化需求），简化签名。
2. 或：将 `WRITE_COMMANDS` 实际用于差异化逻辑（如 write 命令禁止 fallback 到 `online.length === 1` 自动选择，强制显式 target），并在 spec 中说明动机。

**下一步**：用户裁定是否需要差异化。

---

### opus_f007 — `validate_command_request` 不校验 timeout_ms 取值范围

- 位置：`src/bridge/server.ts:800-803`、`src/mcp/schemas.ts:4`
- 类别：correctness
- 级别：medium
- 置信度：高

**问题**：MCP schema 中 `timeout_ms_schema = z.number().int().positive().optional()`，但 bridge 侧 `validate_command_request` 只检查 `typeof === 'number'`，未校验整数与正数。负数、0、NaN、Infinity 都会进入 `queue.enqueue(..., timeout_ms)`：

- `setTimeout(fn, -1)` → 立即触发，命令一入队就超时。
- `setTimeout(fn, NaN)` → Node 视为 0，同样立即超时。
- `setTimeout(fn, Infinity)` → Node 视为 1ms，立即超时。
- `setTimeout(fn, 1.5)` → 非整数被截断。

**影响**：客户端意外传 `timeout_ms: 0` 或负数时，命令必失败但报错信息（`COMMAND_TIMEOUT`）误导排查。MCP schema 校验本可拦截，但 passthrough bridge 校验层应独立防御。

**建议**：
1. `validate_command_request` 增加 `Number.isInteger(value.timeout_ms) && value.timeout_ms > 0` 检查，或在传入 `queue.enqueue` 前 clamp 到 `[1000, config.full_data_timeout_ms]`。
2. NaN 显式拒绝并返回 400。

**下一步**：补校验 + 单测。

---

### opus_f008 — `pairing_code` 比较非恒时

- 位置：`src/bridge/server.ts:632`、`src/bridge/server.ts:19-22`
- 类别：安全
- 级别：medium
- 置信度：中

**问题**：`is_enroll_allowed` 用 `pairing_code === state.code` 比较 6 位数字配对码。虽 enroll 路径还要求 `has_ext_origin`（chrome-extension:// 来源），攻击面受限，但本机恶意页面若能伪造 Origin 头（理论上 chrome-extension 来源不可伪造），仍可侧信道逐字符探测。

**影响**：弱。配对码有效期 5 分钟、6 位空间（10^6）、需 chrome-extension 来源、本机才可达。但安全敏感比较应一致使用恒时。

**建议**：
1. 用 `timingSafeEqual(Buffer.from(a), Buffer.from(b))`（先判长度）。
2. 或直接让 attack 不可达：除来源检查外，额外要求 `Sec-Fetch-Site: same-origin` 或无 `Origin` 头（loopback same-origin GET 不会带 Origin）。

**下一步**：替换比较 + 文档化信任边界。

---

### opus_f009 — `handle_cdp_detect`/`handle_cdp_start` 第二次 fetch 无 timeout

- 位置：`src/bridge/cdp_handler.ts:61-62`、`src/bridge/cdp_handler.ts:103-104`
- 类别：correctness / 可用性
- 级别：medium
- 置信度：高

**问题**：`/json/version` 用 `AbortController` 限制 3s，但 `/json/list` 完全无 timeout。`handle_cdp_start` 的 `/json/list` 同样裸 fetch。

**影响**：若 CDP 端口被恶意服务占据并慢响应（本机任何进程都可监听任意 loopback 端口），bridge 处理请求的协程会挂起直至 socket 默认超时（可能数分钟）。MCP token 持有者可指定任意 port 触发挂起；并发可耗尽 bridge。

**建议**：所有 CDP fetch 用统一 timeout wrapper（1-3s），失败即返回 `cdp_port_not_found`。

**下一步**：补 timeout + 单测覆盖慢响应。

---

### opus_f010 — CDP 路由 `read_json` 结果未做对象校验

- 位置：`src/bridge/server.ts:462`、`src/bridge/server.ts:468`、`src/bridge/server.ts:480`
- 类别：correctness
- 级别：medium
- 置信度：高

**问题**：CDP 路由 `const body = await read_json(request) as Record<string, unknown>;` 是裸断言。`read_json` 返回 `unknown`，合法 JSON 可以是 `null`、`[]`、`"string"`、`42`。后续：
- `handle_cdp_detect(request, body)` → `body.port` 在 null/number/string 输入下：number 输入走 `typeof body.port === 'number'` 分支，OK；但 `body` 本身为 null 时访问 `.port` 抛 TypeError。
- `handle_cdp_stop(body)` → `String(body.session_key || '')` 在 body 为 null 时抛 TypeError。

外层 catch 兜底返回 500，但行为应为 400 + `INVALID_QUERY`。

**影响**：客户端发非对象 JSON 得到 500 而非 400，违反错误码语义。MCP token 持有者可触发 bridge 异常路径（无实质越权）。

**建议**：抽 `validate_cdp_body(value)` 函数，校验 `is_plain_object`，否则抛 `BridgeHttpError(400, 'INVALID_QUERY', ...)`。或直接复用 `is_plain_object`。

**下一步**：补校验。

---

### opus_f011 — `McpServer.registerTool` 未传 `description`

- 位置：`src/mcp/main.ts:20-29`
- 类别：协议 / 可用性
- 级别：low
- 置信度：高

**问题**：`server.registerTool(name, { inputSchema: schema }, handler)` 第二参数仅含 `inputSchema`，未提供 `description`。MCP 客户端（Claude Desktop 等）依赖 description 向 LLM 呈现工具用途；当前 LLM 看到 `get_status` / `start_recording` 等哑名字需自行猜测。

**影响**：MCP 工具可用性下降，LLM 可能误用或漏调。

**建议**：
1. 在 `tools.ts` 维护 `{ name, description, schema }` 三元组（如 `start_recording` → "Start a browser capture session with optional config"）。
2. `MCP_TOOL_SCHEMAS` 与描述同源，避免漂移。

**下一步**：补描述。

---

### opus_f012 — `MAX_JSON_BODY_BYTES` 未对 `/cdp/*` 单独放宽，但对 `/extension/result` 已放行

- 位置：`src/bridge/server.ts:41-42`、`src/bridge/server.ts:395-398`
- 类别：correctness / 一致性
- 级别：low
- 置信度：中

**问题**：`read_json` 默认 1 MiB；`/extension/result` 显式放宽到 64 MiB。`/mcp/command` 中 `capture.export` 可能携带大 payload（虽然项目策略是大输出落盘），但请求方向（payload）理论上不会很大；这里设计合理。但 `/cdp/start` 等路由使用默认 1 MiB，若未来 CDP 配置项扩展（headers、cookies 模板），可能撞上限。

**影响**：未来扩展时易忘调上限。无当前 bug。

**建议**：常量集中管理并按路由命名（`MAX_BODY_BRIDGE_DEFAULT` / `MAX_BODY_EXTENSION_RESULT` / `MAX_BODY_CDP`），便于审阅。

**下一步**：可选重构。

---

### opus_f013 — `get_status` / `list_browsers` schema 含无意义的 `timeout_ms`

- 位置：`src/mcp/schemas.ts:45-51`、`src/mcp/tools.ts:34-41`
- 类别：correctness / 协议一致性
- 级别：low
- 置信度：高

**问题**：`get_status_schema` 与 `list_browsers_schema` 声明 `timeout_ms`，但 `execute_mcp_tool` 中这两个工具走 `client.get_status()` 分支，**不传 timeout**。客户端传 `timeout_ms` 会被 schema 接受但被默默丢弃。

**影响**：误导调用方认为可控制超时；实际超时由 fetch 默认决定。

**建议**：从这两个 schema 中移除 `timeout_ms`，或在 `client.get_status()` 增加可选 timeout 参数并使用 `AbortSignal`。

**下一步**：移除或实现。

---

### opus_f014 — cdp session 5 分钟硬清理，注释与实现不符

- 位置：`src/bridge/cdp_handler.ts:285-292`
- 类别：correctness / 文档一致性
- 级别：low
- 置信度：高

**问题**：注释 `// Auto-cleanup after 5 minutes of inactivity`，实现是 `setTimeout(..., 5 * 60 * 1000)`——基于 wall clock 一次性触发，与是否活跃无关。活跃 session 也会被强杀。

**影响**：长采集任务（>5min）的 CDP bridge 通道会被关闭，事件丢失。但 `/cdp/events` 是扩展侧主动轮询，5 分钟通常够单次调试；若用于长时会话则不合适。

**建议**：
1. 修正注释为"5 分钟后清理"。
2. 若需 inactivity 语义，改为每次 `/cdp/events` 重置 timer。
3. 文档（`docs/guides/mcp_usage.md` 或 troubleshooting）说明 CDP session 最长 5 分钟。

**下一步**：用户裁定语义。

---

### opus_f015 — `cdp_handler` 错误码字符串未纳入 `AgentErrorCode`

- 位置：`src/bridge/cdp_handler.ts:78`、`src/bridge/cdp_handler.ts:108`、`src/bridge/cdp_handler.ts:114`、`src/bridge/cdp_handler.ts:296`、`src/shared/protocol.ts:17-37`、`src/shared/types.ts:614-615`
- 类别：协议一致性
- 级别：low
- 置信度：高

**问题**：`cdp_handler.ts` 返回 `error.code` 字段为 `'cdp_port_not_found'`、`'cdp_target_not_found'`、`'cdp_start_failed'`。这些未列入 `AgentErrorCode` 联合类型，仅 `types.ts:614-615` 定义了同名子集（`BodyCaptureFailureReason` 上下文）。协议层与运行期字符串存在两套真相。

**影响**：类型系统无法捕获拼写错误；客户端按 `AgentErrorCode` 处理会落入 default。

**建议**：
1. 将 `cdp_port_not_found` / `cdp_target_not_found` / `cdp_start_failed` 加入 `AgentErrorCode`。
2. 或在 `cdp_handler.ts` 内部定义独立 `CdpErrorCode` 并在文档说明。

**下一步**：协议层补全。

---

## 非问题（已核实正确的关键约束）

- **Bridge 仅绑 `127.0.0.1`**：`config.ts:17-19` 强制；`agent_bridge_config.ts:75-77` 扩展侧二次校验。✓
- **token 优先级 `CLI > env > persisted file > generated`**：`config.ts:103-124` 顺序正确。✓
- **生成 token 文件 mode 0600**：`config.ts:93` `writeFile(file_path, token, { mode: 0o600 })`。✓
- **token 由用户提供，禁止硬编码/默认值**：`parse_bridge_config` 强制 `raw.token?.trim()` 非空，否则抛错；`generate_bridge_token` 仅用于 fallback。✓
- **instance_token 不得访问 MCP / CDP**：`server.ts:321` `is_mcp_path = path.startsWith('/mcp/') || path.startsWith('/cdp/')`，该分支只接受 `is_authorized(request, config.token)`（MCP token）。instance_token 在 `resolve_extension_auth` 中仅对 `is_extension_data_path` 路径生效。✓
- **MCP token sha256 + timingSafeEqual**：`server.ts:527-536`，sha256 输出定长 32 字节，length 检查非必需。✓
- **instance_token hash 恒时比较**：`server.ts:562-574` 先判 `a.length === b.length` 再 `timingSafeEqual`。✓
- **same browser_label 顶替旧 instance**：`server.ts:287-295` 实现，空 label 视为匿名不顶替。✓
- **`capture.start` 单活跃采集约束**：在扩展端 `body_capture_coordinator` 实现（不在本批范围），bridge 仅转发。本批无回归。✓
- **MCP 不自动脱敏/摘要/过滤/删除**：`tools.ts` 与 `client.ts` 仅转发，无业务变换。✓
- **HTML 导出转义**：`server.ts:648-692` `/pair` 页面动态内容仅 `s.code`（6 位数字）和 `exp`（时间字符串），均为内部生成，无 XSS 风险。✓（但该结论不覆盖 extension 侧 exporter，那是其它批次范围）
- **CORS 仅允许 chrome-extension://**：`server.ts:510-512` 正则 `/^chrome-extension:\/\/[a-p]{32}$/`，匹配 Chrome extension ID 字符集。✓

## 优先级建议

| 级别 | 数量 | 代表项 |
| ---- | ---- | ---- |
| critical | 1 | opus_f001（任意路径写入） |
| high | 3 | opus_f002 dev_mode 断裂、opus_f003 缺日志、opus_f004 内存无界 |
| medium | 6 | opus_f005 类型不一致、opus_f006 死参数、opus_f007 timeout 校验、opus_f008 配对码非恒时、opus_f009 fetch 无 timeout、opus_f010 CDP body 未校验 |
| low | 5 | opus_f011 MCP description、opus_f012 body 上限、opus_f013 schema 噪音、opus_f014 注释错、opus_f015 错误码未入协议 |

建议先处理 critical 与 high；medium 与 low 可在最近一轮收尾 commit 一并落地。`opus_f002` 涉及生产可达性，需用户先裁定 S0 是否应在生产启用。
