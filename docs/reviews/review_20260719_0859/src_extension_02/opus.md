# src_extension_02 审阅报告 (opus)

- 模块：`src_extension`
- 批次：src_extension_02
- 文件：7；行数：1782
- 审阅人：opus
- 审阅日期：2026-07-19
- 审阅范围：只读全量审阅，对照 MANIFEST.md 清单中本批次 7 个文件
- 检查维度：CDP、console/cookie/exception、导出、外部 Bridge、隐私与资源管理

## 1. cdp_handler.ts

### 1.1 [CDP] `handle_request_will_be_sent` 在 responseReceived 单独创建 meta 时丢失 request_body

- 位置：`src/extension/background/cdp_handler.ts:212-249` 与 `252-275`
- 现象：`handle_request_will_be_sent` 中调用 `is_self_origin_url(request.url)` 命中即 `return`，跳过整个 meta 创建。当 requestWillBeSent 因 self-origin 被过滤、随后 responseReceived 到达时，分支进入 `else`（254-274）新建 meta：`method: ''`、`request_body: null`、`request_body_status: 'not_enabled'`。该 meta 仍会通过 `build_cdp_primary_network_event` 发送出一条"看似合法"的网络事件，URL 仍是 self-origin（127.0.0.1 / localhost / chrome-extension）。
- 影响：
  - self-origin 过滤失效于响应阶段。BUG-005 注释声称要避免扩展自身或本地 Bridge 流量进入 body 采集，但仅过滤了请求阶段；responseReceived 阶段无相同保护，最终仍会把本地 Bridge（如 `/log`、`/cdp/events`）URL 作为网络事件泄漏到采集数据中。
  - 该事件 URL 不会被脱敏（redact_url 不视为敏感），Bridge token 在 Authorization header 里虽经 `redact_sensitive_headers` 处理，但 URL 路径与状态码本身构成"本地基础设施存在性"信息泄漏。
- 建议：在 `handle_response_received`（252）与 `handle_loading_finished`（318）入口同样校验 `is_self_origin_url(meta?.url || response?.url)`；或抽取一个 `should_drop_self_origin(url)` 公共前置守卫，对所有可能创建/更新 meta 的分支统一应用。
- 置信度：高
- 级别：中

### 1.2 [CDP] `schedule_orphan_check` 使用裸 `setTimeout(3000)` 与 `ORPHAN_TIMEOUT_MS` 常量脱节

- 位置：`src/extension/background/cdp_handler.ts:765-801`、`803-804`
- 现象：函数末尾硬编码 `}, 3000); // ORPHAN_TIMEOUT_MS`，文件尾部又 `export const ORPHAN_TIMEOUT_MS = 3000;`（且其后还有 `DEFERRED_TIMEOUT_MS = 1500`，但 `DEFERRED_TIMEOUT_MS` 在本文件内完全未被引用）。
- 影响：
  - 真值（3000）出现两次，修改常量不会同步修改实际超时。
  - `DEFERRED_TIMEOUT_MS` 是死代码，但被 export，外部模块可能依赖它做对应延迟——值与实际延迟脱钩时调试困难。
- 建议：将 `setTimeout` 改为 `setTimeout(..., ORPHAN_TIMEOUT_MS)`；删除未被引用的 `DEFERRED_TIMEOUT_MS` export 或在 deferred 计时器处实际使用。
- 置信度：高
- 级别：低

### 1.3 [CDP] `try_resolve_deferred` 中对同一 `cdp_req_id` 关联多个 deferred entry 时的提前清理

