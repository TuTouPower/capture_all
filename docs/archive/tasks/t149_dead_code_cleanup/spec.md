# Task spec

## 背景

intensive-review 死代码全扫检出 8 处死代码/孤儿面：仅测试引用的 network_context.ts、空操作 prune_stale、无入口引用的 devtools_panel、无人引用的 FLUSH_BATCH_SIZE 常量、不可达 go() 映射、不可达设置分支、重复 bridge 启动入口、未用参数。

## 契约区

### 范围

- 修复 review finding：intensive-review 聚合：B2-M7 network_context 死代码、B1-L1 prune_stale、B5-M2 devtools_panel 孤儿、B2-M17 FLUSH_BATCH_SIZE 死常量、B4-L5 go 死映射、B4-L6 死分支、B2-L2 双入口、B1-L2 resolve_target._write

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

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

- [ ] AC-001: 8 处死代码/孤儿面删除或收敛后，typecheck 与全量单测通过，无生产引用残留（rg 验证）
- [ ] AC-002: 删除项对应测试按实际处理（删生产代码则测删或改测真实路径，不把旧预期改成新输出）
- [ ] AC-003: 若 FLUSH_BATCH_SIZE 属规范偏差而非死常量，改为修规范或真用批次（二选一，与 docs/blueprint/domain.md 对齐）

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001: typecheck + 全量单测
- AC-002: 涉及测试按 TDD 纪律处理
- AC-003: 按选型验证

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 聚合：B2-M7 network_context 死代码、B1-L1 prune_stale、B5-M2 devtools_panel 孤儿、B2-M17 FLUSH_BATCH_SIZE 死常量、B4-L5 go 死映射、B4-L6 死分支、B2-L2 双入口、B1-L2 resolve_target._write）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 按项目默认（tests/unit mock Chrome API；fixture 用构造数据）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：行为变更影响既有路径
- 回退：本 task 为独立 commit，可整体 revert

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- docs/blueprint/architecture.md：若删 network_context/devtools_panel，目录结构同步更新
