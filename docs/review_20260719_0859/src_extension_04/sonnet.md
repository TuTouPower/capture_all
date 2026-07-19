# src_extension_04 审阅报告

- 审阅人：sonnet
- 日期：2026-07-19
- 范围：`service_worker.ts`(960)、`storage.ts`(559)、`stream_buffer.ts`(83)、`webrequest_handler.ts`(336)

---

## 1. Service Worker 重启后采集状态丢失

- **位置**：`service_worker.ts:84-88`（模块级变量）、`service_worker.ts:267-326`（`start_capture`）
- **现象**：`is_capturing`、`current_capture`、`current_capture_id`、`start_time`、`current_config` 等全部为模块级内存变量，从未持久化到 `chrome.storage.local`。SW 被 Chrome 杀死后所有采集状态归零。
- **影响**：采集期间 SW 重启后，content script 持续发送事件但 SW 无法接收和存储；`cleanup_stale_capture_state()` 读取 `chrome.storage.local.is_capturing` 永远为 `false`（因为 start 时从未写入），无法检测残留状态。IndexedDB 中已写入的数据保留，但 capture record 状态不会被标记为异常终止。
- **建议**：`start_capture` 开头写入 `chrome.storage.local.set({ is_capturing: true, current_capture: capture })`；`stop_capture` 末尾写入 `{ is_capturing: false, current_capture: null }`；SW 启动时 `cleanup_stale_capture_state` 读取并正确处理。
- **置信度**：高
- **级别**：Critical

---

## 2. `cleanup_stale_capture_state` 无效

- **位置**：`service_worker.ts:123-141`
- **现象**：读取 `chrome.storage.local.get(['is_capturing', 'current_capture'])`，但由于 `start_capture` 从未写入这些 key，条件 `result.is_capturing` 永远为 falsy，函数实际不执行任何清理。
- **影响**：SW 重启后采集 record 状态为 `'capturing'` 但无后续标记为 `'completed'` 或 `'aborted'`，用户看到一条永远在"采集"的记录。
- **建议**：同 #1，需要配套写入 storage。
- **置信度**：高
- **级别**：Critical

---

## 3. `stop_network_capture` 未清除 deferred_web_requests 定时器

- **位置**：`network_capture.ts:119-160`（`stop_network_capture`）；`webrequest_handler.ts:153-174`（deferred timeout 回调）
- **现象**：`stop_network_capture` 清除了 `pending_requests`、`cdp_request_meta`、`cdp_body_results` 等 Map，但未清除 `deferred_web_requests` 和 `_deferred_cdp_index`。停止后仍有 deferred 定时器在 1500ms 后触发。
- **影响**：deferred timeout 回调直接调用 `send_to_background(build_network_event(...))`，不检查 `is_capturing`。定时器触发时会向 `service_worker.ts` 的 `handle_network_request` 发送陈旧数据。由于 `handle_network_request` 检查 `!is_capturing`，数据最终不会入库，但产生了不必要的 CPU 和内存消耗，以及误导性日志。
- **建议**：`stop_network_capture` 中遍历 `deferred_web_requests` 的 timer 并 `clearTimeout`，然后 `deferred_web_requests.clear()`、`_deferred_cdp_index.clear()`。
- **置信度**：高
- **级别**：High

---

## 4. webrequest_handler.ts 与 network_capture.ts 重复实现

- **位置**：`webrequest_handler.ts:31-192` vs `network_capture.ts:880-1073`
- **现象**：`webrequest_handler.ts` 导出 `handle_before_request`、`handle_before_send_headers`、`handle_headers_received`、`handle_completed`、`handle_error`、`find_cdp_candidates`、`find_matching_cdp_request` 等函数，接受 `WebRequestHandlerState` 参数。`network_capture.ts` 内部也有同样逻辑的独立实现（使用模块级变量）。两份代码逻辑几乎相同，结构不同。
- **影响**：维护风险——修改一处忘改另一处导致行为不一致。`webrequest_handler.ts` 的 `handle_completed` 硬编码 `DEFERRED_TIMEOUT_MS = 1500`（行 173），而 `cdp_handler.ts` 导出 `DEFERRED_TIMEOUT_MS = 804`（行 804）。若修改常量值只改一处则另一处不同步。
- **建议**：统一为一份实现。`network_capture.ts` 应使用 `webrequest_handler.ts` 导出的函数（或删除 `webrequest_handler.ts`），消除重复。
- **置信度**：高
- **级别**：High

---

## 5. 孤儿 CDP 定时器跨采集泄漏

