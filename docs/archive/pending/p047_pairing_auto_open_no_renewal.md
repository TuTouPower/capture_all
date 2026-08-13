# p047 pairing_auto_open 窗口过期无自动续期

- 来源：t169 遗留
- 内容：Bridge 启动自动 open pairing 窗口（5 分钟）过期后不自动续期。窗口过期时扩展 resolve_pairing_code 拿不到 code → enroll 401 → 扩展轮询重试；MCP 客户端可再次 /pair/open 续窗。接受为已登记风险（spec 风险与回退），未自动续期保持安全默认。若需改善多实例/晚到浏览器体验，可评估「未消费时到期自动续窗」。
- 处理：t196
