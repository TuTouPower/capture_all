# T071_websocket_nonce

本 task 的核心问题已在以下前序 task 中部分或完全修复：
- T021: WebSocket 单监听器采集 + 原生 listener 语义恢复。
剩余：per-page nonce 需改注入机制（MAIN world + MessageChannel），当前用固定 SIGNAL 字符串。产品风险评估后决定是否实施。
