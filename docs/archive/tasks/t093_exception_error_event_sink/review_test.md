# Task review t093（reviewer_focus: 测试）

- task：`t093_exception_error_event_sink`
- spec：`docs/tasks/t093_exception_error_event_sink/spec.md`
- diff_anchor：`08fe3b7e781b6d749571f283eda61b3c7d62d548`
- target：`git diff 08fe3b7e781b6d749571f283eda61b3c7d62d548`
- round：1
- reviewed_at：2026-08-11 02:23 CST
reviewed_scope: 9d59cbc81d3bee6b

## Findings

### t093_test_f001 - mock_chrome_debugger 未在 beforeEach 重置，跨用例状态泄漏风险

- 严重度：minor
- 锚点：测试隔离；无对应 AC 违反（不影响当前断言真实性）
- 位置：`tests/unit/service_worker_exception_sink.test.ts:3`（import）、同文件 3 个 `it` 块均无 `beforeEach(() => mock_chrome_debugger.reset())`
- 问题：`mock_chrome_debugger` 是模块级单例，其 `listeners` 数组与 `_send_command_calls` 等跨 `it` 持久。同目录兄弟测试均按惯例在 `beforeEach` 调 `reset()`（`tests/unit/console_capture.test.ts:76`、`tests/unit/exception_capture.test.ts:35`），本文件遗漏。当前 3 用例串行通过时各 `it` 末尾都执行 `stop`，会移除监听器并复位 `is_capturing`，故现绿非假绿；但任一用例中途失败（断言抛错跳过 stop）会使 exception/console capture 模块级 `is_capturing` 残留 true，后续用例 `start_exception_capture` 因 `if (is_capturing) return {success:true}` 直接短路，引发级联失败，且难以归因。
- 建议：文件级 `beforeEach(() => mock_chrome_debugger.reset())`，与兄弟测试一致。

## 结论

- 前轮 finding 复核：不适用（Round 1）
- 改测方向复核：无。diff 中无对既有测试的修改，`service_worker_exception_sink.test.ts` 为全新文件；`service_worker.ts` 仅改 `start_exception_capture` 的 sender 参数（`handle_console_log` → `handle_event`）并加注释。
- 本轮新发现：1 条（f001，minor）
- 未进表的提示：
  - `wait_flush` 用固定 20ms `setTimeout` 等待异步写入，而非 await 实际写链。因 `write_events` 内部 T038 每次写入立即 `flush_store` 落 IndexedDB（`src/extension/background/storage.ts:278-298`），20ms 相对充裕，且与 `agent_bridge_server.test.ts`（10ms）、`poll_capture_status.test.ts`（0ms）等既有用法一致，按项目惯例不单列 finding。慢 CI 下理论可 flake，可选改为轮询 `get_error_events` 直到非空。
  - AC-003 第二段（start 新 capture 后断言 errors2 为空）时序上必真：迟到事件在 start 之前已 emit，新监听器尚未注册，不构成对 generation 守卫的独立验证。主断言（stop 后迟到事件不写入已停 capture，errors.length===0）已实质覆盖 AC-003 的可观察行为，故未单列。
- 总体判断：测试真实触达生产逻辑（真实 `service_worker.start_capture` + 真实 `exception_capture.handle_debugger_event` + 真实 `storage.write_events` → fake-indexeddb ERROR_EVENTS），断言具体（`toBe(1)` / `toBe('runtime_exception')` / `toContain('TypeError')` / `toBe(false)` / `toBe(0)`），无恒真、弱化、skip、mock 被测逻辑等危险模式；3 条 AC 均有对应测试证据。仅 1 条 minor（mock 复位隔离），不阻断。

### AC 复验方式

- AC-001：`re_verified` — 实跑 `npx vitest run tests/unit/service_worker_exception_sink.test.ts`，3/3 通过；代码路径逐段核对：`start` message → `start_capture_inner_impl` → `start_exception_capture(..., handle_event, ...)`（`src/extension/background/service_worker.ts:472-480`）→ emit `Runtime.exceptionThrown` → `exception_capture.handle_debugger_event` 构造 `runtime_exception`（`exception_capture.ts:120-165`）→ `handle_event` → `write_events`（category `error` → ERROR_EVENTS，`storage.ts:249-298`）→ `get_error_events` 按 capture_id 索引查询返回 1 条。反向验证：若还原为 `handle_console_log`，异常事件无 `event.data`（`handle_console_log` 第 875-876 行 `if (!data) return`），`get_error_events` 返回 0，`expect(errors.length).toBe(1)` 红灯，故测试能捕获回归。
- AC-002：`re_verified` — 测试断言 `get_console_events(...).some(l => l.type === 'runtime_exception')` 为 false；核对 `console_capture.handle_debugger_event` 仅处理 `Runtime.consoleAPICalled`（`console_capture.ts:138`），`Runtime.exceptionThrown` 不会流入 console 存储，断言与实现一致。
- AC-003：`re_verified` — 测试 stop 后 emit 迟到事件，断言 `get_error_events` 为 0；核对 `stop_capture_inner` 调 `stop_exception_capture`（`service_worker.ts:633`）→ `exception_capture.ts:71-75` 置 `is_capturing=false` 并 `removeListener`，迟到事件在 `exception_capture.ts:88` 早退，不落任何 capture。

coverage = 3 / 3

- 系统性 follow-up：无

verdict: PASS
