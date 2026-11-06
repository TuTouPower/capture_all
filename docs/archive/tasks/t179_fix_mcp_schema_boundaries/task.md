# Task spec

## 背景

MCP schema 未表达 Bridge/dispatcher 已知边界：`source`/`sources`/`format` 公开枚举未编码（BC-005），向 agent 暴露必失败调用（BM-L002）；多实例未指定目标的公开错误码文档与实现不一致（BC-009）。

## 契约区

### 范围

- MCP schema 编码公开的 `source`/`sources`/`format` 枚举，与 Bridge/dispatcher 实际接受的枚举一致。
- 使 schema 表达的边界与 Bridge/dispatcher 已知边界一致，错误在 tool 输入边界产生。
- 统一多实例未指定目标的公开错误码与实现。

### 非范围

- 不改变 MCP 工具的对外名称与语义。
- 不改变 Bridge 的 300000ms 超时上限（见 t175）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：非法 `source`/`sources`/`format` 值在 MCP Zod 层被拒绝，不进入 Bridge。
- [ ] AC-002：合法枚举值正常通过并执行。
- [ ] AC-003：多实例未指定目标的错误码文档与实现一致（文档与协议同步）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：Zod schema 校验 + 文档/协议一致性静态检查。

## 上下文区

- 来源：BC-005、BM-L002、BC-009（2026-08-13 核实）。

### 有意不测

- 无。

### 测试策略

- schema 校验单测 + 文档枚举与实现枚举的一致性测试。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：枚举与 Bridge 实际实现不一致导致误拒。
- 回退：以 Bridge/dispatcher 实际接受的枚举为唯一来源，schema 由共享常量派生。

### 依赖与约束

- 与 t175 共享超时常量；枚举由共享常量派生避免漂移。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：如补 MCP 枚举/错误码契约，同步。
