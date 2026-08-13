# p048 network body redaction 落库集成测试

- 来源：t171 遗留
- 内容：`handle_network_request` 落库前 body 脱敏接入（service_worker.ts）无集成测试。算法已由 body_redaction.test.ts 11 用例覆盖，接入点 12 行无分支胶水；建议后续补「redact_data 时带敏感 body 的请求经 handle_network_request 落库后存储为脱敏值」集成用例。
- 处理：未开
