# Cookie 捕获

通过 `chrome.cookies` API 捕获 Cookie 变化，作为 7 数据标签之一。

## 1. 权限

`manifest.json`：`permissions: ["cookies"]`，`host_permissions: ["<all_urls>"]`。

## 2. 采集

`src/extension/background/cookie_capture.ts` 监听 `chrome.cookies.onChanged`，每次变化产出 `cookie_change` 事件（category=`cookie`）。

变化类型：

- 新增（cause=`explicit` / `inserted`）
- 修改
- 删除（cause=`explicit` / `expired` / `evicted` / `overwrite`）

## 3. 事件结构

公共字段见 `capture_core.md` §4。data 含 cookie domain / name / path / value（脱敏后）/ storeId / hostOnly / secure / httpOnly / sameSite / expirationDate 等。

value 受 `redact_data` 脱敏（标 `redaction_status`），截断由 `max_body_capture_bytes` 类策略约束。

## 4. 存储

写入 `cookie_changes` store（keyPath=`event_id`，索引=`capture_id`）。见 `storage_indexeddb.md`。

## 5. 统计

`capture_stats.ts` 聚合 `cookie_change_count`，对应 UI 标签 "Cookie"。

## 6. 关键文件

- `src/extension/background/cookie_capture.ts`
