# src_extension_01 审阅报告

- **审阅模型**: haiku
- **审阅日期**: 2026-07-19
- **审阅内容**: `src_extension_01` 批次（8 文件，1550 行）
- **审阅维度**: correctness、安全、Bridge 路由、命令处理、存储与隐私

---

## 文件清单

| # | 文件 | 行数 |
|---|------|------|
| 1 | `src/extension/_locales/en/messages.json` | 8 |
| 2 | `src/extension/_locales/zh_CN/messages.json` | 8 |
| 3 | `src/extension/background/agent_bridge_client.ts` | 367 |
| 4 | `src/extension/background/agent_command_dispatcher.ts` | 292 |
| 5 | `src/extension/background/agent_data_queries.ts` | 297 |
| 6 | `src/extension/background/app_log_storage.ts` | 229 |
| 7 | `src/extension/background/body_capture_coordinator.ts` | 313 |
| 8 | `src/extension/background/cdp_event_router.ts` | 36 |

---

## 1. 正确性 (correctness)

### F01-COR: `stop_body_capture()` 未调用 `stop_external_cdp()`，外部 CDP 会话泄漏

- **位置**: `body_capture_coordinator.ts:164-177`
- **级别**: 中
- **置信度**: 高
- **现象**: `stop_body_capture()` 仅清除内存状态和 `poll_timer`，不调用 `stop_external_cdp()` 通知远端 Bridge 终止 CDP 会话。`stop_body_capture_with_cleanup()` 才有完整清理逻辑，但两者签名的存在容易让调用者选错。
- **影响**: 外部 CDP Bridge 上的会话一直保持活跃直到超时，浪费资源；如果短时间内反复启停采集，可能累积僵尸会话。
- **建议**: 统一 `stop_body_capture` 和 `stop_body_capture_with_cleanup` 的行为，或至少在 `stop_body_capture` 内部调用 Bridge 端的 stop API（best-effort）。

### F02-COR: `get_native_record_id` 回退算法可能产生重复 ID

- **位置**: `agent_data_queries.ts:215-218`
- **级别**: 中
- **置信度**: 中
- **现象**: 当 record 既无 `event_id` 也无 `request_id` 时，回退使用 `${sort_key}:${absolute_time}` 作为 native_id。两个事件可以在同一毫秒内发生，拥有完全相同的 `relative_time_ms`（sort_key）和 `absolute_time`，产生非唯一 ID。
- **影响**: `data.get` 或 `timeline.get` 可能返回错误记录或报 `RECORD_NOT_FOUND`。`data.list` 中多条记录共享同一 `record_id`，下游按 ID 去重时丢失数据。
- **建议**: 在回退 ID 中加计数器或随机后缀，例如 `${sort_key}:${absolute_time}:${crypto.randomUUID().slice(0,8)}`。

### F03-COR: `list_captures` 排序依赖 ISO 字符串与 `Date` 构造函数行为

- **位置**: `agent_command_dispatcher.ts:121-123`
- **级别**: 低
- **置信度**: 中
- **现象**: `captures` 排序使用 `new Date(a.started_at).getTime() - new Date(b.started_at).getTime()`。如果 `started_at` 格式异常（如缺少时区），`Date` 构造函数行为在不同运行时中可能不一致（Chrome V8 对某些宽松格式的解析与 Node 不同）。
- **影响**: 排序结果可能在 MCP 服务端（Node）与扩展端（Chrome）表现不同，导致 `captures.list` 返回顺序与 Dashboard 不一致。
- **建议**: 统一在写入时使用 `Date.toISOString()` 保证格式一致，或在排序前增加格式校验。

### F04-COR: service worker 重启后 `runtime_instance_id` 可能丢失

- **位置**: `agent_bridge_client.ts:19`
- **级别**: 低
- **置信度**: 高
- **现象**: `runtime_instance_id` 初始为空字符串 `''`。如果 service worker 被终止后重启，且 session 已持久化，`resolve_token`（line 199-205）会从 `chrome.storage.local` 恢复 `instance_id`。但如果 session 不存在（如首次启动但尚未 enroll），轮询中发送 heartbeat 或 command fetch 时 `instance_id` 为空。
- **影响**: heartbeat（line 273-286）将发送空 `instance_id`，Bridge 服务器无法识别该实例。
- **建议**: 在发送需要 `runtime_instance_id` 的请求前加断言或回退到 uuid 生成。

### F05-COR: `app_log_storage.ts` `write()` 静默丢弃无 ID 条目

