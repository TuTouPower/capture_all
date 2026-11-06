# Task spec

## 背景

`NetworkRequestData` 约 40 字段的构造在多处手工逐字段写死：`body_capture_coordinator.ts:300-317`（external_cdp_bridge 路径）、`network_capture.ts:273-312`（WebSocket 连接事件）等 3+ 处。字段集大体一致（request/response body 状态、headers 状态、尺寸字段、null 默认值），差异在少数字段（capture_method / body_capture_mode / ws 相关 / correlation_status）。审阅确认重复构造点可统一。

## 契约区

### 范围

- 抽取 `NetworkRequestData` 构造 builder：默认字段工厂 + 按调用点覆盖差异字段。
- 落点优先 `src/shared/types.ts` 旁或 `src/shared/` 工具文件，执行期定。
- 迁移 `body_capture_coordinator.ts`、`network_capture.ts` 及其余构造点使用 builder。

### 非范围

- 不改任何调用点实际输出的数据语义（字段值与事件行为不变）。
- 不改 `NetworkRequestData` 类型定义本身。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：已知构造点（body_capture_coordinator、network_capture 等）不再内联 ~40 字段样板，统一经 builder（代码结构断言）。
- [ ] AC-002：网络捕获事件数据不变：网络相关测试全绿，断言覆盖字段值（含 body 状态、headers 状态、ws 字段、correlation 字段）。
- [ ] AC-003：`npm test` 全绿，`npx tsc --noEmit` 通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001 结构断言，AC-002/003 测试套件。

## 上下文区

- 来源：无（审阅发现，2026-08-11 核实 3+ 构造点）

### 有意不测

- 无。

### 测试策略

- 现有网络捕获测试（network_capture / body_capture_coordinator / external_cdp_bridge）覆盖字段语义；builder 本身补轻量单测（默认字段与覆盖行为）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：中。构造点字段差异（如 correlation_status 仅部分路径有）迁移时可能漏字段。以全量网络测试 + 逐构造点 diff 覆盖。
- 回退：git 恢复原构造点。

### 依赖与约束

- 依赖 t123（webrequest_handler 删除后构造点集合确定）。建议在 t123 后执行。

### Finalization 时更新的 blueprint

- 无
