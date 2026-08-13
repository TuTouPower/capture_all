# Spike report

## 问题

CDP 会话 terminal 时 `/cdp/events` 用什么 HTTP 码与响应形态，能让扩展 client 区分「正常空数组」「session 不存在」「session 已终止」三类状态，且符合 `src/bridge` 现有错误码约定。

## 成功判据

- 有明确证据：现有 `/cdp/events` 调用方（`external_cdp_bridge_client.ts`）对非 2xx 的处理方式；`src/bridge` 现有 HTTP 语义与错误对象形态。
- 结论给出可执行的码/形态选择，能被 AC-001/003 测试直接断言。

## 尝试

- 读 `src/bridge/cdp_handler.ts` `handle_cdp_events`：session 不存在返回 `404 { ok: false, events: [] }`；session 存在返回 `200 { ok: true, events: [...] }`。无其他状态码。
- 读 `src/extension/background/external_cdp_bridge_client.ts` `poll_external_cdp_events`：`if (!res.ok) return []`——404 与 500 一律降空数组；仅 fetch 网络错误走 catch 返空。
- 读 `src/bridge` 其他 handler 错误码模式：`handle_cdp_detect`/`handle_cdp_start` 用 `400 { ok:false, error:{code,message} }` 或 `200 { ok:false, error:{code,message} }`（业务错误走 200 + error 对象，HTTP 语义错误走 4xx）。
- 对照 HTTP 语义：410 Gone = 资源永久不再可用（RFC 9110），与「session 已终止且不会再活」精确匹配；404 保留 = 未知/从未存在的 session。

## 证据

- `cdp_handler.ts:425-429`：404 分支现状。
- `external_cdp_bridge_client.ts:154`：`if (!res.ok) return []` 吞掉全部非 2xx。
- `body_capture_coordinator.ts:258-266`：poll 失败仅 warn，`finally` 无条件递归 `setTimeout(poll_once, 500)` 重排下一轮——terminal 无出口。
- 现有错误对象形态：`{ ok: false, error: { code, message } }`（`handle_cdp_detect`/`handle_cdp_start` 全部采用）。

## 结论

选 **410 + `{ ok:false, error:{ code:'cdp_session_terminal', message, reason } }`**：

- 410 语义精确（Gone）；404 继续表示未知 session（`session_key` 拼错/已 stop 销毁后应仍是 404，避免把 404 也改成 terminal——stop 是正常结束，不应报 terminal 错误）。
- 扩展 client `poll_external_cdp_events` 改为：`res.status === 410` → `throw` 分类错误（错误码 `cdp_session_terminal`）；`!res.ok`（含 404）→ 抛 `cdp_poll_failed` 分类错误（不再静默返空）；仅解析 200 响应体。
- coordinator `poll_once` catch 里对 `cdp_session_terminal` 停止 poll（`poll_stopped=true`）并切换 fallback hook / 更新失败状态；其他错误维持 best-effort 重试。
- 测试断言以 status 410 + error.code 为锚点（AC-001/003），不依赖响应体细节。

## 是否采纳

- 决定：是
- 理由：与现有错误码形态一致（200/4xx + error 对象），410 语义准确，client 分类可测。
- 后续 task：t158
