# src_extension_03 独立审阅报告

- 审阅人：sonnet
- 日期：2026-07-19
- 范围：`network_capture.ts`、`network_context.ts`、`network_correlator.ts`、`network_webrequest.ts`
- 关注域：网络采集、关联匹配、请求生命周期、内存管理、隐私脱敏、边界条件

---

## 发现清单

### N-01 stop 时 deferred timer 未逐个取消，cleanup 后回调仍可执行

- 位置：`network_capture.ts` L130 (`stop_network_capture`) 与 L1040-1061 (deferred timer 设置)
- 现象：`stop_network_capture()` 调用 `deferred_web_requests.clear()` 直接清空 Map，但未遍历调用 `clearTimeout(entry.timer)`。cleanup 之后，已排队的 timer 回调仍然会触发，尝试在空 Map 上操作并调用 `send_to_background`。
- 影响：stop 后仍向已清理的 `send_to_background` 闭包发送事件，可能引发异常或向已停止的采集写入脏数据。
- 建议：在 `clear()` 前遍历 `deferred_web_requests`，逐个 `clearTimeout(entry.timer)`。
- 置信度：确定
- 级别：中

### N-02 `finished_before_stream` 只增不减，长采集会话内存无限增长

- 位置：`network_capture.ts` L484 (`finished_before_stream.add(req_id)`) 与 L448 (`finished_before_stream.delete(req_id)`)
- 现象：`loadingFinished` 无条件 `add` 到 `finished_before_stream`；`responseReceived` 中仅当该请求被检测为流式且 `delete` 成功时才清理。非流式请求的 entry 永远不被删除。仅在 `stop_network_capture()` 中全量 `clear()`。
- 影响：长时间单次采集（数十分钟到数小时），非流式请求的 requestId 累积导致内存缓慢增长。
- 建议：在 `loadingFinished` 流式分支结束后、非流式 `getResponseBody` 完成后，主动从 `finished_before_stream` 中 `delete` 对应 req_id。
- 置信度：确定
- 级别：低

### N-03 CDP body 未经过 `redact_data` 路径脱敏

- 位置：`network_capture.ts` L511-593 (`getResponseBody` 回调) 与 L904-969 (`build_cdp_primary_network_event`)
- 现象：CDP 路径中 response body 从 `Network.getResponseBody` 直接写入 `body_result`，request body 从 `request.postData` 直接写入 `cdp_request_meta`。两条路径均不经过 shared/redaction 的 body 脱敏函数。`build_cdp_primary_network_event` 仅对 headers 和 URL 执行 redaction，body 原样传递。
- 影响：当 `redact_data: true` 时，用户期望所有敏感数据被脱敏，但 HTTP body（含 POST 表单、API 响应中的 token/密码）以明文进入采集数据。`type=password` 的 DOM 级别保护不覆盖网络层。
- 建议：在 `build_cdp_primary_network_event` 和 orphan CDP 回调中，对 `request_body` 和 `response_body` 在 `config.redact_data` 为 true 时执行统一脱敏 pass。
- 置信度：确定
- 级别：高

### N-04 orphan CDP 事件中 body 同样未脱敏

- 位置：`network_capture.ts` L739-753 (`schedule_orphan_check` 回调)
- 现象：orphan 路径对 headers 和 URL 执行了 `redact_headers`/`redact_url`，但 `request_body` 和 `response_body` 直接从 meta/result 中取值，未经过任何脱敏。
- 影响：同 N-03，orphan CDP 事件中 body 以明文流向 `on_cdp_body_event` 消费者。
- 建议：与 N-03 统一处理。
- 置信度：确定
- 级别：高（N-03 子项）

### N-05 全局模块级状态阻止多实例并行采集

- 位置：`network_capture.ts` L28-67（模块级 let 变量和 Map/Set）
- 现象：所有状态（`is_capturing`、`capture_id`、`pending_requests`、`cdp_request_meta` 等）均为模块级变量。`start_network_capture()` 开头有 `if (is_capturing) return` 的幂等守卫。
- 影响：产品约束"同一时间只允许一次活跃采集"与此实现一致。但如果未来需要支持多 tab 并行采集，当前架构完全不支持。作为已知设计决策可接受，但应记录到 `decisions.md`。
- 建议：在 blueprint/decisions 中确认这是有意设计，非遗留债务。
- 置信度：中
- 级别：信息

### N-06 URL 关联使用 base URL 精确匹配，同路径不同参数可能误匹配

