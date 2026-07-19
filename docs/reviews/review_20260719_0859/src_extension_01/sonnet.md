# src_extension_01 审阅报告

**审阅模型**: Sonnet
**审阅范围**: 8 文件, 1550 行
**审阅维度**: correctness、安全、Bridge 路由、命令处理、存储与隐私

---

## 1. agent_bridge_client.ts

### 1.1 Bridge 401 重入后 instance_id 可能复用旧值

**位置**: `src/extension/background/agent_bridge_client.ts:240`
**现象**: `handle_401` 中重入逻辑使用 `runtime_instance_id || await generate_instance_id()`，若 `runtime_instance_id` 已有值（来自之前成功 enroll），会复用旧 instance_id。
**影响**: 中。服务端可能拒绝旧 instance_id 的重入请求（如果服务端实现要求新 ID），或产生身份混淆。
**建议**: 401 重入应始终生成新 instance_id，避免潜在身份冲突。
**置信度**: 中
**级别**: 建议

### 1.2 Token 存储在内存变量中

**位置**: `src/extension/background/agent_bridge_client.ts:20`
**现象**: `session_token` 仅存储在模块级变量，Service Worker 重启后丢失，需重新 enroll。
**影响**: 低。设计如此，Service Worker 生命周期短暂，需持久化 session（通过 `save_bridge_session`）。但 `session_token` 本身未持久化，仅依赖 IndexedDB 中的 session 记录。
**建议**: 确认 `save_bridge_session` 的持久化覆盖完整（instance_id + instance_token），当前实现已满足。
**置信度**: 高
**级别**: 无问题

### 1.3 错误日志节流可能导致问题掩盖

**位置**: `src/extension/background/agent_bridge_client.ts:328-343`
**现象**: `log_bridge_error` 对每个 category 节流 60 秒，连续错误仅记录首次。
**影响**: 低。避免日志洪泛，但可能掩盖快速变化的错误模式（如 HTTP 状态码切换）。
**建议**: 可考虑记录错误切换（如从 500 变为 403），当前实现可接受。
**置信度**: 高
**级别**: 无问题

### 1.4 enroll 请求缺少超时控制

**位置**: `src/extension/background/agent_bridge_client.ts:257-271`
**现象**: `fetch` 调用未设置 `AbortController` 或 `signal`，若服务端无响应，请求可能长时间挂起。
**影响**: 中。Service Worker 可能因长时间挂起的 fetch 被浏览器终止（30 秒超时），或阻塞后续 poll 循环。
**建议**: 为 `enroll`、`send_heartbeat`、`fetch_command`、`send_result` 添加 `AbortController`，设置合理超时（如 10 秒）。
**置信度**: 高
**级别**: 重要

---

## 2. agent_command_dispatcher.ts

### 2.1 capture_id 校验不一致

**位置**: `src/extension/background/agent_command_dispatcher.ts:154-159`
**现象**: `get_required_capture_id` 先检查 `typeof payload.capture_id === 'string' && payload.capture_id.length > 0`，但未校验格式（如是否包含非法字符）。
**影响**: 低。capture_id 由 `generate_capture_id()` 生成（UUID 格式），但外部输入可能包含路径遍历或注入字符（如 `../` 或 SQL 注入），虽 IndexedDB 不受 SQL 注入影响，但可能影响文件系统路径（如果用于导出）。
**建议**: 添加 capture_id 格式校验（如正则 `/^[a-zA-Z0-9_-]+$/`），或确认存储层已做转义。
**置信度**: 中
**级别**: 建议

### 2.2 sources 类型转换不安全

**位置**: `src/extension/background/agent_command_dispatcher.ts:196-202`
**现象**: `get_optional_sources` 将 `payload.sources as AgentDataSource[]`，但未校验每个 source 值是否在合法范围内。
**影响**: 中。非法 source 值会导致 `agent_data_queries.ts` 中 `get_source_records` 抛出 `SOURCE_NOT_FOUND` 错误，虽被捕获但返回 500 而非 400。
**建议**: 在 `get_optional_sources` 中校验每个 source 值是否属于 `ALL_SOURCES` 集合。
**置信度**: 高
**级别**: 重要

### 2.3 RECORDING_ALREADY_RUNNING 错误码命名

**位置**: `src/extension/background/agent_command_dispatcher.ts:99`
**现象**: 错误码 `RECORDING_ALREADY_RUNNING` 使用了"recording"术语，但项目禁止使用"录制/记录"相关术语。
**影响**: 低。术语违反 domain.md 约定，但不影响功能。
**建议**: 改为 `CAPTURE_ALREADY_RUNNING`（需同步更新 protocol.ts 中的 AgentErrorCode 定义）。
**置信度**: 高
**级别**: 建议

