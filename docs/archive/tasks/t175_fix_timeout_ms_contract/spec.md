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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：`timeout_ms: 300001` 在 MCP Zod 层被拒绝，不进入 Bridge。
- [ ] AC-002：`get_status({timeout_ms: 1})` 与 `list_browsers({timeout_ms: 1})` 的 AbortSignal 实际为 1ms。
- [ ] AC-003：blueprint、指南、client、Bridge 中同一命令的默认超时值一致。
- [ ] AC-004：新增 schema→tool→client 参数传递测试，验证参数生效或参数已移除。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：Zod 校验 + spy `AbortSignal.timeout` 从 `execute_mcp_tool` 输入验证到达 client。

## 上下文区

- 来源：BM-M002、BC-002（CL-03；2026-08-13 核实，`492a37e` Bridge 后加上限未同步 MCP）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- spy `AbortSignal.timeout`；断言 MCP tool 分发把参数传给 client。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- status 类工具 `timeout_ms` 已确认（2026-08-13 用户决策）：保留参数并真正传入 `BridgeMcpClient.get_status(timeout_ms)`，使 `get_status`/`list_browsers` 可配置。

### 风险与回退

- 风险：统一默认值改变调用方对超时的既有预期。
- 回退：以 Bridge 实际行为为基准统一文档，不改变运行时默认。

### 依赖与约束

- 与 t179 MCP schema 边界修复共享常量与校验。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：统一超时默认值表。
