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

## finished_before_stream 生命周期保证

`finished_before_stream` 只用于 `Network.loadingFinished` 早于 `Network.responseReceived` 的竞态窗口（SSE/流式响应识别），请求进入任何终态后必须从集合中移除对应复合键，保证长采集内存有界、同 session 同 requestId 复用不受残留标记影响：

- 普通请求：body 获取成功/失败并产出事件后清理。
- SSE/流式：`streaming_requests` 完成 emit 后清理。
- 无 metadata / deferred / orphan：`try_resolve_deferred` 完整解析或兜底分支、`schedule_orphan_check` 回调（含事件已被消费的早退）均清理。
- `capture_response_body=false` 早退与 `loadingFailed` 终态同样清理。
- 生产路径 `network_capture` 与复制实现 `cdp_handler` 保持同一生命周期语义（t112，2026-08-11）。
