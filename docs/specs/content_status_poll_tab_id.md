# Spec — content status poll 使用本 tab id

content 脚本轮询恢复/启动采集时，使用本 frame 所在 tab 的 id，而非全局 active tab id。

## 语义

- SW `get_status` 响应 `tab_id` 以请求方 `sender.tab.id` 权威优先；无 sender.tab（popup 等）时回退 `current_capture.tab_id`。
- content `on_active` 使用 `resp.tab_id` 启动采集，capture 事件 tab_id 与本 tab 一致，多 tab 同时 poll 不串台。

## 相关实现

- `src/extension/background/service_worker.ts`：`handle_message` get_status 按 sender 权威
- `src/extension/content/content_script.ts`：`on_active` 用 `resp.tab_id`
- `tests/unit/status_poll_sender_tab.test.ts`：sender 权威 / 采集进行中 tab 不同 / 契约测试
