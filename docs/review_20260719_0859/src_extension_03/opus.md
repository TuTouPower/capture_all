# src_extension_03 审阅报告（opus）

- 范围：`docs/review_20260719_0859/MANIFEST.md` 中 `src_extension_03` 清单。
- 文件：
  - `src/extension/background/network_capture.ts` (1146)
  - `src/extension/background/network_context.ts` (128)
  - `src/extension/background/network_correlator.ts` (202)
  - `src/extension/background/network_webrequest.ts` (184)
- 视角：独立只读全量审阅。重点：网络采集、关联、请求生命周期、内存、隐私、边界条件。
- 级别：`blocker` / `high` / `medium` / `low` / `info`。

## 总评

主体网络采集逻辑（CDP + webRequest 双通道，CDP-first）覆盖了流式、子目标、WebSocket、延迟解析、孤儿超时等关键场景，注释中有清晰的边界说明（`is_streaming_response`、BUG-005 注释）。但 `network_capture.ts` 与 `network_context.ts`、`network_correlator.ts` 之间存在两套并存的"上下文/状态"模型，本批次实际跑的只是 `network_capture.ts` 模块级全局变量那套，导致另一套与 `network_context.ts` 配套的代码在本批次中属于"存在但未被使用"的旁路；并且 `network_capture.ts` 在多个生命周期/边界点上存在内存增长、隐私降级与重复采集风险。

下文逐项给出问题。

---

## 1. [blocker] `cdp_primary_emitted` 集合从未被读取，CDP-first 去重承诺未生效

- 位置：`src/extension/background/network_capture.ts:50,152,504,551,583`。
- 现象：
  - 顶部声明 `const cdp_primary_emitted: Set<string> = new Set();`。
  - 仅在三处 `.add(req_id)`，在 `stop_network_capture` 中 `.clear()`，全模块（包括依赖该模块的 `service_worker.ts`、`webrequest_handler.ts`）均无 `.has(...)` 读取。
  - 注释（第 48-50 行）说明该集合用于"webRequest handlers skip these to avoid duplicates"，但 `handle_completed`、`handle_error`、`handle_before_request` 等本模块 webRequest 处理器均未查询该集合；它们仅靠 `dbg_tab_id !== null && details.tabId === dbg_tab_id` 这一条规则跳过。
- 影响：
  - 当 CDP 通过 `Target.setAutoAttach` 拿到子目标（iframe/worker）的请求时，子目标 `tabId` 在 webRequest 侧可能仍归属同一物理 tab，但 CDP 端已经发出 `loadingFinished` 并 emit 主条目；此时 webRequest 通道不会因 `cdp_primary_emitted.has(...)` 跳过，仍会走到 `handle_completed` 发出 `capture_method: 'web_request'` 事件，造成同一资源被双发。
  - 反过来：注释承诺的"webRequest handlers skip these to avoid duplicates"在本批次代码中未被实现，存在重复采集与下游聚合误算风险。
- 建议：
  - 要么删除 `cdp_primary_emitted` 与所有 `.add(...)`，并同步删除 `network_context.ts:101,118`、`webrequest_handler.ts:25`、`cdp_handler.ts:30,340,387,419` 中对该集合的引用与注释，明确以 `dbg_tab_id` 比较作为唯一去重路径；
  - 要么在 `handle_completed`、`handle_headers_received`、`handle_error`、`handle_before_send_headers` 入口添加 `if (cdp_primary_emitted.has(details.requestId)) return;`，真正落地注释承诺。
  - 二选一，并补一条单测覆盖"CDP 子目标 emit 后 webRequest 仍到达"场景。
- 置信度：高。
- 级别：blocker（去重承诺未实现，直接影响数据正确性）。

## 2. [blocker] 模块级单例状态 + `stop_network_capture` 非幂等，重复启停会泄漏监听器与数据

