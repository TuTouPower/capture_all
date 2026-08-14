# Task spec

## 背景

存储/导出边界两条遗留（pending 总账）：`list_captures` 的 `limit` 参数无输入校验——负数/0 静默返回空数组、小数意外截断（p039，现网调用方均传合法值，防御性缺口）；exporter/coordinator/storage 三条断言缺口——`total_size_kb` 实际字节数未断言、bridge 相对时间 clamp（relative_time=timestamp-start_time）无直接单测、`dom_data` store 映射无路由断言（p044）。

## 契约区

### 范围

- `list_captures` limit 入参校验（clamp/拒绝非法值，语义明确）。
- 补三条断言：`total_size_kb` 为实际字节数、relative_time clamp、dom_data 事件落 USER_ACTION_EVENTS store。

### 非范围

- 不改变合法调用路径的返回语义（limit=undefined 全量、正整数截断不变）。
- 不新增分页 API（t193 已下推 offset/limit）。

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

- [ ] AC-001：`list_captures` 对 limit 负数/0/小数给出明确行为（拒绝或 clamp），不静默截断；合法值（undefined/正整数）语义不变。
- [ ] AC-002：`total_size_kb` 断言为实际字节数（>0 且与内容相符）。
- [ ] AC-003：bridge 相对时间修正（relative_time=timestamp-start_time，clamp 非负）直接单测。
- [ ] AC-004：`dom_data` 类别事件落 USER_ACTION_EVENTS store（路由断言）。
- [ ] AC-005：新增测试全绿，既有 storage/exporter 测试无回归。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：storage 单测（fake-indexeddb）+ exporter 断言。

## 上下文区

- 来源：p039（t153 遗留 t153_gen_f002）、p044（t155 遗留）。2026-08-14 核实：list_captures 无入参校验；exporter.test.ts 仅冒烟覆盖 export_html；relative_time clamp 无单测；dom_data 映射（CATEGORY_STORE_MAP）无路由断言。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- fake-indexeddb 行为断言 + exporter/coordinator 单测补断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：limit 校验改变调用方行为。
- 回退：校验仅在非法值生效，合法路径不变（回归 gate）。

### 依赖与约束

- 与 t193（list_captures offset/limit 下推）同域。

### Finalization 时更新的 blueprint

- 无。
