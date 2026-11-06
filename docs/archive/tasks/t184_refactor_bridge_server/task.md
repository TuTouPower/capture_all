# Task spec

## 背景

`create_bridge_server` 是 553 行单一闭包函数，同时承载状态/路由、pair/enroll、认证、heartbeat/command/result、MCP/file spill、CDP 路由。enroll 与 heartbeat 的「实例被顶替时删除 instance + cancel queue + 清 command owners」逻辑重复，安全修复须保证两条路径同步。CDP 已有 handler 模块，却仍与 pairing/MCP/extension route 编排混在一函数。

## 契约区

### 范围

- 保留薄 `create_bridge_server` 负责 state/context 构造与 `http.createServer`。
- 拆出 `handle_pair_route`、`handle_extension_route`、`handle_mcp_route`、`handle_cdp_route`。
- 抽 `BridgeRegistry`（instances/queues/owners）集中实现 `replace_instance`/`remove_instance`，消除 enroll/heartbeat 重复清理。
- 每个 route handler 返回统一 `{status, body}`；server 层只做 CORS、异常映射与发送。

### 非范围

- 不改变任何 endpoint 的对外行为与认证/权限语义。
- 不改变 `agent_bridge_server.test.ts` 的现有断言结果（行为等价重构）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：重构后全部既有 `agent_bridge_server` 与 `t137_bridge_security` 测试通过。
- [ ] AC-002：enroll 与 heartbeat 的实例顶替清理逻辑收敛到单一 `replace_instance`/`remove_instance`，无重复实现。
- [ ] AC-003：各 route handler 返回统一 `{status, body}`，server 层只做 CORS/异常映射/发送。
- [ ] AC-004：无 endpoint 行为变化（对外状态码、body、认证语义不变）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：既有 server 级测试作为行为 gate。

## 上下文区

- 来源：ARCH-004、BM-I001（2026-08-13 核实，初始 handler 自 `25ba3e9`/`cfed3fe`，t129 只拆指定 4 函数未覆盖此函数）。

### 有意不测

- 无。

### 测试策略

- 行为等价重构；以既有 server 级端到端单测为回归 gate。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：重构引入路由/异常映射行为差异。
- 回退：小步拆分，每步跑全量 server 测试；差异定位到具体 handler。

### 依赖与约束

- 与 t181（close 生命周期）在同域，注意合并冲突；可先做本重构再补生命周期。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：记录 Bridge server 路由分层。
