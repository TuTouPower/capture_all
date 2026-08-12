# Task spec

## 背景

详情页两缺陷（用户裁定并入数据方向）：load_detail 只合并 5 类进 detail_events，network_requests/console_events 未并入，时间线三轨恒空、快速筛选计数恒 0；2s 轮询在 capturing 态无条件全量快照重载 + 整页重渲染，拖拽竞态与监听泄漏。

## 契约区

### 范围

- 修复 review finding：intensive-review 合并：H-15 三轨恒空 + H-16 2s 整页重渲染竞态

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

- [ ] AC-001: 含网络请求/控制台事件的采集，时间线 network/console 轨道显示对应事件
- [ ] AC-002: rail 快速筛选 network/console 计数与实际事件数一致（非恒 0）
- [ ] AC-003: 无网络/控制台事件的采集仍显示空轨道或隐藏，不产生虚假数据
- [ ] AC-004: 详情页轮询仅在有变化时更新（增量或变化检测），无变化不整页重渲染
- [ ] AC-005: 拖拽 playhead/minimap 期间不被轮询重渲染打断，pointermove 监听在交互结束移除
- [ ] AC-006: 数据展示与修复前一致（事件/统计/时间线完整）
- [ ] AC-007: 既有 detail 测试（timeline_marker/zoom_control/search_preserve_input）不回退

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001/002: detail 渲染测试新增含 network/console fixture 断言
- AC-003: 空数据用例
- AC-004/005: 渲染计数/监听生命周期断言（mock 轮询触发）
- AC-007: 既有测试保持通过

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 合并：H-15 三轨恒空 + H-16 2s 整页重渲染竞态）

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

- docs/blueprint/domain.md：dom_data 轨道去留与「dom_data 不上 UI」约束需澄清（B4-L8 关联，本 task 不引入 DOM 数据上 UI）