- 位置：`src/extension/background/network_capture.ts:28-64, 73-117, 119-160`。
- 现象：
  - 模块级 `let is_capturing`、`capture_id`、`pending_requests`、`cdp_request_meta`、`streaming_requests`、`finished_before_stream`、`deferred_web_requests`、`_deferred_cdp_index` 等是单例。
  - `start_network_capture` 开头 `if (is_capturing) return;`——若上一次 `stop_network_capture` 未把 `is_capturing` 置回 `false`（例如 `stop` 中途异常），下次 `start` 会直接 `return`，不重新注册 webRequest 监听器，但 `service_worker` 仍认为采集已启动；结果是"看起来在采，但无事件"。
  - 反之若 `start` 被并发调用两次（service_worker 重入、KeepAlive 复活场景），第二次被静默忽略，但调用方拿不到任何错误。
  - `stop_network_capture` 不清除 `_deferred_cdp_index`、`deferred_web_requests`，也不取消 `DeferredEntry.timer`（见问题 4）；同时 `pending_requests.clear()` 之外的多个 Map 未在 stop 中显式清空（仅依赖下次 `start` 重新赋值，但部分 Map 未重新赋值，而是被复用）。
- 影响：
  - 跨采集批次数据串扰：上一次 capture 的 `cdp_request_meta`、`ws_connections`、`deferred_web_requests` 残留进下一次 capture，correlator 会按 URL+method+status 误匹配到上一批的 CDP 候选，导致 body 张冠李戴。
  - 同一 capture_id 下多调用 `stop` 时 `chrome.dbg.onEvent.removeListener(handle_cdp_event)` 重复执行不会报错，但 `dbg_tab_id` 已被重置为 null 后再次 `stop` 会跳过清理块。
- 建议：
  - 在 `stop_network_capture` 末尾追加 `_deferred_cdp_index.clear()`，并在 stop 开头迭代 `deferred_web_requests` 全部 `clearTimeout(entry.timer)` 再 `clear()`；同时清空 `ws_connections`（目前漏了，问题 7 单列）。
  - 将 `start_network_capture` 改为幂等：若 `is_capturing` 已为 true，记录 warn 日志并显式 `stop_network_capture()` 后再继续；或抛错让调用方决策。当前"静默 return"是最差选择。
  - 在 stop 末尾把所有顶层状态（`capture_id`、`start_time`、`current_tab_id`、`config`、`send_to_background`）重置为初始值，避免悬挂闭包持有上一批 `send_to_background`。
- 置信度：高。
- 级别：blocker（跨批次数据污染 + 静默无采集）。

## 3. [high] `deferred_web_requests` 计时器未在 stop 时清除，回调可在 stop 后触发写入下一批次

- 位置：`src/extension/background/network_capture.ts:1040-1073, 119-160`。
- 现象：
  - `handle_completed` 中 `setTimeout(..., DEFERRED_TIMEOUT_MS=1500ms)`。回调体在触发时仍会调用 `send_to_background(build_network_event(...))` 与 `logger.debug`，且引用 `pending`、`details`、`config`、`capture_id` 等模块级状态。
  - `stop_network_capture` 不取消这些计时器；`stop` 之后 1.5s 内回调仍会执行，使用 `pending`（已 `clear`，但闭包仍持有原引用）与上一批 `capture_id` 发送 `network_request` 事件。
- 影响：
  - 采集停止后仍有"幽灵"事件流入 dashboard，时间戳/`capture_id` 归属错误。
  - 若 stop 后立即 start 新 capture，回调可能向新 capture 的 IndexedDB store 写入上一 capture 的请求。
- 建议：
  - `stop_network_capture` 中遍历 `deferred_web_requests`，对每条 `clearTimeout(entry.timer)`，再 `clear()`。
  - 在 deferred 回调入口加 `if (!is_capturing) return;` 短路。
- 置信度：高。
- 级别：high。

## 4. [high] `schedule_orphan_check` 同样使用裸 `setTimeout`，stop 不取消

- 位置：`src/extension/background/network_capture.ts:727-762`。
- 现象：`ORPHAN_TIMEOUT_MS = 3000`，回调内访问 `cdp_request_meta`、`cdp_body_results` 并调用 `on_cdp_body_event`。
- 影响：
  - `stop_network_capture` 把 `on_cdp_body_event` 置 null（line 159），但已经在途的 setTimeout 回调仍会读到 `on_cdp_body_event === null` 后 early return——这一项 lucky path 保护住了回调空指针，但 stop 与回调竞态窗口内若 `on_cdp_body_event` 已被新 start 设置为新 handler，旧 capture 的孤儿 body 会发给新 handler。
  - 配合问题 2、3，整体状态机不闭合。
