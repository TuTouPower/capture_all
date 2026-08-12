# Task spec

## 背景

intensive-review P7 核查：XSS 转义无参数化测试、detail_render_consistency 自证自、detail_layout_source/settings_ui 源码字符串断言、popup 测试 vacuous/自造 mock、network_hook_config_gate 表层、agent_command_dispatcher/agent_data_queries 无直接单测。

## 契约区

### 范围

- 修复 review finding：intensive-review 聚合：B4-M9 XSS 转义无测试、B4-M10 自证自、B4-M11 源码字符串、B5-M3 popup 表层、B3 表层断言、B2 dispatcher/queries 无单测

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

- [ ] AC-001: dashboard 事件渲染（render_dt_list/render_net_inspector/render_con_table/render_simple_events/render_dt_inspector）新增参数化 XSS 转义测试（<img onerror>/</script>/引号）
- [ ] AC-002: detail_render_consistency 改造为真实渲染断言（七标签出现与计数一致），删除自证自用例
- [ ] AC-003: detail_layout_source/settings_ui 源码字符串断言改行为断言或标注「结构契约」
- [ ] AC-004: popup 关键路径（start/stop→saved、onChanged 同步、导出失败）新增行为级测试（真实 import + mock DOM 触发）
- [ ] AC-005: agent_command_dispatcher/agent_data_queries 补直接单测（结构化错误码、分页；64MiB 预算路径由 t140 agent_bridge_client PAYLOAD_TOO_LARGE 测试覆盖，非本 task 范围）
- [ ] AC-006: 改造后全量单测通过，无测试依赖被删代码之外的实现细节

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 本 task 即测试改造；验证方式：新增/改造测试在对应模块下真实触达生产逻辑并全量跑通

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 聚合：B4-M9 XSS 转义无测试、B4-M10 自证自、B4-M11 源码字符串、B5-M3 popup 表层、B3 表层断言、B2 dispatcher/queries 无单测）

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

- 无
