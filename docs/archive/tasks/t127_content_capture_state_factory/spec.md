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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：9 个模块不再各自声明重复的状态变量组，统一经工厂管理（代码结构断言，无 `let is_capturing` 等重复声明残留）。
- [ ] AC-002：重入守卫与 stop 复位行为不变：重复 start 不叠加捕获，stop 后状态复位可再次 start。
- [ ] AC-003：相关 content 捕获测试全绿，`npm test` 全绿，`npx tsc --noEmit` 通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：AC-001 结构断言，AC-002/003 测试套件。

## 上下文区

- 来源：无（审阅发现，2026-08-11 核实 9 模块样板重复、命名不统一）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 现有各捕获模块测试覆盖行为；工厂本身补轻量单测（重入守卫、stop 复位）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：中。9 模块重构触碰 content 捕获热路径，可能引入状态时序差异。以全量测试 + 重入/复位专项测试覆盖。
- 回退：git 恢复模块原状。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- 无
