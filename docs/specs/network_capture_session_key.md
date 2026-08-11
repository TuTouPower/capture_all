# Spec — network_capture CDP 复合键

生产路径 `network_capture` 内部 Map/Set 使用 `sessionId + requestId` 复合键（`cdp_request_key`），隔离跨 iframe/worker 子目标的同 requestId 请求。

## 键语义

- 复合键格式：`${sessionId}:${requestId}`；根 session（无 sessionId）为 `root:${requestId}`。
- 内部 `cdp_request_meta` / `cdp_body_results` / `streaming_requests` / `finished_before_stream` / `ws_connections` / `_deferred_cdp_index` 均用复合键。
- CDP 命令 `Network.getResponseBody` / `streamResourceContent` 的 `sendCommand` target 携带对应子 session 的 `sessionId`。
- 对外输出 `request_id` 字段保留 CDP 原始 requestId（兼容导出/关联）。
- `CdpRequestMeta.session_id` 记录来源 session，供调试与审计。

## 相关实现

- `src/extension/background/network_capture.ts`：生产 CDP 网络采集（复合键）
- `src/extension/background/cdp_handler.ts`：`cdp_request_key`、`CdpRequestMeta`
- `tests/unit/network_capture_session_key.test.ts`：复合键隔离 + 子 session 命令 + 根 session 回归
- `docs/blueprint/architecture.md`：CDP 段复合键架构描述
