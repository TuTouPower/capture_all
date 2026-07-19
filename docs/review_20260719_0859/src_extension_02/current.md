# src_extension_02 全量审阅报告（current）

## 当前模型判断依据

继承 `default_model`；未显式覆盖模型。底层实际模型及运行时内部状态不可观测，无法进一步确认。

## 审阅范围

依据 `docs/review_20260719_0859/MANIFEST.md` 中 `src_extension_02` 清单，逐文件审阅：

- `src/extension/background/cdp_handler.ts`
- `src/extension/background/console_capture.ts`
- `src/extension/background/cookie_capture.ts`
- `src/extension/background/exception_capture.ts`
- `src/extension/background/exporter.ts`
- `src/extension/background/external_cdp_bridge_client.ts`
- `src/extension/background/keepalive.ts`

重点检查：CDP、console/cookie/exception、导出、外部 Bridge、隐私、资源管理。仅静态只读审阅，未读取其他审阅报告，未运行构建或测试。

## 高优先级问题（CRITICAL / HIGH）

### 1. 子目标请求未保留 CDP session，body 命令错误发送到根目标

- **位置**：`src/extension/background/cdp_handler.ts:112-148, 252-305, 318-428`
- **现象**：事件入口收到 `source.sessionId`，但后续只以 `requestId` 保存元数据。`Network.streamResourceContent`、`Network.getResponseBody` 均使用 `{ tabId: state.dbg_tab_id }`，未携带产生请求的子目标 `sessionId`。
- **影响**：iframe、worker、OOPIF 子目标请求 body 常出现 `No resource with given identifier`；若不同 CDP session 复用同一 `requestId`，还可能读取或关联错误请求，造成数据完整性及隐私边界问题。
- **建议**：在请求元数据中保存标准化 debuggee/source；所有后续 CDP 命令使用原始 session。Map key 改为 `sessionId + requestId` 复合键，根目标也使用明确命名空间。
- **置信度**：高
- **级别**：HIGH

### 2. `capture_response_body` 配置未生效

- **位置**：`src/extension/background/cdp_handler.ts:41-49, 277-305, 318-428`
- **现象**：配置声明 `capture_response_body`，但响应完成后无条件调用 `Network.getResponseBody`；流式响应也无条件调用 `Network.streamResourceContent` 并缓冲内容。
- **影响**：用户关闭响应 body 采集后仍采集敏感响应内容；同时增加 CDP、内存、IndexedDB 和导出负载。属于明确隐私配置失效。
- **建议**：在流式识别及 `loadingFinished` 最前面检查 `capture_response_body`。禁用时仅发元数据，状态标记 `not_enabled`，不得请求或缓冲 body。
- **置信度**：高
- **级别**：HIGH

### 3. WebSocket URL、握手头、payload 绕过脱敏配置

- **位置**：`src/extension/background/cdp_handler.ts:441-612`
- **现象**：WebSocket 连接事件直接保存原始 URL、请求头、响应头；frame 直接保存 payload。未应用 `redact_data`、`redact_url_query`、`redact_sensitive_headers`，也未按请求/响应 body 开关控制 frame 内容。
- **影响**：URL query、`Cookie`、`Authorization`、认证响应头、消息 payload 可在已启用脱敏时仍落库和导出，形成高风险隐私泄漏。
- **建议**：连接事件复用统一 URL/header 脱敏流程；明确 sent/received frame 分别受 request/response body 开关约束；状态字段准确标记 `redacted`、`not_enabled` 或 `too_large`。
- **置信度**：高
- **级别**：HIGH

### 4. CDP 状态仅按 `requestId` 索引，跨 session 可碰撞

- **位置**：`src/extension/background/cdp_handler.ts:27-36, 127-177, 236-248, 441-505`
- **现象**：`cdp_request_meta`、`cdp_body_results`、`streaming_requests`、`finished_before_stream`、`ws_connections` 等全部仅以 `requestId` 为键。启用 flatten auto-attach 后，多个 target/session 请求 ID 不保证全局唯一。
- **影响**：元数据、body、WebSocket 连接或 frame 可能互相覆盖、误关联或提前清理，输出内容与目标页面不一致；极端情况下把另一子目标敏感 body 关联到当前请求。
- **建议**：引入统一 `cdp_request_key(source, request_id)`；所有状态、deferred 索引、回调和日志贯穿复合键，同时保留原始 `request_id` 供输出。
- **置信度**：高
- **级别**：HIGH

### 5. console/exception 未按 debugger source 过滤

