# src_extension_04 审阅报告（Haiku）

**审阅模型**: Haiku
**审阅时间**: 2026-07-19 08:59 UTC+8
**审阅范围**: `src/extension/background/service_worker.ts` (960 行), `storage.ts` (559 行), `stream_buffer.ts` (83 行), `webrequest_handler.ts` (336 行)
**审阅模式**: 独立只读全量审阅，未读取其他审阅报告

---

## 摘要

本次审阅共发现 **11 项问题**：1 项严重（exception 采集写入错误 store），6 项中等（内存态 bytes 追踪丢失、buffer 残留、debgguer 附着竞态、delete_capture 部分失败、IDB 事务数据丢失、localhost 过度过滤），4 项轻微/建议（DRY 重复、event_id 碰撞、zero_stats 类型缺失、unbounded stream buffer 无上限）。

---

## 一、service_worker.ts

### 1.1 [严重] exception 初始启动与重试使用不同事件处理器

- **位置**: `service_worker.ts` L382 vs L801
- **现象**: `start_capture` 中启动 exception 采集时（L382），传入的回调是 `handle_console_log`，该函数将异常事件写入 `console_events` store。而在 `onActivated` 标签页切换重试时（L801），传入的是 `handle_event`，该函数按 category 路由到正确的 `error_events` store。
- **影响**: 初次启动采集的标签页，所有 runtime exception 会被错误地写入 `console_events`，导致 `error_events` store 缺失数据。只有标签页切换后重试的 exception 才写入正确 store。这是数据分类错误，影响后续按数据源查询的正确性。
- **建议**: 统一使用 `handle_event`。将 L382 的 `handle_console_log` 改为 `handle_event`。
- **置信度**: 高
- **级别**: 严重

### 1.2 [中等] debugger_attached_tab_id 在标签页切换重试时的竞态

- **位置**: `service_worker.ts` L795-806
- **现象**: `onActivated` 中，console 重试成功后会设置 `debugger_attached_tab_id = activeInfo.tabId`（L796），随后 exception 重试以 `debugger_attached_tab_id === activeInfo.tabId` 判断是否已附着 CDP（L802）。但如果 console 重试失败（没设置 `debugger_attached_tab_id`），`debugger_attached_tab_id` 保持旧值。exception 重试时 `debugger_attached_tab_id === activeInfo.tabId` 可能为 `null === newTabId`（false），导致 exception 不会主动附着 debugger，也无法启动 CDP exception 采集。
- **影响**: 如果 console 采集在新标签页启动失败，exception 采集也可能连带失败且无自我修复能力。
- **建议**: exception 重试时不应依赖 console 附着状态。应独立尝试 `chrome.dbg.attach`，失败后再使用 `cdp_attached = false` 降级。
- **置信度**: 中
- **级别**: 中等

### 1.3 [轻微] 大量标签页时 stop 通知延迟累积

- **位置**: `service_worker.ts` L538-549
- **现象**: `stop_capture` 遍历所有标签页，对每个调用 `tabs_send_message_retry`（3 次重试，200ms/400ms/600ms 退避），且为串行 `await`。若打开 50 个标签页且其中部分标签页无 content script，总等待时间可达 `50 * (200+400+600) = 60s`。
- **影响**: 用户停止采集后，UI 可能需要等待最多数十秒才能看到 stopped 状态。
- **建议**: 改为并发 `Promise.all` 或限制总超时的 `Promise.allSettled`。
- **置信度**: 中
- **级别**: 轻微

### 1.4 [轻微] 标签页切换与 URL 变更重试逻辑大量重复

- **位置**: `service_worker.ts` L789-826（onActivated）与 L890-929（onUpdated）
- **现象**: console、exception、body capture 的重试代码在两处几乎完全一致，仅 `get_active_tab_url` 和 `get_bridge_config` 的回调略有不同。约 80 行重复代码。
- **影响**: 维护负担，修改重试逻辑需同步两处。当前未发现由此产生的 bug，但历史上有过两处不一致的风险（如上述 1.1 就是重试路径与初始路径参数不一致）。
- **建议**: 抽取公共函数 `retry_cdp_captures_for_tab(tabId, tabUrl)`，包含 console + exception + body 重试。
- **置信度**: 高
- **级别**: 建议