- 位置：`src/extension/background/cdp_handler.ts:722-763`
- 现象：当 `_deferred_cdp_index.get(cdp_req_id)` 返回多个 `dk` 时，循环遍历；首个 pending 清空的 entry 拿走 body 后 `return`，剩余 entry 不再处理。但循环结束后的 fallback（760-762）执行 `state.cdp_body_results.delete(cdp_req_id)`、`state.cdp_request_meta.delete(cdp_req_id)`、`state._deferred_cdp_index.delete(cdp_req_id)`，把所有 entry 共享的 body 与 meta 一次性删掉。
- 影响：当 cdp_req_id 出现在多个 deferred entry 的 pending set 里，且没有任何一个 entry 的 pending_set 在本轮清空，body+meta 会被删除，剩余 entry 永远拿不到 body——它们的 timer 超时后仍会调用 `build_network_event(..., body_result.body, ...)`，引用的是 undefined body。
- 建议：当多个 entry 共享同一 cdp_req_id 时，应缓存 body_result 至所有相关 entry 都完成；或在 fallback 分支只删 `_deferred_cdp_index` 引用、保留 body/meta 供其余 entry 后续消费。需要补单测覆盖"一对多 deferred"场景。
- 置信度：中（需结合 webRequest 协同行为确认触发频率）
- 级别：中

### 1.4 [CDP] `handle_response_received` 触发 `Network.streamResourceContent` 时未校验 stream buffer 已初始化

- 位置：`src/extension/background/cdp_handler.ts:289-305`、`312-314`
- 现象：`state.stream_buffer_instance?.append` 用了 optional chaining，但 `state.streaming_requests.add(req_id)` 是无条件的。若 `stream_buffer_instance === null`（如 stream_buffer 未在本次 capture 初始化），`dataReceived` 事件被丢弃，但请求仍记为 streaming；`loadingFinished` 走 streaming 分支（324-345）时 `state.stream_buffer_instance?.force_flush(req_id)` 同样 no-op，导致 meta.response_body 可能为 null 却记为 `captured`（`byte_size === 0`）。
- 影响：极端情况下 SSE/流式响应被静默吞掉，最终事件 `response_body_status='captured'`，但 body 为 null，下游消费者误判已采集。
- 建议：在 capture start 阶段保证 `stream_buffer_instance` 非空，或在 streaming 分支检测到 null 时显式把 `response_body_status` 标为 `partial`/`cdp_failed`。
- 置信度：中
- 级别：中

### 1.5 [CDP] `pending_requests`、`ws_connections`、`finished_before_stream` 在 stop 时缺少显式清理

- 位置：整个文件未提供 cleanup 入口；状态生命周期依赖外部调用方重置整个 `CdpHandlerState`
- 现象：`state.pending_requests`、`state.ws_connections`、`state.finished_before_stream`、`state.deferred_web_requests`、`state._deferred_cdp_index` 等在 capture 停止时没有统一 `reset_cdp_state()` 函数。`deferred_web_requests` 中每个 entry 含 `setTimeout` 计时器（108），若 stop 时未 `clearTimeout`，将在新 capture 期间触发陈旧回调。
- 影响：多次启停 capture 后状态泄漏，可能让新 capture 的早期事件被旧 deferred entry 误匹配。
- 建议：新增 `reset_cdp_handler_state(state)`，stop 时清空所有 Map/Set 并 `clearTimeout` 所有 deferred timer。
- 置信度：中
- 级别：中

### 1.6 [CDP] `build_cdp_body_result` 的 `body!` 非空断言

- 位置：`src/extension/background/cdp_handler.ts:692-693`
- 现象：`truncate_response_body(...)` 返回类型含可能为 null 的 body 字段，本处用 `body: trunc_result.body!` 强断言。
- 影响：若上游 `truncate_response_body` 实现中 body 可能为 null（截断失败），此处会写入 null 但 status 为 `'too_large'`，下游误判"已截断可读"。
- 建议：检查 `truncate_response_body` 契约；若 body 可空，应在此显式判断并把 status 改为 `cdp_failed`。
- 置信度：中
- 级别：低

### 1.7 [CDP] `handle_sub_target_attached` 直接信任 `state.dbg_tab_id!` 非空