- **位置**：`src/extension/background/console_capture.ts:99-160`；`src/extension/background/exception_capture.ts:79-153`
- **现象**：处理器忽略 `_source`，只检查全局 `is_capturing`。与 network handler 不同，未调用 `should_handle_event`，也未验证 `source.tabId` 或已登记 session。
- **影响**：扩展同时附加其他 tab/target 时，其他页面 console 与异常可能被采入当前 capture，并错误标注当前 `tab_id`；造成跨页面隐私泄漏和数据污染。
- **建议**：复用 `should_handle_event(source, tab_id)`；仅接受当前根 tab 和其已登记子 session。事件 URL、tab 归属应来自对应 target 上下文。
- **置信度**：高
- **级别**：HIGH

### 6. Cookie listener 采集全浏览器 cookie 变更，未限定目标页面

- **位置**：`src/extension/background/cookie_capture.ts:34-65, 68-87`
- **现象**：`chrome.cookies.onChanged` 为全局事件。实现未按目标 tab、目标站点、cookie store 或 capture 范围过滤，且所有事件写入 `tab_id: 0`。
- **影响**：采集期间其他标签页及后台站点 cookie 名称、域、路径、属性也会进入当前 capture。即使不采值，名称与域仍可暴露登录状态、账号体系和访问站点。
- **建议**：启动时传入目标 tab/site/store 上下文；按 cookie domain/path 与目标导航范围过滤。无法可靠归属时应默认丢弃或明确设计为全局采集并在 UI 中单独授权、告警。
- **置信度**：高
- **级别**：HIGH

### 7. console/exception 启动失败后可能遗留 debugger attachment

- **位置**：`src/extension/background/console_capture.ts:33-56, 68-83`；`src/extension/background/exception_capture.ts:31-55, 62-77`
- **现象**：若 `chrome.dbg.attach` 成功、随后 `Runtime.enable` 失败，catch 仅把 `is_capturing` 设为 false，不 detach。`stop_*` 又因 `!is_capturing` 直接返回，无法清理该 attachment。
- **影响**：目标 tab 长期显示 debugger 附加状态；后续采集、DevTools 或其他调试器无法正常附加，资源跨 capture 泄漏。
- **建议**：启动过程使用事务式清理；catch 中若 `attached_by_us` 则 best-effort detach，并重置全部模块状态。stop 不应仅以 `is_capturing` 决定是否释放 attachment。
- **置信度**：高
- **级别**：HIGH

### 8. `finished_before_stream` 对普通请求永久增长

- **位置**：`src/extension/background/cdp_handler.ts:32-33, 277-305, 318-345`
- **现象**：每次 `loadingFinished` 都执行 `finished_before_stream.add(req_id)`。正常顺序为 `responseReceived` 先于 `loadingFinished`，普通非流式请求之后没有任何删除路径。
- **影响**：长时间采集或高请求量页面中 Set 无界增长，增加 service worker 内存占用；request ID 残留还可能干扰后续复用 ID。
- **建议**：只在确有“完成事件先于流式判定”的竞态窗口保存标记，并在请求最终发出、失败、超时、停止 capture 时统一删除。更稳妥方案为单一 request lifecycle 状态机。
- **置信度**：高
- **级别**：HIGH

### 9. 导出固定上限 100000，超限静默丢数据

- **位置**：`src/extension/background/exporter.ts:21-43, 45-78, 80-100, 170-178, 376-392`
- **现象**：每类数据及 app log 均只读取一次，limit 固定为 `100000`，无分页、总数检查、截断标记或错误。
- **影响**：大型 capture 导出结果不完整，用户无法从文件判断已丢失数据；JSON、JSONL、HTML、HAR 与 app log 均受影响。
- **建议**：分页读取直到耗尽；若产品必须设上限，应中止并返回明确错误，或在导出元数据写入截断状态、原始数量和已导出数量。
- **置信度**：高
- **级别**：HIGH

### 10. 外部 Bridge URL 未在客户端限制为本机可信地址

- **位置**：`src/extension/background/external_cdp_bridge_client.ts:6-10, 39-54, 73-100, 112-147`
- **现象**：所有请求直接拼接 `config.bridge_url`，并发送 bearer token；本文件未验证 scheme、hostname、端口或 URL 中已有 path/query。
- **影响**：配置被误设或被篡改时，Bridge token、tab URL、capture 标识和 CDP 控制请求可能发送到远端服务。实际可利用性受扩展 host permissions/CSP 限制，但客户端未落实“Bridge 仅本机”安全边界。
- **建议**：构造请求前统一解析 URL，仅允许 `http://127.0.0.1:<允许端口>`；如需 `localhost`，明确处理 DNS/IPv6 风险。拒绝凭据、fragment、额外 path 和非 HTTP scheme。
- **置信度**：中高
- **级别**：HIGH

## 中低优先级问题（MEDIUM / LOW）

### 11. blanket 排除全部 localhost 流量

