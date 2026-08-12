# d004 enroll 顶替防护用 Origin 扩展 ID 绑定 instance_id

- 来源：s003 spike（t137）
- 结论：扩展 instance_id 为 chrome.storage 会话持久化 uuid，重启不换；重 enroll 时以「首次登记该 instance_id 的 Origin 扩展 ID」为绑定信号，同扩展重启用同 Origin 扩展 ID 放行，伪造 origin 顶替因扩展 ID 不匹配被拒；heartbeat label 顶替同样以被认证实例自身绑定校验。
- 证据：`agent_bridge_config.ts` generate_instance_id 读回会话值；`server.ts` enroll/heartbeat 现均校验 origin_extension_id。
- 影响：bridge enroll 与 heartbeat label 顶替防护（t137）；ExtensionInstance 增 origin_extension_id 字段。
- 现状：有效
