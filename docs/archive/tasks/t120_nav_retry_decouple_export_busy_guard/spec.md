# Task spec

## 背景

两项功能遗留：p019——`service_worker.ts` onActivated/onUpdated listener 在 `nav_count_enabled === false` 时早退，同时跳过 start-send 与 console/error/body CDP 重试（边缘场景导航关时切 tab，数据正确性受影响；start-send 有状态轮询兜底）；p027——dashboard `export_capture` 与各导出接线点无 in-flight/busy 保护，快速重复触发并行 flush/构建/下载（重复下载 + 大 capture 双倍内存峰值）。核实于 2026-08-11：两处均仍在。

## 契约区

### 范围

- p019：早退与重试逻辑解耦，导航关闭时重试仍按需触发。
- p027：dashboard 导出加共享 in-flight 标记（或按钮 disabled），防重入。

### 非范围

- 不改变导航采集的启停语义、导出格式与内容。

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

- [ ] AC-001：`nav_count_enabled === false` 时 onActivated/onUpdated 早退不再跳过 start-send 与 console/error/body CDP 重试（p019）。
- [ ] AC-002：导航关闭时重试按需触发，start-send 有状态轮询兜底语义不回归（p019）。
- [ ] AC-003：dashboard 导出（`export_capture` 及各接线点）in-flight 期间重复触发不并行执行——第二次触发被拦截或排队，单次 flush/构建/下载（p027）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试（SW 单元测试 mock tabs onActivated/onUpdated；dashboard 单元测试模拟重复触发）。

## 上下文区

- 来源：p019（2026-08-11 核实仍在，数据正确性）、p027（2026-08-11 核实仍在，体验 + 并发竞争；t040 后续项）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- SW 侧：mock chrome.tabs onActivated/onUpdated 事件触发 listener，断言 nav_count_enabled=false 时重试调用仍发生。
- dashboard 侧：mock flush/构建/下载链路，快速重复触发 export，断言执行次数为 1。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：p019 解耦重试时机可能引发额外 CDP 命令；以现有轮询兜底测试锁定。
- 回退：逐功能回退 git。

### 依赖与约束

- 依赖 t106（nav_count_enabled 门控）、t040（dashboard 导出）实现落地。

### Finalization 时更新的 blueprint

- 无。
