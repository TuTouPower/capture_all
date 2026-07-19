# Task spec — T016 capture_response_body_config

## 背景

`src/extension/background/cdp_handler.ts:41-49` 声明 `capture_response_body` 配置但：

- `handle_response_received:277-305` 检测到流式响应（SSE/chunked）后无条件调 `Network.streamResourceContent` 并 buffer 内容。
- `handle_loading_finished:346-351` 非流式响应无条件调 `Network.getResponseBody`。

用户关闭 `capture_response_body` 后仍采集响应内容，违反隐私配置；同时增加 CDP/内存/IndexedDB/导出负载。

## 范围

代码/配置：

- `src/extension/background/cdp_handler.ts`：
  - `handle_response_received` 流式分支前检查 `state.config.capture_response_body`：禁用时不加入 `streaming_requests`、不调 `streamResourceContent`、meta.response_body_status 设 `not_enabled`。
  - `handle_loading_finished` 非流式分支前检查：禁用时不调 `Network.getResponseBody`，直接构建 `body_result = {body: null, status: 'not_enabled', ...}`，仍走 `build_cdp_primary_network_event` 发主条目并清理 meta。

测试：

- `tests/unit/network_cdp.test.ts` 或新建 `tests/unit/cdp_response_body_config.test.ts`：
  - `capture_response_body=false` 时 `loadingFinished` 不触发 `Network.getResponseBody` sendCommand（mock 计数）。
  - 响应 body_status 为 `not_enabled`。
  - 流式响应禁用时不入 streaming_requests。

文档：

- 无 blueprint 改动。

## 非范围

- 不改 webRequest 路径（无 response body 采集能力）。
- 不改 request body 配置（与 response 独立）。
- 不改 `is_streaming_response` 识别逻辑。

## 验收标准

- [ ] `capture_response_body=false` 时 `loadingFinished` 后 sendCommand(`Network.getResponseBody`) 调用次数为 0。-> 验证：单测。-> 预期：mock sendCommand 调用次数 0。
- [ ] 事件 body_status 为 `not_enabled`。-> 验证：单测。-> 预期：event.data.response_body_status === 'not_enabled'。
- [ ] 流式响应在禁用时不调 streamResourceContent。-> 验证：单测。-> 预期：sendCommand(`Network.streamResourceContent`) 次数 0。
- [ ] `capture_response_body=true` 时行为不变（向后兼容）。-> 验证：现有用例。-> 预期：原测试全绿。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：`capture_response_body=false` 时不应采集响应内容。
- 无数据迁移。
- 无平台限制。