- 位置：`network_capture.ts` L1086-1098 (`find_cdp_candidates`) 与 L1102-1140 (`find_matching_cdp_request`)；`network_correlator.ts` L51-53
- 现象：关联逻辑用 `url.split('?')[0]` 做 base URL 比较，忽略全部 query 参数。同端点同方法同状态码的并发请求（如 `/api/data?page=1` 和 `/api/data?page=2`）会被关联到同一个 CDP candidate。
- 影响：高并发同端点场景下（分页、轮询），webRequest 可能关联到错误的 CDP body，导致响应体错配。
- 建议：引入时间戳窗口内的 FIFO 匹配，或在 base URL 匹配后用 `requestId` 交叉校验（CDP 和 webRequest 的 requestId 格式不同但 Chrome 内部可映射）。
- 置信度：高
- 级别：中

### N-07 `network_context.ts` 完全未被使用

- 位置：`network_context.ts` 全文（128 行）
- 现象：`NetworkCaptureContext` 类定义了与 `network_capture.ts` 中模块级变量完全相同的状态结构，但无任何文件 import 或使用它。`network_webrequest.ts` L6 声明了 `import type { NetworkCaptureContext }`，但 `create_webrequest_handlers` 函数也未被 `network_capture.ts` 调用。
- 影响：死代码，增加维护负担和审阅噪音。可能是重构中途中止的产物。
- 建议：确认是否为废弃代码，若是则移除或标记 `@deprecated`。
- 置信度：确定
- 级别：低

### N-08 `network_webrequest.ts` L121-123 使用 `require()` 而非 ESM import

- 位置：`network_webrequest.ts` L121-123
- 现象：`create_webrequest_handlers` 函数内部使用 `require('../../shared/redaction')` 和 `require('./network_capture')`，而文件顶部已有 ESM import 语法。
- 影响：(1) 混用 CJS require 和 ESM import 违反项目 conventions；(2) `require('./network_capture')` 引入循环依赖风险（`network_capture.ts` 已 import `network_webrequest.ts`）；(3) Vite 构建时 require 调用可能不被正确 tree-shake。
- 建议：改为顶部 ESM import，打破循环依赖（`is_self_origin_url` 应从共享工具模块 import）。
- 置信度：确定
- 级别：中

### N-09 `network_webrequest.ts` L120 `create_webrequest_handlers` 是死代码

- 位置：`network_webrequest.ts` L120-184
- 现象：`create_webrequest_handlers` 函数创建了依赖 `NetworkCaptureContext` 的 handler 闭包，但 `network_capture.ts` 中实际的 webRequest handler 是独立函数（L785-834），未使用此工厂。
- 影响：死代码，与 `network_capture.ts` 中的实际 handler 存在逻辑重复，维护时容易只改一处遗漏另一处。
- 建议：移除或完成重构，统一使用一处 handler 实现。
- 置信度：确定
- 级别：低

### N-10 `stream_buffer` 无最大容量限制

- 位置：`stream_buffer.ts` 全文；`network_capture.ts` L190-198 (stream_buffer 创建)
- 现象：`create_stream_buffer` 使用固定 16KB 字节阈值触发 flush，但无全局最大容量上限。`Network.enable` 设置 `maxTotalBufferSize: 500 * 1024 * 1024`，CDP 端有保护，但 `stream_buffer_instance` 的 `buffers` Map 内存不受限。SSE 连接长期活跃时，flush 后的 `meta.response_body` 累积字符串也无上限。
- 影响：长时间 SSE（如 ChatGPT 流式响应）可能导致 `response_body` 字符串超大，占满内存。
- 建议：在 `stream_buffer` 的 `on_flush` 回调中检查 `meta.response_body` 累积长度，超限后标记 `too_large` 并停止追加。
- 置信度：高
- 级别：中

### N-11 `TextEncoder` 实例在热路径中反复创建

- 位置：`network_capture.ts` L221, L294, L389, L494, L537, L881, L950；`network_correlator.ts` L86, L92, L139, L145
- 现象：每次需要计算字节长度时 `new TextEncoder().encode(body).length`，在高频网络事件中每秒可能执行数百次。
- 影响：性能。TextEncoder 构造本身开销不大，但在网络采集的热路径中属于可优化点。
- 建议：模块级创建 `const text_encoder = new TextEncoder()` 并复用。
- 置信度：确定
- 级别：低

### N-12 `any` 类型广泛用于 Chrome API 回调参数

- 位置：`network_capture.ts` L283, L336, L785, L813, L824, L836, L971, L1142；`network_webrequest.ts` L33, L125-176
- 现象：所有 webRequest 和 CDP 回调的 `details`/`params` 参数均声明为 `any`。
- 影响：类型安全缺失，字段拼写错误或类型不匹配无法在编译期捕获。
- 建议：使用 `chrome.webRequest.WebResponseCacheDetails` 等 Chrome 类型，或定义最小化接口。
- 置信度：确定
- 级别：低

### N-13 `try_resolve_deferred` 遇到第一个已解析 entry 即 return，可能遗漏后续 entry