- **位置**: `app_log_storage.ts:17`
- **级别**: 低
- **置信度**: 高
- **现象**: `write(entry)` 在 `!entry.id` 时直接 return，不记录也不报错。如果 `Logger` 上游构造了缺少 `id` 的日志条目，数据静默丢失。
- **影响**: 排查问题时缺少关键日志，特别是启动阶段日志。
- **建议**: 对无 ID 条目生成 ID 或至少通过 `console.warn` 记录丢弃动作。

---

## 2. 安全 (security)

### F06-SEC: Bridge token 以明文存储在 `chrome.storage.local`

- **位置**: `agent_bridge_config.ts:47-49`, `agent_bridge_client.ts:210-214`
- **级别**: 中
- **置信度**: 高
- **现象**: `save_bridge_session()` 将 `instance_token` 明文写入 `chrome.storage.local`。虽然 `chrome.storage.local` 仅限当前扩展访问，但如果系统有其他 Chrome 扩展被恶意获取存储权限（如通过 DevTools），token 可被读取。
- **影响**: 攻击者通过其他扩展或本地文件访问获取 instance_token 后，可冒充该扩展实例向 Bridge 发送命令。
- **建议**: 标记为已知风险，在 `SECURITY.md` 或相关威胁模型中记录。短期可考虑使用 `chrome.storage.session`（内存级，不持久化到磁盘）降低风险，但需权衡 service worker 重启后的恢复需求。

### F07-SEC: Bridge 请求仅校验 token，不校验 Origin

- **位置**: `agent_bridge_client.ts:256-271` 等所有 Bridge 请求
- **级别**: 低
- **置信度**: 高
- **现象**: 扩展向 Bridge 发出的所有请求通过 `fetch()` API 发起，会自动附带 `Origin: chrome-extension://...`。Bridge 端 `server.ts` 有 Origin 校验（line 173-183），但校验逻辑仅针对浏览器发起的请求。如果 token 泄漏，攻击者可直接用命令行工具绕过 Origin 校验。
- **影响**: token 就是唯一的认证因子。一旦 token 泄漏，Bridge 完全暴露。
- **建议**: 在文档中明确 token 等同于完全访问权限。已满足 `docs/blueprint/decisions.md` 中 "token 优先 CLI > env > persisted" 的设计。

### F08-SEC: enroll 请求未验证 server 身份

- **位置**: `agent_bridge_client.ts:256-271`
- **级别**: 低
- **置信度**: 中
- **现象**: 构造 `fetch()` URL 时使用用户配置的 `agent_bridge_url`。如果用户被误导配置了恶意 Bridge URL（虽然 `parse_local_bridge_url` 限制为 localhost/127.0.0.1，但本地进程可能被注入），扩展会向恶意服务发送 bridge_token 并接收伪造命令。
- **影响**: 本地攻击场景：恶意进程绑定到正确端口冒充 Bridge 服务，接收 token 并下发危险命令。
- **建议**: 已知风险，`parse_local_bridge_url` 的 localhost 限制已大幅缩小攻击面。可考虑在 enroll 响应中增加 bridge 身份证明（如 server 公钥 hash），但当前设计在本地单机场景下足够。

### F09-SEC: `agent_data_queries.ts` 记录预览包含完整日志参数和数据

- **位置**: `agent_data_queries.ts:252`, `agent_data_queries.ts:281-283`
- **级别**: 信息
- **置信度**: 高
- **现象**: `get_record_summary` 和 `get_record_preview` 对 console_events 返回 `args_preview`（日志参数数组拼接），对 error_events 返回 `message`。这些是完整的原始数据，可能包含 PII 或敏感信息。
- **影响**: 通过 MCP `data.list` / `timeline.list` 返回给 AI Agent 时，可能暴露用户敏感信息。
- **建议**: 符合 `docs/blueprint/domain.md` 中 "MCP 不自动脱敏、不自动摘要、不自动过滤" 的设计原则。建议在 MCP 使用指南中提醒用户，对敏感数据采集应启用 `redact_data: true`。

---

## 3. Bridge 路由 (Bridge routing)

### F10-ROUTE: Bridge 路由完整性检查通过

- **位置**: `agent_bridge_client.ts` 全文
- **级别**: 信息
- **置信度**: 高
- **现象**: 扩展使用 4 条 Bridge 端点路由：
  - `POST /extension/enroll`（line 257）—— 注册实例
  - `POST /extension/heartbeat`（line 275）—— 心跳
  - `GET /extension/command`（line 289）—— 拉取 MCP 命令
  - `POST /extension/result`（line 304）—— 返回命令结果
