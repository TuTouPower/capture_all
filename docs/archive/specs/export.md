# Spec — export

导出格式：JSON / JSONL / HTML / HAR。

## 格式

### JSON

完整快照：CaptureRecord + 所有事件（按 relative_time_ms 排序）+ 网络请求 + 控制台事件。加 system_time 绝对时间。

### JSONL

逐行 JSON：
- 第一行：capture 元数据（type: 'capture'）。
- 后续：每个 event / network_request / console_log 一行。

### HTML

自包含报告：
- `<script>` 内嵌 JSON（`escape_for_html_embed` 转义）。
- 摘要面板：capture_id / start_time / duration / event_count / request_count / log_count / body_capture_info。
- 所有动态 HTML 字段经 `escape_html` 转义（T044）。

### HAR

HTTP Archive 1.2 格式：
- entries 数组，每个含 request/response/timings。
- request.bodySize / response.content.size / response.bodySize 用 UTF-8 字节（优先 request_body_bytes/response_body_bytes，缺失时 utf8_byte_len）。
- base64 body 标注 encoding。

## 数据加载

分页聚合（T043 替代固定 100000 截断）：
- `get_all_events_by_category(capture_id, category)` / `get_all_network_requests(capture_id)` / `get_all_console_events(capture_id)`。
- PAGE_SIZE=5000，循环 offset 直至 batch.length < PAGE_SIZE 或空。
- Promise.all 并行加载 7 类数据。

## 导出选项

| 选项 | 说明 |
|------|------|
| include_response_body | false 时 strip response_body 字段 |

## app_logs 导出

`export_app_logs`：按 level/filter 导出 IndexedDB app_logs store。