### 1.5 [轻微] event_id 碰撞风险

- **位置**: `service_worker.ts` L633, L705
- **现象**: `handle_fallback_body_event` 使用 `Date.now().toString(36)` 生成 event_id，`handle_network_request` 使用 `Date.now().toString(36)_${Math.random().toString(36).slice(2,8)}`。在同一毫秒内，多个 fallback body 事件可能产生相同 event_id。
- **影响**: 同一毫秒内多次 fallback body 事件可能共享 event_id，写入 IDB 时后者覆盖前者。概率低但在高频场景（如轮询接口）可能发生。
- **建议**: fallback 路径也加入随机后缀，或统一使用 `crypto.randomUUID()`。
- **置信度**: 中
- **级别**: 轻微

---

## 二、storage.ts（IndexedDB）

### 2.1 [中等] 内存态 bytes_written 在 SW 重启后丢失

- **位置**: `storage.ts` L263-264, L434-437
- **现象**: `bytes_written` 是内存 Map，不在 IDB 中持久化。MV3 Service Worker 可能随时被浏览器回收重启，重启后 `bytes_written` 重置为空 Map。
- **影响**: `check_storage_limit`（L443）和 `get_capture_size`（L439）在 SW 重启后返回 0，500MB 存储限制完全失效。在 SW 生命周期内持续长时间采集时仍有效，但 SW 回收后保护消失。
- **建议**: 方案 A：在 `start_capture` 时从 IDB 重新计算各 capture 已写入字节数，重建 `bytes_written`；方案 B：将字节计数直接持久化到 `captures` 记录的 stats 中（当前已有 `total_body_bytes` 字段，可复用）。
- **置信度**: 高
- **级别**: 中等

### 2.2 [中等] flush_store 事务失败导致缓冲数据丢失

- **位置**: `storage.ts` L357-379
- **现象**: L362 执行 `buf.splice(0)` 立即清空缓冲区，之后 L364-378 开始 IDB 事务写入。如果事务失败（键冲突、quota 超限等），已清空的缓冲数据不可恢复，整批数据永久丢失。
- **影响**: 在 IndexedDB quota 耗尽或意外错误时，当前批次的采集数据静默丢失，只记录 tx.error 但未通知上层调用者。
- **建议**: 在 `tx.oncomplete` 成功返回前保留缓冲区副本。若事务失败，将数据放回缓冲区或通过 `logger.error` 外加重试机制处理。
- **置信度**: 高
- **级别**: 中等

### 2.3 [中等] delete_capture 跨 store 无原子性保证

- **位置**: `storage.ts` L201-240
- **现象**: `delete_capture` 遍历 9 个 store，每个 store 独立开启事务。若中间某个 store 删除失败（如 IDB 错误），已删除的 store 数据无法恢复，剩余 store 继续尝试删除。
- **影响**: 可能导致捕获记录被删除但关联事件残留，或者事件已删除但记录残留。因为每个 store 使用独立事务，无法实现原子回滚。
- **建议**: 记录失败的 store，至少在上层返回部分失败信息（当前 `delete_capture` 返回 `void`，调用者无法感知失败）。长期考虑使用单一事务覆盖所有 store（IDB 支持跨 store 事务）。
- **置信度**: 中
- **级别**: 中等

### 2.4 [中等] 采集结束后缓冲区未清理

- **位置**: `storage.ts` L263, L399-428
- **现象**: `stop_periodic_flush` 清除定时器但不清除 `buffers` 和 `bytes_written` Map。如果停止采集后短时间内重新开始新采集，上一轮残留的缓冲区数据可能混入新的采集。
- **影响**: `stop_capture` 中 L552 已调用 `flush_all()` 清空缓冲区并写入 IDB，所以正常情况下上一轮数据已被持久化。但 `flush_all` 可能失败（catch 被忽略），或定时器在 `flush_all` 与 `stop_periodic_flush` 之间触发，导致残留。
- **建议**: `stop_periodic_flush` 中增加 `buffers.clear()` 和 `bytes_written.clear()` 调用。
- **置信度**: 中
- **级别**: 中等

