# Task spec

## 背景

Network.webSocketFrameSent/Received.timestamp 是 MonotonicTime（任意起点），*1000 后减 start_time（epoch 级）得到巨型负数，绕过 >1e10 守卫直接落库，timeline 排序污染。

## 契约区

### 范围

- 修复 review finding：review H-11 (B2-H6): CDP MonotonicTime 秒×1000 减 epoch 起点产出 -1.7e12 负数

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001: ws_frame 事件的 relative_time_ms 为合理非负相对时间（与同采集其它事件同基准）
- [ ] AC-002: 含 CDP timestamp 与缺失 timestamp 两条路径均正确
- [ ] AC-003: timeline 查询对既有负值数据不崩溃（若存在历史脏数据，按修复规则处理或忽略）

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001/002: network_capture 测试新增 ws_frame 相对时间断言
- AC-003: 边界用例

## 上下文区

- 来源：intensive-review review_20260812_1249（review H-11 (B2-H6): CDP MonotonicTime 秒×1000 减 epoch 起点产出 -1.7e12 负数）

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