- **影响**: 路由集合与 Bridge `server.ts` 中定义的端点完全匹配。`/extension/result` 的 body 使用 `result` 而非 `command_id + result` 包裹，可能与 Bridge 端的期望格式一致（需交叉验证 server.ts line 300+）。

### F11-ROUTE: URL 验证仅允许 localhost/127.0.0.1

- **位置**: `agent_bridge_config.ts:62-84`
- **级别**: 信息
- **置信度**: 高
- **现象**: `parse_local_bridge_url` 强制要求 `http://` 协议、`127.0.0.1` 或 `localhost` 主机名、必须含端口。拒绝所有外部 URL。
- **影响**: 防止扩展向公网服务发送 token 和数据。安全有效。

### F12-ROUTE: `agent_bridge_enabled` 关闭时自动停止客户端

- **位置**: `agent_bridge_client.ts:121-124`
- **级别**: 信息
- **置信度**: 高
- **现象**: poll 周期中检查 `config.agent_bridge_enabled`，若为 false 则调用 `stop_bridge_client()` 并退出。
- **影响**: 用户可在 Dashboard 即时关闭 Bridge 连接，下一轮 poll 即生效。无需手动重启扩展。

---

## 4. 命令处理 (command handling)

### F13-CMD: 命令分派覆盖完整

- **位置**: `agent_command_dispatcher.ts:39-89`
- **级别**: 信息
- **置信度**: 高
- **现象**: `execute_agent_command` 的 switch 语句覆盖 `AGENT_COMMAND_TYPES` 中全部 11 种命令类型（capture.start, capture.stop, captures.list, captures.get, sources.list, data.list, data.get, timeline.list, timeline.get, capture.get_all_data, capture.export）。无遗漏。
- **影响**: 所有 MCP 命令均可被扩展处理，不会返回"未知命令"错误。

### F14-CMD: 输入验证使用白名单过滤

- **位置**: `agent_command_dispatcher.ts:204-237`
- **级别**: 信息
- **置信度**: 高
- **现象**: `get_capture_config` 使用 `capture_config_keys` Set 白名单校验传入的 config 字段。未知字段立即拒绝，防止注入。类型校验 `has_valid_capture_config_values` 逐字段检查。
- **影响**: 攻击者无法通过 MCP 命令注入非预期的配置字段，也无法设置无效类型值导致运行时崩溃。

### F15-CMD: 错误码使用不一致的 `SESSION` 术语

- **位置**: `agent_command_dispatcher.ts:134`
- **级别**: 低
- **置信度**: 高
- **现象**: `get_capture_metadata` 在 capture 不存在时抛出 `AgentCommandError('SESSION_NOT_FOUND', ...)`。根据 `docs/blueprint/domain.md`，项目术语应为 `capture` 而非 `session`。
- **影响**: 错误码 `SESSION_NOT_FOUND` 定义在 `protocol.ts`（line 23），多处使用。非功能性缺陷，但造成术语混乱。
- **建议**: 统一改为 `CAPTURE_NOT_FOUND` 并更新 `protocol.ts` 及相关引用。低优先级，不建议在当前 task 范围外重构。

### F16-CMD: `export_capture` 的 content 字段直接作为 MCP 响应返回

- **位置**: `agent_command_dispatcher.ts:139-152`
- **级别**: 低
- **置信度**: 中
- **现象**: `export_capture` 返回 `{ format, content }`，其中 `content` 是完整的导出字符串。对于大采集，这可能导致 Bridge 返回超大响应（Bridge 端 `MAX_EXTENSION_RESULT_BODY_BYTES = 64MB`，line 42 of server.ts）。
- **影响**: 大导出（如完整 HTML 报告）可能消耗大量内存，甚至触发 Bridge 端 `CONTENT_TOO_LARGE` 错误。
- **建议**: Bridge 端已有 `INLINE_RESULT_MAX_BYTES` 阈值自动写临时文件。需验证 export 路径是否经过该逻辑（server.ts line 44-45 定义 `FULL_DATA_COMMANDS` 包含 `capture.export`，对应特殊处理）。

---

## 5. 存储与隐私 (storage & privacy)

### F17-STOR: `load_agent_capture_data` 一次性加载全量数据到内存

- **位置**: `agent_data_queries.ts:53-67`
- **级别**: 中
- **置信度**: 高
- **现象**: 调用 `load_agent_capture_data` 时，通过 `Promise.all` 并行加载 7 类数据源，每类最多 100000 条（`FULL_DATA_LIMIT`）。对于大采集（如 10 分钟密集使用），内存占用可能超过几百 MB。
- **影响**: Chrome 扩展 service worker 有内存限制，大采集可能导致 worker 被系统终止，采集中断。
- **建议**: 考虑分页加载或流式处理。当前 `FULL_DATA_LIMIT = 100000` 是硬上限，应急保护足够但不够优雅。可在此添加内存打点监控或按需降级为 lazy load。

