# Task spec

## 背景

Dashboard/Popup 存在多处小缺陷：Popup 分类开关与 Dashboard settings 开关是纯 pointer 自定义控件（无 role/tabindex/键盘/aria-pressed），键盘与辅助技术无法操作；Dashboard 导出异常被 log 但不展示给用户；locale 切换残留硬编码字符串与过期 `document.lang`；timeline lane 拖拽缺取消清理（已在 t189 覆盖，此处只做不重叠的 UI 项）；UI string 测试含空洞断言且跳过真实 manifest。

## 契约区

### 范围

- 将 Popup 分类开关、最近行/View All、Dashboard settings 开关改为原生 `button[aria-pressed]` 或 checkbox/switch + label，支持 Tab + Enter/Space 并宣布状态。
- Dashboard 导出异常向用户展示（非仅 log）。
- locale 切换更新 `document.lang` 并消除残留硬编码字符串。
- UI string 测试改为真实断言并检查真实 manifest。

### 非范围

- 不重复 t189 的 timeline 拖拽清理。
- 不引入新 UI 框架。

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

- [ ] AC-001：Popup 与 Dashboard 的核心开关可通过 Tab 聚焦、Enter/Space 激活，且 `aria-pressed`/状态被正确宣布。
- [ ] AC-002：Dashboard 导出失败时用户可见错误提示（非仅 log）。
- [ ] AC-003：locale 切换后 `document.lang` 更新且无残留硬编码字符串。
- [ ] AC-004：UI string 测试断言真实字符串存在且检查真实 manifest（无空洞断言）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001 `[deploy]`：需真实浏览器/a11y 检查验证键盘操作；其余用 jsdom 与单测。

## 上下文区

- 来源：EXTUI-009、EXTUI-012、EXTUI-013、EXTUI-014（2026-08-13 核实）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- jsdom 断言焦点/键盘事件与 aria 属性；导出异常用 mock 断言用户可见提示；locale 断言 `document.lang`。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：原生控件替换改变样式布局。
- 回退：保持视觉一致，仅补 role/tabindex/键盘/aria 语义。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- 无。