- **位置**：`src/extension/background/cdp_handler.ts:212-218, 705-716`
- **现象**：`is_self_origin_url` 将所有 `127.0.0.1` 和 `localhost` URL 视为扩展自身/Bridge 流量，不区分端口和路径。
- **影响**：调试本地 Web 应用时，其全部网络请求被静默忽略；同时未覆盖 `[::1]` 或其他 loopback 表达，Bridge 排除本身仍不完整。
- **建议**：只排除实际配置 Bridge origin 和扩展 origin；用规范化 origin 比较，不按泛化 hostname 丢弃用户业务流量。
- **置信度**：高
- **级别**：MEDIUM

### 12. console 脱敏参数完全未使用，且 falsy 参数失真

- **位置**：`src/extension/background/console_capture.ts:18-24, 132-133`
- **现象**：`_redactData` 参数被显式忽略。参数提取使用 `arg.value || arg.description || ''`，导致 `0`、`false`、空字符串变为空；对象 description 可能包含敏感字段和值。
- **影响**：脱敏配置对 console 无效，认证信息、个人数据可能落库；同时日志语义被篡改，降低诊断可信度。
- **建议**：明确 console 脱敏规则并实际应用；使用 nullish 判断保留 falsy 值。对象预览应限制深度、长度并经过敏感字段处理。
- **置信度**：高
- **级别**：MEDIUM

### 13. exception 保存完整 description/stack，缺少隐私处理

- **位置**：`src/extension/background/exception_capture.ts:110-153`
- **现象**：异常 message、stack、source URL 原样写入；启动 API 无脱敏配置。异常文本常包含 URL query、请求片段、用户输入或业务对象。
- **影响**：启用全局脱敏时仍可能通过异常事件泄漏敏感信息；导出会进一步放大暴露范围。
- **建议**：传入并应用统一脱敏配置；至少对 source URL query、stack URL、常见 token/credential 模式处理，并保持“已脱敏”状态可追踪。
- **置信度**：中高
- **级别**：MEDIUM

### 14. orphan timeout 未跟踪，停止或切换 capture 后仍可能回调

- **位置**：`src/extension/background/cdp_handler.ts:765-800`
- **现象**：`schedule_orphan_check` 创建裸 `setTimeout`，timer 未保存在 state，也无 capture generation 校验。回调读取可变 state 中当前 `on_cdp_body_event`、配置和标识。
- **影响**：停止后旧 timer 继续存活；若 state 被新 capture 复用，旧请求可能进入新 capture 回调或清理新状态。大量失败请求也会形成短时 timer 堆积。
- **建议**：跟踪所有 orphan timer，在 stop/reset 时清除；闭包捕获 capture ID/generation 并在回调前核对；最终清理放入统一 lifecycle 方法。
- **置信度**：中高
- **级别**：MEDIUM

### 15. 外部 Bridge 轮询把错误伪装成“无事件”

- **位置**：`src/extension/background/external_cdp_bridge_client.ts:112-131, 134-150`
- **现象**：HTTP 非 2xx、超时、认证失败、JSON 解析失败均返回空数组；stop 同样忽略 HTTP 状态。
- **影响**：调用方无法区分正常空队列与 Bridge 中断，采集可持续显示正常但永久丢失 body 事件；停止失败还可能遗留 Bridge 端 CDP session。
- **建议**：返回判别联合类型，至少区分 empty、transient error、auth error、invalid response；连续失败触发状态降级和用户可见错误。stop 应检查响应并允许上层重试/清理。
- **置信度**：高
- **级别**：MEDIUM

### 16. `session_key` 放在 URL query

- **位置**：`src/extension/background/external_cdp_bridge_client.ts:117-123`
- **现象**：轮询凭据/标识通过 `?session_key=...` 传输。
- **影响**：query 更容易进入 Bridge access log、代理日志、诊断日志和错误报告；若 `session_key` 具备控制或读取能力，泄漏后可被滥用。
- **建议**：改为授权 header 或 POST body；Bridge 日志显式禁止记录敏感 header/body。
- **置信度**：中
- **级别**：MEDIUM

### 17. Bridge 响应缺少结构与体量校验

- **位置**：`src/extension/background/external_cdp_bridge_client.ts:56-63, 102-106, 126-128`
- **现象**：`res.json()` 结果直接信任，`data.events || []` 未验证数组元素、字段类型、数量或 body 大小；detect targets 同样无约束。
- **影响**：异常或被替换 Bridge 可注入畸形事件，导致下游崩溃、内存放大或污染 capture；静态类型无法约束运行时 JSON。
- **建议**：对所有 Bridge 边界响应做运行时 schema 校验；限制单批事件数、字符串长度和累计 body 字节，非法响应返回明确协议错误。
- **置信度**：高
- **级别**：MEDIUM

### 18. HTML 导出仍有未转义动态插值

