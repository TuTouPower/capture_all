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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：Popup 与 Dashboard 的核心开关可通过 Tab 聚焦、Enter/Space 激活，且 `aria-pressed`/状态被正确宣布。
- [ ] AC-002：Dashboard 导出失败时用户可见错误提示（非仅 log）。
- [ ] AC-003：locale 切换后 `document.lang` 更新且无残留硬编码字符串。
- [ ] AC-004：UI string 测试断言真实字符串存在且检查真实 manifest（无空洞断言）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001 `[deploy]`：需真实浏览器/a11y 检查验证键盘操作；其余用 jsdom 与单测。

## 上下文区

- 来源：EXTUI-009、EXTUI-012、EXTUI-013、EXTUI-014（2026-08-13 核实）。

### 有意不测

- 无。

### 测试策略

- jsdom 断言焦点/键盘事件与 aria 属性；导出异常用 mock 断言用户可见提示；locale 断言 `document.lang`。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：原生控件替换改变样式布局。
- 回退：保持视觉一致，仅补 role/tabindex/键盘/aria 语义。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- 无。
