# Spec — content postMessage 注入通道 nonce

page 注入通道（network hook / websocket / storage）通过 `window.postMessage` 从页面 MAIN world 回传采集事件。为防页面脚本伪造，content 侧引入 per-start nonce 校验。

## 通道

三个注入脚本（`network_hook` / `websocket_capture` / `storage_capture`）同构：

- content 每次 start 生成 nonce（`generate_nonce()`：优先 `crypto.randomUUID`，http 非 secure context fallback Math.random）。
- `update_page_nonce` 注入无 guard 小脚本写 `window.__capture_all_*_nonce__`（MAIN world 变量）。
- 注入脚本 `post()` 每次发送从该 window 变量动态读 nonce 附到消息。
- content 接收端 `message_listener` 校验 `d.nonce === current_nonce`，否则丢弃。

## 生命周期

- per-start nonce 旋转：每次 start 更新 window 变量与接收端 `current_nonce`，旧 nonce 失效。
- stop→start 与扩展重建（reload/禁用→启用）均不破坏：注入脚本从 window 动态读，guard 阻止二次注入时仍发最新 nonce。
- 页面可直读 window nonce（伪造成本低），防护重点是跨采集伪造旧 nonce 失效；如需更强抗伪造用 per-message HMAC（超出本 spec）。

## 相关实现

- `src/extension/content/network_hook.ts` / `websocket_capture.ts` / `storage_capture.ts`：三通道
- `tests/unit/content_postmessage_nonce.test.ts`：nonce 校验 / 旋转 / 重启 / http fallback 测试