- 建议：
  - 维护 orphan timer 集合（如 `pending_orphan_timers: Set<ReturnType<typeof setTimeout>>`），stop 时统一 `clearTimeout` 并清空。
  - 回调入口校验 `is_capturing` 与 `capture_id` 一致性。
- 置信度：高。
- 级别：high。

## 5. [high] `find_matching_cdp_request` / `find_cdp_candidates` 仅按 URL+method+status 匹配，存在并发同源请求错配

- 位置：`src/extension/background/network_capture.ts:1026-1100, 1102-1140`。
- 现象：
  - 匹配键：`url.split('?')[0]` + `method` + `status_code`（允许 0）+ 时间窗 ±2000ms。
  - 同一 endpoint 在 2 秒内被并发多次调用（轮询、批量请求、重试）时，多个 `cdp_request_meta` 条目都满足候选条件。`find_matching_cdp_request` 取 `time_diff` 最小者；`find_cdp_candidates` 返回全部候选。
  - `try_resolve_deferred` 中"所有 CDP 候选都 resolve 后取第一个 pending_cdp_ids 为空的 entry 获得 body"——但 CDP body 与 webRequest pending 之间没有真正的 1:1 对应，只是"先 resolve 完的赢"。
- 影响：
  - A 请求的响应 body 被挂到 B 请求的网络事件上，类型（JSON vs 文本）与内容不符，下游分析、XSS 检测、redaction 都基于错误前提。
  - 在 streaming/分块响应场景下错配概率进一步上升。
- 建议：
  - 把 `request_id`（CDP requestId 与 webRequest requestId）做映射；若两者无法直接对齐，至少加入响应 `content-length`、`etag` 或首字节哈希做二次校验。
  - 当多个候选均满足匹配条件时，记录 `correlation_status: 'ambiguous'` 并拒绝合并，而不是"最小时间差获胜"。`network_correlator.ts` 已定义 `'ambiguous'` 状态，但 `network_capture.ts` 的快速路径绕过了 correlator。
- 置信度：中（错配需要并发场景，但用户场景里轮询接口很常见）。
- 级别：high。

## 6. [high] `network_correlator.ts` 在本批次代码路径中未被实际调用，`network_context.ts` 是死代码旁路

- 位置：
  - `src/extension/background/network_correlator.ts:42-202`（`correlate`、`merge_matched`、`build_cdp_only_request`、`build_web_request_only_request`）。
  - `src/extension/background/network_context.ts:85-128`（`NetworkCaptureContext` 类）。
  - `src/extension/background/network_webrequest.ts:120-184`（`create_webrequest_handlers(ctx)` 工厂）。
- 现象：
  - 在本批次 4 个文件内：`network_capture.ts` 自己实现了 `build_network_event`、`build_cdp_primary_network_event`、`find_matching_cdp_request`、`try_resolve_deferred`、`schedule_orphan_check`，并自己维护所有 Map。它不 import `network_correlator` 的任何函数（仅 `import type { CdpBodyEvent }`），也不实例化 `NetworkCaptureContext`。
  - `network_capture.ts:19` 甚至留了 `import {} from './webrequest_handler';`（空命名导入），暗示这些配套模块原本是另一套设计。
  - 全仓搜索显示 `network_correlator.correlate / merge_matched / build_cdp_only_request / build_web_request_only_request` 与 `new NetworkCaptureContext()` 仅被测试引用（见 `tests_unit_07/network_correlator.test.ts`），生产代码路径不使用。
