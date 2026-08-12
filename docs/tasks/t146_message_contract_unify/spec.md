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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001: 请求统一 {action, payload?}，响应统一 {success, data?, error?}（含 popup/dashboard/devtools 与 SW 全部消息面）
- [ ] AC-002: 引入共享请求/响应类型，SW 与 UI 侧 sendMessage 不再依赖 any 返回
- [ ] AC-003: 既有 UI 功能（start/stop/状态轮询/列表/导出）行为与修前一致
- [ ] AC-004: conventions.md 文档与实际实现一致（不再漂移）

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001/002: 三端契约测试（请求形状断言 + 类型编译）
- AC-003: 既有 popup/dashboard/stop/export 测试保持通过

## 上下文区

- 来源：intensive-review review_20260812_1249（review H-17 (B5-M1 横切): 扁平字段/裸数组与文档约定漂移，依赖 any 无类型共享）

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

- docs/blueprint/conventions.md：消息约定按实现结论对齐
