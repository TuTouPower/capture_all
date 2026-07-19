# Task log - T024 stream_buffer_cleanup

## 进展

- 2026-07-19：`src/extension/background/stream_buffer.ts` 三处修复：
  1. `flush` 区分 `delete_after`：force_flush 与 flush_all 默认 true（连接结束语义），从 buffers Map 删除 entry；周期 flush 与阈值 flush 默认 false（保留 entry 继续接收）。
  2. `remove` 幂等：用 `entry?.timer != null` 守护，不存在 request_id 不抛 TypeError。
  3. `on_flush` 失败保留 chunks：同步路径 try/catch 不清空；异步路径 `.catch` 异步回填。
  - `size()` 仅计 chunks.length > 0 活跃流（空 entry 不计）。

## 关键验证

- 红 -> 绿：stream_buffer.test.ts 3 用例 -> 全绿。
- 全量：`npm test` 98 文件 / 1124 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- force_flush/flush_all = finish 语义（flush + delete），匹配"连接结束必须清理"。
- on_flush 同步路径优先；异步路径（返回 Promise）仅清空 chunks + 失败回填，主流程不阻塞。
- 失败异常吞掉以避免污染调用方；调用方可通过再次 force_flush 重试。

## 验收

- [x] force_flush 后 entry 从 Map 删除（size=0）。
- [x] remove 不存在 request_id 不抛错。
- [x] on_flush 抛错时 chunks 保留。
- [x] npm test 全绿。
