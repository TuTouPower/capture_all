# Task spec

## 背景

`timeout_ms` 在 MCP schema、工具实现、Bridge 与文档间漂移：MCP Zod 只校验正整数无上限，`get_status`/`list_browsers` schema 接受参数但 `execute_mcp_tool` 不读取；`BridgeMcpClient.get_status()` 固定 10s；指南称「所有工具支持 timeout_ms 且显式传入优先」，domain blueprint 又声明另一组默认值（30/120/15 秒），与 client/Bridge 的 120/300 秒冲突。

## 契约区

### 范围

- 抽取共享 `MAX_COMMAND_TIMEOUT_MS = 300000`，MCP Zod 用 `.max(...)`，Bridge 复用同一常量。
- `get_status`/`list_browsers` 把 timeout 传至 `BridgeMcpClient.get_status(timeout_ms)`，或从 schema 与指南删除该参数（二选一）。
- 统一 blueprint、指南、client、Bridge 的默认超时值。

### 非范围

- 不改变 Bridge 强制 300000ms 上限本身。
- 不重构 MCP schema 的其他字段（见 t179）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：`timeout_ms: 300001` 在 MCP Zod 层被拒绝，不进入 Bridge。
- [ ] AC-002：`get_status({timeout_ms: 1})` 与 `list_browsers({timeout_ms: 1})` 的 AbortSignal 实际为 1ms。
- [ ] AC-003：blueprint、指南、client、Bridge 中同一命令的默认超时值一致。
- [ ] AC-004：新增 schema→tool→client 参数传递测试，验证参数生效或参数已移除。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：Zod 校验 + spy `AbortSignal.timeout` 从 `execute_mcp_tool` 输入验证到达 client。

## 上下文区

- 来源：BM-M002、BC-002（CL-03；2026-08-13 核实，`492a37e` Bridge 后加上限未同步 MCP）。

### 有意不测

- 无。

### 测试策略

- spy `AbortSignal.timeout`；断言 MCP tool 分发把参数传给 client。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- status 类工具 `timeout_ms` 已确认（2026-08-13 用户决策）：保留参数并真正传入 `BridgeMcpClient.get_status(timeout_ms)`，使 `get_status`/`list_browsers` 可配置。

### 风险与回退

- 风险：统一默认值改变调用方对超时的既有预期。
- 回退：以 Bridge 实际行为为基准统一文档，不改变运行时默认。

### 依赖与约束

- 与 t179 MCP schema 边界修复共享常量与校验。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：统一超时默认值表。
