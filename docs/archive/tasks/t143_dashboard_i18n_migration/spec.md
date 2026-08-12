# Task spec

## 背景

dashboard 全部 UI 文案硬编码中文，i18n.ts data-i18n/t() 无消费，切 en 界面仍全中文，违反「国际化 data-i18n + t()」约定。

## 契约区

### 范围

- 修复 review finding：review H-14 (B4-H1): dashboard 8 文件零 data-i18n 全硬编码中文；ui_strings 测试不守卫

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

- [ ] AC-001: dashboard 渲染产物不再含未国际化的硬编码中文 UI 文案（可枚举键集核对或测试守卫）
- [ ] AC-002: 设置语言切换后 dashboard 界面文案随 locale 变化（zh/en 两态）
- [ ] AC-003: ui_strings.test.ts 增加「dashboard 渲染产物不含硬编码中文文案」断言

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001/003: ui_strings 测试守卫（渲染产物或模板扫描）
- AC-002: 既有 theme-i18n 类测试扩展

## 上下文区

- 来源：intensive-review review_20260812_1249（review H-14 (B4-H1): dashboard 8 文件零 data-i18n 全硬编码中文；ui_strings 测试不守卫）

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
