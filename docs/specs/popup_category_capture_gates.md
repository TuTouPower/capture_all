# Spec — Popup 分类开关门控采集类别

Popup 分类开关（用户行为/页面导航/控制台/网络/错误异常/Storage/Cookie）映射到采集门控：关闭时新 start 的 capture 不写入对应类别事件。

## 开关映射

| popup 开关 | 门控字段 | 生效范围 |
|-----------|---------|---------|
| request_count | capture_network | SW network/websocket + content network_hook |
| log_count | capture_console | SW console |
| event_count | event_count_enabled | content 全部 user_action 生产者（mouse/keyboard/scroll/dom/clipboard/form_submit/focus/resize/fullscreen/print） |
| nav_count | nav_count_enabled | content page_load/route_change/dom_ready/visibility + SW tab_switch/tab_created/tab_url_change |
| error_count | error_count_enabled | SW exception_capture（含 tab 切换/URL 重试路径，独立于 console） |
| storage_change_count | storage_change_count_enabled | content storage_capture |
| cookie_change_count | cookie_change_count_enabled | SW cookie_capture |

开关缺省视为 true（`!== false` 判断）。

## 相关实现

- `src/shared/types.ts`：CaptureConfig 类别开关字段
- `src/extension/background/service_worker.ts`：cookie/exception/nav 门控
- `src/extension/content/content_script.ts`：event/storage/nav 门控
- `tests/unit/popup_category_capture_gates.test.ts`：静态门控断言