- 影响：
  - 双套实现长期分叉：`network_correlator.ts` 中的匹配规则（要求 `resource_type` 与 `status_code` 都严格相等，否则判 `ambiguous`）与 `network_capture.ts` 中 `find_matching_cdp_request` 的宽松规则（允许 `status_code=0`、忽略 `resource_type`、最小时间差获胜）不一致。后续维护者改一处不改另一处，redaction/字段填充行为会进一步漂移。
  - `network_context.ts` 的 `NetworkCaptureConfig` 字段（`redact_sensitive_headers` 等）与 `network_capture.ts` 顶部从 `cdp_handler.ts` re-import 的 `NetworkCaptureConfig` 是同一类型，但 `network_capture.ts` 与 `network_context.ts` 定义了**两份**同名的 `NetworkCaptureConfig`、`NetworkEventPayload`、`PendingRequest`、`CdpRequestMeta`、`CdpBodyResult`、`WsConnectionMeta`、`DeferredEntry` 接口（见 `network_context.ts:10-81` 与 `network_capture.ts` 通过 `import type` 从 `cdp_handler.ts` 拉的同名接口）。这种"同名双份"会让任何后续 refactor 一改就崩。
- 建议：
  - 明确淘汰一条路径。若 `network_capture.ts` 是当前生产路径，则：
    1. 删除 `network_context.ts` 中的重复接口与 `NetworkCaptureContext` 类（除非另有调用方）；
    2. 删除 `network_webrequest.ts:120-184` 的 `create_webrequest_handlers(ctx)` 工厂（依赖 `ctx` 的死代码）；
    3. 在 `network_correlator.ts` 顶部加注释说明"当前仅供 tests 验证匹配语义；生产路径见 network_capture.ts"，或直接把 correlator 的严格规则迁回 `network_capture.ts`。
  - 若 `network_context.ts` 是未来方向，则反向操作。
- 置信度：高（基于本批次可见代码 + 仓内 grep）。
- 级别：high（架构/可维护性，不直接 bug，但会持续孵化 bug）。

## 7. [high] `ws_connections` 在 stop 时不清理；WebSocket 关闭事件缺失导致永久残留

- 位置：`src/extension/background/network_capture.ts:52, 119-160, 672-679`。
- 现象：
  - `stop_network_capture` 中没有 `ws_connections.clear()`（对比 `pending_requests.clear()`、`cdp_request_meta.clear()` 等都有）。
  - `Network.webSocketClosed` 是唯一 `ws_connections.delete` 的位置；若采集停止时连接未关闭，`ws_connections` 元素持续占用内存，并在下一次采集中共用同一 Map。
- 影响：
  - 内存泄漏（长生命周期 SW + 多次采集）。
  - 下一次采集里 `send_ws_frame` 会通过 `ws_connections.get(req_id)?.url` 读到上一次的连接 URL（虽然 req_id 通常不冲突，但代码层无防护）。
- 建议：
  - stop 中追加 `ws_connections.clear()`。
  - 在 `send_ws_frame` / `send_ws_connection_event` 入口加 `if (!ws_connections.has(req_id) && !is_capturing) return;`。
- 置信度：高。
- 级别：high。

## 8. [high] `handle_completed` 中无 CDP match 时无条件延迟 1.5s，所有请求都承受额外延迟

- 位置：`src/extension/background/network_capture.ts:1023-1073`。
- 现象：
  - 即使 `dbg_tab_id !== null` 但该请求**不在** CDP 通道（例如其他 tab 的请求，CDP 根本不会 emit），仍会走 `find_cdp_candidates` → 创建 deferred entry → 等 1500ms 超时再发 `not_enabled`。
  - `find_cdp_candidates` 只遍历 `cdp_request_meta`，CDP 不跟踪其他 tab 的请求，candidates 必为空，但代码仍创建空 `pending_cdp_ids` 的 deferred entry 并等满超时。
- 影响：
  - 多 tab 场景下所有非调试 tab 的请求事件被人为延后 1.5s 才上报，破坏实时性。
  - `deferred_web_requests` 短时间内堆积大量空 pending 条目（问题 3 已提到内存层面）。
- 建议：
  - 当 `candidates.length === 0 && cdp_request_meta.size >= 0` 时直接判定"CDP 不会处理该请求"，立即发 `not_enabled`，不走 deferred。
  - 或：用"该请求是否来自 `dbg_tab_id` 同源/子目标"作为是否等待 CDP 的判据（同问题 1）。
