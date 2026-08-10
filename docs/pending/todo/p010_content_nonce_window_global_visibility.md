# p010 content nonce 存页面 window 全局可见性

- 来源：t097 遗留（t097_code_f007，minor）
- 内容：nonce 存页面 MAIN world 的 `window.__capture_all_*_nonce__`，页面脚本可直读直写。spec 范围表述为「content 生成、注入脚本持有、接收端校验」，动态 window 方案为解耦 stop→start/扩展重建的必要取舍；页面可伪造 nonce 使采集门控退化。当前防护仍优于 SIGNAL-only（nonce 每次 start 旋转，跨采集伪造旧 nonce 失效）。若需更强抗伪造，可改为 per-message HMAC（超出本 task）。
- 处理：未开
