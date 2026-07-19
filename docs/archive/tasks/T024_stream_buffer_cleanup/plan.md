# Task plan - T024 stream_buffer_cleanup

## 步骤

1. 红：扩展 `tests/unit/stream_buffer.test.ts` 覆盖 4 项验收。
2. 红：跑测试失败。
3. 绿：
   - on_flush 改 `(req_id, data) => Promise<void> | void`；内部封装 await + try/catch。
   - flush 保留 entry（chunks 清空但 entry 不删）；失败回填 chunks；串行化（per-request 等待前次 promise）。
   - finish(req_id) = flush + delete；force_flush 改用 finish。
   - remove 用 `entry?.timer != null`。
   - size 仅计 chunks.length > 0。
4. 全量 `npm test` + `tsc --noEmit`。
5. log + commit + 归档。

## 风险与回退

- 风险：异步 on_flush 改变现有调用顺序。缓解：await 在 cdp_handler force_flush 不阻塞主流程；force_flush 改异步需调用方适配（grep 调用方）。
- 回退：`git revert <commit>`。