- 置信度：高。
- 级别：high。

## 9. [medium] `send_ws_frame` 中 base64 截断字符数计算可能产生非法 base64

- 位置：`src/extension/background/network_capture.ts:283-307`。
- 现象：
  - 二进制帧（`opcode === 2`）`payload_bytes` 用 `base64_decoded_size(raw_payload)` 估算。
  - 超阈值时 `max_chars = Math.floor(config.max_body_capture_bytes * 4 / 3)`，直接 `raw_payload.slice(0, max_chars)`。
  - 但 base64 编码长度不一定是 4 的倍数（虽然标准 base64 通常 pad 到 4 的倍数，截断后可能丢掉 padding `=`），截断后的字符串解码时会失败或乱码。
- 影响：
  - 下游消费者尝试 `atob()` 截断后的 base64 字符串时会抛 `DOMException`，或静默得到错误字节。
- 建议：
  - 截断时把 `max_chars` 向下舍到 4 的倍数：`Math.floor(max_chars / 4) * 4`。
  - 或将二进制帧转为 `Uint8Array` 后按字节截断，再重新 base64 编码——成本高但语义正确。
- 置信度：中（需要实际构造超阈值二进制帧触发，但逻辑缺陷明确）。
- 级别：medium。

## 10. [medium] `extract_request_body` 当 `enabled === undefined` 时静默按"enabled"处理

- 位置：`src/extension/background/network_webrequest.ts:32-76`。
- 现象：
  - 函数签名 `capture_enabled?: boolean`，注释说"Caller must pass config explicitly when needed"，但当 `enabled === undefined` 时既不返回 `not_enabled`，也不返回 `captured`——直接继续解析 body。
  - 这等价于"未传 config 默认开采集 body"。`network_capture.ts:794` 与 `network_webrequest.ts:130` 都显式传了 `ctx.config.capture_request_body`，所以本批次路径不会触发，但函数自身契约危险。
- 影响：
  - 后续若有新调用方忘记传 config，会在用户关闭 body 采集的情况下仍采集 body，违反隐私设置。
- 建议：
  - 把 `capture_enabled` 改为必填 `boolean`，或 `undefined` 时显式 `return { body: null, status: 'not_enabled' }`。
- 置信度：高。
- 级别：medium（隐私契约）。

## 11. [medium] `redact_url` 在 `try_resolve_deferred` 等路径中只脱敏 query，不脱敏 path 与 userinfo

- 位置：`src/extension/background/network_capture.ts:800, 911-913, 736-753`；`src/shared/redaction.ts:53-71`。
- 现象：
  - `redact_url` 仅替换预定义敏感 query 参数；URL 中 `userinfo`（`https://user:pass@host/`）、path 中嵌入的 token（`/api/v1/token/abc123`）不做处理。
  - URL 本体在 `pending.url`（`handle_before_request` 已脱敏）和 `meta.url`（CDP 侧，在 `build_cdp_primary_network_event` / `schedule_orphan_check` 内脱敏）两条路径上都做了 `redact_url`，覆盖基本一致。
  - 但 `build_network_event` 第 862 行 `url: pending.url` 使用的是已脱敏 url，没问题；第 863 行 `url_status` 根据配置决定，也没问题。问题在于 `redact_url` 自身的覆盖面。
- 影响：
  - 若 URL path 中包含敏感 token（常见于预签名 URL、reset-password 链接），仍会被原样记录。
- 建议：
  - 与 `docs/blueprint/domain.md` 对齐隐私范围；若需扩展，在 `redaction.ts` 中新增 path 脱敏规则，本批次代码无需改动。
  - 此项主要是**横切提醒**，本批次实现已是规范的"在所有出口都调 `redact_url`"，无新漏洞。
- 置信度：中。
- 级别：medium。

## 12. [medium] `build_cdp_body_result` 截断时丢失 base64 路径的 preview 与 encoding

