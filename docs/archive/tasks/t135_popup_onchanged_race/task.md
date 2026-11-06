# Task spec

## 背景

MCP 同步监听对所有 is_capturing 变更无条件 load_state→render。正常 popup stop 产生两次 is_capturing:false 写入，onChanged 竞争 state='saved' 赋值，导出/查看入口可能消失。

## 契约区

### 范围

- 修复 review finding：review H-12 (B5-H1, 2aaeec9 新增): onChanged 监听无法区分自写/外部写入，stop 完成态时序性被 ready 覆盖

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001: 用户从 popup 手动 stop 后，popup 稳定停留在「采集完成」态（saved），不被监听重渲染覆盖为就绪态
- [ ] AC-002: MCP/外部触发 start/stop 时 popup 仍同步刷新（既有同步语义保留）
- [ ] AC-003: 修复后无新监听泄漏（render 次数有界）

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001: 单测模拟 storage.onChanged 触发时序，断言最终态为 saved
- AC-002: 外部变更同步用例

## 上下文区

- 来源：intensive-review review_20260812_1249（review H-12 (B5-H1, 2aaeec9 新增): onChanged 监听无法区分自写/外部写入，stop 完成态时序性被 ready 覆盖）

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
