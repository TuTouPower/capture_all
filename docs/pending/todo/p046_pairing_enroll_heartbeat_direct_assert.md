# p046 pairing 路径 enroll 后 heartbeat 直接断言

- 来源：t169 遗留
- 内容：t137 AC-003a（pairing code 零配置 enroll）后未直接断言 heartbeat 后续认证（AC-003b 的 heartbeat 走 MCP token 路径）。pairing 路径 enroll 后的 instance token 有效性无独立测试，建议补一条「pairing enroll → 用颁发 token heartbeat 200」。
- 处理：未开
