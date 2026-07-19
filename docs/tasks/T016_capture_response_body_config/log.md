# Task log - T016 capture_response_body_config

## 进展

- 2026-07-19：`src/extension/background/cdp_handler.ts` 在两条响应体采集路径前检查 `state.config.capture_response_body`：
  - `handle_response_received` 流式分支包裹 `if (capture_response_body)`，禁用时设 meta.response_body_status='not_enabled'，不加入 streaming_requests、不调 streamResourceContent。
  - `handle_loading_finished` 非流式分支前 early skip：直接构建 not_enabled body_result，发主条目并清理 meta，不调 Network.getResponseBody。

## 关键验证

- 红 -> 绿：cdp_response_body_config.test.ts 3 用例 -> 2 红 -> 全绿。
- 全量：`npm test` 93 文件 / 1100 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- 禁用时仍发主网络条目（仅元数据），保证网络时间线完整。
- 禁用时 body_status 用 'not_enabled'（与 OPTIONS/HEAD 无 body 同状态码），与 webRequest 路径对齐。
- 流式禁用时也清理 streaming_requests（防御性，因禁用根本不会加入）。

## 验收

- [x] capture_response_body=false 时 loadingFinished 不触发 Network.getResponseBody。
- [x] 事件 body_status 为 not_enabled。
- [x] 流式禁用时不调 streamResourceContent。
- [x] capture_response_body=true 时行为不变。
- [x] npm test 全绿。
