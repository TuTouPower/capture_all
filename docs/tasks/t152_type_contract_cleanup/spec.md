# Task spec

## 背景

类型/状态漂移 12 处：detail_time_display_mode 'absolute' 类型谎言、locale 双轨 zh_CN vs zh、network store 混存 ws_frame 与请求、storage/ws payload 在事件顶层而非 event.data、时间列读不存在字段、event_kind 与 category 映射不一致、多处 id 碰撞/重复工具、MCP schemas passthrough、相对时间负值。

## 契约区

### 范围

- 修复 review finding：intensive-review 聚合：B1-M5 absolute、B1-M6 locale 双轨、B2-M8 store 混存、B3-M1 payload 顶层、B4-M1/M2 时间列、B4-M3 event_kind、B2-M2/M13 id 冲突、B1-L8/L9 工具统一、B1-L12 passthrough、B1-L13 负相对时间、B3-L2 request_id

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

- [ ] AC-001: detail_time_display_mode 合法值域与类型/消费端一致（删 'absolute' 或扩实现）
- [ ] AC-002: locale 单一事实来源，user_config 与 i18n 枚举一致，设置页语言选择持久化生效
- [ ] AC-003: network store 中 ws_frame 与 NetworkRequestData 可区分（独立 store 或查询按 type 路由），agent 查询不产生误导记录
- [ ] AC-004: storage/ws 事件 payload 在 event.data 内（与其余模块契约一致），dashboard/导出读得到 key 等字段
- [ ] AC-005: 网络/控制台表时间列显示真实时间（非恒 +00.000s/空）
- [ ] AC-006: event_kind 与 category_for_event_type 对齐，无事件错标「生命周期」
- [ ] AC-007: id 生成统一（无碰撞风险），冲突位点加唯一化后缀
- [ ] AC-008: MCP schemas 未知参数不再静默放行（strict/strip 按字段定）
- [ ] AC-009: 相对时间计算无负值（时钟回拨/异常数据 clamp）
- [ ] AC-010: 既有相关测试语义不回退

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001/002: user_config/i18n 测试断言值域与持久化
- AC-003/004: 查询与事件结构断言
- AC-005: detail 渲染 fixture 断言时间列
- AC-006: event_kind 映射全类别断言
- AC-007-009: 各自单测

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 聚合：B1-M5 absolute、B1-M6 locale 双轨、B2-M8 store 混存、B3-M1 payload 顶层、B4-M1/M2 时间列、B4-M3 event_kind、B2-M2/M13 id 冲突、B1-L8/L9 工具统一、B1-L12 passthrough、B1-L13 负相对时间、B3-L2 request_id）

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

- docs/blueprint/conventions.md：locale 单一来源若成规则可补记
