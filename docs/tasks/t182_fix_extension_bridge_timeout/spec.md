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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：`stop_bridge_client` 后 in-flight 请求被 abort，`poll_cycle` 不再等待 deferred resolve。
- [ ] AC-002：enroll/heartbeat/command fetch 超过各自 timeout 被 abort。
- [ ] AC-003：restart 后无 stale in-flight 请求残留。
- [ ] AC-004：新增 timeout、stop-abort、restart 后无 stale 请求测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：mock fetch + deferred + fake timer 断言 abort。

## 上下文区

- 来源：PERF-M005（2026-08-13 核实，核心 fetch 自 `f0763c03` 存在，多实例/重试后仍未加 signal）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock fetch 返回永不 resolve 的 deferred，断言 stop/timeout 触发 abort。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- heartbeat 与 5 秒 TTL 的合理 timeout 取值：`UNVERIFIED-SPIKE`，执行期按 Bridge TTL 常量核实。

### 风险与回退

- 风险：timeout 过短误伤正常慢响应。
- 回退：heartbeat timeout 与 TTL 协调（小于 TTL），result 用 command budget。

### 依赖与约束

- 与 Bridge 侧 5 秒 TTL 协调。

### Finalization 时更新的 blueprint

- 无。