- 位置：`src/extension/background/network_capture.ts:220-227, 527-545`。
- 现象：
  - `build_cdp_body_result` 只处理 utf8 路径；调用点在 `loadingFinished` 的 `else`（非 base64Encoded）分支。
  - 但当 `result.base64Encoded` 且 `byte_size > max_body_capture_bytes` 时（line 527-535），代码设置 `body_status = 'too_large'` 但 `body = null`、`preview = null`、`encoding = 'base64'`——`byte_size` 被记录但实际 body 完全丢弃。
  - 对比 utf8 路径的 `build_cdp_body_result`：返回 `trunc_result.body`（截断后的 body）+ `preview`，仍保留可用样本。
- 影响：
  - 二进制资源（图片、字体、wasm）超阈值时，下游完全无法判断资源类型或预览，调试体验降级。
- 建议：
  - 二进制超阈值时仍保留 base64 前 N 字节作为 preview（与 utf8 路径对齐）。
- 置信度：中。
- 级别：medium。

## 13. [medium] `pending_requests`/`cdp_request_meta` 在异常路径下不释放

- 位置：`src/extension/background/network_capture.ts:971-991, 1142-1146`。
- 现象：
  - `handle_completed`：若 `pending = pending_requests.get(details.requestId)` 为空直接 return，不删除（OK，本来就没有）。
  - 但 `handle_error`（1142）只删 `pending_requests`，不删 `cdp_request_meta`、`cdp_body_results`。错误请求的 CDP 元数据若已写入（`requestWillBeSent` 收到但随后 `loadingFailed`），会留在 Map 直到 orphan_check 或 stop。
  - `loadingFailed` 路径（595）写 `cdp_body_results` 后调用 `try_resolve_deferred` + `schedule_orphan_check`——OK；但若 `try_resolve_deferred` 在 `deferred_keys` 为空时直接 `cdp_body_results.delete(cdp_req_id)` 与 `cdp_request_meta.delete(cdp_req_id)`（720-722），只有 `cdp_req_id` 这一条被清，其他被该 CDP 请求作为候选引用过的 deferred entry 不会被回收（除非走 1043-1049 的 deferred timeout）。
- 影响：
  - 内存增长缓慢但确定，长采集场景下 Map 体积持续增长。
- 建议：
  - `handle_error` 中补充 `cdp_request_meta.delete(details.requestId)` 与 `cdp_body_results.delete(details.requestId)`。
  - `try_resolve_deferred` 中清理 `_deferred_cdp_index` 的同时，反向从所有引用过该 `cdp_id` 的 deferred entry 的 `pending_cdp_ids` 中删除（已有 1043-1049 的对称清理，但只在 deferred timer 触发时执行；resolve 路径不对称）。
- 置信度：中。
- 级别：medium。

## 14. [medium] `send_ws_connection_event` 中 `status_code` 字段对失败连接误导

- 位置：`src/extension/background/network_capture.ts:229-281, 627-635`。
- 现象：
  - WebSocket 握手失败时 CDP 通常发 `webSocketFrameError` 后 `webSocketClosed`，`status_code` 可能停留在 0。
  - `send_ws_connection_event` 在 `ws_status='closed'` 时仍把 `status_code: conn.status_code || null` 写入；若握手从未成功，`status_code=0` 会被记录为 `null`（因 `0 || null === null`），丢失"已尝试但失败"的语义。
- 影响：
  - 下游无法区分"未收到响应"与"收到非 101 响应"。
- 建议：
  - 显式区分：`status_code: conn.ws_status === 'connecting' ? null : (conn.status_code || null)`，或在 `webSocketFrameError` 路径补发一次 `ws_status='error'` 的 connection 事件。
- 置信度：中。
- 级别：medium。

## 15. [medium] 隐私：CDP primary 路径在 emit 前才脱敏 url，但 `cdp_request_meta` 内存中长期持有未脱敏 url

- 位置：`src/extension/background/network_capture.ts:402-414, 904-968, 727-762`。
- 现象：
  - `cdp_request_meta.url` 在 `requestWillBeSent` 写入原始 url。
  - 脱敏仅发生在 `build_cdp_primary_network_event` 与 `schedule_orphan_check` 的输出阶段。
  - Map 本身长期持有原始 url；`find_matching_cdp_request` 与 `find_cdp_candidates` 比对时也用原始 url（`meta.url.split('?')[0]`）。
