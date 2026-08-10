# Spec — network stop 清理 deferred/orphan timer

网络采集 stop 时清理 deferred/orphan 定时器，防止迟到回调跨采集串写。

## 清理语义

- `stop_network_capture` 清空 `deferred_web_requests`（先 clearTimeout 每个 entry 的 timer）与 `_deferred_cdp_index`。
- orphan timer 由 `on_cdp_body_event = null` 守卫（stop 置空）。
- `Network.getResponseBody` 的 then/catch 回调入口比较 `capture_id_at_send !== capture_id`：stop→restart 后旧请求的迟到回调被挡，不重插 map、不排新 orphan timer、不写新 capture。

## 相关实现

- `src/extension/background/network_capture.ts`：`stop_network_capture` / getResponseBody 回调守卫
- `tests/unit/network_stop_deferred_timers.test.ts`：AC-001 deferred 清理 / AC-002 跨采集 / AC-002b 迟到回调守卫