---

## 3. agent_data_queries.ts

### 3.1 FULL_DATA_LIMIT 内存风险

**位置**: `src/extension/background/agent_data_queries.ts:52`
**现象**: `FULL_DATA_LIMIT = 100000`，`load_agent_capture_data` 一次性加载所有 7 类数据源，每类最多 100K 条记录到内存。
**影响**: 高。长时间采集（如数小时）可能产生数十万条记录，一次性加载到内存可能导致：
- Service Worker OOM（内存限制约 100-500 MB）
- IndexedDB 游标长时间持有，阻塞其他事务
- 响应延迟（序列化大对象）
**建议**: 
1. 将 `load_agent_capture_data` 改为惰性加载（按需读取单个 source）
2. 或添加内存保护（如检查 `performance.memory.usedJSHeapSize`）
3. 或降低 `FULL_DATA_LIMIT` 至合理值（如 10000），并提供分页 API
**置信度**: 高
**级别**: 严重

### 3.2 get_native_record_id 生成不唯一

**位置**: `src/extension/background/agent_data_queries.ts:215-219`
**现象**: 若记录无 `event_id` 或 `request_id`，使用 `${get_record_sort_key(record)}:${get_record_absolute_time(record) ?? ''}` 作为 native_id，但 `relative_time_ms` + `absolute_time` 可能重复（如同一毫秒的多条事件）。
**影响**: 中。重复 native_id 会导致 `get_entry_from_capture_data` 返回错误记录（find 返回首个匹配）。
**建议**: 添加随机后缀或递增序号（如 `${sort_key}:${absolute_time}:${Math.random().toString(36).slice(2, 8)}`）。
**置信度**: 中
**级别**: 重要

### 3.3 timeline 排序未去重

**位置**: `src/extension/background/agent_data_queries.ts:119-132`
**现象**: `get_timeline_from_capture_data` 将多个 source 的记录合并后排序，但未去重（如同一条记录在不同 source 中重复出现）。
**影响**: 低。当前数据模型中各 source 互斥（user_action_events、network_requests 等），不存在重复。但若未来扩展导致 source 重叠，会产生重复。
**建议**: 当前可接受，添加注释说明数据模型保证。
**置信度**: 高
**级别**: 无问题

---

## 4. app_log_storage.ts

### 4.1 trim_if_needed 使用估算大小

**位置**: `src/extension/background/app_log_storage.ts:8-10`
**现象**: `estimate_entry_bytes` 仅估算 `message.length + module.length + 40`，忽略 `extra` 字段（JSON 对象可能很大）。
**影响**: 中。实际存储大小可能远超估算，导致 IndexedDB 存储超限（浏览器配额约 50-200 MB），触发 QuotaExceededError。
**建议**: 
1. 使用 `JSON.stringify(entry).length * 2`（UTF-16）估算
2. 或使用 `navigator.storage.estimate()` 检查总配额
3. 或限制 `extra` 字段大小（如最大 1KB）
**置信度**: 高
**级别**: 重要

### 4.2 flush 并发风险

**位置**: `src/extension/background/app_log_storage.ts:29-52`
**现象**: `flush` 使用 `this.buffer.splice(0)` 提取当前批次，但若 `flush` 被并发调用（如外部显式调用 + 定时器同时触发），可能导致：
- 两个 Promise 同时操作 IndexedDB 事务
- `trim_if_needed` 与 `flush` 竞争
**影响**: 低。IndexedDB 事务自动串行化，但可能产生意外的事务冲突（`TransactionInactiveError`）。
**建议**: 添加 `flushing` 标志位，避免重入：
```typescript
private flushing = false;
async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try { /* ... */ } finally { this.flushing = false; }
}
```
**置信度**: 中
**级别**: 建议

### 4.3 get_entries 分页逻辑低效

**位置**: `src/extension/background/app_log_storage.ts:54-105`
**现象**: `get_entries` 使用游标遍历跳过 offset 条记录，当 offset 很大（如 10000）时性能差。
**影响**: 低。日志条目通常有限（默认 100MB 限制），但若用户频繁查询历史日志，可能体验不佳。
**建议**: 当前实现可接受，日志场景通常只查最近 N 条。
**置信度**: 高
**级别**: 无问题

---

## 5. body_capture_coordinator.ts

### 5.1 状态泄露风险

**位置**: `src/extension/background/body_capture_coordinator.ts:33-41`
**现象**: `coordinator_state` 是模块级变量，存储敏感信息（`external_session_key`），且未加密。
**影响**: 低。Service Worker 内存中，浏览器沙箱保护，但若有 XSS 注入扩展（通过 content script），可能读取。
**建议**: 确认 content script 隔离机制（MV3 使用 isolated world），当前实现安全。
**置信度**: 高
**级别**: 无问题