### 2.5 [轻微] 旧版 store 未迁移清理

- **位置**: `storage.ts` L49-69
- **现象**: `onupgradeneeded` 保留了升级前的 `sessions`、`events`、`console_logs`、`error_log` 四个旧 store，仅做 `if (!exists) create`，从未删除。
- **影响**: 从 v1 升级到 v3 的用户，IDB 中残留 4 个无效 store，占用空间但无功能影响。`events` 和 `console_logs` 的 keyPath 使用 `['session_id', 'relative_time']`（旧字段名），与新 schema 不兼容。
- **建议**: 在下一次 DB 版本升级时（v4），清理旧 store。
- **置信度**: 高
- **级别**: 建议

### 2.6 [轻微] bytes 统计使用 JSON.stringify 近似

- **位置**: `storage.ts` L372
- **现象**: `update_bytes_written(capture_id, JSON.stringify(item).length)` 用 JSON 序列化长度估算 IDB 存储大小。IndexedDB 使用 structured clone 存储，实际存储大小可能与 JSON 字符串长度有差异（如二进制数据、特殊对象）。
- **影响**: 500MB 限制的判断略有偏差，但作为近似值可接受。structured clone 通常比 JSON 紧凑（对二进制数据），因此实际可能低估存储消耗。
- **建议**: 如果 precision 不重要可保持现状；如需精确，可累积 structured clone 后的大小或使用 `navigator.storage.estimate()`。
- **置信度**: 中
- **级别**: 建议

---

## 三、采集状态管理

### 3.1 [中等] handle_event 写入与 stop_capture 之间的数据窗口

- **位置**: `service_worker.ts` L484（同步设 false） vs L571（检查 is_capturing）
- **现象**: `stop_capture` 在 L484 同步设置 `is_capturing = false`，之后才开始异步清理。而 `handle_event` 在 L571 检查 `is_capturing`。由于 JS 单线程，不存在真正并发竞态。但在 `is_capturing = false` 设置前已经进入 `handle_event` 的异步调用（如 `write_events` 的 await 之后）可能仍持有引用。
- **影响**: 实际影响极小——`handle_event` 内部仅写入 IDB 和更新 stats，stop 后的最后几个事件仍会被正常持久化，不会导致数据损坏。
- **建议**: 当前设计可接受。如需更强保证，可在 `handle_event` 和 `handle_network_request` 中增加 `current_capture_id` 与当前活跃 capture_id 比对。
- **置信度**: 中
- **级别**: 轻微

---

## 四、stream_buffer.ts

### 4.1 [轻微] 无单请求 buffer 上限

- **位置**: `stream_buffer.ts` L40-57
- **现象**: `append` 仅在字节数达到 `byte_threshold`（默认 16KB）时触发 flush。如果网络连接异常导致 chunk 持续到达但从不触发阈值（chunk 极小），或者 `time_threshold_ms` 极大，单个 `BufferEntry` 可能无限增长。
- **影响**: 极端场景下单个 request_id 可积累数 MB chunk，join 时一次性拼接可能在内存中产生大字符串。
- **建议**: 增加 `max_buffer_bytes` 配置项（如 10MB），超限时强制 flush 或丢弃并告警。
- **置信度**: 中
- **级别**: 建议

---

## 五、webrequest_handler.ts

### 5.1 [中等] is_self_origin_url 过度过滤所有 localhost 流量

- **位置**: `webrequest_handler.ts` L325-336
- **现象**: `is_self_origin_url` 将所有 `hostname === '127.0.0.1'` 或 `hostname === 'localhost'` 的请求视为自身流量并跳过。对于本地开发者在 localhost 上运行被测应用时，所有业务请求都会被静默丢弃。
- **影响**: 用户无法采集与 localhost 服务的网络交互。设计意图是过滤 Bridge 自身流量，但过滤面过大。
- **建议**: 增加端口判断——仅过滤目标端口等于 Bridge 端口或开发服务器的请求。或通过配置项让用户指定忽略列表。
- **置信度**: 高
- **级别**: 中等

