# Spec — storage

IndexedDB 存储：DB 结构、写入语义、容量限制、升级路径。

## DB 基本信息

- DB 名：`capture_all_db`
- 版本：3
- 容量上限：500MB（`MAX_SESSION_SIZE_BYTES`）
- 时长上限：24h（`MAX_SESSION_DURATION_MS`）

## Object Stores（10 个）

| Store | keyPath | 索引 | 用途 |
|-------|---------|------|------|
| captures | capture_id | started_at | CaptureRecord |
| user_action_events | event_id | capture_id, timestamp | 用户行为事件 |
| navigation_events | event_id | capture_id, timestamp | 页面导航事件 |
| network_requests | event_id | capture_id, timestamp | 网络请求事件 |
| console_events | event_id | capture_id, timestamp | 控制台事件 |
| error_events | event_id | capture_id, timestamp | 错误异常事件 |
| storage_changes | event_id | capture_id, timestamp | Storage 变更 |
| cookie_changes | event_id | capture_id, timestamp | Cookie 变更 |
| capture_lifecycle_events | event_id | capture_id, timestamp | 采集生命周期事件 |
| app_logs | id | timestamp, level, module | 应用日志 |

所有事件 store 的 keyPath 为 `event_id`（UUID 格式 `evt_<crypto.randomUUID()>`）。

## 写入语义

### 立即落库（T038 durability）

write_events / write_network_requests / write_console_events 每次调用**立即 await flush_store**（不依赖批量 buffer）。调用方收到成功前数据已入 IndexedDB。

### 事务边界（T035）

- create_capture / update_capture：`tx.oncomplete` resolve，`tx.onerror/onabort` reject（不以 request.onsuccess 为成功）。
- flush_store：`tx.oncomplete` 后累计 bytes_written；`tx.onerror/onabort` 时 batch 按原顺序放回 buffer 头部供重试。

### delete_capture（T036 单事务）

单一 readwrite 事务覆盖全部 9 个 store（captures + 8 事件 store）。tx.oncomplete resolve。

### app_log 分页（T049）

- 终止条件：`results.length >= limit`（不再多返回 offset 条）。
- estimate_entry_bytes：`TextEncoder().encode(JSON.stringify(entry)).length`（含 details/stack，按 UTF-8 字节）。
- flush 失败 batch 放回 buffer + tx.onabort reject。

## 容量统计

- bytes_written：累计用 `json_byte_length(item)`（TextEncoder UTF-8 字节）。
- flush_store tx.oncomplete 后累计。
- check_storage_limit 按 capture_id 检查。

## 升级路径

v1 → v2 → v3：
- 不得丢 records。
- v1 旧 stores（sessions/events/console_logs/error_log）保留不迁移（deprecated alias 只映射函数名，不读旧数据）。
- v2/v3 新增 store 在 upgrade transaction 内创建。

## IndexedDB 初始化

- `init_db()` 缓存 `opening_promise`（并发 open 复用）。
- `db.onversionchange` 自动 close（未来版本升级不被旧连接阻塞）。
