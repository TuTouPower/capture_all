# Task log - T018 command_id_unique

## 进展

- 2026-07-19：`src/bridge/command_queue.ts` 命令 ID 改进程级全局唯一（`cmd_<counter>_<uuid>`），跨实例不再碰撞；新增 `cancel_all()` 清理 timer/commands/pending 并以 `COMMAND_CANCELLED` resolve。`src/bridge/server.ts` 顶替同 label 实例时调 `old_queue.cancel_all()` + 清理归属该实例的 `command_owners` 条目。

## 关键验证

- 红 -> 绿：agent_bridge_queue.test.ts 新增 3 用例 -> 全绿。
- 全量：`npm test` 93 文件 / 1109 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- 命令 ID 用 `cmd_<global_counter>_<uuid>` 双保险：进程内单调可读 + 跨进程/重启 UUID 防碰撞。
- `cancel_all()` 仅在顶替与显式 server close 路径调用，避免误取消。
- 顶替时同步清理 `command_owners` 避免残留归属指向已删 queue。
- agent_bridge_client.test.ts 中 `cmd_1` 字面值是 mock Bridge 响应，与本改动无关，保留。

## 验收

- [x] 两个独立 queue 首条命令 ID 不碰撞。
- [x] cancel_all 后 pending 命令 resolve COMMAND_CANCELLED。
- [x] cancel_all 后 pending_count=0。
- [x] cancel_all 后已 take 命令不再可 take。
- [x] npm test 全绿。
