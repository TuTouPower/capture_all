# Response Body Capture 完整设计

## 目标

Record All 在用户勾选 response body 捕获后，自动选择最强可用路径，且不要求普通用户启动 Chrome CDP 端口。

最终能力：

```text
默认：Extension-owned CDP
冲突：External CDP Bridge
兜底：webRequest + content script hook
```

不把 `9222` 当主方案。`9222` 只属于 External CDP Bridge 的探测候选。

## 非目标

- 不要求用户默认用 `--remote-debugging-port` 启动 Chrome。
- 不后台持续扫描本机端口。
- 不为了捕获 body 关闭脱敏或突破浏览器安全限制。
- 不错误合并 webRequest 和 CDP 请求；模糊时宁可拆成独立记录。

## 当前问题

### Cookie 脱敏开关不生效

`src/popup/popup.ts` 里 `redactData` change handler 只写 storage，没有更新内存态 `user_config`。开始录制时 `get_record_config()` 读取旧值，导致 `redact_data` 仍为 `true`。

### Response body 静默失败

当前 response body 只走 `chrome.debugger.attach`。失败后只 `console.warn`，UI 和 session 都不知道失败原因。用户看到的结果是 body 没记录。

### CDP 时序不稳

当前实现用 `webRequest.onCompleted` 触发 `Network.getResponseBody`，再用 URL 查 CDP requestId。URL 不是稳定唯一键；CDP body 更适合在 `Network.loadingFinished` 后获取。

### 脱敏和截断混在一起

`truncate_response_body(body, config.redact_data)` 会导致用户关闭脱敏时也关闭大小截断。脱敏开关不应控制 payload 上限。

## 架构总览

```text
User starts advanced recording with response body enabled
        |
        v
BodyCaptureCoordinator
        |
        |-- try Extension CDP
        |       |
        |       |-- success -> Extension CDP Mode
        |       |
        |       |-- another debugger attached
        |               |
        |               |-- bridge enabled/available -> External CDP Bridge Mode
        |               |-- bridge unavailable -> Fallback Hook Mode
        |
        |-- permission/restricted/unknown failure -> Fallback Hook Mode
```

核心是引入 `BodyCaptureCoordinator`，集中决定 body 捕获模式、状态、失败原因、降级路径。

## 捕获模式

### 1. Extension CDP Mode

默认首选。

要求：

```text
capture_mode = advanced
capture_network = true
capture_response_body = true
chrome.debugger.attach(tab) 成功
```

流程：

```text
chrome.debugger.attach(tab)
Network.enable
Network.responseReceived -> 建立 cdp_request_id 记录
Network.loadingFinished -> Network.getResponseBody
Network.loadingFailed -> 标记失败
webRequest metadata -> 和 CDP body 合并
```

优点：

- 普通 Chrome 用户无需 CDP 端口。
- 不需要本地 bridge。
- 权限和生命周期都在扩展内。

失败必须结构化：

```text
another_debugger_attached
debugger_permission_denied
restricted_url
unknown
```

### 2. External CDP Bridge Mode

只在 Extension CDP attach 冲突时启用。

触发条件：

```text
chrome.debugger.attach 失败
failure_reason = another_debugger_attached
bridge enabled
bridge health ok
```

bridge 职责：

```text
探测 CDP 端口
读取 /json/version
读取 /json/list
匹配当前 tab target
连接 webSocketDebuggerUrl
Network.enable
Network.loadingFinished 后 getResponseBody
把 body 事件返回扩展
```

端口策略：

```text
用户配置端口优先
再试默认候选：9222, 9223, 9224, 9225, 9333
只在用户点击 Detect 或 attach 冲突后探测
不后台常驻扫描
```

target 匹配优先级：

```text
1. targetId 明确匹配
2. 当前 tab URL 完全匹配
3. URL origin + title 匹配
4. 用户手选 target
```

bridge API：

```text
GET  /health
POST /cdp/detect
POST /cdp/start
POST /cdp/stop
GET  /cdp/events?session_id=...
```

`POST /cdp/detect` request：

```json
{
    "ports": [9222, 9223, 9224, 9225, 9333]
}
```

`POST /cdp/start` request：

```json
{
    "session_id": "session_x",
    "tab_url": "https://example.com/path",
    "target_id": null,
    "redact_data": true,
    "max_response_body_bytes": 51200
}
```

body event：

```json
{
    "type": "network_response_body",
    "session_id": "session_x",
    "cdp_request_id": "1234.5",
    "url": "https://example.com/api",
    "method": "GET",
    "status_code": 200,
    "timestamp": 123456.7,
    "body": "...",
    "body_status": "captured"
}
```

### 3. Fallback Hook Mode

兜底路径。

触发条件：

```text
Extension CDP 不可用
External CDP Bridge 不可用或未启用
```

能力：

```text
webRequest 捕获 metadata、headers、request body
content script hook fetch response.clone().text()
content script hook XHR responseText
WebSocket 只记录 metadata
```

限制：

```text
不能捕获主文档导航 response body
不能捕获 chrome://、扩展页面等不可注入页面
不能可靠捕获 opaque response
不能可靠捕获 binary/stream body
不能覆盖所有跨域响应
```

UI 必须显示 `partial`，不能伪装成完整捕获。

