# Response Body Capture 一次性实现计划

## 成功标准

```text
Advanced + response body 开启后：
1. 默认用 extension chrome.debugger 捕获 body
2. attach 冲突时自动尝试 external CDP bridge
3. bridge 不可用时 fallback hook 生效
4. UI/session/detail 明确显示当前模式和失败原因
5. 关闭脱敏后 cookie/header 不脱敏
6. 关闭脱敏后 payload 仍按大小截断
7. 测试覆盖主路径、冲突路径、兜底路径
```

## 改动清单

### 1. 修配置状态

文件：

```text
src/extension/popup/popup.ts
```

修改：

```text
redactData change handler 更新 user_config 内存态
```

验证：

```text
单元或 e2e 检查关闭脱敏后 start config.redact_data=false
```

### 2. 拆分脱敏和截断

文件：

```text
src/shared/redaction.ts
src/extension/background/network_capture.ts
相关测试文件
```

修改：

```text
truncate_request_body / truncate_response_body 永远按大小截断
redact_data 只控制敏感信息脱敏
```

要求：

```text
关闭 redact_data 不影响 MAX_REQUEST_BODY_BYTES / MAX_RESPONSE_BODY_BYTES
```

验证：

```text
redact_data=false + 超大 body -> status too_large，body 截断
redact_data=false + Cookie header -> 原值保留
redact_data=true + Cookie header -> [REDACTED]
```

### 3. 扩展 shared types

文件：

```text
src/shared/types.ts
```

新增：

```text
BodyCaptureMode
BodyCaptureRuntimeStatus
BodyCaptureFailureReason
BodyCaptureStartResult
correlation_status
cdp_request_id
```

Session 增加：

```text
body_capture_mode
body_capture_status
body_capture_failure_reason
body_capture_message
```

NetworkRequest 增加：

```text
correlation_status?
cdp_request_id?
```

验证：

```text
npm run build 类型通过
```

### 4. 新增 BodyCaptureCoordinator

文件：

```text
src/extension/background/body_capture_coordinator.ts
```

职责：

```text
输入 tab_id/session_id/config/bridge config
尝试 extension CDP
分类 attach 失败原因
必要时尝试 bridge
必要时启 fallback
返回 BodyCaptureStartResult
统一 stop 生命周期
```

决策：

```text
capture_response_body=false -> none/not_enabled
extension CDP success -> extension_cdp/active
another_debugger_attached + bridge ok -> external_cdp_bridge/active
another_debugger_attached + bridge fail -> fallback_hook/partial
permission/restricted/unknown -> fallback_hook/partial 或 failed
```

验证：

```text
mock chrome.debugger / bridge client / fallback，跑完整决策树测试
```

### 5. 重构 Extension CDP body 捕获

文件：

```text
src/extension/background/network_capture.ts
```

修改：

```text
CDP body 捕获从 webRequest.onCompleted 触发改为 CDP Network.loadingFinished 触发
responseReceived 记录 metadata
loadingFinished 调 Network.getResponseBody
loadingFailed 标记 cdp_failed
```

保留 webRequest：

```text
webRequest 仍记录 headers/status/timing/request body
CDP body 通过 correlator 合并进去
```

注意：

```text
不要只用 URL map requestId
同 URL 多请求必须可区分
```

验证：

```text
连续两个相同 URL 请求 body 不串
loadingFinished 前不调用 getResponseBody
loadingFailed 后 status=cdp_failed
```

### 6. 新增 request correlator

文件：

```text
src/extension/background/network_correlator.ts
```

职责：

```text
合并 webRequest metadata 和 CDP body event
```

匹配字段：

```text
method
raw_url
timestamp ±2s
status_code
resource_type
```

结果：

```text
matched
ambiguous
cdp_only
web_request_only
```

验证：

```text
唯一候选合并
多个候选不合并并标 ambiguous
只有 CDP 生成 cdp_only
只有 webRequest 生成 web_request_only
```

### 7. 新增 fallback fetch/XHR hook

文件：

```text
src/extension/content/network_hook.ts
src/extension/content/content_script.ts 或现有入口
src/extension/background/service_worker.ts
```

能力：

```text
patch window.fetch
response.clone().text() 捕获文本 body
patch XMLHttpRequest
loadend 后读取 responseText
发 message 到 background
```

限制处理：

```text
binary -> unsupported_binary
opaque -> opaque_response
stream/read failed -> failed
body too large -> too_large
```

安全：

```text
不破坏原 fetch/XHR 行为
异常时恢复原路径，不影响页面请求
```

验证：

```text
fetch JSON body captured
XHR text body captured
opaque response 标记 opaque_response
binary 标记 unsupported_binary
页面 fetch 行为不变
```

### 8. 新增 External CDP bridge client

文件：

```text
src/extension/background/external_cdp_bridge_client.ts
src/shared/agent_bridge_config.ts
src/shared/types.ts
```

扩展侧职责：

```text
health check bridge
POST /cdp/detect
POST /cdp/start
poll GET /cdp/events
POST /cdp/stop
把 bridge body event 交给 network correlator
```

配置：

