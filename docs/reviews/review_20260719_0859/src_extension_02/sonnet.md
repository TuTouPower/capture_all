# src_extension_02 审阅报告 (sonnet)

- 审阅人：sonnet
- 日期：2026-07-19
- 范围：src_extension_02 清单 7 文件，1782 行
- 关注域：CDP、console/cookie/exception、导出、外部 Bridge、隐私与资源管理

---

## 1. CDP

### 1.1 CDP attach 协调依赖调用顺序，缺乏防重入

- **位置**：`src/extension/background/cdp_handler.ts` L184-L199；`console_capture.ts` L37-L43；`exception_capture.ts` L34-L40
- **现象**：console_capture 和 exception_capture 各自维护 `attached_by_us` 标志，独立调用 `chrome.debugger.attach()`。两个模块在 `already_attached=false` 时各自 attach，第二次 attach 会静默失败（catch 吞掉错误），但 `attached_by_us` 仍被设为 true。stop 时两个模块都会调用 `chrome.debugger.detach()`，第二个 detach 会静默失败。
- **影响**：功能上不会崩溃（Chrome debugger API 对重复 attach/detach 抛错但不致命），但 `attached_by_us` 状态不准确，导致 stop 时 detach 逻辑不可靠。若未来新增第三个 CDP 用户，现有协调机制会失效。
- **建议**：引入共享的 debugger attach 引用计数模块（或复用 service_worker 中 `debugger_attached_tab_id` 状态），由 service_worker 统一 attach/detach，子模块只用 `sendCommand`。
- **置信度**：中
- **级别**：低（当前两个用户场景下功能正常）

### 1.2 Sub-target session 注册无清理守卫

- **位置**：`src/extension/background/cdp_event_router.ts` L6；`cdp_handler.ts` L182-L201；`console_capture.ts` L109-L119；`exception_capture.ts` L84-L98
- **现象**：三个模块各自独立 `register_session()`，但只有 `cdp_handler.ts` 在 `detachedFromTarget` 时调用 `unregister_session()`。console_capture 和 exception_capture 也各自注册同一个 child_session，但仅 cdp_handler 的 detach 路径会清理。`attached_sessions` 是全局 Set，多个模块注册同一条目不会重复（幂等），但若 cdp_handler 未收到 detach 事件（如 tab crash），session 残留。
- **影响**：残留 session 导致 `should_handle_event` 持续接受已失效 session 的事件，但因 tab 已销毁实际不会有新事件到达，影响极低。长期运行（24h 上限）下 Set 持续增长。
- **建议**：采集停止时 `clear_sessions()` 全量清理（service_worker.stop_capture 流程已有此意图，需确认调用链）。或增加 session 数量上限。
- **置信度**：中
- **级别**：低

### 1.3 sub_target Network.enable 资源缓冲区配置过高

- **位置**：`cdp_handler.ts` L188-L190
- **现象**：`maxResourceBufferSize: 100 * 1024 * 1024`（100MB），`maxTotalBufferSize: 500 * 1024 * 1024`（500MB）。这是为每个子目标设置的。若页面有多个 worker/iframe，总内存占用 = N * 500MB 上限（Chrome 实际实现中可能有全局约束，但文档不保证）。
- **影响**：资源密集型页面（含大量 iframe 或 service worker）可能造成扩展进程内存压力。
- **建议**：考虑为子目标使用更保守的缓冲区大小（如 maxTotalBufferSize=50MB），或与主目标配置共用。主目标的 Network.enable 未在本文件中（在 network_capture.ts），应保持一致。
- **置信度**：低（Chrome 内部可能有全局约束）
- **级别**：低

### 1.4 orphan check 超时硬编码

- **位置**：`cdp_handler.ts` L768-L801，L803
- **现象**：`schedule_orphan_check` 内 `setTimeout(..., 3000)` 硬编码，虽然导出了 `ORPHAN_TIMEOUT_MS = 3000`，但函数内部直接使用字面量 3000 而非常量。
- **影响**：维护时容易只改常量不改实际调用，或反过来。
- **建议**：函数内使用 `ORPHAN_TIMEOUT_MS` 常量。
- **置信度**：高
- **级别**：低（代码风格问题）

---

## 2. Console / Cookie / Exception

### 2.1 console args 取值不完整，嵌套对象丢失

