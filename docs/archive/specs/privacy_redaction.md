# Spec — privacy_redaction

隐私脱敏策略：URL/header/data 脱敏、password 永不采集、cookie scope、logger 净化。

## 脱敏规则（`src/shared/redaction.ts`）

### URL query 脱敏（`redact_url`）

触发条件：`redact_data && redact_url_query`。

匹配方式：遍历所有 query key，小写后子串包含以下模式之一：
`token` / `key` / `secret` / `password` / `passwd` / `auth` / `credential` / `jwt`

覆盖：
- 组合参数名：access_token / api_key / client_secret / auth_token / session_token
- 大小写变体：Token / AUTH / API_KEY
- 重复参数：全部保留并替换为 `[REDACTED]`

不处理：URL fragment（产品语义未定）。

### Header 脱敏（`redact_headers`）

触发条件：`redact_data && redact_sensitive_headers`。

匹配方式（三重）：
1. 精确 header name（小写）：authorization / cookie / set-cookie / x-api-key / x-csrf-token / proxy-authorization / www-authenticate
2. Header name 包含模式：token / key / secret / bearer
3. Header value 包含模式：token / key / secret / bearer

重复 header（Set-Cookie 等）合并为 `, ` 分隔。

### 数据脱敏（`redact_data`）

触发条件：`config.redact_data = true`。

- keyboard_capture：key/code → null，key_status = 'masked'。
- input value：value_preview → '[REDACTED]'，value_status = 'redacted'。
- cookie value：value_status = 'not_captured'（永不采集值，仅名称/域/路径/属性）。

### Password 永不采集（`redact_password`）

`input_type === 'password'` 判断**优先于** `enabled` 开关。password 在任何配置下都返回 `[REDACTED]`。

DOM 采集层（dom_capture compute_value_fields）另有独立保护：is_password → value_status = 'not_captured'。

## Logger 净化（`src/shared/logger.ts`）

Logger.write 入口对 message 与 details 统一净化：
- URL 子串模式 `[a-z][a-z0-9+.-]*://[^\s"'<>\`)]+` 匹配 → redact_url(redact_query=true)。
- 递归扫描嵌套对象/数组。
- Error message/stack 也净化。
- 单条上限 64KB（`MAX_LOG_ENTRY_BYTES`），UTF-8 字节截断 + `[TRUNCATED]`。
- 循环引用用 WeakSet 守护，返回 `[Circular]`。
- Date/RegExp/TypedArray/Map/Set 原样保留。

## Cookie scope（`src/extension/background/cookie_capture.ts`）

`chrome.cookies.onChanged` 全局事件按目标 tab URL domain 过滤：
- extract_target_domains：hostname 所有父域（含 dot 前缀）。
- cookie.domain 匹配集合才采集。

## WebSocket 脱敏

WebSocket 连接事件 + frame 的 URL/headers 走 redact_url/redact_headers（与 HTTP 主路径一致）。url_status/headers_status 正确反映脱敏状态。

## 外部 Bridge URL allowlist

`external_cdp_bridge_client.ts` 仅允许 `http(s)://127.0.0.1`/`localhost`/`[::1]`；拒绝 credentials/fragment/非根 path。

## self_origin 过滤

`is_self_origin_url` 仅排除扩展 origin（`chrome-extension://`）+ 配置的 Bridge origin（精确 origin 匹配）。不再笼统排除所有 127.0.0.1/localhost 端口，避免本地开发应用请求被误排除。
