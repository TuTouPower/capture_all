# 脱敏与安全

实现：`src/shared/redaction.ts` / `src/shared/escape.ts`。

## 1. 脱敏配置

默认 CaptureConfig（`src/shared/constants.ts` `DEFAULT_CONFIG`）：

```typescript
redact_sensitive_headers: true   // 默认开启 header 脱敏
redact_url_query: true           // 默认开启 URL 脱敏
redact_data: true                // 默认开启数据脱敏
keyboard_capture_mode: 'shortcuts' // 默认只记录快捷键
capture_input_values: true       // 默认捕获输入值
capture_request_body: true
capture_response_body: true
max_body_capture_bytes: 100MB
inline_text_max_bytes: 32KB
```

## 2. 脱敏规则

### 2.1 Headers

`authorization` / `cookie` / `set-cookie` / `x-api-key` 等敏感 header → `[REDACTED]`。

### 2.2 URL query

`token` / `key` / `secret` / `password` / `auth` 参数值 → `[REDACTED]`。

### 2.3 表单值

- `type=password` 始终 `[REDACTED]`（`value_status: 'not_captured'`），与 `capture_input_values` 开关无关。
- 其他 input 仅在 `capture_input_values=true` 时采集。

### 2.4 键盘

`keyboard_capture_mode`：`'none'` 不记录、`'shortcuts'` 只记修饰键组合、`'all'` 完整记录。

### 2.5 Body 截断

- request_body / response_body 共用 `max_body_capture_bytes`（默认 100MB）。
- inline text `inline_text_max_bytes`（默认 32KB）。
- console args 1KB。
- target_text 预览 100 字符。

### 2.6 脱敏与截断分离

`redact_data` 控制脱敏。payload size limit 永远生效，不受 `redact_data` 影响。关闭脱敏不应关闭截断。

## 3. HTML 导出安全

- `</script>` → `<\/script>`。
- `<` / `>` / `&` 全部转义。
- 动态内容不可执行 JavaScript。
- 单引号也转义（P2 #20 统一 `escape_html`）。

实现：`src/shared/escape.ts`，单测 `escape.test.ts` / `escape_html.test.ts`。

## 4. Agent Bridge 安全

- Bridge 仅绑定 `127.0.0.1`，禁止 `0.0.0.0` / 公网。
- 所有 API 必须带 token；token 用户提供，禁止硬编码 / 默认 / 示例值。无效 / 缺失 → 401。
- URL 仅允许 `127.0.0.1` / `localhost`（`agent_bridge_config.test.ts` 验证）。
- token 缺失不发起请求（`agent_bridge_client.test.ts`）。
- 不提供删除采集 / 清空数据 MCP 能力。

## 5. postMessage 安全

`postMessage` 必须指定 `targetOrigin`，接收方必须校验 `event.origin`（M1-M6 修复）。

## 6. CSP

`manifest.json`：

```json
{ "content_security_policy": { "extension_pages": "script-src 'self'; object-src 'self'" } }
```

## 7. 密钥管理

- 禁止硬编码 secret / token / 密码 / 弱口令 / API key。
- 公网开放的密钥必须由用户提供随机生成值。
- Bridge token 用户填入设置页，存 `chrome.storage.local`。

## 8. 关键文件

- `src/shared/redaction.ts` — 脱敏规则。
- `src/shared/escape.ts` — HTML / JS 转义。
- `src/shared/agent_bridge_config.ts` — Bridge 配置（URL / token 校验）。
