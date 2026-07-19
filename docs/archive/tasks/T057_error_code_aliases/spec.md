# Task spec + log - T057 error_code_aliases

## 背景

`protocol.ts:17-37` AgentErrorCode 仍用 SESSION/RECORDING 旧术语，与领域文档要求的 capture 术语冲突。直接迁移是 breaking change。

## 范围

- AgentErrorCode 新增 capture 系列：CAPTURE_NOT_FOUND / CAPTURE_ALREADY_RUNNING / NO_ACTIVE_CAPTURE。
- 旧码保留作为兼容别名，附废弃期限注释（v2.0 移除）。
- 新增 ERROR_CODE_ALIASES 映射表，供 dispatcher 与客户端渐进迁移。

## 验收

- [x] 新 capture 错误码在 AgentErrorCode 联合类型中声明。
- [x] ERROR_CODE_ALIASES 映射旧码到新码。
- [x] npm test 全绿。

## 进展

- 2026-07-19：声明新码 + 兼容别名 + 映射表。dispatcher 暂继续返回旧码，新客户端可通过映射表渐进迁移。

## 决策

- 渐进迁移而非 breaking change：旧客户端继续收到旧码，新客户端可主动使用新码。
- dispatcher 切换新码留作后续 task（需更新所有 dispatcher 测试断言）。
