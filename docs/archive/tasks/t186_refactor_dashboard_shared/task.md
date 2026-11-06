# Task spec

## 背景

`dashboard_shared.ts` 同时充当全局状态仓库（约 20 个模块级可变状态）、数据服务（load/export/格式化）与可变 service locator（文件尾定义带默认 no-op 的可变 `router`）。`dashboard.ts` 通过赋值注入 `go/render_content/...` 以「breaks circular deps」，`dashboard_detail.ts` 反向覆写 `router.is_tl_dragging`。未完成入口初始化时 `router.go()` 静默 no-op，行为依赖 import/执行顺序。

## 契约区

### 范围

- 最小拆分为 `dashboard_state.ts`（显式 `DashboardState` 对象与 factory/reset）、`dashboard_data.ts`（load/export）、`dashboard_format.ts`（纯函数）。
- router 改为入口显式传入 controller/callbacks，或提供一次性 `wire_dashboard_router()`；未接线调用抛明确错误而非 no-op。
- 测试每例创建 state/controller，不再直接共享模块单例。

### 非范围

- 不引入 UI 框架。
- 不改变 Dashboard 的功能行为与页面表现。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：重构后 Dashboard 功能行为与页面表现不变（既有 dashboard 相关测试通过）。
- [ ] AC-002：router 未接线时调用抛明确错误，而非静默 no-op。
- [ ] AC-003：测试不再依赖共享模块单例的 import/执行顺序。
- [ ] AC-004：状态、数据、格式化职责分离到各自模块，`dashboard_shared.ts` 不再同时承载三者。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：既有 dashboard 单测 + 未接线错误断言 + 测试隔离检查。

## 上下文区

- 来源：ARCH-003（2026-08-13 核实，`ac8fefe` 从 1317 行拆为 6 模块时形成，后续 t144/t152/t154 继续向 shared 增加状态）。

### 有意不测

- 无。

### 测试策略

- 每例创建 state/controller；断言未接线抛错；以既有 dashboard 测试为行为 gate。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：拆状态后遗漏某调用方共享可变状态。
- 回退：渐进迁移，先 state 再 data/format，保留 factory/reset 兜底。

### 依赖与约束

- 与 t160 Dashboard 轮询增量改动同域，注意合并顺序。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：如记录 Dashboard 分层，同步。
