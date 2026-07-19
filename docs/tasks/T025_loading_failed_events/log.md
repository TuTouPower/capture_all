# Task log - T025 loading_failed_events

## 进展

- 2026-07-19：三处失败请求生命周期修复：
  1. `cdp_handler.handle_loading_failed` 已有 meta 时立即发失败主条目（注入 error_text + response_body_status='cdp_failed'/'not_enabled'）+ 清理 meta/body/finished_before_stream/orphan_timer；无 meta 时保留 orphan_check 兜底。
  2. `webrequest_handler.handle_error` 已有 pending 时构造失败 NetworkRequestData（status_code=null, error_text=details.error, body_status='failed'）并 emit；清理 pending。
  3. `network_context.reset` 先遍历 deferred_web_requests clearTimeout，再 clear Map，避免回调在 reset 后仍执行。

## 关键验证

- 红 -> 绿：loading_failed_events.test.ts 4 用例 -> 3 红 -> 全绿。
- 全量：`npm test` 99 文件 / 1128 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- handle_loading_failed 用 `req_key.split(':').pop()` 取原 req_id 作输出 request_id；保持与 build_cdp_primary_network_event 签名一致。
- handle_error 复用 build_network_event 构造基础事件，再覆盖 status_code/error_text/response_body_status。
- network_context.reset 暂未删 cdp_primary_emitted 字段（与 T023 删除同步迁移成本高，独立 task 处理）。

## 验收

- [x] handle_loading_failed 已有 meta 时立即发失败主条目含 error_text。
- [x] handle_loading_failed 无 meta 时走 orphan_check（不发主条目）。
- [x] webRequest handle_error 发失败事件含 error_text、status_code=null。
- [x] network_context.reset 取消 deferred timer。
- [x] npm test 全绿。
