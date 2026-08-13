# Task spec

## 背景

Bridge 侧三条遗留（pending 总账）：结构化日志 `command_timeout`（server.ts）与 `cdp_event_evicted`（cdp_handler.ts）路径无测试（p036，仅 auth_failed 有覆盖）；pairing 路径 enroll 后 heartbeat 走颁发 instance token 认证无独立断言（p046）；Bridge 启动自动 open pairing 窗口过期后不自动续期（p047，已登记为接受风险，需明确决策或实现）。

## 契约区

### 范围

- 补 `command_timeout` 与 `cdp_event_evicted` 两条日志路径的 JSON 行输出测试。
- 补「pairing enroll → 用颁发 instance token heartbeat 200」直接断言。
- p047 明确决策：保持不自动续期（安全默认）并在文档记录，或实现「未消费到期自动续窗」。

### 非范围

- 不改动既有认证/配对语义（决策性改动除外）。

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

- [ ] AC-001：命令超时产生 `command_timeout` 结构化日志行（JSON，含 command_id/type/timeout_ms）。
- [ ] AC-002：CDP 事件淘汰产生 `cdp_event_evicted` 结构化日志行。
- [ ] AC-003：pairing code 完成 enroll 后，用返回的 instance token 调 heartbeat 返回 200。
- [ ] AC-004：p047 决策落定——保持不自动续期并记录于 decisions.md，或实现自动续窗（含测试）。
- [ ] AC-005：新增测试全绿，既有 bridge 测试无回归。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：server/cdp_handler 日志路径 mock 断言；pairing enroll 流程既有 server 测试模式。

## 上下文区

- 来源：p036（t150 遗留 test_f002）、p046（t169 遗留）、p047（t169 遗留）。2026-08-14 核实：`bridge/logger.ts` 有 auth_failed 测试，command_timeout/cdp_event_evicted 无；t137 AC-003b heartbeat 走 MCP token 路径，pairing token 路径无独立断言。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- server 测试 mock 命令超时/事件淘汰触发日志；pairing enroll 复用既有 server 测试夹具。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：日志路径测试依赖计时（超时）脆弱。
- 回退：注入可观测钩子或缩短超时窗口。

### 依赖与约束

- 复用 `agent_bridge_server.test.ts` 夹具与 bridge logger 结构化输出。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：如 p047 决策记录，同步。