- 影响：
  - 这是匹配需要（必须用原始 url 才能对齐 webRequest 端已被脱敏的 url？——实际上 `pending.url` 已脱敏，对比 `meta.url` 原始 url 的 `split('?')[0]` 在 query 被完全脱敏成 `[REDACTED]` 时仍能匹配 path，但 path 中的 token 不会被对齐）。
  - 同时带来隐私风险：如果 IndexedDB 或导出环节有任何"dump 内存 Map"的调试路径，未脱敏 url 会泄露。本批次未见 dump 路径，但属于潜在风险。
- 建议：
  - 接受当前实现（匹配需要），但在 `cdp_request_meta` 注释中明确"url 字段为匹配用原始值，输出前必须脱敏"，并保证不在任何导出/日志中输出该字段（当前 `logger.debug` 输出的是 `meta.url?.slice(0, 120)`，即原始 url 前 120 字符进入 app log，这是实质泄露点）。
  - 修复：`logger.debug` 中对 url 做 `redact_url(meta.url, true).url.slice(0, 120)` 后再输出。
- 置信度：高（日志泄露点明确）。
- 级别：medium（取决于 app log 是否随导出/上报外流，本批次未见外流路径，故不升 high）。

## 16. [low] `network_capture.ts:17` 从 `cdp_handler.ts` re-import `NetworkCaptureConfig` 等接口，与 `network_context.ts` 同名接口重复定义

- 位置：`network_capture.ts:18`、`network_context.ts:10-81`、`cdp_handler.ts`（被引方）。
- 现象：见问题 6。本项单列以提示：**本批次文件之间接口定义不同步**。`network_capture.ts` 的 `PendingRequest`、`CdpRequestMeta`、`CdpBodyResult`、`WsConnectionMeta`、`DeferredEntry` 来自 `cdp_handler.ts`；`network_context.ts` 自己又定义了一份。任何字段调整都需要同时改两份。
- 影响：维护成本上升，类型层无法保证一致性。
- 建议：统一到 `network_context.ts`（作为领域类型归属）或 `cdp_handler.ts`，删除另一份。
- 置信度：高。
- 级别：low。

## 17. [low] `network_webrequest.ts:121-122` 在 ES 模块中使用 `require(...)`，与项目 ESM 构建冲突

- 位置：`src/extension/background/network_webrequest.ts:121-123`。
- 现象：`create_webrequest_handlers` 内 `const { redact_headers } = require('../../shared/redaction');`、`const { is_self_origin_url } = require('./network_capture');`。Vite + TS ESM 构建下 `require` 不可用。
- 影响：
  - 该函数当前是死代码（问题 6），所以构建未爆。一旦启用会立即 build break。
- 建议：
  - 改为顶部 `import { redact_headers, redact_url } from '../../shared/redaction';`、`import { is_self_origin_url } from './network_capture';`。
- 置信度：高。
- 级别：low（死代码路径）。

## 18. [low] `network_capture.ts:19-20` 空 `import {}` 是无效导入

- 位置：`network_capture.ts:19-20`。
- 现象：
  ```ts
  import {} from './webrequest_handler';
  import {} from './ws_handler';
  ```
  空命名导入既不引入符号也不触发副作用，TS 会将其优化为 no-op，但代码阅读时易误以为存在副作用依赖。
- 建议：删除这两行。
- 置信度：高。
- 级别：low。

## 19. [low] `send_ws_frame` 中 `params?.timestamp ? params.timestamp * 1000 : Date.now()` 与 `relative_time_ms` 语义不一致

- 位置：`network_capture.ts:326-328`。
- 现象：`relative_time_ms: (params?.timestamp ? params.timestamp * 1000 : Date.now()) - start_time`。CDP timestamp 是 monotonic seconds（高精度时间戳，相对于进程启动），`start_time` 是 `Date.now()`（wall-clock ms）。两者相减无物理意义。
- 影响：WebSocket 帧的 `relative_time_ms` 可能为巨大负数或溢出，timeline 排序失真。
- 建议：统一用 `Date.now() - start_time`，或在 capture 启动时记录 CDP monotonic 基准。
- 置信度：中。
- 级别：low（仅时间戳显示）。

