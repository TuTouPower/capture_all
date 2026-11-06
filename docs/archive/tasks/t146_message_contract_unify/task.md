# Task spec

## 背景

用户裁定：改代码统一契约。popup start 扁平字段、get_status/list_captures 裸对象/裸数组、get_capture_data {success,capture}，与 conventions.md 约定不符，全部依赖 sendMessage any。

## 契约区

### 范围

- 修复 review finding：review H-17 (B5-M1 横切): 扁平字段/裸数组与文档约定漂移，依赖 any 无类型共享

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001: 请求统一 {action, payload?}，响应统一 {success, data?, error?}（含 popup/dashboard/devtools 与 SW 全部消息面）
- [ ] AC-002: 引入共享请求/响应类型，SW 与 UI 侧 sendMessage 不再依赖 any 返回
- [ ] AC-003: 既有 UI 功能（start/stop/状态轮询/列表/导出）行为与修前一致
- [ ] AC-004: conventions.md 文档与实际实现一致（不再漂移）

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001/002: 三端契约测试（请求形状断言 + 类型编译）
- AC-003: 既有 popup/dashboard/stop/export 测试保持通过

## 上下文区

- 来源：intensive-review review_20260812_1249（review H-17 (B5-M1 横切): 扁平字段/裸数组与文档约定漂移，依赖 any 无类型共享）

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

- docs/blueprint/conventions.md：消息约定按实现结论对齐
