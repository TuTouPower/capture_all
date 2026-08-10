# p011 generate_nonce 三通道共享 helper

- 来源：t097 遗留（t097_code_f008，minor）
- 内容：network_hook / websocket_capture / storage_capture 三通道各有一份 verbatim 的 `generate_nonce()`（crypto.randomUUID + Math.random fallback）。可提取到共享模块（如 src/shared/event_utils.ts 或 content_event_utils.ts）复用，避免三处漂移。
- 处理：未开