- **位置**：`network_capture.ts:727-763`（`schedule_orphan_check`）
- **现象**：`schedule_orphan_check` 创建 `setTimeout(ORPHAN_TIMEOUT_MS)` 回调，内部检查 `on_cdp_body_event`——模块级变量。`stop_network_capture` 将 `on_cdp_body_event` 设为 `null`，但定时器仍存在。若两次采集间隔小于 `ORPHAN_TIMEOUT_MS`（2s），第二次采集的 `start_body_capture` 设置新的 `on_cdp_body_event`，旧定时器触发时使用新回调处理旧采集的陈旧 `cdp_body_results`。
- **影响**：低概率的数据完整性问题——上一次采集的 orphan CDP body 被注入新采集。
- **建议**：`stop_network_capture` 中清除 `streaming_requests` 后，也清除 `cdp_body_results` 和 `cdp_request_meta` 中所有条目（已做），确保 orphan 定时器触发时 `body_result` 为 null。当前实现已清除这两个 Map，因此旧定时器触发时 `cdp_body_results.get(req_id)` 返回 undefined 并 `return`。实际影响已被现有清除逻辑缓解，但依赖于清除顺序，防御性不足。
- **置信度**：中
- **级别**：Medium

---

## 6. `storage.ts` v1 stores 只增不删

- **位置**：`storage.ts:49-71`（`onupgradeneeded` 中 v1 store 创建）
- **现象**：升级路径创建 v1 stores（`sessions`、`events`、`console_logs`、`error_log`）和 v2/v3 stores，但从不删除 v1 stores。v1 数据完全不被应用读写。
- **影响**：v1 stores 占用 IndexedDB 存储空间；`delete_capture` 只清理 v2 stores，v1 残留数据永远不被删除。对老用户（从 v1 升级）而言浪费空间。
- **建议**：在 `onupgradeneeded` 中检测到 v1 stores 存在时，用 `database.deleteObjectStore()` 清除（先确认无 v1 数据迁移需求）。至少在 `delete_capture` 中也清理 v1 stores 的 `capture_id` 相关记录。
- **置信度**：高
- **级别**：Medium

---

## 7. `delete_capture` 非原子操作

- **位置**：`storage.ts:201-241`
- **现象**：遍历 9 个 store，每个 store 独立创建事务。若第 5 个 store 的事务失败，前 4 个 store 的删除已提交。
- **影响**：部分删除导致数据不一致——captures store 中记录已删但子 store 中残留事件，或反之。后续 `query_by_store` 按 `capture_id` 查询不会报错但找不到主记录。
- **建议**：使用单一事务覆盖所有 store：`database.transaction(store_names, 'readwrite')`。IndexedDB 支持多 store 事务。或在失败时记录错误但仍继续删除剩余 store（当前已在每个 store 独立 try/catch，但没有 catch）。
- **置信度**：高
- **级别**：Medium

---

## 8. `delete_capture` 未清理 `APP_LOGS` store

- **位置**：`storage.ts:202-213`（`store_names` 列表）
- **现象**：`store_names` 包含 9 个 store，不包含 `STORE_NAMES.APP_LOGS`。
- **影响**：APP_LOGS 按 `id` 键存储，没有 `capture_id` 索引，无法按采集删除日志。APP_LOGS 是独立于采集生命周期的系统日志，不绑定 `capture_id`，所以此处不清理是正确行为。但需确认 `app_log_storage.ts` 自身的清理策略（按 `log_max_size_mb` 滚动）是否覆盖了采集场景。
- **建议**：无需修改。标注为设计如此。
- **置信度**：中
- **级别**：Info

---

## 9. `last_tab_urls` 未在采集结束时清除

- **位置**：`service_worker.ts:859-860`（定义）、`service_worker.ts:932-934`（仅 tab 关闭时 delete）、`service_worker.ts:479-558`（`stop_capture`）
- **现象**：`last_tab_urls` 在 `tabs.onUpdated` 中添加条目，在 `tabs.onRemoved` 中删除。`stop_capture` 清除了 `last_active_tab`（行 555）但未清除 `last_tab_urls`。
- **影响**：采集结束后 `last_tab_urls` 保留上次采集的 URL 数据。SW 重启后归零。对功能无影响（`is_capturing` 为 false 时所有 listener 提前返回），但属于不必要的内存残留。
- **建议**：`stop_capture` 中添加 `last_tab_urls.clear()`。
- **置信度**：高
- **级别**：Low

---

## 10. `persist_stats` 每个事件都触发 IDB 写入

- **位置**：`service_worker.ts:560-568`、`service_worker.ts:594-601`（`handle_event`）、`service_worker.ts:707-714`（`handle_network_request`）、`service_worker.ts:726-733`（`handle_console_log`）
- **现象**：每个事件处理后都调用 `persist_stats()`，其内部执行 `update_capture(current_capture)`（IDB `put` 操作）。高频场景（鼠标移动 20ms 采样、大量网络请求）下产生大量小写入。
- **影响**：高吞吐采集时 IndexedDB 写入放大。IDB `put` 涉及序列化整个 `CaptureRecord` 对象（含 `config_snapshot`、`stats` 等），每秒可能数十次。
- **建议**：将 `persist_stats` 改为节流模式——累积更新，每 N 毫秒或每 M 次事件后实际写入一次。或利用已有的 `FLUSH_INTERVAL_MS` 将 stats 持久化合并到 flush 周期中。
- **置信度**：高
- **级别**：Medium

---

## 11. `stream_buffer.ts` TextEncoder 重复实例化

