# Task plan - T032 sw_start_rollback

## 步骤

1. 红：扩展测试模拟 start 内部失败（mock chrome.tabs.query 或 create_capture 后续抛错），验证 stop 被调用。
2. 红：跑测试失败。
3. 绿：start_capture_inner 主体包裹 try/catch；catch 中调 stop_capture_inner() 清理。
4. 全量 npm test + tsc --noEmit。
5. log + commit + 归档。

## 风险与回退

- 风险：catch 调用 stop_capture_inner 可能再次抛错。缓解：stop_capture_inner 已用 run_stop_step 容错。
- 回退：`git revert <commit>`。
