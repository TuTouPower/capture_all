# Task plan - T031 sw_stop_drain

## 步骤

1. 红：扩展 tests/unit/stop_capture.test.ts 断言 stop 顺序（stopped_event 后于 stop_network）。
2. 红：跑测试失败。
3. 绿：调整 stop_capture_inner 顺序：先停生产者 + flush drain，再写 stopped_event + update_capture。
4. 全量 npm test + tsc --noEmit。
5. log + commit + 归档。

## 风险与回退

- 风险：现有 stop_capture.test.ts 期望顺序。缓解：grep 调整。
- 回退：`git revert <commit>`。
