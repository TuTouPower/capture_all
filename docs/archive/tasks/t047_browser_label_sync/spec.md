# Task spec + log - T047 browser_label_sync

## 背景

`agent_bridge_client.ts:196-205,273-282` 有 session 时直接复用 instance_token 不重新 enroll；heartbeat 仅发 instance_id/版本/capture_id，不发送 browser_label。配置改 label 后 Bridge 实例元数据保留旧标签，按 label 路由可能选错实例。

## 范围

- agent_bridge_client.ts: send_heartbeat 加 browser_label 参数；调用点读 config.browser_label 传入。
- bridge/server.ts: heartbeat handler 显式同步 browser_label（包括清空为 null），不再 `?? prev` 回退；label 变化时顶替同 label 旧实例（与 enroll 一致）。

## 验收

- [x] heartbeat body 含 browser_label。
- [x] server 端显式更新 browser_label（包括 null 清空）。
- [x] label 变化触发顶替同 label 旧实例。
- [x] npm test 全绿。

## 进展

- 2026-07-19：send_heartbeat 加 browser_label；server heartbeat handler 显式同步 + 顶替逻辑。

## 决策

- 显式 null 表示用户清空 label，不再回退 prev（避免旧标签残留）。
- 顶替逻辑复用 enroll 的同 label 处理（cancel_all + 清 command_owners）。
