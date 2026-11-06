# Task spec

## 背景

Extension Bridge client 的 enroll/heartbeat/command fetch 用原生 `fetch` 无 `signal`，任一请求永久 pending 则 `poll_cycle` 不返回，后续 timer 不再安排；`stop_bridge_client` 只清已安排 timer 和 lifecycle 标志，不能 abort 当前 fetch。MCP 侧同类 client 已用 `AbortSignal.timeout`，此路径不一致。

## 契约区

### 范围

- 每个 lifecycle 建 `AbortController`，stop 时 `abort()`。
- enroll/heartbeat/command fetch 使用短 timeout（heartbeat 与 5 秒 TTL 协调），result 使用 command/full-data budget。
- 组合 `AbortSignal.any([lifecycle.signal, AbortSignal.timeout(ms)])`。

### 非范围

- 不改变 Bridge 侧 TTL 与命令队列超时数值。
- 不重构 poll 调度逻辑（仅加取消能力）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：`stop_bridge_client` 后 in-flight 请求被 abort，`poll_cycle` 不再等待 deferred resolve。
- [ ] AC-002：enroll/heartbeat/command fetch 超过各自 timeout 被 abort。
- [ ] AC-003：restart 后无 stale in-flight 请求残留。
- [ ] AC-004：新增 timeout、stop-abort、restart 后无 stale 请求测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：mock fetch + deferred + fake timer 断言 abort。

## 上下文区

- 来源：PERF-M005（2026-08-13 核实，核心 fetch 自 `f0763c03` 存在，多实例/重试后仍未加 signal）。

### 有意不测

- 无。

### 测试策略

- mock fetch 返回永不 resolve 的 deferred，断言 stop/timeout 触发 abort。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- heartbeat 与 5 秒 TTL 的合理 timeout 取值：结论=`heartbeat=4000ms`（< Bridge `EXTENSION_TTL_MS` 5000，留 1s 余量，避免 slow heartbeat 期间被判 offline）、`enroll=5000ms`、`command fetch=5000ms`（轮询取命令，短超时不影响命令执行）、`result=MAX_COMMAND_TIMEOUT_MS`（300s，结果 body 可能大；2026-08-13 按 `src/bridge/server.ts` EXTENSION_TTL_MS 与 MCP client AbortSignal.timeout 模式核实）。

### 风险与回退

- 风险：timeout 过短误伤正常慢响应。
- 回退：heartbeat timeout 与 TTL 协调（小于 TTL），result 用 command budget。

### 依赖与约束

- 与 Bridge 侧 5 秒 TTL 协调。

### Finalization 时更新的 blueprint

- 无。