- 位置：`src/extension/background/cdp_handler.ts:184`
- 现象：`const child_target = { tabId: state.dbg_tab_id!, sessionId: child_session };`，虽然 `handle_cdp_event` 入口已校验 `state.dbg_tab_id !== null`（113），但 `handle_sub_target_attached` 仍依赖调用顺序。
- 影响：当前安全；但 future 重构若改动入口校验顺序，这里会变潜在 NPE。
- 建议：保留入口校验文档；或将 `dbg_tab_id` 作为函数参数显式传入，避免靠 `!` 维护不变量。
- 置信度：高
- 级别：低

## 2. console_capture.ts

### 2.1 [console/资源] 模块级状态变量导致并发 capture 风险

- 位置：`src/extension/background/console_capture.ts:11-16`
- 现象：`is_capturing`、`capture_id`、`start_time`、`tab_id`、`send_to_background`、`attached_by_us` 全部是模块级 `let`。若 `start_console_capture` 在上一次 `stop` 完成前被再次调用（或并发多 tab），旧 capture 的回调仍引用同一 `tab_id`，新 capture 覆盖变量后旧事件错配新 capture_id。
- 影响：硬约束规定"同一时间只允许一次活跃采集"在 stop 路径上完全依赖外部协调；MV3 service worker 重启后这些变量也会丢失，但 chrome.dbg 仍附着——下一次启动会误以为未 attached，二次 attach 失败但不抛错（37-42 行 try/catch 吃掉）。
- 建议：
  - 把这些状态收敛进一个 `console_capture_state` 对象，由 service_worker 统一持有；或显式记录 attached_by_us 到 chrome.storage 防止 SW 重启失忆。
  - `await chrome.dbg.attach` 失败时 `attached_by_us=false`，但代码继续往下执行 `Runtime.enable`，若真正失败会导致后续 sendCommand 抛错；若只是 "Already attached to target" 错误，应识别并显式标记 externally attached，避免 stop 时不去 detach 真正由自己 attach 的 session。
- 置信度：高
- 级别：中

### 2.2 [console] `params.args.map(... arg.value || arg.description || '')` 丢失 falsy 值

- 位置：`src/extension/background/console_capture.ts:132`
- 现象：当 `arg.value === 0` 或 `arg.value === ''` 或 `arg.value === false`，`||` 短路返回 `arg.description` 或空字符串，导致 `console.log(0)`、`console.log(false)` 显示错误。
- 影响：采集数据偏离真实 console 输出，对依赖精确数值的调试回放产生误导。
- 建议：改为 `arg.value ?? arg.description ?? ''`，或显式 `typeof arg.value !== 'undefined' ? arg.value : ...`。
- 置信度：高
- 级别：中

### 2.3 [console] 子目标 attach 仅 `Runtime.enable`，无 `Runtime.runIfWaitingForDebugger`

- 位置：`src/extension/background/console_capture.ts:109-120`
- 现象：cdp_handler 的 `handle_sub_target_attached`（196-199）对子目标同时调用 `Runtime.runIfWaitingForDebugger`，console_capture 这里没有。注释（102-108）解释子目标默认未 Runtime.enable，但若子目标处于 waiting-for-debugger 状态（如 service worker 启动时被显式暂停），其 console 输出不会触发。
- 影响：debug 场景或 service worker 启动时机敏感时，console 输出可能丢失。
- 建议：与 cdp_handler 行为对齐；若不需要，则补注释说明差异原因。
- 置信度：中
- 级别：低

### 2.4 [console] 子目标注册 `register_session`，但 `handle_debugger_event` 未调用 `should_handle_event`

- 位置：`src/extension/background/console_capture.ts:99-128`
- 现象：`handle_debugger_event` 第一个参数 `_source` 被忽略；当其他 tab（非当前 capture 的 tab）也启用了 dbg attach，事件会混杂。console_capture 没有像 cdp_handler 那样调用 `should_handle_event(source, tab_id)` 校验。
- 影响：多 tab 采集或外部 CDP 桥并发时，可能采集到非目标 tab 的 console。
- 建议：在 130 行 `Runtime.consoleAPICalled` 校验前补 `_source.tabId === tab_id` 校验；子目标 sessionId 通过 `has_session` 校验。
- 置信度：中
- 级别：中

