# Spec — capture_all

## 背景

Chrome MV3 扩展，采集浏览器内的用户行为、页面导航、网络请求、控制台、错误异常、Storage、Cookie 7 类数据，并通过本地 Bridge + MCP 服务端供 AI Agent 调用。所有数据本地 IndexedDB，不入云。

## 架构

三产品 + 共享层：

```
src/
├── extension/          # Chrome MV3 扩展
│   ├── background/     # Service Worker（采集调度、CDP、IndexedDB）
│   ├── content/        # Content Script（页面事件采集）
│   ├── dashboard/      # 管理 UI（采集列表、详情、设置）
│   ├── devtools/       # DevTools 面板入口
│   ├── popup/          # 弹出窗口（快捷启停）
│   ├── shared/         # 扩展专用工具
│   └── manifest.json   # MV3 清单
├── bridge/             # 本地 HTTP Bridge（Node.js）
├── mcp/                # MCP 服务端（stdio → Bridge）
└── shared/             # 跨产品共享类型/常量/工具
```

构建产物（`npm run build`）：`artifacts/dist/`（扩展 zip）、`artifacts/bridge/`（bridge.mjs）、`artifacts/mcp/`（mcp.mjs）。

## 采集能力

### 数据类别（7 类）

| 类别 | 事件类型 | 来源 | 存储目标 store |
|------|---------|------|--------------|
| 用户行为 | mouse_event / keyboard_event / scroll_event / input_event / clipboard_write / clipboard_read / form_submit / focus_event / resize_event / fullscreen_change / print_event | content script | user_action_events |
| 页面导航 | page_navigation / route_change / page_load / tab_switch / tab_created / tab_url_change / dom_ready / visibility_change | content + background | navigation_events |
| 网络请求 | network_request / ws_frame / ws_message | background (CDP + webRequest) | network_requests |
| 控制台 | console_event | background (CDP Runtime.consoleAPICalled) | console_events |
| 错误异常 | runtime_exception / unhandled_rejection / resource_error / network_failed / capture_error | background (CDP Runtime.exceptionThrown) | error_events |
| Storage | storage_change | content script (localStorage/sessionStorage hook) | storage_changes |
| Cookie | cookie_change | background (chrome.cookies.onChanged, 按 tab domain 过滤) | cookie_changes |

生命周期事件（capture_started / capture_stopped / capture_config_changed / permission_missing / debugger_attach_status / body_capture_status_changed）存入 capture_lifecycle_events。

### 采集配置（CaptureConfig）

| 字段 | 默认值 | 说明 |
|------|--------|------|
| mouse_precision | clicks_scroll_drag | 鼠标精度：clicks / clicks_scroll_drag / full_trajectory |
| capture_console | true | 控制台采集 |
| capture_network | true | 网络请求采集 |
| keyboard_capture_mode | shortcuts | 键盘：none / shortcuts（仅修饰键）/ all |
| capture_input_values | true | 输入值采集 |
| capture_request_body | true | 请求体采集 |
| capture_response_body | true | 响应体采集 |
| max_body_capture_bytes | 104857600 (100MB) | 单条 body 上限 |
| inline_text_max_bytes | 32768 (32KB) | 内联文本上限 |
| redact_sensitive_headers | true | 敏感 header 脱敏 |
| redact_url_query | true | URL query 脱敏 |
| redact_data | true | 数据脱敏（key/code/value 等） |
| sample_rate_ms | 50 | 采样间隔 |

### 网络采集路径（优先级）

1. **Extension CDP**（`extension_cdp`）：扩展自身 attach debugger → Network.enable + Target.setAutoAttach(flatten)。子目标（iframe/worker/OOPIF）自动 Runtime.enable。
2. **External CDP Bridge**（`external_cdp_bridge`）：外部 Chrome --remote-debugging-port → Bridge 连接 CDP WebSocket → 扩展轮询 Bridge /cdp/events。
3. **Fallback Hook**（`fallback_hook`）：content script 注入页面脚本 monkey-patch fetch/XHR（最后兜底）。

状态键：所有 CDP 状态按 `${sessionId ?? 'root'}:${requestId}` 复合键索引（跨子目标隔离）。

### 隐私策略

