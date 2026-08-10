# Task plan — T002 shared_protocol_relocate

## 步骤与验证

1. `git mv src/agent/shared/protocol.ts src/shared/protocol.ts` → 验证：`ls src/shared/protocol.ts` 存在
2. 改 5 处 import：`src/extension/background/*` 由 `'../agent/shared/protocol'` 改为 `'../shared/protocol'`；`tests/*` 由 `'../src/agent/shared/protocol'` 改为 `'../src/shared/protocol'` → 验证：`grep -rn 'agent/shared/protocol'` 无输出
3. `rmdir src/agent/shared` → 验证：目录不存在
4. `npm test` → 验证：全绿
5. `npm run build` → 验证：全绿
6. 建 `task_t002_shared_protocol_relocate` 分支；commit `refactor: move agent protocol into src/shared`

## 风险与回退

- 风险：import 漏改导致 tsc 或测试红。
- 缓解：grep 全仓扫描 + tsc/vitest 失败即停。
- 风险：bridge / mcp 间接 import protocol 出现循环依赖。
- 缓解：protocol.ts 是纯类型定义，无运行时副作用；build 后 bridge.mjs / mcp.mjs 正常生成。
- 回退：`git reset --hard` 后恢复 `src/agent/shared/protocol.ts`。

## Finalization 时更新的 blueprint

- 无需更新。`decisions.md §003` 已记 shared 扁平策略；本次是该策略的具体落地，不形成新决策。
