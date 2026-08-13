# d007 CDP 会话 terminal 的 HTTP 码选择

- 来源：s005 spike
- 结论：CDP 会话终止用 `410 + { ok:false, error:{ code:'cdp_session_terminal', message, reason } }` 表达；404 保留表示未知 session（stop 销毁后仍是 404）。扩展 client 对 410/404 抛分类错误不再降空数组，coordinator 对 terminal 停 poll 降级。
- 证据：`cdp_handler.ts` 现有 404 分支与 200 响应形态；`external_cdp_bridge_client.ts:154` `if (!res.ok) return []` 吞全部非 2xx；`body_capture_coordinator.ts:258-266` finally 无条件重排 poll；RFC 9110 410 Gone 语义。
- 影响：t158 实现；`/cdp/events` 契约扩展（410 分支），domain/architecture 文档补 terminal 语义。
- 现状：有效