### 5.2 [轻微] CDP-priority 模式下 webRequest 被完全跳过无降级

- **位置**: `webrequest_handler.ts` L34, L85
- **现象**: 当 `dbg_tab_id !== null` 时，所有 `handle_before_request`、`handle_completed` 等方法立即 return，完全依赖 CDP 提供网络数据。如果 CDP `Network` domain 未能捕获某类请求（如某些 resource type CDP 不支持），该请求完全丢失。
- **影响**: 在 debugger 附着的标签页中，非标准资源类型的网络请求可能漏采。
- **建议**: `handle_completed` 中增加 CDP 查找失败后的 webRequest fallback 写入，而非仅等待 deferred timeout。
- **置信度**: 中
- **级别**: 轻微

### 5.3 [轻微] deferred timeout 硬编码且不可配置

- **位置**: `webrequest_handler.ts` L153, L173
- **现象**: `setTimeout(..., 1500)` 固定 1500ms 等待 CDP body 到达。如果 CDP body 因网络延迟超过 1.5 秒才到达，webRequest 已超时释放，body 数据被孤立。
- **影响**: 慢速响应可能丢失 response body。
- **建议**: 将 `DEFERRED_TIMEOUT_MS` 提取为可配置常量，或基于响应大小动态调整超时。
- **置信度**: 中
- **级别**: 建议

---

## 六、并发与升级安全

### 6.1 升级安全

- **DB 升级**: `onupgradeneeded` 使用 `if (!exists) create` 模式，支持 v1->v2->v3 连续升级，不丢数据。设计安全。
- **旧 store 保留**: v1 的 `sessions`、`events`、`console_logs`、`error_log` 保留不删除，数据安全但占用空间（见 2.5）。
- **SW 重启**: `cleanup_stale_capture_state` 通过 `chrome.storage.local` 持久化的 `is_capturing` 标记检测上次未正常停止的采集，并标记为 `completed`。但 `bytes_written` 内存态丢失（见 2.1）。

### 6.2 并发安全

- **JS 单线程保证**: 所有 SW 代码运行在单线程事件循环中，不存在真正并发写 IDB。
- **异步操作间状态一致**: `stop_capture` 先同步设置 `is_capturing = false` 再做异步清理，防止新事件进入。但已在飞行中的异步操作（如 `write_events` await 之后）可能短暂持有过期引用。
- **flush 竞态**: `flush_store` 的 `buf.splice(0)` 是原子操作（JS 单线程），`flush_all` 和定时器 flush 不会重复 flush 同一批数据。安全。
- **delete_capture 跨 store 非原子**: 见 2.3。

---

## 七、测试覆盖评估

### 已有测试

| 测试文件 | 覆盖范围 | 质量 |
| -------- | -------- | ---- |
| `service_worker_bridge_initialization.test.ts` | Bridge 初始化正常/异常路径 | 良好 |
| `service_worker_stale_cleanup.test.ts` | SW 重启 stale 状态清理 | 良好 |
| `sw_action_contract.test.ts` | UI action 与 SW handler 契约 | 良好 |
| `tab_events.test.ts` | tab URL 去重、事件构造 | 良好 |
| `stop_capture.test.ts` | stop 消息协议、核心停止行为 | 良好 |
| `stream_buffer.test.ts` | 字节/时间阈值、force_flush、并发追加 | 良好 |
| `storage.test.ts` | 仅 2 个基础 case | 严重不足 |
| `storage_helpers.test.ts` | query_by_store 签名验证 | 不足 |

### 缺失测试

- `handle_event`/`handle_network_request`/`handle_console_log` 的事件路由逻辑无单元测试
- `handle_message` 各 action 分支的集成测试缺失（仅契约测试验证 action 名）
- `onActivated` 和 `onUpdated` 中的 CDP 重试逻辑无测试
- `handle_completed` 的 CDP 匹配、deferred、超时路径无测试
- `delete_capture` 部分失败场景无测试
- `flush_store` 事务失败恢复无测试
- `find_matching_cdp_request`/`find_cdp_candidates` 匹配逻辑无单元测试

---

*报告结束*
