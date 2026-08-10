# Task log - T020 input_event_event_id

## 进展

- 2026-07-19：消除 content_script `send_event` 旧格式分支，统一所有 content 模块走 `create_content_event`：
  - `dom_capture.ts`: `start_dom_capture` 签名加 `capture_id`/`capture_start_epoch_ms`/`tab_id`，`emit_input_event` 调 `create_content_event` 构造标准 base event。
  - `network_hook.ts`: 同样改造，type 用 `network_request`，NetworkRequestData 补全缺失字段（request_id/request_body_encoding 等）。
  - `content_script.ts`: send_event 签名收敛为 `(event, data?)`，删除旧 string type 分支，移除 `category_for_event_type` 未用 import。
  - `dom_capture_privacy.test.ts`: 同步更新调用方签名。

## 关键验证

- 红 -> 绿：dom_network_hook_event_id.test.ts 2 用例 -> 全红 -> 全绿。
- 全量：`npm test` 95 文件 / 1113 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- dom_capture/network_hook 与其他 capture 模块风格一致：start 时传完整上下文（capture_id/start_ms/tab_id），sender 接收 (CaptureEvent, data)。
- network_hook 的 EventType 用现有合法类型 `network_request`（移除非标 `network_body_hook`）。
- network_hook NetworkRequestData 字段补全（request_id 等必填字段不再缺）。

## 验收

- [x] dom_capture input 事件含 event_id 非空。
- [x] network_hook 事件含 event_id 非空，type='network_request'。
- [x] send_event 不再有 string type 分支（已删）。
- [x] npm test 全绿。
