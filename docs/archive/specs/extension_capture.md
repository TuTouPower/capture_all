# Spec — extension_capture

扩展侧采集能力：content script 事件采集、background CDP/webRequest 网络、3 级网络路径优先级、CaptureConfig、子目标 auto-attach。

## 数据类别（7 类）

| 类别 | 事件类型 | 来源 | 存储 store |
|------|---------|------|-----------|
| 用户行为 | mouse_event / keyboard_event / scroll_event / input_event / clipboard_write / clipboard_read / form_submit / focus_event / resize_event / fullscreen_change / print_event | content script | user_action_events |
| 页面导航 | page_navigation / route_change / page_load / tab_switch / tab_created / tab_url_change / dom_ready / visibility_change | content + background | navigation_events |
| 网络请求 | network_request / ws_frame / ws_message | background (CDP + webRequest) | network_requests |
| 控制台 | console_event | background (CDP Runtime.consoleAPICalled) | console_events |
| 错误异常 | runtime_exception / unhandled_rejection / resource_error / network_failed / capture_error | background (CDP Runtime.exceptionThrown) | error_events |
| Storage | storage_change | content script (localStorage/sessionStorage hook) | storage_changes |
| Cookie | cookie_change | background (chrome.cookies.onChanged) | cookie_changes |

生命周期事件（capture_started / capture_stopped / capture_config_changed / permission_missing / debugger_attach_status / body_capture_status_changed）存入 capture_lifecycle_events。

## CaptureConfig

| 字段 | 默认值 | 说明 |
|------|--------|------|
| mouse_precision | clicks_scroll_drag | 鼠标精度：clicks / clicks_scroll_drag / full_trajectory |
| capture_console | true | 控制台采集 |
| capture_network | true | 网络请求采集 |
| keyboard_capture_mode | shortcuts | 键盘：none / shortcuts（仅修饰键组合）/ all |
| capture_input_values | true | 输入值采集 |
| capture_request_body | true | 请求体采集 |
| capture_response_body | true | 响应体采集 |
| max_body_capture_bytes | 104857600 (100MB) | 单条 body 上限 |
| inline_text_max_bytes | 32768 (32KB) | 内联文本上限 |
| redact_sensitive_headers | true | 敏感 header 脱敏 |
| redact_url_query | true | URL query 脱敏 |
| redact_data | true | 数据脱敏（key/code/value 等） |
| sample_rate_ms | 50 | 采样间隔（mousemove 等） |

## 网络采集路径（3 级优先级）

### 1. Extension CDP（`extension_cdp`）

扩展自身 `chrome.debugger.attach` → `Network.enable` + `Target.setAutoAttach(flatten:true)`。

- 主 target：Network domain（requestWillBeSent/responseReceived/loadingFinished/loadingFailed/dataReceived）。
- 子 target（iframe/worker/OOPIF）：auto-attach 后独立 sessionId，console/exception 路径对其 Runtime.enable。
- 流式响应（SSE/chunked）：`Network.streamResourceContent` + stream_buffer 累计拼接。
- 响应体：`Network.getResponseBody`（仅在 capture_response_body=true 时调用）。

**状态键**：所有 CDP 状态按 `${sessionId ?? 'root'}:${requestId}` 复合键索引，跨子目标隔离。

**capture_response_body=false**：不调 getResponseBody/streamResourceContent，事件 body_status='not_enabled'。

### 2. External CDP Bridge（`external_cdp_bridge`）

外部 Chrome `--remote-debugging-port` → Bridge 连接 CDP WebSocket → 扩展轮询 Bridge `/cdp/events`。

- body_capture_coordinator 单飞轮询（递归 setTimeout，500ms）。
- Bridge URL 仅允许 `http(s)://127.0.0.1`/`localhost`/`[::1]`（T052 allowlist）。
- tab_url 非空时精确匹配 CDP target，无匹配 fail fast（T061）。

### 3. Fallback Hook（`fallback_hook`）

content script 注入页面脚本 monkey-patch fetch/XHR（最后兜底，无 CDP 时使用）。

- 注入 guard `__capture_all_network_hook__` 防重复。
- postMessage 从 page world → content script（origin + source 校验）。

## Content Script 事件采集

所有 content 模块通过 `create_content_event()` 统一构造标准事件（含 event_id/source/severity/redaction_status/raw_available/created_at）。

模块清单：
- mouse_capture（click/wheel/drag/move，精度按 config）
- keyboard_capture（keydown/keyup，shortcuts 模式仅修饰键组合 + redact_data 脱敏 key/code）
- scroll_capture
- dom_capture（input/change/focusin/focusout → input_event）
- form_submit_capture（form_action 走 redact_url）
- storage_capture（localStorage/sessionStorage hook，tab_id 传入）
- network_hook（fetch/XHR fallback）
- clipboard_capture
- focus_capture
- visibility_capture
- resize_capture
- fullscreen_capture
- print_capture
- websocket_capture（单内部 listener 采集，原生 listener 语义保留）

## SSE 流式响应

stream_buffer 累计拼接 chunks 到 `meta.response_body`，每次 flush 检查累计字节：
- 超 `max_body_capture_bytes`：停止追加 + 标 `too_large`。
- 已标 too_large 的后续 chunk 跳过。
- loadingFinished 时优先尊重 on_flush 标注。

## 重定向链

CDP 重定向复用 requestId + 携带 `params.redirectResponse`。
- 检测到 redirectResponse 时先用 redirectResponse 填充 existing meta（status/headers/mime），立即 emit 前一跳事件。
- 再 set 新 meta（覆盖），redirect_count 累加。

## Cookie scope

`chrome.cookies.onChanged` 全局事件，按目标 tab URL domain 过滤：
- extract_target_domains 从 tab URL hostname 提取所有父域（含 dot 前缀）。
- cookie.domain 匹配目标 domain 集合才采集；不匹配跳过。
- tab_id 使用传入的目标 tab_id（不硬编码 0）。
