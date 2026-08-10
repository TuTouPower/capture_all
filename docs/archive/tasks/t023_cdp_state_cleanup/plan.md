# Task plan - T023 cdp_state_cleanup

## 步骤

1. 红：新建 tests/unit/cdp_state_cleanup.test.ts，覆盖 3 项验收。
2. 红：跑测试失败。
3. 绿：
   - 删除 cdp_primary_emitted Set 与所有引用（grep 后逐一删）。
   - handle_loading_finished 完成清理时 finished_before_stream.delete(req_key)。
   - CdpHandlerState 加 orphan_timers: Map<string, ReturnType<typeof setTimeout>>；schedule_orphan_check 存句柄；回调 delete；新增 clear_orphan_timers(state)。
4. 全量 npm test + tsc --noEmit。
5. log + commit + 归档。

## 风险与回退

- 风险：cdp_primary_emitted 可能有未发现的读取点。缓解：grep 确认；如发现读取语义保留并补 read 逻辑。
- 回退：`git revert <commit>`。
