# Task spec

## 背景

Bridge public `close()` 仅 `server.close(callback)`，不取消 pending command，不销毁 CDP sessions；一个 `/mcp/command` 可 await queue result 至 300s，close 会等到结果或超时。`AgentCommandQueue.cancel_all()` 已能清 timer/pending/commands 但 close 未调用；CDP sessions 为模块全局 Map，close 不触达。多实例 registry/queue 无 TTL 过期 sweep，offline 实例仍留 `instances`/`queues`，status 每次遍历全部历史实例。

## 契约区

### 范围

- public `close()` 开始时遍历 `queues.values()` 调 `cancel_all()`，清 `command_owners`/instances。
- 从 cdp_handler 导出 `destroy_all_sessions()`，close 时关闭所有 WS、timer、映射。
- 之后 `closeIdleConnections`/`server.close`，定义有界 graceful timeout。
- 增加过期实例 sweep：超过 TTL + grace 后 `cancel_all()`、删除 queue/instance、清理 `command_owners`（enroll/heartbeat/status 懒清理或 interval）。

### 非范围

- 不改变命令 timeout 上限数值。
- 不重构 registry 数据结构（仅补清理）。

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

- [ ] AC-001：public `close()` 后 pending command 收到 `COMMAND_CANCELLED` 终态，不阻塞至 timeout。
- [ ] AC-002：close 后 CDP WebSocket 与 idle timer 被关闭/清理，不阻止进程退出。
- [ ] AC-003：close 不预调 `closeAllConnections` 也能快速完成。
- [ ] AC-004：offline 实例超过 TTL + grace 后被 sweep（queue cancel、instance/queue 删除、owner 清理）。
- [ ] AC-005：新增测试仅调用 public close，断言命令取消、WS 关闭、timer 清理、registry sweep。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：mock server/queue/cdp session 与 fake timer。

## 上下文区

- 来源：BM-M001、PERF-M006（2026-08-13 核实，public close 来自首版，`cancel_all` 注释明确「server close 时调用」但未调用）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 只调 public close，不预调 closeAllConnections；断言命令取消、WS/timer 清理、registry sweep。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：graceful timeout 过短误杀正常命令。
- 回退：cancel_all 先发取消，再等有界 grace，最后 closeIdleConnections。

### 依赖与约束

- 复用 `AgentCommandQueue.cancel_all()` 与 cdp_handler session 生命周期。

### Finalization 时更新的 blueprint

- 无。