## 数据模型

### Session 增加运行态 body 捕获能力

```ts
export type BodyCaptureMode =
    | 'none'
    | 'extension_cdp'
    | 'external_cdp_bridge'
    | 'fallback_hook';

export type BodyCaptureRuntimeStatus =
    | 'not_enabled'
    | 'active'
    | 'partial'
    | 'failed';

export type BodyCaptureFailureReason =
    | null
    | 'another_debugger_attached'
    | 'debugger_permission_denied'
    | 'restricted_url'
    | 'bridge_unavailable'
    | 'cdp_port_not_found'
    | 'cdp_target_not_found'
    | 'unknown';
```

Session 字段：

```ts
body_capture_mode: BodyCaptureMode;
body_capture_status: BodyCaptureRuntimeStatus;
body_capture_failure_reason: BodyCaptureFailureReason;
body_capture_message?: string;
```

### NetworkRequest 增强 body 状态

```ts
export type BodyCaptureStatus =
    | 'captured'
    | 'not_enabled'
    | 'too_large'
    | 'unsupported'
    | 'unsupported_binary'
    | 'opaque_response'
    | 'cdp_failed'
    | 'fallback_unavailable'
    | 'target_not_matched'
    | 'failed';
```

新增合并状态：

```ts
correlation_status?: 'matched' | 'cdp_only' | 'web_request_only' | 'ambiguous';
cdp_request_id?: string;
```

## 请求合并策略

webRequest requestId 和 CDP requestId 不同，不能直接等同。

合并 key：

```text
method
normalized_url
timestamp window ±2s
status_code
resource_type
```

规则：

```text
唯一候选 -> 合并
多个候选 -> 不合并，标记 ambiguous
只有 CDP body -> 写 cdp_only network_request
只有 webRequest metadata -> 写 web_request_only network_request
```

`normalized_url` 保留 query，除非 `redact_url_query=true` 且 `redact_data=true`。内部匹配用原始 URL，导出/展示用脱敏 URL。

## 脱敏和截断

拆开两件事：

```text
redact_data 控制敏感字段脱敏
payload size limit 永远生效
```

要求：

```text
关闭脱敏时，cookie/header/body 不脱敏
关闭脱敏时，大 body 仍按 MAX_RESPONSE_BODY_BYTES 截断
关闭脱敏时，大 request body 仍按 MAX_REQUEST_BODY_BYTES 截断
```

建议函数：

```ts
redact_headers(headers, redact_data)
redact_url(url, redact_data && redact_url_query)
truncate_payload(body, max_bytes)
```

不要再用 `redact_data` 作为 truncate enabled 参数。

## UI

Popup / detail 页面显示当前状态：

```text
Response body: Active · Extension CDP
Response body: Active · External CDP Bridge · port 9222
Response body: Partial · Fallback Hook
Response body: Failed · Another debugger attached
```

失败时给动作：

```text
Enable bridge fallback
Detect external CDP
Continue with fallback
```

External CDP 设置：

```text
[ ] Enable external CDP bridge fallback
Bridge URL: http://127.0.0.1:17831
CDP ports: 9222,9223,9224,9225,9333
[Detect external CDP]
Detected targets:
- https://example.com — Page title
```

## 错误处理

所有捕获启动结果结构化：

```ts
interface BodyCaptureStartResult {
    mode: BodyCaptureMode;
    status: BodyCaptureRuntimeStatus;
    failure_reason: BodyCaptureFailureReason;
    message?: string;
    bridge_port?: number;
}
```

service worker 不只打 `console.warn`，还要：

```text
更新 current_session
持久化 session
返回 popup
在 detail 可见
```

## 安全

- 不自动打开或要求打开 remote debugging port。
- bridge 只允许 localhost URL。
- bridge 请求必须带 token。
- bridge 不接受公网 callback。
- body 捕获遵守用户脱敏选择。
- payload size limit 永远生效，避免 IndexedDB 爆。
- bridge mode 不存 CDP WebSocket URL 到导出文件。

## 测试要求

单元测试：

```text
redact_data 关闭时不脱敏但仍截断
attach error 分类
body capture coordinator 决策树
request correlation 唯一匹配/模糊匹配/CDP-only/webRequest-only
```

集成测试：

```text
Extension CDP 成功 -> body captured
attach another debugger -> bridge 可用 -> external_cdp_bridge
attach another debugger -> bridge 不可用 -> fallback_hook partial
loadingFinished 后 getResponseBody
```

E2E：

```text
普通 Chrome 不开 9222，advanced + response body 能记录 fetch body
外部 CDP 占用 tab，UI 显示 bridge/fallback 状态
关闭脱敏，cookie 不被 REDACTED
关闭脱敏，大 body 仍截断
```

## 验收标准

- 普通用户无需 `--remote-debugging-port` 即可捕获 response body。
- attach 被占用时，用户能看到明确原因。
- bridge 可用时能接管 External CDP。
- bridge 不可用时 fallback 生效且 UI 明确 partial。
- 关闭脱敏后 cookie/header 不再被 `[REDACTED]`。
- 关闭脱敏后大 body 仍被截断。
- response body 捕获基于 `Network.loadingFinished`，不依赖 URL 单点映射。