- **位置**：`console_capture.ts` L132
- **现象**：`params.args.map((arg: any) => arg.value || arg.description || '')`。CDP `Runtime.RemoteObject` 中 object/array 类型的 `value` 字段为 undefined，`description` 可能是简短摘要如 `"Array(3)"` 或 `"Object"`。完整内容在 `arg.preview` 或需单独 `Runtime.getProperties` 调用。
- **影响**：`console.log({a:1, b:2})` 只记录 `"Object"`，`console.log([1,2,3])` 只记录 `"Array(3)"`。用户期望看到完整参数值，实际只看到类型摘要。这是已知权衡（避免额外 CDP 调用带来的延迟），但文档未说明。
- **建议**：在 `ConsoleEventData.args_status` 中区分 `'summary_only'` 与 `'captured'`，或在 docs 中明确此设计决策。
- **置信度**：高
- **级别**：中（用户体验受限，但属于设计权衡）

### 2.2 cookie_capture cause 映射逻辑与 Chrome API 不匹配

- **位置**：`cookie_capture.ts` L22-L32
- **现象**：`map_cause` 函数在 `!info.removed` 时直接返回 `'explicit'`，忽略了 Chrome API 在 cookie 创建/更新时提供的 `cause` 字段（可能是 `'explicit'`、`'overwrite'`、`'expired'` 等）。只有 `removed=true` 时才检查实际 cause。
- **影响**：创建或更新 cookie 时（`removed=false`），无论真实原因是用户手动设置还是脚本覆盖，都记录为 `'explicit'`。丢失了区分脚本覆盖 vs 用户操作的能力。
- **建议**：对 `removed=false` 也映射 `info.cause`，保持与 Chrome API 一致。或在字段文档中说明此简化。
- **置信度**：高
- **级别**：低（cookie cause 精度影响有限）

### 2.3 exception_capture 合并事件对象方式不规范

- **位置**：`exception_capture.ts` L153
- **现象**：`send_event({ ...event, ...event_data } as CaptureEvent & RuntimeExceptionData)`。通过展开两个对象并强制类型断言合并。若 `create_base_event` 返回的字段与 `RuntimeExceptionData` 有同名字段（如 `severity`），后者覆盖前者。
- **影响**：当前 `create_base_event` 的 `severity` 参数已设为 `'error'`，而 `RuntimeExceptionData.severity` 也是 `'error'`，不冲突。但若未来任一字段变更，覆盖可能导致静默数据错误。
- **建议**：采用与 console_capture 一致的模式：`send_event({ ...base, data: event_data })`，将事件数据放在 `data` 子字段。
- **置信度**：中
- **级别**：低（当前无实际冲突）

---

## 3. 导出

### 3.1 HTML 导出 XSS 风险：JS 字符串字面量未转义反斜杠和单引号

- **位置**：`src/extension/background/exporter.ts` L102, L163；`src/shared/escape.ts` L4-L9
- **现象**：`export_html` 使用 `escape_for_html_embed(json_str)` 转义后嵌入 `<script>` 标签的 JS 字符串字面量 `'${safe_json}'`。`escape_for_html_embed` 只转义 `</script>`、`<`、`>`、`&`，不处理反斜杠 `\`、单引号 `'`、换行符 `\n`。若 JSON 内容包含 `\'` 或 `\n`，会破坏 JS 字符串语法。
- **影响**：捕获的数据中 URL、cookie 名、console 参数可能包含反斜杠（如 Windows 路径 `C:\Users\...`）或单引号。这会导致导出 HTML 文件在浏览器打开时 JS 语法错误，JSON 解析失败，原始数据不可见。极端情况下可构造 XSS（如 `\x27` 注入闭合字符串）。
- **建议**：在 `escape_for_html_embed` 中增加对 `\`、`'`、`\n`、`\r`、`\t` 的转义；或改用 `JSON.stringify` 后直接写入 `<script type="application/json">` 并用 DOM API 读取，避免字符串字面量。
- **置信度**：高
- **级别**：高（安全风险 + 数据完整性）

### 3.2 导出硬编码 100,000 条上限，无分页

- **位置**：`exporter.ts` L26-L33, L49-L57, L84-L92, L174
- **现象**：所有 `get_events_by_category` 和 `get_network_requests` 调用均传入 `limit: 100000`。四个导出函数（JSON、JSONL、HTML、HAR）各自独立加载全部数据。
- **影响**：单次采集超过 100,000 条记录时静默截断，无警告。JSON/JSONL/HTML 导出加载 7 类数据 ×100K 条到内存，可能达数百 MB。HAR 导出 `JSON.stringify(har, null, 2)` 格式化输出会进一步膨胀内存。
- **建议**：(1) 超限时在导出结果中添加截断警告元数据；(2) 大数据量场景考虑流式导出；(3) JSONL 已天然适合流式，可逐条写入而非拼接完整字符串。
- **置信度**：高
- **级别**：中（功能截断 + 内存风险）

### 3.3 HAR 导出 `start_time_ms` 被当作绝对时间戳使用

