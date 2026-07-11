# 应用日志

实现：`src/shared/logger.ts` + `src/background/app_log_storage.ts`。独立于采集数据，用于调试扩展自身。

## 1. 存储

IndexedDB `app_logs` store（`capture_all_db` 内）：

| 字段 | 说明 |
|---|---|
| `id` | keyPath |
| `level` | 索引：debug / info / warn / error |
| `module` | 索引：模块名 |
| `timestamp` | 索引 |
| `message` | 日志内容 |
| 上下文 | 附加字段 |

与采集事件 store 完全隔离。

## 2. 配置

`DEFAULT_USER_CONFIG`：

```typescript
log_level: 'debug',       // 默认 debug
log_max_size_mb: 100      // 最大 100MB
```

## 3. 使用规则

- 优先用 `logger.ts`，禁止 `console.log` / `print` 调试输出进入提交（见 `conventions.md` §7）。
- UI 层给用户友好提示，后台层记详细上下文到 `app_logs`。

## 4. 导出

支持日志独立导出（`log_export` id，文件名 `log_{date}.{ext}`），保存位置记忆与采集导出分离。见 `export_zip.md`。

## 5. 关键文件

- `src/shared/logger.ts` — 日志模块。
- `src/background/app_log_storage.ts` — `app_logs` store CRUD。