- 位置：`network_capture.ts` L700-717
- 现象：遍历 `deferred_keys`，找到第一个 `pending_cdp_ids.size === 0` 的 entry 后执行 send 并 return。如果有多个 deferred entry 共享同一 CDP candidate（并发同 URL），只有第一个获得 body，其余 entry 的 pending set 减少了该 CDP 但未触发重试。
- 影响：并发同 URL 请求场景下，部分 deferred entry 可能永远无法获得 body，最终走到 timeout 路径输出 `not_enabled`。
- 建议：在 for 循环末尾不 return，让所有 entry 都有机会检查。或者在当前 entry 消费 body 后，将 body 副本传递给其他已解析的 entry。
- 置信度：中
- 级别：中

### N-14 CDP `getResponseBody` 资源释放竞态

- 位置：`network_capture.ts` L511-592
- 现象：`Network.getResponseBody` 在 `loadingFinished` 后调用。Chrome 在内存压力下会释放 response body，导致 `-32000` 错误。代码已处理（L572），但降级为 `not_enabled` 而非 `cdp_failed`。
- 影响：快速连续请求或大文件下载场景下，body 采集命中率下降。已有合理降级，非 bug。
- 建议：文档记录此降级行为，便于排查"body 采集率低"的用户反馈。
- 置信度：确定
- 级别：信息

### N-15 WebSocket 帧 payload 截断公式对带 padding 的 base64 不精确

- 位置：`network_capture.ts` L298-301（`send_ws_frame` 内截断逻辑）
- 现象：`max_chars = Math.floor(max_body_capture_bytes * 4 / 3)` 假设 base64 编码无 padding。实际 base64 字符串可能含 1-2 个 `=` padding 字符，且输入可能含换行。`base64_decoded_size` 用于计算字节数但截断时用字符数。
- 影响：截断后的 base64 payload 长度可能略超 `max_body_capture_bytes` 解码后的字节数，误差在 1-3 字节，实际影响极小。
- 建议：接受当前精度，添加注释说明近似行为。
- 置信度：确定
- 级别：信息

### N-16 `empty import` 语句暗示重构未完成

- 位置：`network_capture.ts` L19-20 (`import {} from './webrequest_handler'` 和 `import {} from './ws_handler'`)
- 现象：两个空 import 语句，实际 handler 逻辑在 `network_capture.ts` 内联实现。`webrequest_handler.ts` 和 `ws_handler.ts` 已有完整独立实现，但未被使用。
- 影响：代码重复——`network_capture.ts` 内联了 `webrequest_handler.ts` 和 `ws_handler.ts` 的全部逻辑。维护时需同步修改两处。
- 建议：完成重构，将 `network_capture.ts` 的 handler 函数替换为对独立模块的调用，或删除独立模块。清理空 import。
- 置信度：确定
- 级别：中

### N-17 `correlate()` 函数未被实际调用路径使用

- 位置：`network_correlator.ts` L42-57
- 现象：`correlate()` 和 `merge_matched()` 定义了 webRequest + CDP body 的关联合并逻辑，但 `network_capture.ts` 使用的是自有的 `find_matching_cdp_request` + `build_network_event` 组合，未调用 `correlate()`/`merge_matched()`。
- 影响：`network_correlator.ts` 中的 `correlate()`、`merge_matched()`、`build_cdp_only_request()`、`build_web_request_only_request()` 均为死代码。关联逻辑在 `network_capture.ts` 中内联实现，与 correlator 的定义存在行为差异（correlator 要求 `resource_type` 严格匹配，capture 不检查）。
- 建议：统一关联逻辑到一处。若保留 `network_correlator.ts`，则 `network_capture.ts` 应调用其函数而非内联。
- 置信度：确定
- 级别：中

---

## 总结

| 级别 | 数量 |
|------|------|
| 高   | 2 (N-03, N-04) |
| 中   | 7 (N-01, N-06, N-08, N-10, N-13, N-16, N-17) |
| 低   | 4 (N-02, N-07, N-09, N-11, N-12) |
| 信息 | 3 (N-05, N-14, N-15) |

核心风险集中在两方面：

1. **隐私脱敏缺陷（高）**：CDP 路径的 request/response body 完全绕过 `redact_data` 机制，HTTP body 中的敏感信息（token、密码、PII）以明文进入采集数据。这是产品承诺"支持脱敏"与实际行为之间的一致性缺口。

2. **架构债务（中）**：重构进行中的中间状态——`network_capture.ts` 内联了 `webrequest_handler.ts`、`ws_handler.ts`、`cdp_handler.ts` 的逻辑，同时保留了 `network_context.ts`（未使用）和 `network_correlator.ts`（大部分函数未被调用）。4 个文件存在 3 套独立但重复的关联/事件构建逻辑。