- **位置**：`exporter.ts` L267-L270
- **现象**：`const abs_time_ms = r.start_time_ms ?? 0; new Date(abs_time_ms).toISOString()`。但 `start_time_ms` 在 cdp_handler.ts 中是 `Date.now()`（绝对时间），而在 webRequest 路径中可能是相对时间。两种路径对 `start_time_ms` 的语义不一致。
- **影响**：若 webRequest 路径的 `start_time_ms` 为相对值（如毫秒偏移），HAR 的 `startedDateTime` 将是 1970 年日期，无实际意义。
- **建议**：统一 `start_time_ms` 语义为绝对 epoch 毫秒，或在 HAR 构建时显加 capture started_at 偏移。
- **置信度**：中（需确认 webRequest 路径的值语义）
- **级别**：中（数据准确性）

### 3.4 HTML 导出 total_size_kb 估算粗糙

- **位置**：`exporter.ts` L112-L114
- **现象**：`Math.round((event_count + request_count + log_count) * 0.5)`，假设每条记录 0.5KB。实际网络请求可能含大型 response_body（最大 100MB），估算与真实大小偏差可达数个数量级。
- **影响**：用户看到的"Est. Size"无参考价值，可能误导存储/传输决策。
- **建议**：基于实际序列化长度计算，或至少区分有/无 response_body 的估算。
- **置信度**：高
- **级别**：低（显示信息不准确，不影响功能）

---

## 4. 外部 Bridge

### 4.1 session_key 通过 URL query string 传输

- **位置**：`src/extension/background/external_cdp_bridge_client.ts` L117-L118
- **现象**：`/cdp/events?session_key=${encodeURIComponent(session_key)}`。session_key 作为 GET 参数出现在 URL 中。
- **影响**：虽然 bridge 绑定 127.0.0.1（本地安全），但 session_key 会出现在 Chrome DevTools Network 面板、服务器访问日志中。若未来 bridge 配置改变（如通过反向代理暴露），session_key 泄露风险增加。
- **建议**：改用 POST body 或自定义 header 传递 session_key，与 `Authorization` header 风格一致。
- **置信度**：中（当前仅 localhost，风险有限）
- **级别**：低

### 4.2 bridge_url 无 localhost 校验

- **位置**：`external_cdp_bridge_client.ts` L39-L71, L73-L110
- **现象**：`detect_external_cdp`、`start_external_cdp`、`poll_external_cdp_events`、`stop_external_cdp` 均接受任意 `config.bridge_url`，无校验是否为 127.0.0.1/localhost。
- **影响**：若用户配置或代码 bug 导致 bridge_url 指向公网地址，bridge_token 会通过 Authorization header 发送到非受信服务器。项目硬约束要求 Bridge 仅绑定 127.0.0.1，但客户端未做镜像校验。
- **建议**：在客户端增加 `bridge_url` 的 hostname 校验，非 localhost 时拒绝连接并警告。
- **置信度**：高
- **级别**：中（安全防线缺失）

### 4.3 错误信息过于笼统

- **位置**：`external_cdp_bridge_client.ts` L65-L66, L107-L109, L129-L131, L148-L149
- **现象**：多个 catch 块只返回空数组或固定错误码，不记录原始错误。
- **影响**：排查 bridge 连接问题时无日志可查。
- **建议**：至少 `logger.debug` 记录 catch 到的错误。
- **置信度**：高
- **级别**：低（可观测性）

---

## 5. 隐私与资源管理

### 5.1 `is_self_origin_url` 未覆盖所有本地地址

- **位置**：`cdp_handler.ts` L705-L716
- **现象**：只排除 `chrome-extension://`、`127.0.0.1`、`localhost`。未覆盖 `0.0.0.0`、`[::1]`、`*.localhost`、局域网地址（如 `192.168.*`、`10.*`）。
- **影响**：若用户本地服务绑定 `0.0.0.0` 或 `::1`，扩展对这些地址的请求会进入 CDP body 采集，可能捕获 Bridge 自身的流量（若 Bridge 监听在非 127.0.0.1 地址——违反项目约束但仍需防御）。
- **建议**：补充 `0.0.0.0`、`[::1]` 排除。局域网地址是否排除取决于产品意图。
- **置信度**：高
- **级别**：低（当前 Bridge 硬约束 127.0.0.1，风险有限）

### 5.2 keepalive 仅记录日志，无健康检查

- **位置**：`src/extension/background/keepalive.ts` L10-L26
- **现象**：`start_keepalive` 创建 30 秒 alarm，`setup_keepalive_listener` 仅 `logger.debug`。无实际保活逻辑（如发 heartbeat、检查采集状态、清理过期资源）。
- **影响**：Chrome MV3 service worker 在 30 秒无事件后可被终止。alarm 本身能唤醒 service worker（防止终止），但唤醒后无后续动作，仅打日志后再次进入空闲。
- **建议**：在 alarm 回调中增加采集状态一致性检查（如清理过期的 pending_requests、检查 debugger 连接是否仍然有效）。或在文档中明确 alarm 仅用于防止 service worker 终止。
- **置信度**：高
- **级别**：低

