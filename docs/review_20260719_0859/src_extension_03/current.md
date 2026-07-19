# `src_extension_03` 独立审阅报告

## 当前模型判断依据

继承主会话 `default_model`；未显式覆盖模型。底层实际模型不可观测，因此不作进一步推断。

## 审阅范围

仅审阅 `docs/review_20260719_0859/MANIFEST.md` 中 `src_extension_03` 清单：

- `src/extension/background/network_capture.ts`
- `src/extension/background/network_context.ts`
- `src/extension/background/network_correlator.ts`
- `src/extension/background/network_webrequest.ts`

检查重点：网络采集、事件关联、请求生命周期、内存、隐私、边界条件。未读取其他审阅报告，未运行构建或测试。

## 高优先级问题（CRITICAL / HIGH）

### 1. SSE 响应体无总量上限，长连接可持续占用内存

- 位置：`src/extension/background/network_capture.ts:190-197,475-479,488-503`
- 现象：`stream_buffer` 每次 flush 后把数据继续拼接到 `meta.response_body`。`max_body_capture_bytes` 只在 `loadingFinished` 后决定最终状态，不限制采集期间累计字符串。SSE 可长期不触发 `loadingFinished`。
- 影响：长时间或高吞吐 SSE 可让扩展 Service Worker 内存持续增长，导致 GC 压力、进程终止、采集中断；恶意页面可利用此路径制造资源耗尽。
- 建议：累计字节达到 `max_body_capture_bytes` 后立即停止追加并标记 `too_large`/`partial`；丢弃后续 chunk，必要时调用 CDP 停止该请求流采集。避免反复字符串拼接，改用有界 chunk 列表或有界缓冲。
- 置信度：高
- 级别：CRITICAL

### 2. 子目标 CDP `requestId` 未纳入 `sessionId`，可覆盖或串联不同目标请求

- 位置：`src/extension/background/network_capture.ts:336-376,402-414,418-473,482-603,605-679`
- 现象：已启用 `Target.setAutoAttach(... flatten: true)`，但所有 HTTP、流式请求、WebSocket 状态均只用 `params.requestId` 作为 Map/Set key，忽略事件来源 `source.sessionId`。CDP `requestId` 仅在对应 target/session 范围内可靠，跨主页面、iframe、worker 子目标可能重复。
- 影响：不同目标请求元数据互相覆盖；响应体、状态码、Header、WebSocket frame 可能关联到错误 URL 或错误请求。除数据完整性问题外，还可能把一个子目标敏感响应体暴露到另一个请求条目。
- 建议：使用复合键，例如 `${source.sessionId ?? 'root'}:${requestId}`；所有 Map、Set、stream buffer、延迟索引及输出关联字段统一使用内部复合键，同时保留原始 CDP request ID 供展示。
- 置信度：高
- 级别：HIGH

### 3. 停止采集未取消 deferred/orphan 定时器，停止后仍可能写入旧采集

- 位置：`src/extension/background/network_capture.ts:119-160,727-762,1023-1072`
- 现象：`stop_network_capture()` 未清理 `deferred_web_requests`、`_deferred_cdp_index`，也未 `clearTimeout` deferred timer；orphan timer 未保存句柄，无法取消。定时回调闭包保留 `pending`、`details`、body 及旧 `send_to_background`，并可在停止后继续发送事件。
- 影响：停止后出现迟到网络条目；若随后快速开始新采集，全局 `capture_id`、`start_time`、`config`、sender 已被替换，旧请求可能被写入新采集。闭包还会延长请求体和响应体驻留时间。
- 建议：停止时遍历 deferred entries 执行 `clearTimeout`，清空两个索引；集中跟踪 orphan timer 并取消。所有异步回调捕获本次采集 generation/capture ID，回调执行前校验仍属同一活跃采集。
- 置信度：高
- 级别：HIGH

### 4. `loadingFailed` 不生成 CDP 主请求条目，且无 orphan handler 时永久残留

- 位置：`src/extension/background/network_capture.ts:595-603,727-762`
- 现象：`Network.loadingFailed` 只写入 `cdp_body_results`、尝试 deferred 关联并安排 orphan 检查，没有像 `loadingFinished` 一样直接构建并发送 CDP 主条目。`schedule_orphan_check()` 回调遇到 `on_cdp_body_event === null` 立即返回，连 Map 清理也不执行。
- 影响：附加 tab 中 DNS、TLS、连接重置、取消等失败请求可能完全丢失；对应 `cdp_request_meta` 和 `cdp_body_results` 保留到停止采集，失败请求多时造成线性内存增长。
- 建议：`loadingFailed` 若存在 metadata，直接发送带 `error_text`、失败状态和结束时间的 CDP 主条目并清理；orphan 回调无论是否存在消费者都必须执行清理，回调调用与资源释放分离。
- 置信度：高
- 级别：HIGH

### 5. `finished_before_stream` 与 `cdp_primary_emitted` 对正常请求持续增长

