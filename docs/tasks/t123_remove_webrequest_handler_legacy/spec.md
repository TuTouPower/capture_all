# Task spec

## 背景

t119 统一网络捕获路径后，`src/extension/background/webrequest_handler.ts` 生产 0 引用：其导出（`handle_before_request` / `handle_completed` / `build_network_event` / `find_cdp_candidates` 等）全部被 network_capture 自建实现取代，唯一残留是 `network_capture.ts:19` 的 `import {} from './webrequest_handler'` 空导入。但 3 个测试文件仍直驱旧实现：`loading_failed_events.test.ts`（同时 import 新旧两套 API）、`network_cdp.test.ts`、`network_stop_deferred_timers.test.ts`。审阅确认这是 t119 重构后测试未迁移的遗留。

## 契约区

### 范围

- 将直驱旧 `webrequest_handler` 实现的测试迁移到生产路径（network_capture 的等价实现）。
- 删除 `src/extension/background/webrequest_handler.ts` 整文件。
- 删除 `network_capture.ts` 中 `import {} from './webrequest_handler'` 空导入。

### 非范围

- 不改 network_capture 生产实现逻辑。
- 不改动 `network_webrequest.ts`（其 `create_webrequest_handlers` 死导出归 t124）。

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

- [ ] AC-001：`src/extension/background/webrequest_handler.ts` 不存在。
- [ ] AC-002：`network_capture.ts` 无 `webrequest_handler` 相关 import 语句。
- [ ] AC-003：`tests/unit/` 无文件 import `webrequest_handler` 或 `ws_handler`（旧路径彻底清空）。
- [ ] AC-004：`loading_failed_events.test.ts` 等迁移后测试仍验证原语义（handle_error 发失败网络事件含 error_text 等），断言目标为生产路径，非旧实现。
- [ ] AC-005：`npm test` 全绿，`npx tsc --noEmit` 通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：文件/import 断言 + 测试套件。

## 上下文区

- 来源：无（审阅发现，2026-08-11 核实：webrequest_handler 全部导出生产 0 引用，仅 3 个测试文件直驱）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 迁移时保留原测试语义与断言（失败事件含 error_text、CDP-first 跳过等），仅换生产路径。生产 `handle_error` 在 network_capture 内部非 export，执行期决定触达方式（测试钩子 export 或经 start/stop 集成驱动），不得改变生产逻辑语义。fixture 沿用原测试构造。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：测试迁移后语义漂移（断言错位到新实现的不同行为）。以原测试语义对照迁移后断言降低。
- 回退：git 恢复 webrequest_handler.ts；测试 revert。

### 依赖与约束

- 无。与 t122（删 ws_handler）互不冲突，可并行。

### Finalization 时更新的 blueprint

- 无