### 5.2 stop_body_capture 缺少 deps 参数

**位置**: `src/extension/background/body_capture_coordinator.ts:164-177`
**现象**: `stop_body_capture` 无 `deps` 参数，无法调用 `stop_external_cdp`（需要 `get_bridge_config`）。仅清理定时器和状态。
**影响**: 中。外部 CDP bridge 会话未显式停止，服务端可能残留会话（需超时清理）。
**建议**: 使用 `stop_body_capture_with_cleanup` 替代 `stop_body_capture`，或合并两个函数。
**置信度**: 高
**级别**: 重要

### 5.3 try_external_cdp_bridge 异常吞没

**位置**: `src/extension/background/body_capture_coordinator.ts:249`
**现象**: `catch` 块为空（`catch { return null; }`），吞没所有异常。
**影响**: 低。外部 CDP bridge 可选功能，失败应降级到 fallback hook。但异常信息丢失，难以调试。
**建议**: 添加日志记录：
```typescript
catch (error) {
    logger.warn('External CDP bridge failed', { error: String(error) });
    return null;
}
```
**置信度**: 高
**级别**: 建议

---

## 6. cdp_event_router.ts

### 6.1 attached_sessions 内存泄漏

**位置**: `src/extension/background/cdp_event_router.ts:5`
**现象**: `attached_sessions` 是模块级 Set，仅通过 `unregister_session` 和 `clear_sessions` 清理。若调用方忘记清理，会话 ID 永久累积。
**影响**: 低。会话 ID 为短字符串（如 `"1234.5"`），内存占用小。但长时间运行可能积累数千条。
**建议**: 在 `stop_body_capture_with_cleanup` 中调用 `clear_sessions`，或添加定时清理（如每小时清理 1 小时前的会话）。
**置信度**: 中
**级别**: 建议

### 6.2 should_handle_event 过滤逻辑

**位置**: `src/extension/background/cdp_event_router.ts:27-36`
**现象**: 仅检查 `tabId` 和 `sessionId`，未检查 `frameId`（子帧事件可能不属于目标 tab）。
**影响**: 低。CDP 事件路由设计如此，frameId 由上层（cdp_handler.ts）处理。
**建议**: 无需修改，设计合理。
**置信度**: 高
**级别**: 无问题

---

## 7. 国际化文件 (messages.json)

### 7.1 缺少 description 字段

**位置**: `src/extension/_locales/en/messages.json:1-8`, `src/extension/_locales/zh_CN/messages.json:1-8`
**现象**: 仅包含 `name` 和 `description`，缺少其他常用字段（如 `action.default_title`、`command.description`）。
**影响**: 低。manifest.json 中的 `default_title` 使用硬编码英文，未国际化。
**建议**: 如需完整国际化，添加 `action.default_title`、`command.description` 等字段。
**置信度**: 高
**级别**: 建议

---

## 审阅总结

### 严重问题 (1)
1. **agent_data_queries.ts:52** — `FULL_DATA_LIMIT = 100000` 一次性加载所有数据，OOM 风险高。

### 重要问题 (4)
1. **agent_bridge_client.ts:257-271** — fetch 请求缺少超时控制。
2. **agent_command_dispatcher.ts:196-202** — sources 类型转换不安全。
3. **agent_data_queries.ts:215-219** — native_id 生成不唯一。
4. **body_capture_coordinator.ts:164-177** — stop_body_capture 未清理外部 CDP 会话。

### 建议问题 (6)
1. **agent_bridge_client.ts:240** — 401 重入应生成新 instance_id。
2. **agent_command_dispatcher.ts:154-159** — capture_id 格式校验。
3. **agent_command_dispatcher.ts:99** — 错误码术语违反约定。
4. **app_log_storage.ts:8-10** — 日志大小估算不准确。
5. **app_log_storage.ts:29-52** — flush 并发风险。
6. **cdp_event_router.ts:5** — sessions 未自动清理。

### 无问题 (5)
1. **agent_bridge_client.ts:20** — token 存储设计合理。
2. **agent_bridge_client.ts:328-343** — 错误日志节流设计合理。
3. **agent_data_queries.ts:119-132** — timeline 排序无重复（数据模型保证）。
4. **app_log_storage.ts:54-105** — get_entries 分页可接受。
5. **body_capture_coordinator.ts:33-41** — 状态存储安全。

---

**审阅完成时间**: 2026-07-19
**审阅结论**: 发现 1 个严重问题（OOM 风险）、4 个重要问题、6 个建议问题。建议优先修复严重和重要问题。
