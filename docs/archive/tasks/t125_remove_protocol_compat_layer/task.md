# Task spec

## 背景

`src/shared/protocol.ts` 与 `src/shared/types.ts` 存在标注「v2.0 移除」的协议兼容层：`ERROR_CODE_ALIASES`（旧错误码→新码映射，`protocol.ts:45`）、`protocol.ts:27` 附近的旧码兼容别名、`types.ts:717-727` 的 6 个 `@deprecated` 类型别名（`CaptureRecord` / `CaptureEvent` / `CaptureConfig` / `ConsoleEventData` / `NetworkRequestData` / `RuntimeExceptionData`）。用户 2026-08-11 明确决策：不考虑兼容、不考虑最小修改，直接破坏性升级移除。

## 契约区

### 范围

- 删除 `protocol.ts` 的 `ERROR_CODE_ALIASES` 及旧码兼容别名（含注释）。
- 删除 `types.ts` 的 6 个 `@deprecated` 类型别名。
- 迁移本仓全部引用（生产 + 测试）到新码/新类型名。
- 同步检查 `schemas/` 跨服务接口契约是否引用旧码/旧类型名，若有则同步更新。

### 非范围

- 不改新码与新类型名的语义。
- 不改协议消息结构本身（仅移除别名层）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：`ERROR_CODE_ALIASES` 与旧码兼容别名不存在，src 与 tests 无引用（grep 验证）。
- [ ] AC-002：`types.ts` 6 个 `@deprecated` 类型别名不存在，src 与 tests 全部使用新类型名。
- [ ] AC-003：`schemas/` 契约与迁移后代码一致，无旧码/旧类型名残留。
- [ ] AC-004：`npm test` 全绿，`npx tsc --noEmit` 通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：符号引用 grep 断言 + 测试套件 + schemas 检查。

## 上下文区

- 来源：无（审阅发现，2026-08-11；用户同日确认破坏性升级决策）

### 有意不测

- 无。

### 测试策略

- 迁移引用后跑全量 vitest + tsc。错误码相关测试（protocol / mcp / agent 协议）验证新码语义不变。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 本仓外 agent 客户端若使用旧错误码将无法识别新协议：风险由用户 2026-08-11 破坏性升级决策接受（不考虑兼容），不阻塞执行；同仓引用创建期已核实可迁移。

### 风险与回退

- 风险：对外协议破坏，外部 agent 客户端若仍发旧错误码将无法识别。用户已确认破坏性升级接受此风险。
- 回退：git 恢复别名定义（协议版本未发布则无兼容负担）。

### 依赖与约束

- 无。与 t124 互不重叠（t124 清理内部死导出，本 task 清理协议兼容层）。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：若存在「v2.0 移除兼容层」相关决策记录，更新为已移除结论。
