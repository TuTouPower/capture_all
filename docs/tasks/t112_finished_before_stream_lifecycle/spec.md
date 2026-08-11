# Task spec

## 背景

`finished_before_stream` 标记本应用于 `Network.loadingFinished` 早于 `Network.responseReceived` 的竞态窗口，但生产路径在每个 `loadingFinished` 无条件写入，并在普通响应、SSE、body 获取失败与 orphan 终态后遗漏删除。长时间或高请求量采集会线性占用 Service Worker 内存；requestId 复用时还可能把后续 SSE 误判为已完成流，跳过流式读取并降级为 partial。

## 契约区

### 范围

- 修复 `src/extension/background/network_capture.ts` 生产路径中 `finished_before_stream` 的全部终态与早退清理。
- 修复 `src/extension/background/cdp_handler.ts` 中同因复制实现的剩余早退路径，或消除两处重复实现并统一生命周期语义。
- 覆盖 root target 与子 session 的标记生命周期回归测试。

### 非范围

- 不清理 p006 的 `cdp_primary_emitted` 死代码；该机制与修复策略独立。
- 不重构 Bridge 侧 CDP 事件处理；`src/bridge/cdp_handler.ts` 不使用该竞态标记。
- 不改变 SSE 捕获、body 获取或 orphan 延迟等业务语义，只补齐标记生命周期。

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

- [ ] AC-001：普通 Document/XHR/Fetch 请求完成并产出事件后，其 request key 不再保留在 `finished_before_stream`；同一 session 后续同 key 请求不会因残留标记改变 SSE/body 行为。
- [ ] AC-002：SSE 请求完成并 emit 后，其 request key 不再保留在 `finished_before_stream`；body 获取失败路径同样完成清理。
- [ ] AC-003：`loadingFinished` 早于 `responseReceived` 的逆序竞态只在竞态窗口保留标记，最终输出、deferred 或 orphan 终态后均清理；无 metadata、`capture_response_body=false` 与 orphan 早退不残留。
- [ ] AC-004：root target 与子 session 在连续 100 个请求后 `finished_before_stream` 为空，长采集标记数量有界。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001：全部 AC 可自动测试。

## 上下文区

- 来源：p007（2026-08-11 重新完整分析；确认产品缺陷与测试假绿，生产路径与复制 helper 两处已确认同类位点；复现线索 `.scratch/finished_before_stream_leak.test.ts` 与 `.scratch/finished_before_stream_helper_edge.test.ts`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock 边界与 fixture 按项目默认；断言必须触达生产 `network_capture` 路径及 `cdp_handler` 复制实现，不以状态清理测试替身代替。
- 覆盖普通成功、`getResponseBody` reject、SSE、逆序竞态、无 metadata/orphan、root/子 session；逐场景断言 marker 只在竞态窗口存在，终态后为 0。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：清理遗漏会改变 SSE 逆序竞态降级行为；合并两处重复实现可能触碰 CDP 事件处理主路径。
- 回退：保留原 marker 生命周期实现或恢复本 task commit；SSE/body 捕获语义不回退。

### 依赖与约束

- 依赖既有 CDP debugger 与 session 生命周期约束；无外部服务或配置前置。

### Finalization 时更新的 blueprint

- `docs/specs/network_capture_session_key.md`：补充 `finished_before_stream` 生命周期保证（如行为变化被纳入长期契约）。