## 3. cookie_capture.ts

### 3.1 [cookie] 模块级状态与并发风险（同 2.1）

- 位置：`src/extension/background/cookie_capture.ts:14-17`
- 现象：与 console_capture 相同模式：`is_capturing`、`capture_id`、`capture_start_epoch_ms`、`send_to_background` 均为模块级。
- 影响：MV3 SW 重启后状态丢失，但 listener 仍可能残留（取决于 service_worker.ts 的注册逻辑）；多次 start 会重复注册 listener。
- 建议：与 console_capture 一并收敛到 state 对象；`start_cookie_capture` 在 `is_capturing` 为 true 时仅返回，不重新 `addListener`——这点 73 行已做，但未防范"SW 重启后 is_capturing=false 但旧 listener 仍在 chrome.cookies.onChanged 队列"。需要 service_worker 启动时显式确认。
- 置信度：中
- 级别：低

### 3.2 [cookie] `tab_id: 0` 硬编码导致事件无法关联真实 tab

- 位置：`src/extension/background/cookie_capture.ts:58`
- 现象：`create_base_event` 调用时 `tab_id: 0`，但 cookie change 来自整个 cookie store，与具体 tab 无关。0 作为 tab_id 在 types 里可能是合法值（tab ID 0 实际不存在），但下游消费者可能用 tab_id 做过滤，0 会被当作有效 tab。
- 影响：dashboard 或导出数据中 cookie 事件的 tab_id 字段失去语义；若按 tab 聚合统计，结果会偏差。
- 建议：若类型允许，使用 `null` 或 `-1` 表示"无具体 tab"；或在 domain.md 显式定义 cookie 事件 tab_id=0 的语义并保证下游一致。
- 置信度：中
- 级别：低

### 3.3 [cookie] `map_cause` 在 `info.removed=false` 时强制返回 'explicit'

- 位置：`src/extension/background/cookie_capture.ts:22-32`
- 现象：cookie 设置（非删除）一律标为 `'explicit'`，但 Chrome 实际 cause 还可能是 `'set'`、`'overwrite'` 等非 explicit 的设置原因。当前实现丢失这些区分。
- 影响：cookie 变更原因语义被压平，用户无法分辨"主动设置"与"被覆盖"。
- 建议：参考 Chrome `chrome.cookies.OnChangedCause` 完整枚举；若只在 removed=true 时有意义，则在 domain.md 显式说明 cause 字段在非删除时统一为 explicit。
- 置信度：中
- 级别：低

## 4. exception_capture.ts

### 4.1 [exception] 与 console_capture 完全同构的问题（2.1/2.4）

- 位置：`src/extension/background/exception_capture.ts:10-15`、`79-106`
- 现象：模块级状态；`handle_debugger_event` 不校验 `_source.tabId === tab_id`，也不调用 `should_handle_event`。
- 影响：与 2.1/2.4 相同。exception 与 console 共用 `chrome.dbg.onEvent` 事件流，两处分别 `addListener` 同一 callback 名（`handle_debugger_event`），实际是各自模块的私有函数，不冲突，但叠加 cdp_handler 后实际有三个 listener 同时监听同一 dbg 事件流——每次 dbg event 都要三个 handler 全跑一遍，性能与潜在重复处理需评估。
- 建议：抽出一个统一的事件路由器（cdp_event_router 扩展），按 method 分发给 console/exception/cdp_handler；减少重复 attach/listen。
- 置信度：中
- 级别：中

### 4.2 [exception] `error_name` 提取正则只覆盖英文 Error 类型

- 位置：`src/extension/background/exception_capture.ts:127-128`、`156-159`
- 现象：`extract_error_name` 用 `/^(\w+Error|Error):/` 匹配；中文错误名、含空格的 DOMException 子类、`Uncaught Error` 前缀等情况都会失败。
- 影响：error_name 字段为 null 的比例偏高，下游聚合按 error_name 分组不准确。
- 建议：扩大正则或优先用 `exception.className`（128 已优先用），仅在 className 为空时回退到 message 提取。
- 置信度：高
- 级别：低

