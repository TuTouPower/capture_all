# Task plan - T018 command_id_unique

## 步骤

1. 红：扩展 `tests/unit/agent_bridge_queue.test.ts` 覆盖命令 ID 唯一性 + cancel_all 行为；扩展 `tests/unit/agent_bridge_server.test.ts` 覆盖顶替同 label 时旧命令取消。
2. 红：跑测试失败。
3. 绿：
   - `command_queue.ts`：模块级 `global_command_counter` 单调计数 + `randomUUID()` 后缀（或直接 UUID），跨实例唯一；新增 `cancel_all()`。
   - `server.ts:292`：顶替前 `old_queue.cancel_all()` + 清理 command_owners 中归属该实例的条目。
4. 全量 `npm test` + `tsc --noEmit`。
5. log + commit + 归档。

## 风险与回退

- 风险：现有测试可能断言 `command_id === 'cmd_1'` 字面值。缓解：grep 调用方。
- 风险：cancel_all 影响 server close。缓解：仅在顶替与显式 close 时调用。
- 回退：`git revert <commit>`。