- **位置**：`stream_buffer.ts:48`（`append` 函数内）
- **现象**：每次 `append` 调用创建 `new TextEncoder().encode(chunk)` 计算字节数。高吞吐 SSE 场景下每秒可能数百次。
- **影响**：GC 压力增加。单次 TextEncoder 创建成本很低（~微秒级），但累积可能影响流式采集性能。
- **建议**：将 `TextEncoder` 提升为闭包级常量：`const encoder = new TextEncoder()` 在 `create_stream_buffer` 内部声明一次。
- **置信度**：高
- **级别**：Low

---

## 12. `webrequest_handler.ts:handle_completed` 硬编码超时常量

- **位置**：`webrequest_handler.ts:173`（`}, 1500); // DEFERRED_TIMEOUT_MS`）
- **现象**：超时值 `1500` 直接写在代码中，注释标注 `DEFERRED_TIMEOUT_MS`，但未引用 `cdp_handler.ts` 导出的同名常量。
- **影响**：若修改 `cdp_handler.ts:DEFERRED_TIMEOUT_MS`，此处不会同步，导致两处超时不一致。deferred 匹配行为可能不稳定。
- **建议**：`import { DEFERRED_TIMEOUT_MS } from './cdp_handler'` 并使用常量。
- **置信度**：高
- **级别**：Medium

---

## 13. `storage.ts` 类型转换绕过类型安全

- **位置**：`storage.ts:298-311`（`write_network_requests`、`write_console_events`）、`storage.ts:314-318`（`write_error_events`）、`storage.ts:320-334`（`write_storage_changes`、`write_cookie_changes`）、`storage.ts:336-351`（`write_lifecycle_events`）
- **现象**：`batch as unknown as CaptureEvent[]` 将 `NetworkRequestData[]`、`ConsoleEventData[]` 等类型强制转换为 `CaptureEvent[]`。
- **影响**：绕过 TypeScript 类型检查。若 `CaptureEvent` 和 `NetworkRequestData` 结构不同（`event_id` 位置、必填字段等），运行时 `store.put(item)` 可能存储缺字段的记录。当前 `flush_store` 使用 `JSON.stringify(item).length` 计算字节，若字段缺失会影响存储统计。
- **建议**：统一 buffer 类型为 `unknown[]` 或定义通用 `StorableItem` 接口，避免 double cast。
- **置信度**：中
- **级别**：Low

---

## 14. `service_worker.ts` 对所有 tab 发送 start/stop 消息

- **位置**：`service_worker.ts:452-468`（start 通知）、`service_worker.ts:538-549`（stop 通知）
- **现象**：start 阶段过滤了 `https?://` 的 tab；stop 阶段不过滤，对所有 tab 发送 stop 消息。两者均为串行发送，每个 tab 最多重试 3 次（start）/ 2 次（stop），重试间隔 200/100ms。
- **影响**：大量 tab 时（如 50+），stop 阶段串行重试可导致最长 50×2×100ms = 10s 延迟（`flush_all` 在 stop 通知之后执行）。start 阶段类似。
- **建议**：使用 `Promise.all` 并行发送（或限制并发数）；stop 阶段可考虑只通知 http/https tab。
- **置信度**：中
- **级别**：Low

---

## 15. `query_by_store` 全量加载后 slice

- **位置**：`storage.ts:452-468`
- **现象**：`index.getAll(IDBKeyRange.only(capture_id))` 将一个 capture 的所有记录加载到内存，然后 `.slice(offset, offset + limit)`。
- **影响**：大型采集（如百万级网络请求）会导致 OOM 或严重卡顿。`getAll` 无游标分页能力。
- **建议**：改用 `index.openCursor(IDBKeyRange.only(capture_id))` 跳过 offset 条记录后逐条收集 limit 条。或限制 `offset + limit` 上限。
- **置信度**：高
- **级别**：Medium

---

## 16. `handle_network_request` 重载签名类型不安全

- **位置**：`service_worker.ts:683-715`
- **现象**：函数接受 `{ event, data } | NetworkRequestData` 联合类型，内部用 `'event' in payload` 区分。但调用方（`handle_fallback_body_event`、`start_body_capture` callback）传入 `NetworkRequestData`，而 `start_network_capture` 的 callback 传入 `{ event, data }`。
- **影响**：类型安全依赖运行时 `'event' in` 检查。若调用方传入的对象恰好有 `event` 属性但非预期结构，分支判断错误。
- **建议**：拆分为两个函数 `handle_network_event_payload(payload)` 和 `handle_network_request_data(data)`，消除联合类型。
- **置信度**：中
- **级别**：Low

---

## 汇总

| 级别 | 数量 | 编号 |
|------|------|------|
| Critical | 2 | #1, #2 |
| High | 2 | #3, #4 |
| Medium | 6 | #5, #6, #7, #10, #12, #15 |
| Low | 5 | #9, #11, #13, #14, #16 |
| Info | 1 | #8 |

核心风险：Service Worker 生命周期管理（#1+#2）是架构级缺陷，MV3 30 秒空闲杀 SW 的场景下，长采集几乎必然丢失状态。deferred timer 未在 stop 时清除（#3）是确定性 bug。webrequest_handler 与 network_capture 重复实现（#4）增加维护负担。