### 4.3 [exception] `exception_id: exception.objectId` 字段语义不准

- 位置：`src/extension/background/exception_capture.ts:137`
- 现象：`exception.objectId` 是 CDP 远程对象句柄（如 `{"injectedScriptId":1,"id":1}` 序列化），生命周期短暂，捕获后再使用会失效。命名为 `exception_id` 容易误导下游当作稳定唯一标识。
- 影响：导出数据中 exception_id 字段看似可用但实际无效，下游可能据此做去重。
- 建议：或注释说明此字段仅为调试用途，或移除该字段。
- 置信度：高
- 级别：低

## 5. exporter.ts

### 5.1 [导出/安全] HTML 模板中 `${capture_id}`、`${session.capture_id}` 等动态值未经 HTML 转义

- 位置：`src/extension/background/exporter.ts:143-151`、`246`
- 现象：`<span>${capture_id}</span>`、`<title>Capture All - Capture ${capture_id}</title>`（124）、`id: session.capture_id`（246）等把 capture_id 直接拼进 HTML。capture_id 来源是 `start_capture` 时生成的 ID；当前生成路径若严格使用时间戳+随机字符则安全，但本文件本身无法保证。
- 影响：若未来 capture_id 生成方式引入可控字符（例如用户传入的 label），就会形成 stored XSS。CLAUDE.md 硬约束"HTML 导出必须转义动态内容"。
- 建议：所有插入 HTML 文本/属性位置的动态值统一走 `escape_html(...)`。`safe_json` 路径（102、163）已正确转义；但 summary 区域未对齐。
- 置信度：高
- 级别：中（取决于 capture_id 生成约束，但 defense-in-depth 应转义）

### 5.2 [导出/正确性] HAR `startedDateTime` 用 `r.start_time_ms` 但该字段语义是相对 capture 的毫秒

- 位置：`src/extension/background/exporter.ts:264-271`
- 现象：注释明说"Use request start_time_ms as absolute time proxy (relative to capture start)"，然后 `new Date(abs_time_ms).toISOString()`。`r.start_time_ms` 若是相对 capture start 的毫秒数，则 `new Date(12345).toISOString()` 会得到 1970-01-01 附近时间，完全错误。
- 影响：HAR 导出的 startedDateTime 字段全部落在 1970 年，标准 HAR 消费者（浏览器 DevTools、charles 等）打开时时间戳异常。
- 建议：`startedDateTime` 应基于 `session.started_at + r.start_time_ms`（若 start_time_ms 真为相对）；若 start_time_ms 已是绝对 epoch ms，则注释与变量名都需更新。需核对 `NetworkRequestData.start_time_ms` 的真实语义。
- 置信度：高（变量与注释直接矛盾，至少其中一处错误）
- 级别：高

### 5.3 [导出] HAR `bodySize` 用 `r.request_body.length` 而非字节大小

- 位置：`src/extension/background/exporter.ts:280`、`289`、`295`
- 现象：`r.request_body.length`、`r.response_body.length` 是字符串字符数（含 base64），不是字节数。网络捕获中 cdp_handler 计算了 `byte_size`/`response_body_bytes`，但 HAR 导出未使用。
- 影响：HAR bodySize 字段对多字节 body（中文、emoji、binary）严重低估，违反 HAR 1.2 spec。
- 建议：`bodySize: r.request_body_bytes ?? (r.request_body ? new TextEncoder().encode(r.request_body).length : -1)`，response 同理。
- 置信度：高
- 级别：中

### 5.4 [导出] `export_html` 估算 `total_size_kb` 用固定 0.5 系数

- 位置：`src/extension/background/exporter.ts:112-114`
- 现象：`Math.round((event_count + request_count + log_count) * 0.5)`，0.5 KB/条是凭空假设。
- 影响：summary 显示的大小与实际文件大小偏差大；用户根据该值判断是否分享/上传会被误导。
- 建议：直接用 `json_str.length / 1024` 计算实际 KB（已有 `json_str` 变量）。
- 置信度：高
- 级别：低

