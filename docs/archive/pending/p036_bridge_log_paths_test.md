# p036 AC-008 bridge 日志路径测试补全

- 来源：t150 遗留（test_f002 minor）
- 内容：bridge 结构化日志（bridge/logger.ts）的 `auth_failed` 已有测试覆盖，但 `command_timeout`（server.ts）与 `cdp_event_evicted`（cdp_handler.ts）两条日志路径无测试。补用例验证超时/淘汰时输出 JSON 行。非阻断（auth_failed 已证明机制）。
- 处理：t196