- 位置：`src/extension/background/network_capture.ts:48-60,482-505,551-552,583-584`
- 现象：每次 `loadingFinished` 都先把 ID 加入 `finished_before_stream`，普通非 SSE 请求从不删除。`cdp_primary_emitted` 每次发送后添加 ID，但本文件没有读取或逐项删除逻辑，只在停止时整体清空。
- 影响：长采集期间两个 Set 按完成请求数线性增长。大量短请求页面会造成持续内存占用；`finished_before_stream` 还可能在 request ID 重用时误判新请求已经结束。
- 建议：仅在确有“`loadingFinished` 先于 `responseReceived`”等待场景时短期保存，并设置 TTL；正常完成后立即删除。若 `cdp_primary_emitted` 已不参与去重则删除该 Set；若仍需要则消费后删除或使用有界 TTL cache。
- 置信度：高
- 级别：HIGH

### 6. CDP 切换与启用失败可能错误 detach 或遗留调试器连接

- 位置：`src/extension/background/network_capture.ts:172-179,181-217`
- 现象：切换 tab 时无条件 `chrome.dbg.detach({ tabId: dbg_tab_id })`，未尊重旧连接 `dbg_attached_externally`；新 attach 成功但 `Network.enable` 或后续步骤失败时，catch 只返回错误，不撤销本模块刚建立的 attach，也不恢复部分配置。
- 影响：可能断开外部 DevTools/Bridge 管理的调试连接；失败路径可留下扩展持有的 debugger attach，妨碍后续调试或重试，且生命周期状态与实际 Chrome 状态不一致。
- 建议：切换旧 tab 时仅 detach 自己创建的连接；外部连接只移除自身 listener、禁用自身 domain 或交由拥有者释放。启用流程记录每一步所有权，catch 中按相反顺序回滚 listener、Network domain、auto-attach 和自建 debugger attach。
- 置信度：高
- 级别：HIGH

### 7. WebSocket URL 与握手 Header 绕过已配置脱敏

- 位置：`src/extension/background/network_capture.ts:229-280,605-635`
- 现象：WebSocket URL 直接使用 `params.url`；请求及响应 Header 通过 `headers_map_from_cdp` 原样保存并发送。此路径未应用 `redact_url_query` 或 `redact_sensitive_headers`，与 HTTP CDP 主路径的脱敏行为不一致。
- 影响：查询参数 token、Cookie、Authorization、Set-Cookie 等敏感数据可在用户启用脱敏后仍进入本地采集与导出，形成明确隐私承诺缺口。
- 建议：创建连接元数据时按配置调用 `redact_url`；握手 Header 写入前调用 `redact_headers`；同步设置 `url_status`、`headers_status`。增加 WebSocket 脱敏回归测试。
- 置信度：高
- 级别：HIGH

## 中低优先级问题（MEDIUM / LOW）

### 8. 重定向复用 request ID 时覆盖前一跳，生命周期不完整

- 位置：`src/extension/background/network_capture.ts:378-415,418-441`
- 现象：CDP 重定向通常通过新的 `requestWillBeSent` 携带 `redirectResponse`，并复用同一 request ID。实现直接覆盖 `cdp_request_meta`，未先落盘前一跳，也未处理 `redirectResponse`。webRequest 路径同样按 request ID 覆盖 pending 状态。
- 影响：301/302/307/308 中间跳转、每跳 Header、状态码、耗时丢失；最终条目开始时间可能变成最后一跳，难以还原请求链和定位认证跳转问题。
- 建议：识别 `params.redirectResponse`，在覆盖前完成当前 hop；内部标识加入 hop 序号并记录 redirect chain。webRequest 路径按 `onBeforeRedirect` 或等价生命周期事件结束当前 hop。
- 置信度：高
- 级别：MEDIUM

### 9. deferred 关联算法可能把“最后完成候选”响应体分配给错误请求

- 位置：`src/extension/background/network_capture.ts:682-723,1023-1077,1080-1099`
- 现象：候选仅按去查询 URL、method、status 筛选。一个 deferred entry 有多个候选时，算法逐个删除候选 ID，直到集合为空，再把“最后触发解析候选”的 `body_result` 分配给该 entry；没有按时间距离、tab/session 或完整 URL选择。多个 deferred entry 共享候选时，首个完成后直接 `return`，其他 entry 只能超时。
- 影响：并发调用同一路径时可能响应体错配，或本可关联请求退化为 `not_enabled`。若请求返回用户数据，错配会造成条目间敏感内容串联。
- 建议：为每个候选保存评分，至少包含 tab/session、完整 URL、method、status、时间差；候选 body 到达时只解析其最佳未占用 entry，并建立一对一消费关系。不要把“候选全部结束”与“最后候选即正确匹配”混为一体。
- 置信度：高
- 级别：MEDIUM

### 10. `NetworkCaptureContext.reset()` 清空 deferred Map 前未取消 timer