### 5.5 [导出] `export_json`/`export_jsonl`/`export_html` 大量重复查询代码

- 位置：`src/extension/background/exporter.ts:21-43`、`45-78`、`80-101`
- 现象：三个函数前 20 行几乎一致：同一组 `get_events_by_category` + `get_network_requests` + `get_console_events` + `strip_response_body` + 排序。
- 影响：若新增事件类型（如 ws_frame 需独立导出），三处都要同步修改，易漏。
- 建议：抽 `_gather_export_data(capture_id, options)`，三个 format 共享。
- 置信度：高
- 级别：低（重构建议，非缺陷）

### 5.6 [导出] `export_app_logs` 用 `JSON.stringify(entry.details)` 直接拼接

- 位置：`src/extension/background/exporter.ts:390-392`
- 现象：`details` 是结构化对象，`JSON.stringify` 后拼到纯文本日志。若 details 含换行、控制字符，输出格式会被破坏；若含敏感数据（redact 应已在采集时处理，但此处未二次校验）则一并输出。
- 影响：纯文本日志解析困难；潜在敏感数据泄漏（取决于上游 redaction 覆盖度）。
- 建议：`JSON.stringify(entry.details).replace(/[\r\n]+/g, ' ')` 或考虑结构化字段输出。
- 置信度：中
- 级别：低

### 5.7 [导出] `export_jsonl` 未 strip console_logs 的 response_body 字段

- 位置：`src/extension/background/exporter.ts:73-75`
- 现象：`console_logs` 不经 `strip_response_body`（合理，console_logs 无此字段），但 `network_requests` 已 strip。代码正确，但 `export_json` 中 `console_events: console_logs` 也未做任何过滤——若 console 事件里 args_preview 含敏感数据且 redact_data 未启用，会进入导出。
- 影响：当前由 capture 阶段的 redaction 保证，exporter 不重复处理；符合分层，但应在文档明确"exporter 不二次脱敏"。
- 建议：无需修改，记录为 review 注意项。
- 置信度：高
- 级别：信息

## 6. external_cdp_bridge_client.ts

### 6.1 [外部 Bridge/安全] `bridge_url` 拼接路径，未校验是否含查询串或尾斜杠

- 位置：`src/extension/background/external_cdp_bridge_client.ts:46`、`84`、`117-118`、`139`
- 现象：`${config.bridge_url}/cdp/detect` 等模板字符串拼接。若 `bridge_url` 配置为 `http://127.0.0.1:7800/`（带尾斜杠），URL 变成 `...//cdp/detect`；若含查询串 `?x=1`，路径会被破坏。
- 影响：用户配置不严谨时连接失败，错误信息仅 `cdp_port_not_found` / `bridge_unavailable`，调试困难。
- 建议：用 `new URL('/cdp/detect', config.bridge_url)` 构造，自动处理尾斜杠与 base。
- 置信度：高
- 级别：低

### 6.2 [外部 Bridge/安全] `session_key` 通过 query string 传递

- 位置：`src/extension/background/external_cdp_bridge_client.ts:117-118`
- 现象：`?session_key=${encodeURIComponent(session_key)}`。Authorization 已走 Bearer header，session_key 放 URL 本身不算敏感，但 URL 会出现在 bridge 端 access log、proxy log 中。
- 影响：session_key 泄漏风险高于放 header；若 bridge 端日志被采集，可能形成自递归。
- 建议：评估是否能将 session_key 改入 header（如 `X-Session-Key`）；或在 bridge 端记录访问日志时主动脱敏 query。
- 置信度：中
- 级别：低

### 6.3 [外部 Bridge/资源] `poll_external_cdp_events` 失败时静默返回空数组

