# Task spec

## 背景

`src/extension/background/cdp_handler.ts` 与 `network_capture.ts` 存在同因 CDP 事件处理复制实现（loadingFinished / loadingFailed / streaming / deferred / orphan 生命周期双点维护）。t112 已同步两处修复并各自补断言，但消除重复实现留作技术债。核实于 2026-08-11：`cdp_handler.ts` 事件路径仍**无生产调用方**（`handle_cdp_event`/`CdpHandlerState` 仅测试 import；生产 CDP 走 `network_capture.ts` 自建 handler，从 cdp_handler 仅引辅助如 is_self_origin_url / 超时常量 / 类型）。

## 契约区

### 范围

- 消除 CDP 事件生命周期处理的复制实现：统一到单一 handler，或将 `cdp_handler.ts` 事件路径显式废弃（生产接线或废弃二选一，实施期决定）。

### 非范围

- 不改变采集行为、CDP 事件消费语义、deferred/orphan 生命周期结果。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：CDP 事件生命周期（loadingFinished / loadingFailed / streaming / deferred / orphan）不再双点维护——生产路径与唯一实现一致，或 `cdp_handler.ts` 事件路径已显式废弃（无生产调用 + 无测试直驱或测试已迁移）。
- [ ] AC-002：现有 CDP 生命周期行为无回归——cdp_state_cleanup / loading_failed_events / t112 / cdp_request_key_session_isolation / network_stop_deferred_timers 等测试全绿。
- [ ] AC-003：无悬挂引用——删除或迁移后 `grep` 无指向废弃路径的 import（保留的辅助导出如超时常量/类型被引用的除外）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001/AC-003：以代码审阅 + `grep` 静态验证为主。
- AC-002：可自动测试（现有测试回归）。

## 上下文区

- 来源：p029（2026-08-11 核实：cdp_handler.ts 事件路径仅测试驱动；t112 已同步两处；p007 分析复制实现漂移致 T023 只修单点）

### 有意不测

- 无。

### 测试策略

- 按项目默认；生产接线路径须保留现有 CDP 行为断言（含 sub-target sessionId、deferred/orphan 生命周期）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- `cdp_handler.ts` 与 `network_capture.ts` 行为是否完全等价：已知 t112 已同步，但两处历史修复可能仍有细微差异——实施期以测试矩阵核对，差异处按生产路径为准。

### 风险与回退

- 风险：统一到单一 handler 若接线生产路径，改动面大；显式废弃则需迁移测试直驱。任一路径失败可回退 git。
- 回退：合并前保留两文件；`grep` 复核无悬挂引用后提交。

### 依赖与约束

- 依赖 t112（finished_before_stream 生命周期同步修复）已落地。

### Finalization 时更新的 blueprint

- 无。
