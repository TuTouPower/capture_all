# Task plan - T030 sw_restart_recovery

## 步骤

1. 红：扩展 tests/unit/service_worker_stale_cleanup.test.ts 覆盖 3 项验收。
2. 红：跑测试失败。
3. 绿：
   - start_capture_inner：commit 后写持久化键。
   - stop_capture_inner：清理前清键。
   - cleanup_stale_capture_state：读新键，残留则 update_capture 标 completed。
4. 全量 npm test + tsc --noEmit。
5. log + commit + 归档。

## 风险与回退

- 风险：现有 stale_cleanup 测试期望旧键。缓解：grep 现有断言。
- 回退：`git revert <commit>`。