- **位置**：`src/extension/background/exporter.ts:104-118, 120-167`
- **现象**：嵌入 JSON 使用 `escape_for_html_embed`，但 `capture_id`、`start_date`、`session.body_capture_mode`、`session.body_capture_status` 直接插入 HTML 文本或 `<title>`。
- **影响**：当前字段多半由受控来源生成，现实风险受限；但只要持久化数据可导入、迁移或被污染，导出 HTML 可形成存储型 XSS。也违反“HTML 导出动态内容必须转义”原则。
- **建议**：所有 HTML 文本节点统一调用 HTML escape；不要依赖字段当前生成方式。最好用单一安全模板 helper，避免遗漏。
- **置信度**：高
- **级别**：MEDIUM

### 19. 导出全量物化导致峰值内存显著放大

- **位置**：`src/extension/background/exporter.ts:21-178, 376-392`
- **现象**：各 store 数据并行加载为数组，再构建合并数组、系统时间副本、JSON 字符串或 HTML 字符串。JSONL 也先积累全部 `lines`，并非流式。
- **影响**：大 capture 下同时保留原始对象、复制对象及最终字符串，MV3 service worker 易出现内存压力、长任务终止或导出失败。响应 body 会显著放大问题。
- **建议**：采用分页游标和流式归档/写出；避免 `Promise.all` 同时拉取全部大表。HTML 可只嵌入压缩归档或分块数据；至少设置可观测容量阈值并返回明确错误。
- **置信度**：高
- **级别**：MEDIUM

### 20. HAR body size 使用字符数而非字节数

- **位置**：`src/extension/background/exporter.ts:258-306`
- **现象**：`request.bodySize`、`response.content.size`、`response.bodySize` 在存在正文时使用 JavaScript 字符串 `.length`，未使用已记录 byte 字段或按 encoding 计算。
- **影响**：中文、emoji、其他 UTF-8 内容及 base64 body 的 HAR size 错误，影响性能分析和工具兼容性。
- **建议**：优先使用 `request_body_bytes`、`response_body_bytes`；缺失时按 encoding 计算真实字节数。明确 base64 `content.encoding`。
- **置信度**：高
- **级别**：MEDIUM

### 21. `loadingFailed` 路径保留元数据至少 3 秒且缺少直接主事件处理

- **位置**：`src/extension/background/cdp_handler.ts:431-439, 765-800`
- **现象**：失败请求只写 `cdp_body_results`、尝试 deferred，然后统一等待 orphan timeout。即使已有完整 `cdp_request_meta`，也不直接构建主网络事件。
- **影响**：失败请求延迟输出；若 capture 在 3 秒内停止或回调被清空，事件可能丢失。高失败率场景同时积累 metadata、body result 和 timer。
- **建议**：已有 meta 时立即发出失败网络事件并清理；仅真正缺少关联信息时进入有限超时路径。
- **置信度**：中高
- **级别**：MEDIUM

### 22. keepalive listener 缺少幂等和移除机制

- **位置**：`src/extension/background/keepalive.ts:20-26`
- **现象**：每次 `setup_keepalive_listener` 都注册新匿名 listener，无法检查是否已注册，也无法精确移除。
- **影响**：若初始化路径重复执行，会产生重复日志和 listener 泄漏。MV3 service worker 通常每次生命周期只初始化一次，因此当前风险较低。
- **建议**：使用模块级命名 handler 与 `listener_registered` 标志；setup 幂等，必要时提供 teardown。
- **置信度**：中
- **级别**：LOW

## 改进建议

1. 建立统一 CDP request context：`session_id + request_id + debuggee + capture_generation`，所有 Network/WebSocket 状态和命令只通过该 context 操作。
2. 建立单一采集隐私策略入口，覆盖 HTTP、WebSocket、console、exception、cookie；禁止各模块自行遗漏配置。
3. 将 start/stop 改为可回滚生命周期：注册 listener、attach、enable、timer、Map/Set 均进入统一资源清单，失败和停止都完整释放。
4. 导出改为分页/流式，显式报告截断与失败；所有 HTML 动态字段统一转义。
5. 外部 Bridge 客户端落实本机 URL allowlist、运行时 schema、体量限制、可观测错误状态和凭据非 query 传输。

## 不确定项 / 可能误报

- 外部 Bridge URL 的实际远端可达性可能被 `manifest.json` host permissions 或扩展 CSP 限制；本批清单未包含该文件，因此第 10 项按客户端边界缺失报告。
- WebSocket frame 是否应受现有 request/response body 开关控制，需产品语义确认；但 URL/header 脱敏绕过不依赖该确认。
- cookie 产品若明确设计为“浏览器全局变更采集”，第 6 项仍需独立授权、UI 告警和数据归属说明，否则当前默认行为不满足最小采集原则。
- HTML 直接插值字段当前可能全部由可信内部代码生成；第 18 项主要针对长期数据边界、导入/迁移场景及项目硬约束。
