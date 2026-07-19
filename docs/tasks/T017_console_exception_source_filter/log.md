# Task log - T017 console_exception_source_filter

## 进展

- 2026-07-19：`console_capture.ts` 与 `exception_capture.ts` 三处修复：
  1. `handle_debugger_event` 入口调 `should_handle_event(source, tab_id)` 过滤非目标 tab/未登记 session 事件。
  2. Target.attachedToTarget/detachedFromTarget lifecycle 事件仅校验 tabId（用于 register/unregister session，本身不带 sessionId 校验）。
  3. `start_*` catch 中若 `attached_by_us` 则 best-effort detach + 重置，避免 Runtime.enable 失败遗留 debugger attachment。

## 关键验证

- 红 -> 绿：console_capture + exception_capture 共 6 红测试 -> 全绿。
- 全量：`npm test` 93 文件 / 1106 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- Target.* lifecycle 事件放在 should_handle_event 之前处理：这些事件本身用于 register session，不能因 session 未登记被过滤。仅校验 tabId 与目标 tab 一致。
- 其他 Runtime.* 事件严格走 should_handle_event（tabId + 已登记 session）。
- catch 中 detach 失败静默忽略（cleanup 路径）。

## 验收

- [x] 其他 tab 的 console 事件不发。
- [x] 未登记 session 的 sub-target console 事件不发。
- [x] Runtime.enable 失败 + attached_by_us 时 detach 被调，返回 success:false。
- [x] exception_capture 同样三行为。
- [x] npm test 全绿。