### F18-STOR: 应用日志 FIFO 淘汰策略正确

- **位置**: `app_log_storage.ts:189-221`
- **级别**: 信息
- **置信度**: 高
- **现象**: `trim_if_needed` 使用 cursor `'next'` 顺序遍历，删除最旧条目直到空间低于配置阈值（默认 100MB）。删除按时间戳降序索引扫描，策略正确。
- **影响**: 日志不会无限增长占用 IndexedDB 空间。

### F19-STOR: `IndexedDBLogTransport.flush()` 未处理事务失败后的数据恢复

- **位置**: `app_log_storage.ts:29-52`
- **级别**: 中
- **置信度**: 中
- **现象**: `flush()` 使用 `splice(0)` 清空 buffer 后尝试写入 IndexedDB。如果事务失败（`tx.onerror`），数据已从内存 buffer 移除但未持久化，日志永久丢失。
- **影响**: 事务失败（如存储空间不足）时，该批次日志静默丢失。下次 `schedule_flush` 时 buffer 已空，无法重试。
- **建议**: 在事务失败时将 batch 重新合并回 buffer，或保留 batch 引用直到 `tx.oncomplete` 触发后才清空。

### F20-STOR: body capture 隐私配置正确传递

- **位置**: `body_capture_coordinator.ts:218-226`
- **级别**: 信息
- **置信度**: 高
- **现象**: `try_external_cdp_bridge` 将 `config.redact_data`、`config.redact_sensitive_headers`、`config.redact_url_query` 正确传递给外部 CDP 启动请求。内部 CDP（`enable_response_body_capture`）通过 `capture_response_body` 门控。
- **影响**: 隐私配置在三级回退路径中均被传播，不会因回退而降级隐私保护。

### F21-STOR: `chrome.storage.local` 用于 session 持久化

- **位置**: `agent_bridge_config.ts:34-53`
- **级别**: 信息
- **置信度**: 高
- **现象**: Bridge session（instance_id + instance_token）存储在 `chrome.storage.local`，键名 `agent_bridge_session`。数据仅本地存储，不同步到云端。
- **影响**: 符合产品"所有数据本地 IndexedDB，不入云"的承诺。

---

## 汇总

| 编号 | 维度 | 严重度 | 描述 |
|------|------|--------|------|
| F01 | 正确性 | 中 | `stop_body_capture()` 未关闭外部 CDP 会话 |
| F02 | 正确性 | 中 | `get_native_record_id` 回退 ID 可能重复 |
| F03 | 正确性 | 低 | ISO 日期排序依赖运行时行为 |
| F04 | 正确性 | 低 | SW 重启后 instance_id 可能为空 |
| F05 | 正确性 | 低 | 日志条目无 ID 时静默丢弃 |
| F06 | 安全 | 中 | session token 明文存储 |
| F07 | 安全 | 低 | token 是唯一认证因子（已知设计） |
| F08 | 安全 | 低 | enroll 未验证 server 身份 |
| F09 | 安全 | 信息 | 记录预览包含原始数据（符合设计） |
| F10 | 路由 | 信息 | Bridge 路由完整性通过 |
| F11 | 路由 | 信息 | URL 强制 localhost 有效 |
| F12 | 路由 | 信息 | enabled 关闭时自动停止 |
| F13 | 命令 | 信息 | 命令分派覆盖 11 种全部类型 |
| F14 | 命令 | 信息 | 配置白名单过滤有效 |
| F15 | 命令 | 低 | 错误码使用弃用术语 SESSION |
| F16 | 命令 | 低 | export content 可能超大 |
| F17 | 存储 | 中 | 全量数据一次性加载到内存 |
| F18 | 存储 | 信息 | 日志 FIFO 淘汰正确 |
| F19 | 存储 | 中 | flush 事务失败时数据丢失无法重试 |
| F20 | 存储 | 信息 | 隐私配置三级回退正确传递 |
| F21 | 存储 | 信息 | 数据仅本地存储 |

**整体评价**: 代码质量良好，状态管理与错误处理覆盖全面。Bridge 路由与命令处理完整对齐协议定义。安全方面 token 管理符合本地优先的设计原则。3 个中等问题（F01、F02、F19）需要在后续 task 中修复；其余低级别和信息级发现属于已知设计取舍或改进建议。