```text
agent_bridge_enabled
agent_bridge_url
agent_bridge_token
external_cdp_ports
external_cdp_bridge_enabled
```

验证：

```text
bridge health fail -> bridge_unavailable
port detect fail -> cdp_port_not_found
target fail -> cdp_target_not_found
body event -> network request merged
```

### 9. 扩展本地 bridge CDP API

文件位置按现有 bridge 实现确定，优先搜索：

```text
src/agent/
```

新增 API：

```text
POST /cdp/detect
POST /cdp/start
POST /cdp/stop
GET /cdp/events
```

bridge 行为：

```text
只连 localhost CDP
按 token 鉴权
按 session_id 管理 CDP WebSocket
Network.enable
loadingFinished 后 getResponseBody
缓存事件供扩展 poll
stop 时断开 session
```

端口探测：

```text
用户端口优先
默认候选 9222,9223,9224,9225,9333
请求触发，不后台扫
```

验证：

```text
mock CDP /json/version 和 /json/list
检测端口成功/失败
target 匹配成功/失败
Network event 转 body event
```

### 10. service_worker 接入 coordinator

文件：

```text
src/extension/background/service_worker.ts
```

修改：

```text
start_recording 里不直接 enable_response_body_capture
改调用 BodyCaptureCoordinator.start
把 BodyCaptureStartResult 写入 current_session
update_session 持久化
stop_recording 调 coordinator.stop
get_status 返回 body capture runtime 状态
```

验证：

```text
start response 带 body capture 状态
session detail 能读取状态
stop 后 extension CDP / bridge / fallback 都清理
```

### 11. UI 显示状态和外部 CDP 设置

文件：

```text
src/extension/popup/popup.ts
src/extension/popup/popup.html
src/extension/popup/popup.css
src/detail/detail.ts
src/detail/detail.html
src/detail/detail.css
src/shared/i18n.ts
```

Popup 显示：

```text
Response body: Active · Extension CDP
Response body: Active · External CDP Bridge · port 9222
Response body: Partial · Fallback Hook
Response body: Failed · Another debugger attached
```

设置新增：

```text
Enable external CDP bridge fallback
CDP ports input
Detect external CDP button
Detected target list
```

Detail 显示：

```text
session body_capture_mode/status/failure_reason/message
每条 request response_body_status/correlation_status
```

验证：

```text
三种模式 UI 文案正确
detect 失败不影响默认 extension CDP
```

### 12. Export 保持兼容

文件：

```text
src/extension/background/exporter.ts
```

修改：

```text
导出 session body capture 状态
导出 network request correlation_status/cdp_request_id
HAR 中 body 缺失时写明确 comment/status，不伪造 body
```

验证：

```text
旧 session 无新增字段也能导出
新 session 字段完整导出
```

### 13. 测试补齐

新增/修改测试：

```text
tests/popup_detail_url.test.ts 或新 popup config test
tests/redaction.test.ts
tests/body_capture_coordinator.test.ts
tests/network_correlator.test.ts
tests/network_capture_cdp.test.ts
tests/external_cdp_bridge_client.test.ts
tests/content_network_hook.test.ts
tests/e2e.spec.ts
tests/e2e-9223.spec.ts
```

覆盖：

```text
关闭脱敏后 cookie 不脱敏
关闭脱敏后大 body 仍截断
extension CDP success
extension CDP another debugger -> bridge
bridge unavailable -> fallback
fetch hook body captured
XHR hook body captured
request correlation ambiguous 不误合并
UI 显示 active/partial/failed
```

## 执行顺序

一次性完成，但按依赖顺序提交代码：

```text
1. types + redaction + popup config bug
2. coordinator + extension CDP loadingFinished
3. correlator
4. fallback hook
5. external bridge client + bridge API
6. service_worker 接入
7. UI/detail/export
8. tests/e2e/build
9. code review agent
10. 修 review 问题
```

## 验证命令

```text
npm test
npm run build
npm run test:e2e
```

如果 e2e 需要宿主机 Chrome/CDP：

```text
用现有项目脚本，不用 Playwright 内置浏览器
分别验证不开 CDP、开 9223、外部占用 tab 三种场景
```

## 风险和处理

### 风险：CDP target 匹配错误

处理：

```text
严格匹配；模糊时不接管，要求用户手选 target
```

### 风险：content hook 破坏页面

处理：

```text
try/catch 包裹
保留原始 fetch/XHR 行为
hook 失败不影响请求
```

### 风险：IndexedDB 过大

处理：

```text
payload size limit 永远生效
binary 默认 unsupported，不存大 base64
```

### 风险：bridge token 泄露

处理：

```text
不导出 token
日志不打印 token
bridge 只接受 localhost
```

### 风险：旧 session 兼容

处理：

```text
新增字段全部可选或有默认值
detail/export 对缺失字段显示 Unknown/Not recorded
```

## 完成定义

```text
所有测试通过
build 通过
手动验证三种模式
UI 能解释 body 未捕获原因
关闭脱敏后 cookie 不再 REDACTED
response body 捕获不再依赖用户是否启动 9222
```