### 5.3 `send_ws_frame` 二进制 payload 截断可能破坏 base64 对齐

- **位置**：`cdp_handler.ts` L577-L580
- **现象**：二进制 payload（`opcode === 2`）的截断使用 `raw_payload.slice(0, max_chars)`，其中 `max_chars = Math.floor(max_body_capture_bytes * 4 / 3)`。直接 `slice` 可能切断在 base64 字符中间，产生无效 base64 字符串。接收方 base64 decode 会失败或产生乱码。
- **影响**：截断后的 binary WebSocket payload 无法正确解码。截断场景仅在 payload 超过 max_body_capture_bytes 时触发。
- **建议**：截断到 4 的倍数长度（`max_chars - (max_chars % 4)`），或截断后补齐 `=` padding。
- **置信度**：高
- **级别**：低（仅影响超大 binary frame 的截断预览）

### 5.4 `redact_headers` 值模式匹配过于宽泛

- **位置**：`src/shared/redaction.ts` L43-L45
- **现象**：`SENSITIVE_HEADER_PATTERNS` 包含 `'token'`、`'key'`、`'secret'`、`'bearer'`。值匹配使用 `lower_value.includes(pattern)`。任何 header 值包含 "key" 子串（如 URL 中的 `?apikey=xxx`、自定义 header 值 `"keyboard-layout"`）都会被误标为 `[REDACTED]`。
- **影响**：非敏感 header 值被错误脱敏，丢失调试信息。常见场景：`X-Custom-Info: {"keyboard":"layout"}` 会被 redact。
- **建议**：值匹配改为精确匹配（如 `startsWith('Bearer ')`），或缩小 pattern 列表仅匹配 key 名。
- **置信度**：高
- **级别**：中（数据完整性受损，过度脱敏）

### 5.5 `password` 类型保护仅在 content script 层

- **位置**：`src/shared/redaction.ts` L79-L83
- **现象**：`redact_password` 函数检查 `input_type === 'password'` 并返回 `[REDACTED]`。但此函数在 content script 的 DOM 采集路径调用。CDP 路径（cdp_handler.ts）直接处理 `request.postData`，未检查是否包含密码字段。
- **影响**：通过 CDP 捕获的 request body 中如果包含 `type=password` 的表单值（如 login POST），不会被密码脱敏处理。product spec 要求 `type=password` 永远不采集。
- **建议**：在 cdp_handler.ts 的 request body 采集路径中增加密码字段检查（至少对 `application/x-www-form-urlencoded` content-type 解析并检查字段名模式）。或在文档中说明此限制。
- **置信度**：中（取决于 webRequest 路径是否已覆盖此场景）
- **级别**：高（隐私合规）

### 5.6 `stream_buffer` 内存无上限

- **位置**：`src/extension/background/stream_buffer.ts` L21-L83
- **现象**：`create_stream_buffer` 维护 `buffers` Map，每个 request_id 一个 BufferEntry，chunks 无限追加直到 `byte_threshold`（16KB）触发 flush。但 flush 后 `on_flush` 将数据追加到 `meta.response_body`（cdp_handler.ts L295），而 `meta.response_body` 无大小上限。长时间 SSE 连接会持续积累。
- **影响**：长时间 SSE（如 ChatGPT 流式输出）会持续增长 `meta.response_body`，直到 `max_body_capture_bytes`（100MB）检查。但该检查仅在 `handle_loading_finished` 时执行，中间阶段无限制。
- **建议**：在 `stream_buffer.append` 中增加总字节数上限检查，超限时停止追加并标记 partial。
- **置信度**：高
- **级别**：中（长时间 SSE 可能导致内存压力）

---

## 总结

| 级别 | 数量 | 关键项 |
|------|------|--------|
| 高   | 3    | #3.1 HTML 导出 XSS、#5.5 密码字段 CDP 路径未保护、#3.3 HAR 时间语义 |
| 中   | 5    | #2.1 console 对象摘要、#3.2 导出 100K 上限、#4.2 bridge_url 无校验、#5.4 header 值误脱敏、#5.6 stream_buffer 内存 |
| 低   | 9    | CDP 协调、session 清理、缓冲区配置、orphan 超时、cookie cause、event 合并、session_key URL、keepalive、base64 截断 |

优先修复建议：#3.1（escape_for_html_embed 安全缺陷）、#5.5（CDP 路径密码保护）、#5.4（header 值过度脱敏）。
