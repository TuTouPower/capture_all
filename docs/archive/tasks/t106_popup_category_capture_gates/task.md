# Task spec

## 背景

Popup 用户/导航/错误/Storage/Cookie 等开关仅写 tag，不关闭对应采集门控，UI 显示关闭仍采集。P1-9。

## 契约区

### 范围

- Popup 分类开关关闭时，对应类别事件在新 start 的 capture 中不写入（或 start 配置反映关闭）。
- 打开时恢复采集（回归）。
- 若某开关产品定义为「仅标签不控制采集」，须从 UI 移除误导或改文案；默认按「控制采集」实现。

### 非范围

- 不重做 popup 视觉设计。
- 不改 Dashboard 设置页（除共享配置字段必需）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：关闭「网络」类开关后 start capture，不产生 network 类事件入库（或 config.capture_network===false 且 background 尊重）。
- [ ] AC-002：关闭「控制台」类开关后 start，不产生 console 事件入库（或 config.capture_console===false 且被尊重）。
- [ ] AC-003：上述开关重新打开后 start，对应类别可再入库（回归）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（改配置后 start 的单元/集成级；不必真 UI 点击若能直接设同一 storage 键）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-9；src_ext_ui_shared/review.md F001

### 有意不测

- 像素级 UI 布局：有意不测。

### 测试策略

- 设与 popup 相同的配置键；跑 start 与事件写入断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：历史用户把开关当标签用——行为变更更严格，符合最小采集。
- 回退：恢复仅写 tag。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