- 位置：`src/extension/background/external_cdp_bridge_client.ts:126-131`
- 现象：`if (!res.ok) return [];` 与 `catch { return []; }` 都把错误吞掉。
- 影响：bridge 暂时 503 或网络抖动会被当作"无事件"，调用方无法区分"真的没事件"与"poll 失败"。长期失败时 polling 循环看起来一切正常，但事件持续丢失。
- 建议：返回 `{ events: [], transient_error: true }` 或区分 404/401（session 失效）与网络错误；调用方据此退避或重新 detect。
- 置信度：高
- 级别：中

### 6.4 [外部 Bridge/安全] `DEFAULT_CDP_PORTS` 含 9333，非标准 CDP 端口

- 位置：`src/extension/background/external_cdp_bridge_client.ts:36`
- 现象：默认端口列表 `[9222, 9223, 9224, 9225, 9333]`。前 4 个是常见 CDP 端口，9333 非典型。
- 影响：在多扩展共存环境（如 playwright、其他自动化工具用 9333），可能误连到非预期 Chrome 实例，造成数据串台。
- 建议：在 docs 中说明 9333 的来源；或缩小默认列表至 `[9222, 9223]`，其余靠用户显式配置。
- 置信度：中
- 级别：低

### 6.5 [外部 Bridge] `detect_external_cdp` 首个成功端口即返回，不验证目标 URL 匹配 `tab_url`

- 位置：`src/extension/background/external_cdp_bridge_client.ts:44-71`
- 现象：循环端口，任一端口返回 ok 即返回 `cdp_port`。但 `targets` 列表可能为空或不含 `tab_url` 对应的 tab——此时 start 阶段仍会以该端口发起，最终采集不到任何 body。
- 影响：detect 与实际目标有效性脱钩，错误定位困难。
- 建议：detect 阶段若 `data.target_count === 0` 应返回失败；或让调用方先 detect 再根据 targets 决定是否 start。
- 置信度：中
- 级别：低

## 7. keepalive.ts

### 7.1 [资源/正确性] `setup_keepalive_listener` 每次调用都 `addListener`，可能重复注册

- 位置：`src/extension/background/keepalive.ts:20-25`
- 现象：service_worker.ts:150 在 SW 启动时调用一次 `setup_keepalive_listener()`，每次 SW 唤醒都会重新执行顶层代码——但 service_worker.ts 是模块级调用，MV3 SW 每次唤醒是否重新执行 listener 注册取决于 SW 是否已被销毁。若 SW 未销毁而重复调用，会重复注册。
- 影响：keepalive alarm 触发时回调被多次执行（虽然本回调只是 logger.debug，影响小）。
- 建议：Chrome 官方建议在 top-level 注册 listener；保持现状即可，但需要确认 service_worker.ts:150 是 top-level 调用（不在 onStartCapture 等函数内）。
- 置信度：高（现状正确）
- 级别：信息

### 7.2 [资源] ALARM_INTERVAL_MINUTES = 0.5，Chrome alarms 最小精度问题

- 位置：`src/extension/background/keepalive.ts:8`
- 现象：Chrome `chrome.alarms` 在 MV3 中 minimum 是 0.5 分钟（30 秒），但实际触发精度受 SW 生命周期影响，常常会被合并到下一次 SW 唤醒。
- 影响：keepalive 效果有限——MV3 SW 在 30 秒无事件后仍可能被销毁，alarm 自身会重新唤醒 SW，但中间的内存状态丢失。
- 建议：MV3 推荐用 `chrome.runtime.sendMessage` 心跳或 `chrome.storage.session` 维持；或承认 keepalive 仅作"半存活"，在 docs/blueprint/decisions.md 记录该取舍。
- 置信度：中
- 级别：低

### 7.3 [资源] `stop_keepalive` 不返回 Promise，调用方无法确认 alarm 清除

- 位置：`src/extension/background/keepalive.ts:16-18`
- 现象：`chrome.alarms.clear` 实际是 Promise（MV3），但函数签名同步返回 void。
- 影响：service_worker.ts:521 `await run_stop_step('stop_keepalive', () => stop_keepalive())` 等待的不是 alarm 真正清除，而是同步返回 undefined。
- 建议：`return chrome.alarms.clear(ALARM_NAME)`，让调用方真正 await。
- 置信度：高
- 级别：低

