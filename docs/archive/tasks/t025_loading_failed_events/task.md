# Task spec - T025 loading_failed_events

## 背景

`src/extension/background/cdp_handler.ts:466-475` `handle_loading_failed` 只设 `cdp_body_results` 并走 orphan_check，不像 `loadingFinished` 那样已有 meta 时直接发主条目。失败请求（DNS/TLS/CORS 前置失败/连接重置）延迟 3 秒输出，若 capture 3 秒内停止则丢失，且 Map/Set 残留。

`src/extension/background/webrequest_handler.ts:188-192` `handle_error` 仅删 pending，不构造 NetworkRequestData，CDP 未附加 tab 的失败请求从采集中消失。

`src/extension/background/network_context.ts:114-127` `reset()` 直接 clear deferred_web_requests，未 clearTimeout 各 entry.timer，回调仍会执行。

## 范围

代码/配置：

- `cdp_handler.ts`：`handle_loading_failed` 已有 meta 时直接 emit 失败主条目（含 error_text 来自 params.errorText），清理 meta/body/finished_before_stream/orphan_timer；否则保留 orphan_check 兜底。
- `webrequest_handler.ts`：`handle_error` 构造失败 NetworkRequestData（status_code=null, error_text=details.error, body_status='failed'），emit 并清理 pending + deferred。
- `network_context.ts`：`reset()` 先遍历 deferred_web_requests clearTimeout，再 clear。

测试：

- 新建 `tests/unit/loading_failed_events.test.ts`：
  - handle_loading_failed 已有 meta 时立即发主条目，含 error_text，meta 清理。
  - webRequest handle_error 发失败事件含 error_text。
  - network_context.reset 取消 deferred timer（mock setTimeout）。

文档：

- 无 blueprint 改动。

## 非范围

- 不改 deferred 关联算法（T069 处理）。

## 验收标准

- [ ] handle_loading_failed 已有 meta 时同步发失败主条目。-> 验证：单测。-> 预期：emitted 含 error_text。
- [ ] webRequest handle_error 发失败事件。-> 验证：单测。-> 预期：emitted 含 error_text 与 status_code=null。
- [ ] network_context.reset 取消 deferred timer。-> 验证：单测。-> 预期：clearTimeout 被调 N 次。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：失败请求不延迟丢失；deferred timer 不残留。
- 无数据迁移。
- 无平台限制。
