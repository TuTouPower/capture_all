# Task review t093（reviewer_focus: 代码）

- task：`t093_exception_error_event_sink`
- spec：`docs/tasks/t093_exception_error_event_sink/spec.md`
- diff_anchor：`08fe3b7e781b6d749571f283eda61b3c7d62d548`
- target：`git diff 08fe3b7e781b6d749571f283eda61b3c7d62d548`
- round：1
- reviewed_at：2026-08-11 02:30 UTC+8

## Findings

### t093_code_f001 - AC-002 断言在修复前后恒成立，未真正回归防护该 AC 维度

- 严重度：minor
- 锚点：AC-002 的测试「异常不写入 CONSOLE_EVENTS」无法区分修复前后行为
- 位置：`tests/unit/service_worker_exception_sink.test.ts:140-142`
- 问题：`expect(logs.some((l) => l.type === 'runtime_exception')).toBe(false)`。原缺陷（exception 经 `handle_console_log` 走 console sink）中，异常事件因 `event.data` 缺失在 `handle_console_log` 入口被 `if (!data) return` 直接丢弃，本就不会写入 CONSOLE_EVENTS。故该断言在修复前后均通过，对「不再经 console sink 丢弃」这一核心回归无判别力；该维度实际只由 AC-001（error store 出现记录）覆盖。另 `ConsoleEventData`（`src/shared/types.ts:388-400`）未声明 `type` 字段，`l.type` 恒为 undefined，断言在类型层不可验证。
- 建议：改为可判别断言——先记录该 capture 的 `get_console_events` 数量，emit 异常后断言 console 数量不变且 error store 新增 1 条（与 AC-001 联动）；或断言 console store 为空的同时直接验证 error store 内容，去掉 `l.type` 谓词。

### t093_code_f002 - 测试访问了返回类型未声明字段（类型不安全）

- 严重度：minor
- 锚点：无 AC 违反，测试代码类型正确性
- 位置：`tests/unit/service_worker_exception_sink.test.ts:109`（`errors[0].type`）与 `:142`（`l.type`）
- 问题：`get_error_events` 返回 `RuntimeExceptionData[]`（`types.ts:406-418` 无 `type` 字段），`get_console_events` 返回 `ConsoleEventData[]`（无 `type`）。`tsconfig.json` `exclude: ["tests"]`，tsc 不检查测试；vitest 经 esbuild 转译运行，运行时存储对象含 base event 的 `type` 故断言通过，但类型层访问不存在的属性。
- 建议：`type` 断言改用 `get_events_by_category(capture_id, 'error')`（返回 `CaptureEvent[]`，含 `type`），或对返回对象做窄化类型断言。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` 1127 行 ≥ 800 important 阈值，但本 task 对该文件仅净增 2 行注释，无可观测缺陷，按降级规则仅在此列出。
  - 复杂度：`handle_event` / `handle_debugger_event` 分支数远低于阈值，无提示。
  - 范围外观察：exception 事件不经过 `config.redact_data` 脱敏（stack/message 可能含敏感信息），为 `exception_capture.ts` 既有行为，非本 task 引入，且 spec 非范围未含脱敏，不进 finding。
- 总体判断：修复正确——exception sender 由 `handle_console_log` 换为 `handle_event` 后，事件按 `category: 'error'` 经 `write_events` 路由至 ERROR_EVENTS（`CATEGORY_STORE_MAP` 验证），扁平字段形状与 `RuntimeExceptionData` 对齐，stop 后迟到的 exception 由模块级 `is_capturing` 守卫 + 监听器移除 + `handle_event` 入口守卫三重拦截；AC-001/003 测试真实覆盖，AC-002 测试偏弱但不阻断。仅有 minor，PASS。
- AC 复验披露：
  - AC-001：`re_verified` — 重跑 `npx vitest run tests/unit/service_worker_exception_sink.test.ts` 通过；查证 `write_events` 按 `event.category` 经 `CATEGORY_STORE_MAP.error → ERROR_EVENTS` 写入。
  - AC-002：`re_verified` — 重跑通过；独立查证修复后 exception 事件不再路由至 console sink，CONSOLE_EVENTS 无对应写入；注明该测试本身判别力弱（f001）。
  - AC-003：`re_verified` — 重跑通过；查证 stop 路径移除 exception 监听器（`stop_exception_capture`）且 `handle_event` 入口守卫 `!is_capturing || !current_capture_id` 拦截迟到事件。
  - coverage = 3 / 3
- 系统性 follow-up：无

reviewed_scope: 9d59cbc81d3bee6b

verdict: PASS
