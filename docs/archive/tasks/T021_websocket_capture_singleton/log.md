# Task log - T021 websocket_capture_singleton

## 进展

- 2026-07-19：重写 `src/extension/content/websocket_capture.ts` PAGE_SCRIPT：
  - 单一内部 message listener：PatchedWP 构造时调用 `ws.addEventListener('message', ...)` 注册一次采集 listener，不再重写 onmessage setter / 不再包装业务 addEventListener。页面 listener 保持原生调用链，单条消息只采集一次。
  - `removeEventListener` 透传原生：不再有 wrapper 映射，移除即生效。
  - data_bytes 用 UTF-8 字节长度（TextEncoder，旧环境 fallback 手动编码）。
  - tab_id 不再硬编码 0：start_websocket_capture 加 tab_id 参数，content_script.ts 调用点更新。
  - 导出 PAGE_SCRIPT 供测试 eval 验证。

## 关键验证

- 红 -> 绿：websocket_capture_injected_script.test.ts 4 用例覆盖单 listener、removeEventListener 透传、UTF-8 字节、sent post。全绿。
- 全量：`npm test` 96 文件 / 1117 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- 注入脚本不重写 onmessage setter / addEventListener，避免破坏页面 WebSocket 语义。
- UTF-8 字节长度用 TextEncoder 优先，旧环境手动编码 fallback（3 字节汉字、4 字节 emoji 等）。
- PAGE_SCRIPT 导出仅为测试便利（eval 验证），生产仍走 textContent 注入。

## 验收

- [x] 单 listener：页面注册多个 listener 时单次消息仅采集 1 次。
- [x] removeEventListener 透传：移除后 handler 不再被调。
- [x] UTF-8 字节：'中文' = 6 字节。
- [x] sent post 正常。
- [x] npm test 全绿。
