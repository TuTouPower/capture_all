# Task spec - T014 network_ws_redaction

## 背景

`src/extension/background/network_capture.ts:229-280` 和 `src/extension/background/cdp_handler.ts:441-612` 两个 WebSocket 采集路径：

- `send_ws_connection_event` 直接使用 `conn.url`，`url_status` 写死 `'captured'`，未调用 `redact_url`。
- `request_headers`/`response_headers` 直接使用 `headers_map_from_cdp(...)`，`headers_status` 写死 `'captured'`，未调用 `redact_headers`。
- `send_ws_frame` 与 `handle_ws_frame_error` 的 `url` 字段也直接使用 `conn.url`。

对比 HTTP CDP 主路径（`build_cdp_primary_network_event`）已对 url/headers 脱敏并设置 `url_status`/`headers_status`。WebSocket 路径与之不一致，导致 `redact_url_query`/`redact_sensitive_headers` 启用时 WebSocket URL query token、Cookie、Authorization 等仍明文入库。

## 范围

代码/配置：

- `src/extension/background/network_capture.ts`：
  - `send_ws_connection_event`：对 `conn.url` 走 `redact_url(url, redact_q)`，`url_status` 设为脱敏结果；`request_headers`/`response_headers` 走 `redact_headers`，`headers_status` 同步。
  - `send_ws_frame` 与 `handle_ws_frame_error`（webSocketFrameError）的 `url` 字段走 `redact_url`。
- `src/extension/background/cdp_handler.ts`：同样三处修复（`send_ws_connection_event`、`send_ws_frame`、`handle_ws_frame_error`）。

测试：

- `tests/unit/network_capture.test.ts` 或 `tests/unit/network_cdp.test.ts` 新增 WebSocket URL/headers 脱敏行为用例（已有 WebSocket 测试则扩展）。

文档：

- 无 blueprint 改动。

## 非范围

- 不改 WebSocket frame payload 脱敏（payload 内容级脱敏属产品决策）。
- 不改 frame payload 字节统计（T021 处理 UTF-8 byte size）。
- 不改 `ws_connections` Map 生命周期（T065 处理）。

## 验收标准

- [ ] WebSocket 连接事件 url_status 在 redact 启用时为 'redacted'，url 不含 token 原值。-> 验证：单测。-> 预期：url_status='redacted' 且 url 不含 'SECRET'。
- [ ] WebSocket 连接事件 headers_status 在 redact 启用时为 'redacted'，Authorization/Cookie 被 [REDACTED]。-> 验证：单测。-> 预期：headers_status='redacted' 且 headers['Authorization']==='[REDACTED]'。
- [ ] WebSocket frame error 事件 url 走脱敏。-> 验证：单测。-> 预期：error 事件 url 不含 token 原值。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：`redact_url_query`、`redact_sensitive_headers` 配置必须覆盖 WebSocket 路径。
- 无数据迁移。
- 无平台限制。
