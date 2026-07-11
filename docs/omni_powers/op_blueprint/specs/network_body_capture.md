# 网络请求与 Body 捕获

网络请求采集 + 响应体三层降级架构。CDP console / exception 捕获也归此（同为 CDP 子系统）。

## 1. CDP-first 架构（P0.41 重构）

活跃 tab（CDP attached）的网络请求由 CDP 直接采集，不再依赖 webRequest + CDP 关联：

```
活跃 tab（CDP attached）:
  CDP Network.requestWillBeSent → 记录 url/method/headers/request body/resource_type
  CDP Network.responseReceived  → 更新 status_code/response_headers
  CDP Network.loadingFinished   → getResponseBody → 构建完整 NetworkRequestData → emit
  webRequest                    → 跳过（避免重复）

非活跃 tab:
  webRequest                    → 创建记录（URL/headers/request body）
  响应体                        → not_enabled（无法获取）
```

消除 webRequest ↔ CDP 时序竞态（P0.41 根因），页面加载时约 98% 请求不再丢失响应体。

## 2. capture_method 值域

| 值 | 含义 |
|---|---|
| `cdp_primary` | CDP-first：活跃 tab 由 CDP 直接构建完整记录 |
| `web_request` | webRequest 路径：非活跃 tab，无响应体 |
| `extension_cdp` | 旧路径（兼容保留）：webRequest + CDP body 关联 |
| `external_cdp_bridge` | 外部 CDP bridge 提供响应体 |
| `fallback_hook` | fetch / XHR 拦截 fallback |

## 3. 请求关联策略

仅非活跃 tab 需要：webRequest requestId 与 CDP requestId 不同，使用五元组匹配：

```
(method, normalized_url, timestamp_window_2s, status_code, resource_type)
```

活跃 tab 无需关联——CDP 直接构建完整记录。实现：`network_correlator.ts`。

## 4. Body 捕获三层降级

```
start capture（response_body=true）
  → BodyCaptureCoordinator.start()
  → try Extension CDP（chrome.debugger.attach）
      ├ success → Extension CDP Mode（cdp_primary）
      ├ another_debugger_attached
      │   ├ bridge enabled/available → External CDP Bridge Mode
      │   └ bridge unavailable → Fallback Hook Mode
      └ permission_denied / restricted_url / unknown → Fallback Hook Mode
```

| 模式 | 触发 | 能力 | 限制 |
|---|---|---|---|
| Extension CDP | `chrome.debugger.attach` 成功 | 完整 body | 与 F12 互斥 |
| External CDP Bridge | attach 冲突 + bridge 可用 | 通过外部 CDP 端口 | 需要 `--remote-debugging-port` |
| Fallback Hook | 以上均不可用 | fetch clone + XHR 拦截 | 不支持主文档 / opaque / binary |

### 4.1 BodyCaptureStatus（每条请求）

`not_enabled` | `captured` | `failed` | `too_large` | `unsupported` | `unsupported_binary` | `opaque_response` | `cdp_failed` | `fallback_unavailable` | `target_not_matched` | `permission_denied` | `partial` | `redacted`

## 5. 流式响应（SSE）

```
responseReceived(mime=event-stream)
  → streamResourceContent(requestId)         // 首块
  → dataReceived × N（reportResourceContent）// 累积
  → [stream_buffer 节流] flush 增量写 response_body（streaming）
  → loadingFinished | capture stop
  → 强制 flush, status=captured
```

降级：`streamResourceContent` 不支持 → `dataReceived` 累积可见部分，status=`partial`。实现：`stream_buffer.ts`。

## 6. WebSocket 帧捕获（CDP 层）

```
webSocketCreated            → emit network_request(connecting, resource_type=websocket)
willSendHandshakeRequest    → 补 request headers
handshakeResponseReceived   → 补 response headers, status=open
frameSent / frameReceived × N → emit ws_frame（逐帧独立 event）
webSocketClosed             → update record(closed), 清理连接
```

帧 payload 受 `max_body_capture_bytes` 截断，超限标 `too_large`。

## 7. CDP console / exception

虽走 CDP，但归独立 store：

- `Runtime.consoleAPICalled` → `console_event`（level 保留 error）→ `console_events` store。
- `Runtime.exceptionThrown` → `runtime_exception` → `error_events` store。

console.error() ≠ 运行时异常。实现：`console_capture.ts` / `exception_capture.ts`。

## 8. 外部 CDP bridge

当本扩展无法 attach（另一 debugger 已占用，典型为 DevTools 打开），通过外部 `--remote-debugging-port` 端口走 CDP。实现：`external_cdp_bridge_client.ts` + `agent/bridge/cdp_handler.ts`。端点见 `agent_mcp.md`。

## 9. webRequest 纯工具

`network_webrequest.ts` 提取自 `network_capture.ts` 的纯函数（header 处理、URL 规范化等），便于单测。`network_context.ts` 维护请求上下文。

## 10. 关键文件

- `src/background/network_capture.ts` — CDP-first 主逻辑，`dbg_tab_id` / `dbg_attached_externally` 状态。
- `src/background/network_webrequest.ts` — webRequest 纯工具。
- `src/background/network_correlator.ts` — 非活跃 tab 五元组关联。
- `src/background/body_capture_coordinator.ts` — 三层降级协调。
- `src/background/stream_buffer.ts` — SSE 流缓冲。
- `src/background/cdp_event_router.ts` — CDP 事件分发。
- `src/background/console_capture.ts` / `exception_capture.ts` — CDP console / exception。
- `src/background/external_cdp_bridge_client.ts` — 外部 CDP 客户端。
- `src/content/network_hook.ts` — fetch/XHR fallback。
- `src/content/websocket_capture.ts` — 页面级 WebSocket。
- `src/shared/body_routing.ts` — body 路由。
