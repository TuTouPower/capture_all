# Storage（IndexedDB）

采集数据持久化。用户配置走 `chrome.storage.local`，不在此。

## 1. 数据库

- 名称：`capture_all_db`（`DB_NAME`）。
- 版本：`3`（`DB_VERSION`）。
- 封装：`src/extension/background/storage.ts`。

## 2. Stores

| Store | keyPath | 索引 | 内容 |
|---|---|---|---|
| `captures` | `capture_id` | `started_at` | CaptureRecord |
| `user_action_events` | `event_id` | `capture_id`, `type`, `relative_time_ms` | 用户操作 |
| `navigation_events` | `event_id` | `capture_id`, `relative_time_ms` | 页面导航 |
| `network_requests` | `event_id` | `capture_id`, `url`, `relative_time_ms` | 网络请求 |
| `console_events` | `event_id` | `capture_id`, `level`, `relative_time_ms` | 控制台 |
| `error_events` | `event_id` | `capture_id`, `relative_time_ms` | 运行时异常 |
| `storage_changes` | `event_id` | `capture_id`, `relative_time_ms` | Storage 变更 |
| `cookie_changes` | `event_id` | `capture_id`, `relative_time_ms` | Cookie 变更 |
| `capture_lifecycle_events` | `event_id` | `capture_id`, `relative_time_ms` | 采集生命周期 |
| `app_logs` | `id` | `level`, `module`, `timestamp` | 应用日志 |

所有事件 store 统一 `event_id`（UUID）作 keyPath，避免复合主键 `[capture_id, relative_time_ms]` 高频碰撞。`capture_id` 作索引支持按采集查询。

Console 和 Error 分两个独立 store（console.error() ≠ 运行时异常）。

定义在 `src/shared/constants.ts` 的 `STORE_NAMES`。

## 3. 写入流程

```
事件源（content script / background capture）
  → service_worker 规范化（生成 event_id + 公共字段）
  → 按 category 路由到对应 store
  → storage.ts 批量缓冲
  → flush（批次 100，间隔 1000ms）写 IndexedDB
  → stopCapture 时强制 flush 所有未写入数据
```

`category → store` 路由在 `storage.ts`。泛型查询辅助 `query_by_store`。

## 4. 读取流程

查询统一通过 `capture_id` 索引聚合：

- Agent 数据查询：`agent_data_queries.ts` 按 source 列记录、分页、时间过滤、timeline 合并。
- Dashboard 详情：`capture_data_reader.ts` 读单采集全量。
- 实时计数：`capture_stats.ts` 按 category 聚合 → 7 标签。

读取活跃采集数据前必须先 flush（P043：`tests/p043_flush_before_read.test.ts`）。

## 5. 大小限制

| 限制 | 值 |
|---|---|
| 单采集 | 500 MB（`MAX_SESSION_SIZE_BYTES`） |
| 单采集时长 | 24 小时（`MAX_SESSION_DURATION_MS`） |
| 单条 body | 100 MB（`MAX_BODY_CAPTURE_BYTES`） |
| 单条 inline_text | 32 KB（`INLINE_TEXT_MAX_BYTES`） |
| 单条 console arg | 1 KB（`MAX_CONSOLE_ARG_BYTES`） |
| target_text 预览 | 100 字符（`MAX_TARGET_TEXT_CHARS`） |
| flush 批次 | 100（`FLUSH_BATCH_SIZE`） |
| flush 间隔 | 1000 ms（`FLUSH_INTERVAL_MS`） |

大小截断与脱敏分离：截断永远生效，不受 `redact_data` 开关影响。

## 6. 兼容层

旧数据可能含 `session_id` 字段；读取层自动映射为 `capture_id`（`tests/p060_capture_id.test.ts` / `entry_unification.test.ts`）。`Session` / `RecordEvent` 类型保留 `@deprecated` 指向新类型，仅为迁移，新代码禁用。

## 7. 关键文件

- `src/extension/background/storage.ts` — IndexedDB CRUD + flush + store 路由。
- `src/extension/background/app_log_storage.ts` — `app_logs` store 专用。
- `src/shared/constants.ts` — `STORE_NAMES` / 大小限制常量。
- `src/shared/capture_data_reader.ts` — 单采集读取。
- `src/shared/capture_stats.ts` — 7 标签统计。
- `src/extension/background/agent_data_queries.ts` — Agent 查询。