## 8. 跨文件交叉问题

### 8.1 [资源] 三个 capture 模块（console/exception/cdp）共享 `chrome.dbg` 但无统一所有者

- 位置：`console_capture.ts`、`exception_capture.ts`、`cdp_handler.ts` 三个模块都直接调 `chrome.dbg.attach/detach` 与 `onEvent.addListener`
- 现象：通过 `already_attached` 参数协调，但任何一处 detach 都会影响其他两处。stop 顺序若不一致（如 exception 先 stop 且 attached_by_us=true，detach 后 console_capture 的 listener 仍注册，但下次事件不再到达），导致状态混乱。
- 影响：多模块协同的脆弱性；MV3 SW 重启后所有 `attached_by_us` 都丢，但 dbg 实际可能仍 attached，下次 start 时 attach 失败、各模块分别误标 externally_attached。
- 建议：引入 `chrome.dbg ownership manager`，所有 attach/detach 走它，引用计数；或在 blueprint/decisions.md 显式记录当前依赖 `already_attached` 协调的约束。
- 置信度：中
- 级别：中

### 8.2 [隐私] `is_self_origin_url` 未覆盖 `0.0.0.0`、`[::1]`、内网Bridge自定义主机名

- 位置：`src/extension/background/cdp_handler.ts:705-716`
- 现象：仅校验 `127.0.0.1` 与 `localhost`。用户若把 Bridge 跑在 `0.0.0.0`、`[::1]`、`localtest.me`（解析到 127.0.0.1）或自定义主机名，过滤失效。
- 影响：本地基础设施信息泄漏到采集数据；若 Bridge token 通过 URL query 传递（不推荐），也会被采集。
- 建议：增加 `0.0.0.0`、`::1` 校验；或允许用户在配置中追加"自采集排除主机名"。
- 置信度：高
- 级别：低

## 总结

- 高级别问题：1 项（5.2 HAR startedDateTime 时间基准矛盾）
- 中级别问题：10 项（1.1、1.3、1.4、1.5、2.1、2.2、2.4、4.1、5.1、5.3、6.3、8.1）
- 低级别问题：10+ 项（代码质量、命名、死代码等）
- 信息项：2 项（5.7、7.1）

### 最优先修复

1. exporter.ts HAR `startedDateTime`（5.2）：直接影响导出正确性，标准 HAR 消费者无法使用。
2. cdp_handler.ts self-origin 过滤在响应阶段失效（1.1）：BUG-005 修复不完整，泄漏本地 Bridge 调用。
3. console_capture falsy 值丢失（2.2）：采集保真度问题，影响调试回放。
4. console/exception 不校验 source.tabId（2.4、4.1）：多 tab 场景下串台风险。
5. exporter.ts HTML 未转义 capture_id（5.1）：违反硬约束"HTML 导出必须转义动态内容"，defense-in-depth。

### 与硬约束对照

- "Bridge 仅绑定 127.0.0.1"：external_cdp_bridge_client 通过 fetch 调用 bridge_url，未校验 bridge_url 必须为 127.0.0.1/localhost——bridge 端已绑，但客户端理论上可指向任意 URL。建议客户端启动时校验 hostname。
- "instance_token 不得访问 MCP/CDP"：external_cdp_bridge_client 使用 bridge_token 调 `/cdp/*`，需确认该 token 类型不是 instance_token；本文件不持有 token 类型信息，需结合 service_worker.ts 与 bridge 端确认。
- "术语 capture/session"：本批次未发现 session/record 误用。
- "HTML 导出必须转义动态内容"：5.1 发现 capture_id 未转义。
- "type=password 永远不采集"：本批次无相关代码。
- "同一时间只允许一次活跃采集"：本批次模块级状态机制（2.1、3.1、4.1）依赖外部协调，建议加 state object 显式管理。
- "MCP 不自动脱敏/摘要/过滤/删除"：exporter 不做二次脱敏（5.7），符合约束。
