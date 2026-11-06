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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：public `close()` 后 pending command 收到 `COMMAND_CANCELLED` 终态，不阻塞至 timeout。
- [ ] AC-002：close 后 CDP WebSocket 与 idle timer 被关闭/清理，不阻止进程退出。
- [ ] AC-003：close 不预调 `closeAllConnections` 也能快速完成。
- [ ] AC-004：offline 实例超过 TTL + grace 后被 sweep（queue cancel、instance/queue 删除、owner 清理）。
- [ ] AC-005：新增测试仅调用 public close，断言命令取消、WS 关闭、timer 清理、registry sweep。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：mock server/queue/cdp session 与 fake timer。

## 上下文区

- 来源：BM-M001、PERF-M006（2026-08-13 核实，public close 来自首版，`cancel_all` 注释明确「server close 时调用」但未调用）。

### 有意不测

- 无。

### 测试策略

- 只调 public close，不预调 closeAllConnections；断言命令取消、WS/timer 清理、registry sweep。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：graceful timeout 过短误杀正常命令。
- 回退：cancel_all 先发取消，再等有界 grace，最后 closeIdleConnections。

### 依赖与约束

- 复用 `AgentCommandQueue.cancel_all()` 与 cdp_handler session 生命周期。

### Finalization 时更新的 blueprint

- 无。