- 位置：`src/extension/background/network_context.ts:114-127`
- 现象：`reset()` 直接清空 `deferred_web_requests`，未遍历执行 `clearTimeout(entry.timer)`。清空 Map 不会取消定时回调或释放其闭包。
- 影响：若该 context 路径投入使用，reset 后回调仍会执行，可能发送过期事件或保留大对象直至超时；行为与 `reset` 语义不符。
- 建议：清空前取消全部 deferred timer；同样为 orphan/其他异步任务提供统一 disposer。
- 置信度：高
- 级别：MEDIUM

### 11. WebSocket 文本帧按字符截断，不能保证字节上限

- 位置：`src/extension/background/network_capture.ts:293-305`
- 现象：先用 UTF-8 字节数判断超限，但文本帧超限后使用 `raw_payload.slice(0, max_body_capture_bytes)` 按 UTF-16 code unit 截断。中文、Emoji 等多字节字符会让截断结果仍明显超过配置字节上限，也可能切开代理对。
- 影响：内存及导出大小上限失真；截断结果可能含损坏字符。配置越小、多字节文本占比越高，偏差越明显。
- 建议：复用按 UTF-8 字节安全截断函数，确保结果编码后不超过限制且不切断 Unicode code point。二进制 base64 截断还应对齐 4 字符边界。
- 置信度：高
- 级别：MEDIUM

### 12. Header 转 Map 丢失重复字段

- 位置：`src/extension/background/network_webrequest.ts:78-85`；`src/extension/background/network_capture.ts:765-767`
- 现象：webRequest Header 数组按名称直接赋值，重复 Header 被后值覆盖；CDP Header 对象也未经多值规范化。`Set-Cookie`、`Warning`、`Link` 等允许重复的字段无法完整保留。
- 影响：网络证据不完整，Cookie 或缓存问题分析可能误判；不同 Chrome/CDP 表达方式下结果不一致。
- 建议：数据模型允许时使用 `Record<string, string[]>`；若必须保持字符串，按字段语义安全合并，并为不可逗号合并的 `Set-Cookie` 保留数组或独立条目。
- 置信度：高
- 级别：MEDIUM

### 13. `merge_matched()` 用空对象真值回退，CDP Header 可能被静默丢弃

- 位置：`src/extension/background/network_correlator.ts:80-93`
- 现象：`web_meta.request_headers || cdp_event.request_headers` 与响应 Header 同理。空对象 `{}` 为真值，因此 webRequest 未采到 Header 时不会回退到 CDP Header；MIME 提取也会对空对象执行并返回 null。
- 影响：已成功采到的 CDP Header 和 MIME 被丢弃，合并结果不完整；关联成功反而可能比 CDP-only 数据更少。
- 建议：按 `Object.keys(headers).length > 0` 判断是否可用，或合并两个来源并定义冲突优先级。
- 置信度：高
- 级别：MEDIUM

### 14. webRequest 错误路径只删除 pending，不输出失败请求

- 位置：`src/extension/background/network_capture.ts:1142-1146`；`src/extension/background/network_webrequest.ts:172-176`
- 现象：`onErrorOccurred` 只删除 pending 状态，不构建 `NetworkRequestData`，也不记录 `details.error`。
- 影响：未附加 CDP 的 tab 中，网络失败请求从采集结果消失；无法分析 DNS、TLS、CORS 前置失败、连接中断等关键问题。
- 建议：错误事件应结束请求生命周期并输出条目，填充 `error_text`、结束时间、duration，body 状态按实际阶段设置；随后清理 pending。
- 置信度：高
- 级别：MEDIUM

## 改进建议

1. 为一次采集引入 generation token 和统一 disposer，集中管理 listener、debugger ownership、timer、Map/Set、stream buffer，停止或切换时原子释放。
2. 统一请求内部键：`target_session + request_id + redirect_hop`；关联时增加 tab/session、完整 URL、时间、资源类型约束。
3. 所有输入通道共用同一隐私策略函数，覆盖 HTTP、WebSocket、CDP-only、deferred、错误和重定向路径。
4. 给每类长期状态定义容量或 TTL：SSE buffer、完成 ID Set、orphan body、WebSocket connection、deferred index。
5. 增加压力与竞态测试：长时间 SSE、十万短请求、多子目标 request ID 碰撞、并发同 URL、停止后立即重启、外部 debugger 所有权、失败请求、重定向链、WebSocket 脱敏。

## 不确定项 / 可能误报

- `network_context.ts` 与 `create_webrequest_handlers()` 可能处于尚未接入或迁移中间态；其 timer 问题当前是否可触发取决于外部调用方，但实现本身不满足 reset 资源释放语义。
- deferred 关联路径在当前 CDP-first 主流程中触发频率可能较低，但一旦触发，并发候选选择逻辑仍存在确定性错误。
- 请求/响应 body 是否应执行内容级脱敏，需结合产品隐私规范确认；本报告未将“body 原样采集”单列为缺陷。WebSocket URL 与敏感 Header 绕过已有明确配置，不依赖该不确定项。
