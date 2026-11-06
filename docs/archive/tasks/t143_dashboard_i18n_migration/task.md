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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001: dashboard 渲染产物不再含未国际化的硬编码中文 UI 文案（可枚举键集核对或测试守卫）
- [ ] AC-002: 设置语言切换后 dashboard 界面文案随 locale 变化（zh/en 两态）
- [ ] AC-003: ui_strings.test.ts 增加「dashboard 渲染产物不含硬编码中文文案」断言

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001/003: ui_strings 测试守卫（渲染产物或模板扫描）
- AC-002: 既有 theme-i18n 类测试扩展

## 上下文区

- 来源：intensive-review review_20260812_1249（review H-14 (B4-H1): dashboard 8 文件零 data-i18n 全硬编码中文；ui_strings 测试不守卫）

### 有意不测

- 无

### 测试策略

- 按项目默认（tests/unit mock Chrome API；fixture 用构造数据）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：行为变更影响既有路径
- 回退：本 task 为独立 commit，可整体 revert

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
