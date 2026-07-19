# Task plan — T016 capture_response_body_config

## 步骤

1. 红：新建 `tests/unit/cdp_response_body_config.test.ts` 覆盖 3 项验收。
2. 红：跑测试失败。
3. 绿：
   - `handle_response_received:277` 流式分支包裹 `if (state.config.capture_response_body)`；禁用时 meta.response_body_status='not_enabled' 并不加入 streaming_requests。
   - `handle_loading_finished:346` 非流式 sendCommand 分支前 `if (!state.config.capture_response_body)` 直接走 not_enabled body_result + 发主条目 + return。
4. 全量 `npm test` + `tsc --noEmit`。
5. log + commit + 归档。

## 风险与回退

- 风险：流式禁用时 meta.response_body_status 字段后续被覆盖。缓解：在 streaming 分支外加 early skip 后 `return`，确保不再进入 stream buffer 路径。
- 回退：`git revert <commit>`。