## 20. [low] `network_correlator.ts` 的 `merge_matched` 缺少 `event_id`

- 位置：`network_correlator.ts:64-105`。
- 现象：输出 `NetworkRequestData` 没有 `event_id` 字段，而 `build_cdp_only_request` 在 117 行显式 `event_id: undefined`。两处行为不一致，依赖 `NetworkRequestData` 是否要求 `event_id` 必填。
- 影响：若该路径被启用（问题 6），下游找不到 `event_id` 会拒绝事件。
- 建议：与 `NetworkRequestData` 类型对齐（见 `src/shared/types.ts`），明确 `event_id` 可选性。
- 置信度：中。
- 级别：low。

## 21. [low] `find_matching_cdp_request` 中 `reject_reasons` 仅在 miss 时计入 `cdp_match_miss` 日志，hit 路径不记录诊断

- 位置：`network_capture.ts:1111-1138`。
- 现象：命中时不输出诊断字段，调试时无法复现为何选了某个候选。
- 建议：在 debug 模式下输出命中候选的 `time_diff` 与 `cdp_meta_count`。
- 置信度：高。
- 级别：low。

## 22. [info] `network_capture.ts:596-603` `loadingFailed` 路径未 `cdp_primary_emitted.add`

- 位置：`network_capture.ts:595-603`。
- 现象：失败请求直接写 `cdp_body_results`，不 emit primary 事件，依赖 `schedule_orphan_check` 走 `on_cdp_body_event`。
- 影响：与成功路径（`loadingFinished` 中直接 emit primary）不对称，失败请求的上报延迟到 `ORPHAN_TIMEOUT_MS=3000ms` 之后；且依赖外部 `handle_cdp_body_event` 处理。
- 建议：若 CDP-first 是目标，`loadingFailed` 也应直接 emit primary（status=`cdp_failed`），与成功路径对称。当前实现是"CDP-first 仅对成功请求"的半实现。
- 置信度：高。
- 级别：info。

## 23. [info] `handle_cdp_event` 入口未校验 `source.tabId`，子目标 sessionId 路径完全依赖 `should_handle_event`

- 位置：`network_capture.ts:336-373`。
- 现象：顶部 `if (!should_handle_event(source, dbg_tab_id)) return;` 是唯一过滤。`Target.attachedToTarget` 子会话上来的事件 `source.tabId === dbg_tab_id`，`source.sessionId` 是子目标。
- 影响：当前实现依赖 `cdp_event_router.ts` 的 `should_handle_event` 正确性。本批次未审 `cdp_event_router.ts`（在 `src_extension_01`）。**仅作记录**，需要与该模块审阅报告交叉核对。
- 置信度：高（事实记录）。
- 级别：info。

---

## 覆盖维度小结

| 维度 | 覆盖情况 | 主要问题 |
| ---- | ---- | ---- |
| 网络采集 | 完整 | 双通道去重未落地（#1）；ws_connections 不清理（#7） |
| 关联 | 完整 | 并发同源请求错配（#5）；双套 correlator 实现分叉（#6） |
| 请求生命周期 | 部分 | deferred/orphan timer 不取消（#3、#4）；loadingFailed 不 emit primary（#22） |
| 内存 | 部分 | 多个 Map 在 stop 不清空、闭包持有引用（#2、#7、#13） |
| 隐私 | 部分 | app log 输出未脱敏 url 前 120 字符（#15）；extract_request_body 默认开（#10） |
| 边界条件 | 部分 | base64 截断产生非法串（#9）；二进制 too_large 丢 preview（#12）；时间戳基准不一致（#19） |

---

## 阻断项汇总

- #1：`cdp_primary_emitted` 去重承诺未实现，CDP-first 与 webRequest 通道可能双发。
- #2：模块级单例 + 非幂等启停 + stop 未清多个 Map/timer，跨批次数据污染与"静默无采集"风险。

修复 #1、#2、#3、#4 后可降为 high 级评审通过；其余 high/medium 按 backlog 排期。
