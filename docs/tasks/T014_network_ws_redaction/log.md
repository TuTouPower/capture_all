# Task log - T014 network_ws_redaction

## 进展

- 2026-07-19：WebSocket URL/Header 在两个采集路径（network_capture、cdp_handler）启用 redact_url + redact_headers，正确设置 url_status/headers_status。frame error 与 send_ws_frame 的 url 字段也走 redact_url。

## 关键验证

- 红 → 绿：websocket_capture.test.ts 新增 3 用例（redact 启用、redact 关闭、frame error URL）→ 2 红 → 全绿。
- 全量：`npm test` 92 文件 / 1089 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- redact 触发条件与 HTTP CDP 主路径一致：`redact_data && redact_url_query` 控制 url；`redact_data && redact_sensitive_headers` 控制 headers。
- 不动 ws_connections 存储内容（存原始 URL），发送时按配置脱敏，与 HTTP 路径风格一致。
- cdp_handler.ts 同步修改但不新增独立测试：该文件无现成 unit test 设施；websocket_capture.test.ts 覆盖 network_capture 路径，cdp_handler 行为对称代码改动，由 e2e 覆盖（如 `e2e-websocket-capture.spec.ts`）。

## 验收

- [x] WebSocket 连接事件 url_status='redacted' 且 url 不含 token 原值（redact 启用）。
- [x] headers_status='redacted' 且 Authorization/Cookie/Set-Cookie 被替换。
- [x] frame error 事件 url 被脱敏。
- [x] redact 关闭时 url/headers 保留原值。
- [x] npm test 全绿。
