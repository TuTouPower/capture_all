# Task log - T022 cdp_state_keyed_by_session

## 进展

- 2026-07-19：`src/extension/background/cdp_handler.ts` 引入复合 key `${sessionId ?? 'root'}:${requestId}`，所有状态 Map/Set 改用 req_key：
  - `cdp_request_meta`、`cdp_body_results`、`streaming_requests`、`finished_before_stream`、`ws_connections`、`cdp_primary_emitted`、`_deferred_cdp_index`。
  - `handle_cdp_event` 入口计算 req_key 并传给各 handler；CDP 命令 requestId 与输出 `request_id` 字段仍用原 req_id。
  - `handle_request_will_be_sent`/`handle_response_received`/`handle_data_received`/`handle_loading_finished`/`handle_loading_failed`/`handle_ws_*`/`send_ws_frame`/`try_resolve_deferred`/`schedule_orphan_check` 全部改签名（req_key + req_id）。

## 关键验证

- 红 -> 绿：cdp_request_key_session_isolation.test.ts 1 用例 -> 全绿。
- 全量：`npm test` 97 文件 / 1118 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- 主 target 用 'root' namespace，子 target 用 sessionId。
- CDP 命令 requestId 不变（CDP 仍按 target 路由），仅内部 Map/Set 用复合 key。
- 输出事件 `request_id` 字段保留原 req_id（便于与 webRequest 路径关联）。
- network_capture.ts 暂未改：该文件主要走 webRequest 路径 + deferred 关联，CDP 路径已收敛到 cdp_handler.ts；T022 验收标准满足。

## 验收

- [x] 主 target 与子 target 相同 requestId 时 meta 独立保留（size=2）。
- [x] 子 target body 不串到主 target 请求（method/status 独立）。
- [x] npm test 全绿。
