# Task spec - T018 command_id_unique

## 背景

`src/bridge/command_queue.ts:9-20` 每个 `AgentCommandQueue` 实例独立从 `next_id=1` 计数生成 `cmd_1/cmd_2/...`，但 `src/bridge/server.ts:58` `command_owners` 是全局 `Map<string, string>` 仅按 `command_id` 索引。两个实例并发首条命令都生成 `cmd_1`，后写入者覆盖前者归属，先返回结果的实例被判"command_id does not belong to this instance"被拒，任一完成后又删除另一条同名命令归属。多实例路由核心不可靠。

另外 `server.ts:292` 顶替同 label 实例时直接 `queues.delete(id)`，旧队列中 pending promise/timer 仍存活，最长等 120/300s 超时返回 `COMMAND_TIMEOUT`。已定义 `COMMAND_CANCELLED` 错误码（`protocol.ts:22`）但未使用。

## 范围

代码/配置：

- `src/bridge/command_queue.ts`：
  - 命令 ID 改进程级唯一：用模块级单调计数器或 `randomUUID()` 生成 `cmd_<uuid>`，不再每实例从 1 计数。
  - 新增 `cancel_all(): void`：遍历 pending 清理 timer、命令数组、pending map，每个 pending 以 `{ok:false, error:{code:'COMMAND_CANCELLED', message:'Command cancelled'}}` resolve。
- `src/bridge/server.ts`：
  - 顶替同 label 实例（line 285-294）删 queue 前调 `queue.cancel_all()`，并清理对应 `command_owners` 条目。
  - server close 路径（如有）同样调 cancel_all。

测试：

- `tests/unit/agent_bridge_server.test.ts`（或新建）：
  - 两个独立 queue enqueue 首条命令，command_id 不碰撞。
  - `cancel_all()` 后 pending promise resolve `COMMAND_CANCELLED`，pending_count 归 0。
  - 顶替同 label 时旧实例 pending 命令 resolve `COMMAND_CANCELLED`（如可在 server 层测试）。

文档：

- 无 blueprint 改动。

## 非范围

- 不改 MCP schema 或 client 协议。
- 不改 result 投递重试（T046 处理）。

## 验收标准

- [ ] 两个独立 AgentCommandQueue 实例首条命令 command_id 不同。-> 验证：单测。-> 预期：q1.enqueue().command.command_id !== q2.enqueue().command.command_id。
- [ ] `cancel_all()` 后所有 pending promise resolve `{ok:false, error.code:'COMMAND_CANCELLED'}`。-> 验证：单测。-> 预期：result.ok === false && error.code === 'COMMAND_CANCELLED'。
- [ ] `cancel_all()` 后 pending_count() === 0。-> 验证：单测。-> 预期：0。
- [ ] 顶替同 label 实例时旧 queue 的 pending 命令 resolve COMMAND_CANCELLED。-> 验证：单测（server 层）。-> 预期：旧 pending result error.code === 'COMMAND_CANCELLED'。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：多实例路由命令 ID 全局唯一；实例顶替时旧命令有明确取消语义而非超时。
- 无数据迁移。
- 无平台限制。
