# Task plan - T017 console_exception_source_filter

## 步骤

1. 红：扩展 `tests/unit/console_capture.test.ts` 与 `tests/unit/exception_capture.test.ts` 覆盖 3 项验收 ×2 文件。
2. 红：跑测试失败。
3. 绿：
   - import should_handle_event。
   - handle_debugger_event 入口加 should_handle_event(source, tab_id) 守卫。
   - start catch 中 best-effort detach + 重置。
   - stop 不再以 is_capturing 为唯一条件，attached_by_us 残留时也 detach。
4. 全量 `npm test` + `tsc --noEmit`。
5. log + commit + 归档。

## 风险与回退

- 风险：should_handle_event 对 source=undefined 返回 false 会误杀。缓解：保持当前实现 source undefined 且 dbg_tab_id!=null 时不按 session 校验（仅主目标）。复核 cdp_event_router:27-36 已正确处理。
- 风险：stop 重构可能改变现有测试期望。缓解：先跑现有测试看影响。
- 回退：`git revert <commit>`。
