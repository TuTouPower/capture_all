# Task spec

## 背景

性能预算遗留项：app log 配置上限实际允许接近 2 倍峰值（PERF-L008）；Agent `captures.list` 全量读取并二次排序后才 slice（PERF-L009）；app log 导出固定全量 100000 条并构建单个巨型字符串（PERF-L010）；Dashboard 详情/归档全量 DOM 渲染与全量 ZIP 组装（PERF-H004 的渲染/组装部分，截断部分见 t156）；构建流程无 bundle size 预算或差异门禁（PERF-I011）。

## 契约区

### 范围

- app log 配置上限修正为与峰值一致，避免接近 2 倍峰值。
- `captures.list` 避免全量读取后二次排序再 slice（推入存储排序/分页或维护计数）。
- app log 导出避免固定全量 100000 + 单个巨型字符串（分页/流式或明确边界）。
- Dashboard 列表/详情采用 windowed/virtual rendering，ZIP 采用流式组装，降低峰值内存。
- 构建流程增加 bundle size 预算或差异门禁。

### 非范围

- 不改动 100000 截断逻辑（见 t156）。
- 不改动 Agent 七源查询谓词下推（见 t161）。

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

- [ ] AC-001：app log 配置上限不超过声明峰值的 1 倍（不再接近 2 倍）。
- [ ] AC-002：`captures.list` 返回结果与排序语义不变，但不再全量读取后二次排序再 slice（存储排序/分页或计数下推）。
- [ ] AC-003：app log 导出对 >100000 条不再构建单个巨型字符串（分页/流式或显式上限）。
- [ ] AC-004：Dashboard 大列表 DOM 节点数受窗口预算约束（windowed/virtual rendering）。
- [ ] AC-005：ZIP 导出使用流式组装，输入 snapshot、enriched arrays、JSONL strings、bytes、输出 ZIP 不全部同时驻留。
- [ ] AC-006：构建流程存在 bundle size 预算或差异门禁。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-005 `[deploy]`：峰值内存需真实大 capture 基准；其余用单测/基准断言读取量、DOM 节点数、字符串大小、bundle 门禁。

## 上下文区

- 来源：PERF-L008、PERF-L009、PERF-L010、PERF-H004、PERF-I011（2026-08-13 核实）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 断言读取量/节点数/字符串大小受预算约束；ZIP 用流式 API 单测；bundle 门禁用构建产物大小断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- bundle size 预算阈值取值：结论=基于 2026-08-14 实测构建产物（`npm run build`）：`bridge.mjs` 77KB、`mcp.mjs` 1.1MB、`extension.zip` 124KB、`dist/` 508KB。预算取当前 + 50% 余量：bridge.mjs ≤ 200KB、mcp.mjs ≤ 2MB、extension.zip ≤ 500KB、dist/ 总 ≤ 2MB（新 bundle size 门禁脚本 `scripts/check_bundle_budget.mjs`，`npm run check:bundle`）。

### 风险与回退

- 风险：流式/虚拟化引入功能回归。
- 回退：以既有功能测试为 gate，逐步替换；预算阈值可放宽但门禁存在。

### 依赖与约束

- 与 t156（截断）、t161（查询下推）协同，避免重复改动。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：如记录 bundle 预算与流式导出决策，同步。
