# Task spec - T021 websocket_capture_singleton

## 背景

`src/extension/content/websocket_capture.ts` 三个缺陷：

1. `onmessage` setter (line 76-89) + 每个 `addEventListener('message')` 包装器 (line 91-107) 各自调 `post(url, 'received', ev.data)`。同一消息若页面注册多个 message listener，或同时用 `onmessage` 与 `addEventListener`，会被重复采集。
2. `removeEventListener('message', original)` 找不到 wrapper（wrapper 未映射回 original），listener 无法被移除，页面 listener 泄漏；`message_wrappers` 只写不读。
3. `PAGE_SCRIPT` 中 `data_bytes = data.length` 是 UTF-16 code unit 数，非 UTF-8 字节数；中文/emoji 大小与截断状态失真。

## 范围

代码/配置：

- `src/extension/content/websocket_capture.ts`：
  - 重写注入脚本：每个 WebSocket 实例只注册一个内部原始 `message` 监听器负责采集；页面 `onmessage`/`addEventListener`/`removeEventListener` 保持原生语义，不在每个业务 listener 包装器内重复 post。
  - `removeEventListener` 保留原生语义（直接透传 orig）。
  - `data_bytes` 字符串用 UTF-8 字节长度（注入脚本内用 `TextEncoder` 或手动编码计字节）。
- 同样修复 `tab_id: 0` 硬编码（与 T013 storage 同类问题）：`start_websocket_capture` 加 `tab_id` 参数。

测试：

- `tests/unit/websocket_capture_page.test.ts` 或新建：
  - 单次消息只采集一次（页面注册多个 listener）。
  - `removeEventListener` 移除后该 listener 不再被调。
  - 字符串 data_bytes 用 UTF-8 字节（中文 3 字节/字符）。

文档：

- 无 blueprint 改动。

## 非范围

- 不改注入机制（T071 nonce + schema 处理伪造防护）。
- 不改 content script 侧 message_listener。

## 验收标准

- [ ] 单条消息只采集一次（页面同时 onmessage + addEventListener）。-> 验证：单测。-> 预期：send_event 被调 1 次。
- [ ] `removeEventListener('message', handler)` 后 handler 不再被调。-> 验证：单测。-> 预期：handler 被移除。
- [ ] 字符串 data_bytes 用 UTF-8 字节（'中文' = 6 字节）。-> 验证：单测。-> 预期：data_bytes === 6。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：WebSocket 采集不重复；listener 语义透明；data_bytes 字节口径正确。
- 无数据迁移。
- 无平台限制。