- `type=password` **永远不采集**（DOM 采集层独立保护 + redact_password 优先于 redact_data）。
- `redact_data=true` 时：key/code/cookie value/password → [REDACTED]；URL query 中含 token/key/secret/password/passwd/auth/credential/jwt 子串的参数 → [REDACTED]（大小写不敏感）。
- `redact_sensitive_headers=true` 时：Authorization / Cookie / Set-Cookie / X-API-Key / X-CSRF-Token / Proxy-Authorization / WWW-Authenticate + 含 token/key/secret/bearer 的 header name/value → [REDACTED]。
- Logger 统一净化：message/details 中嵌入的 URL 子串自动走 redact_url；单条日志上限 64KB（TextEncoder UTF-8 字节）。
- Cookie 采集按目标 tab URL domain 过滤（不含跨站点 cookie）。

## 存储

IndexedDB `capture_all_db` v3，10 object stores：

| Store | keyPath | 索引 |
|-------|---------|------|
| captures | capture_id | started_at |
| user_action_events | event_id | capture_id, timestamp |
| navigation_events | event_id | capture_id, timestamp |
| network_requests | event_id | capture_id, timestamp |
| console_events | event_id | capture_id, timestamp |
| error_events | event_id | capture_id, timestamp |
| storage_changes | event_id | capture_id, timestamp |
| cookie_changes | event_id | capture_id, timestamp |
| capture_lifecycle_events | event_id | capture_id, timestamp |
| app_logs | id | timestamp, level, module |

写入语义：所有 write_events/write_network_requests/write_console_events 调用**立即 await flush_store**（每次写入即落库，不依赖批量 buffer）。flush 失败时 batch 按原顺序放回 buffer 头部重试。tx.oncomplete 为成功边界。

容量限制：500MB / 24h（`MAX_SESSION_SIZE_BYTES` / `MAX_SESSION_DURATION_MS`）。

## Bridge

Node.js HTTP 服务，仅绑定 `127.0.0.1`。`--port` 必须显式指定（入口无默认端口）。

### Token 模型（双 token）

