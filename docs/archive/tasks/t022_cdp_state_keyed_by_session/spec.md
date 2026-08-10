# Task spec - T022 cdp_state_keyed_by_session

## 背景

`src/extension/background/cdp_handler.ts` 与 `network_capture.ts` 所有 CDP 状态（`cdp_request_meta`/`cdp_body_results`/`streaming_requests`/`finished_before_stream`/`ws_connections`/`cdp_primary_emitted`）仅按 `requestId` 索引。但 `Target.setAutoAttach(... flatten:true)` 启用后，CDP `requestId` 仅在对应 target/session 范围内唯一，跨主页面/iframe/worker 子目标可能重复。

后果：元数据/body/WebSocket 连接互相覆盖、误关联、提前清理；极端情况下把另一子目标敏感 body 关联到当前请求。

## 范围

代码/配置：

- `src/extension/background/cdp_handler.ts`：
  - 新增 `cdp_request_key(source: { sessionId?: string } | undefined, req_id: string): string` 返回 `${sessionId ?? 'root'}:${req_id}`。
  - `handle_cdp_event` 入口计算 key，所有 handler 改为接 key 而非 req_id；事件输出 `request_id` 字段保留原 req_id。
  - 所有 `cdp_request_meta`/`cdp_body_results`/`streaming_requests`/`finished_before_stream`/`ws_connections`/`cdp_primary_emitted` 操作用 key。
  - `try_resolve_deferred` / `schedule_orphan_check` 也用 key。
- `src/extension/background/network_capture.ts`：同样改造（如适用）。

测试：

- `tests/unit/network_cdp.test.ts` 或新建：构造主 target + 子 target 用相同 requestId，验证两条记录独立保留、互不覆盖。

文档：

- 无 blueprint 改动。

## 非范围

- 不改 webRequest 路径（独立 correlator）。
- 不改 CDP target URL 严格匹配（T061）。
- 不改 WebSocket URL 脱敏（T014 已修）。

## 验收标准

- [ ] 主 target 与子 target 用相同 requestId 时，两条 meta 独立保留。-> 验证：单测。-> 预期：cdp_request_meta.size === 2。
- [ ] 子 target 的 getResponseBody 结果不串到主 target 的请求。-> 验证：单测。-> 预期：主 target meta.response_body 不被子 target body 覆盖。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：CDP 状态按 session 隔离；body 不串到错误请求。
- 无数据迁移。
- 无平台限制。
