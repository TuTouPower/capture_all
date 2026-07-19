# Task plan - T021 websocket_capture_singleton

## 步骤

1. 红：扩展 `tests/unit/websocket_capture_page.test.ts` 覆盖 3 项验收。
2. 红：跑测试失败。
3. 绿：
   - 重写 PAGE_SCRIPT：每个 PatchedWS 实例只在构造时注册一次内部 message listener 调 post；不重写 onmessage setter / addEventListener（透传原生）。
   - data_bytes 用 UTF-8 字节（注入脚本内实现 utf8_byte_len）。
   - start_websocket_capture 加 tab_id 参数；content_script.ts 调用点更新。
4. 全量 `npm test` + `tsc --noEmit`。
5. log + commit + 归档。

## 风险与回退

- 风险：单内部 listener 可能被页面后续覆盖。缓解：用 addEventListener 而非 onmessage setter，且在 PatchedWS 构造时立即注册。
- 风险：jsdom 测试环境 WebSocket mock。缓解：用现有 websocket_capture_page 测试设施（如有）。
- 回退：`git revert <commit>`。
