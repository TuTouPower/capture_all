# Task spec

## 背景

9 个 content 捕获模块（mouse / keyboard / scroll / focus / resize / visibility / fullscreen / print / form_submit）各自内联同一套状态样板：`is_capturing` + `capture_id`（或 `_capture_id`）+ `capture_start_epoch_ms`（或 `_capture_start_epoch_ms`）+ `tab_id`（或 `_tab_id`）+ `send_event` 模块级变量、start 时的重入守卫、stop 时的复位。命名不统一（带 `_` 前缀与否混用）。审阅确认这是可抽取的重复样板。

## 契约区

### 范围

- 抽取 content 捕获状态管理工厂（持有 is_capturing / capture_id / epoch / tab_id / sender，提供 start 守卫与 stop 复位），落点优先 `content_event_utils.ts`（已共享的 content 工具文件）或同目录新文件。
- 上述 9 个模块改为使用工厂，统一命名。
- 若执行期发现同构样板也存在于其它 content 模块（如 clipboard / dom / storage），可纳入同一工厂，但不得改变其业务逻辑。

### 非范围

- 不改各模块业务逻辑（事件监听、数据处理、monkey-patch 内容）。
- 不强制统一模块间存在的合理差异（如个别模块持有的额外状态）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：9 个模块不再各自声明重复的状态变量组，统一经工厂管理（代码结构断言，无 `let is_capturing` 等重复声明残留）。
- [ ] AC-002：重入守卫与 stop 复位行为不变：重复 start 不叠加捕获，stop 后状态复位可再次 start。
- [ ] AC-003：相关 content 捕获测试全绿，`npm test` 全绿，`npx tsc --noEmit` 通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001 结构断言，AC-002/003 测试套件。

## 上下文区

- 来源：无（审阅发现，2026-08-11 核实 9 模块样板重复、命名不统一）

### 有意不测

- 无。

### 测试策略

- 现有各捕获模块测试覆盖行为；工厂本身补轻量单测（重入守卫、stop 复位）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：中。9 模块重构触碰 content 捕获热路径，可能引入状态时序差异。以全量测试 + 重入/复位专项测试覆盖。
- 回退：git 恢复模块原状。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- 无
