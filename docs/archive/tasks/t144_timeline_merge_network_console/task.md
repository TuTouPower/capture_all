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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

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

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001/002: detail 渲染测试新增含 network/console fixture 断言
- AC-003: 空数据用例
- AC-004/005: 渲染计数/监听生命周期断言（mock 轮询触发）
- AC-007: 既有测试保持通过

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 合并：H-15 三轨恒空 + H-16 2s 整页重渲染竞态）

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

- docs/blueprint/domain.md：dom_data 轨道去留与「dom_data 不上 UI」约束需澄清（B4-L8 关联，本 task 不引入 DOM 数据上 UI）
