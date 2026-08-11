# Task spec

## 背景

审阅扫描（2026-08-11，grep 全量交叉验证 src+tests）发现 12 处无消费者导出。其中 storage.ts 的 deprecated aliases（`create_session` 等 11 个）与 `write_storage_changes` / `write_cookie_changes` / `write_lifecycle_events` 在生产与测试均 0 引用；其余符号同样无任何 import 方。`detect_locale` 内部有调用（`i18n.ts:385`），export 属多余。

## 契约区

### 范围

删除/私有化以下无消费者导出：

- `storage.ts`：`create_session`、`get_session`、`list_sessions`、`update_session`、`delete_session`、`write_requests`、`write_logs`、`write_errors`、`get_session_size`、`get_events`、`get_console_logs`、`get_error_logs`（deprecated aliases 块）、`write_storage_changes`、`write_cookie_changes`、`write_lifecycle_events`
- `theme.ts`：`get_theme`
- `network_hook.ts`：`is_network_hook_active`
- `console_capture.ts`：`get_attached_tab_id`
- `cdp_event_router.ts`：`has_session`
- `agent_bridge_client.ts`：`set_bridge_instance_id_for_tests`、`get_bridge_instance_id`
- `network_webrequest.ts`：`create_webrequest_handlers`（含其内部 `require()` 反模式，随函数删除消失）
- `dashboard_shared.ts`：`set_selected`
- `i18n.ts`：`detect_locale` 改为非 export（保留内部调用）

### 非范围

- 不动 `protocol.ts` 的 `ERROR_CODE_ALIASES` 与 `types.ts` 的 `@deprecated` 类型别名（归 t125）。
- 不改任何存活导出及其行为。

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

- [ ] AC-001：范围列出的符号不再以 export 形式存在，src 与 tests 中无任何 import 引用（grep 验证）。
- [ ] AC-002：`i18n.ts` 内部仍使用 `detect_locale` 逻辑（私有化后行为不变）。
- [ ] AC-003：`network_webrequest.ts` 无 `require()` 调用。
- [ ] AC-004：`npm test` 全绿，`npx tsc --noEmit` 通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：符号引用 grep 断言 + 测试套件。

## 上下文区

- 来源：无（审阅发现，2026-08-11 全量 grep 核实 0 引用）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 按项目默认。删除后跑全量 vitest + tsc；另以 grep 断言符号无引用。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：极低，全部符号 0 消费者。
- 回退：git 恢复删除行。

### 依赖与约束

- 无。与 t126 冲突（同改 network_hook.ts），调度时避让。

### Finalization 时更新的 blueprint

- 无
