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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：`ERROR_CODE_ALIASES` 与旧码兼容别名不存在，src 与 tests 无引用（grep 验证）。
- [ ] AC-002：`types.ts` 6 个 `@deprecated` 类型别名不存在，src 与 tests 全部使用新类型名。
- [ ] AC-003：`schemas/` 契约与迁移后代码一致，无旧码/旧类型名残留。
- [ ] AC-004：`npm test` 全绿，`npx tsc --noEmit` 通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：符号引用 grep 断言 + 测试套件 + schemas 检查。

## 上下文区

- 来源：无（审阅发现，2026-08-11；用户同日确认破坏性升级决策）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 迁移引用后跑全量 vitest + tsc。错误码相关测试（protocol / mcp / agent 协议）验证新码语义不变。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 本仓外 agent 客户端若使用旧错误码将无法识别新协议：风险由用户 2026-08-11 破坏性升级决策接受（不考虑兼容），不阻塞执行；同仓引用创建期已核实可迁移。

### 风险与回退

- 风险：对外协议破坏，外部 agent 客户端若仍发旧错误码将无法识别。用户已确认破坏性升级接受此风险。
- 回退：git 恢复别名定义（协议版本未发布则无兼容负担）。

### 依赖与约束

- 无。与 t124 互不重叠（t124 清理内部死导出，本 task 清理协议兼容层）。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：若存在「v2.0 移除兼容层」相关决策记录，更新为已移除结论。
