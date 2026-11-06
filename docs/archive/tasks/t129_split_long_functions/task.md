# Task spec

## 背景

审阅扫描（2026-08-11）发现 17 个 >80 行函数，其中 4 个值得拆分：`archive_builder.ts:235` 的 `build_archive`（163 行）、`dashboard_detail.ts:585` 的 `wire_trace`（139 行）、`service_worker.ts:203` 的 `handle_message`（103 行）、`body_capture_coordinator.ts:54` 的 `start_body_capture`（115 行）。用户确认拆分。`network_hook.ts` 的 `build_page_script`（265 行）由 t126 处理，不在本 task。

## 契约区

### 范围

- 将 4 个函数拆分为职责单一的子函数，每个拆分后函数 <80 行。
- 子函数命名与落点遵循项目 snake_case 约定；可提取为模块级函数，不改变导出面（原导出保留）。

### 非范围

- 不改 4 个函数的可观察行为。
- 不拆 `build_page_script`（归 t126）及其余 12 个 >80 行函数。
- 不借机重构函数内部业务逻辑。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：4 个函数拆分后各自 <80 行（代码结构断言）。
- [ ] AC-002：行为不变：相关测试全绿（archive_builder / dashboard_detail / service_worker / body_capture_coordinator 覆盖面）。
- [ ] AC-003：`npm test` 全绿，`npx tsc --noEmit` 通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001 结构断言，AC-002/003 测试套件。

## 上下文区

- 来源：无（审阅发现，2026-08-11；用户确认拆分这 4 个）

### 有意不测

- 无。

### 测试策略

- 按项目默认。拆分后跑全量 vitest + tsc；必要时对提取的子函数补轻量单测。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：低。纯结构拆分可能引入变量作用域错误。以全量测试覆盖。
- 回退：git 恢复原函数。

### 依赖与约束

- 依赖 t128（`start_body_capture` 与 `body_capture_coordinator` 的 builder 迁移同文件，先 t128 后拆分避免合并冲突）。

### Finalization 时更新的 blueprint

- 无
