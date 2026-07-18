# network_capture.ts 拆分计划

## 目标
将 1248 行的 `network_capture.ts` 拆分为 4 个模块，保持现有功能不变。

## 拆分方案

### 1. `cdp_handler.ts` (~340行)
职责：CDP 事件处理、子目标生命周期
- `handle_cdp_event()` 主函数
- `enable_response_body_capture()`
- `build_cdp_body_result()`
- CDP 事件子处理：requestWillBeSent, responseReceived, dataReceived, loadingFinished, loadingFailed
- 子目标处理：attachedToTarget, detachedFromTarget

### 2. `webrequest_handler.ts` (~360行)
职责：webRequest API 事件处理
- `handle_before_request()`
- `handle_before_send_headers()`
- `handle_headers_received()`
- `handle_completed()`
- `handle_error()`
- `build_network_event()`
- `build_cdp_primary_network_event()`

### 3. `ws_handler.ts` (~100行)
职责：WebSocket 连接和帧处理
- `send_ws_connection_event()`
- `send_ws_frame()`
- WebSocket 事件处理（webSocketCreated, webSocketWillSendHandshakeRequest 等）

### 4. `network_correlator.ts` (~80行)
职责：CDP-webRequest 关联、延迟/孤儿解析
- `try_resolve_deferred()`
- `schedule_orphan_check()`
- `find_matching_cdp_request()`
- `find_cdp_candidates()`
- `_deferred_cdp_index` 管理

### 5. `network_capture.ts` (保留 ~200行)
职责：模块协调、状态管理、启动/停止
- 模块级状态变量
- `start_network_capture()`
- `stop_network_capture()`
- 接口定义
- 工具函数（base64_decoded_size, is_self_origin_url）

## 状态管理策略

模块级状态保留在 `network_capture.ts`，通过参数传递给子模块：
- `pending_requests`, `cdp_request_meta`, `cdp_body_results`
- `ws_connections`, `streaming_requests`, `deferred_web_requests`
- `config`, `capture_id`, `start_time`, `send_to_background`

子模块通过回调或参数访问共享状态，避免循环依赖。

## 验证策略

1. 保持所有导出不变（`_xxx_for_test` 测试导出）
2. 运行现有测试套件确保无回归
3. 检查 TypeScript 编译无错误
4. 运行 build 验证扩展打包正常