| Token | 来源 | 保护路由 | 存储 |
|-------|------|---------|------|
| MCP token | CLI/env/persisted file(mode 0600)/Bridge 随机生成 | /mcp/* /cdp/* | SHA-256 hash |
| instance_token | Bridge 在 enroll 时为每个扩展实例生成 | /extension/* (与 MCP token 二选一) | SHA-256 hash |

优先级：CLI > env > persisted file > generated。

### 路由

| 路由 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| /health | GET | 无 | 健康检查 |
| /extension/discover | GET | 无 | 扩展发现 Bridge |
| /extension/enroll | POST | MCP token | 扩展登记（browser_label 顶替同 label 旧实例） |
| /extension/heartbeat | POST | instance_token | 心跳（携带 browser_label 同步） |
| /extension/command | GET | instance_token | 扩展拉取命令 |
| /extension/result | POST | instance_token | 扩展回报命令结果 |
| /pair | GET | 无 | 配对窗口（pairing code enroll） |
| /mcp/status | GET | MCP token | Bridge 状态 |
| /mcp/command | POST | MCP token | MCP 工具调用 → 转发到扩展 |
| /cdp/detect | POST | MCP token | 检测外部 CDP 端口 |
| /cdp/start | POST | MCP token | 连接外部 CDP WebSocket |
| /cdp/events | GET | MCP token | 轮询 CDP 网络事件 |
| /cdp/stop | POST | MCP token | 断开外部 CDP |

### 命令队列

每个扩展实例独立 `AgentCommandQueue`。命令 ID 全局唯一（`cmd_<counter>_<uuid>`）。`command_owners` 全局 Map 按 command_id → instance_id 索引。

实例顶替（同 browser_label enroll）：旧队列 `cancel_all()`（COMAND_CANCELLED resolve），清理 command_owners。

### 体积限制

| 路径 | 上限 |
|------|------|
| Bridge JSON body | 1 MiB |
| 扩展结果回传 | 64 MiB |
| 单条 body 截断 | 100 MB |
| CDP events 单次轮询 | 100 条 |

## MCP 工具集

17 个工具（15 主工具 + get_status/list_browsers 独立处理 + 2 别名对）：

| 工具 | Agent 命令 | 说明 |
|------|-----------|------|
| get_status | —（直接 Bridge status） | Bridge 状态 + 在线扩展列表 |
| list_browsers | —（从 status 提取） | 在线浏览器实例列表 |
| start_recording | capture.start | 启动采集 |
| stop_recording | capture.stop | 停止采集 |
| list_captures | captures.list | 采集列表（分页） |
| get_capture | captures.get | 采集元数据 |
| list_sessions | captures.list | 别名 |
| get_session | captures.get | 别名 |
| list_data_sources | sources.list | 数据源摘要 |
| list_records | data.list | 数据列表（分页，offset/limit 非负整数） |
| get_record | data.get | 单条详情 |
| get_timeline | timeline.list | 时间线（分页） |
| get_timeline_item | timeline.get | 时间线条目 |
| get_all_capture_data | capture.get_all_data | 全量数据（分页聚合，PAGE_SIZE=5000） |
| get_all_session_data | capture.get_all_data | 别名 |
| export_capture | capture.export | 导出（json/jsonl/html/har） |
| export_session | capture.export | 别名 |

路由参数：`target_label`（按 browser_label 路由）、`target_instance_id`（按实例 ID 路由）。多实例未指定 → `TARGET_REQUIRED`；显式 label 非唯一 → `TARGET_AMBIGUOUS`。

MCP 不自动脱敏、不自动摘要、不自动过滤、不提供删除/清空。

## Service Worker 状态机

```
idle ──start()──> starting ──ok──> capturing ──stop()──> stopping ──done──> idle
                    │                                          ▲
                    └──fail──> rollback ──────────────────────┘
```

- `capture_state.ts` 模块单例：phase / capture_id / start_time / config / generation。
- `run_exclusive` 串行化 start/stop（pending_promise 链）。
- generation token：每次 begin_start 递增；listener 入口捕获，await 后校验。
- 持久化：start 写 `active_capture_id`/`active_capture_start_ms`/`active_capture_config`/`active_capture_generation` 到 chrome.storage.local；stop 清空。
- SW 重启：cleanup_stale_capture_state 读持久化键，残留则 CaptureRecord 标 completed。
- stop drain 顺序：先停生产者 → flush_all → 翻 is_capturing=false → 写 stopped event + 最终 stats → 清持久化键 → idle。
- start 回滚：start_capture_inner_impl 抛错时调 stop_capture_inner 逆序清理。

## 导出

| 格式 | 说明 |
|------|------|
| JSON | 完整快照（capture + events + network + console） |
| JSONL | 逐行（capture / event / network_request / console_log） |
| HTML | 自包含报告（嵌入 JSON + 样式 + 摘要面板） |
| HAR | HTTP Archive 1.2（请求/响应条目） |

所有动态 HTML 字段经 `escape_html` 转义。HAR bodySize/content.size 用 UTF-8 字节。数据分页聚合（PAGE_SIZE=5000，循环至耗尽）。

## Dashboard

页面：captures（列表 + 搜索/筛选/状态过滤）、detail（详情 + 时间线/网络/控制台 tabs）、settings、current（当前采集）、exports（导出任务）。

轮询单飞（poll_in_flight）：2s 间隔，签名含 capture_id + status + event_count + request_count，变化时 render。detail 页活跃时增量加载。

## 硬约束

- Bridge 仅绑定 `127.0.0.1`。
- token 必须是用户提供或 Bridge 安全随机生成的强 token，禁止硬编码/默认/示例值。
- instance_token 不得访问 MCP/CDP 路由。
- IndexedDB 升级路径不得丢 records。
- HTML 导出必须转义动态内容。
- `type=password` 永远不采集。
- 脱敏与截断分离。
- 同一时间只允许一次活跃采集。
- MCP 不自动脱敏/摘要/过滤/删除。
- 生成物放 `artifacts/`，不入版本库。
- 禁止 `taskkill /F /IM chrome.exe` 类破坏性操作。

## 术语

- 英文 `capture`，中文"采集"。
- 禁用 `session`/`record`/`录制`/`记录` 作产品术语（兼容别名保留至 v2.0 移除）。
- 类型 `CaptureRecord`/`CaptureEvent`/`CaptureConfig`，标识 `capture_id`。
- MCP 命令 `capture.start`/`captures.list`/`data.list` 等。
