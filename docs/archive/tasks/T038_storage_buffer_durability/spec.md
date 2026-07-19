# Task spec + log - T038 storage_buffer_durability

## 背景

`src/extension/background/storage.ts:263-317` 写入函数先入内存 buffer，不足 FLUSH_BATCH_SIZE 不落 IndexedDB。调用方收到成功后 MV3 SW 回收丢内存批次但 stats 已增加。

## 范围

- write_events/write_network_requests/write_console_events：每次写入立即 await flush_store，调用方返回前数据已落库。
- 代价：失去 batch 合并优化，但保证 durability。

## 验收

- [x] write_events 每次调用后 flush_store 被 await。
- [x] npm test 全绿。

## 进展

- 2026-07-19：write_events/write_network_requests/write_console_events 改为每次写入立即 await flush_store；周期 flush 仍作为兜底（buffer 已空时无操作）。

## 决策

- 性能影响：高频事件每次单事务，相对 batch 慢。但 MV3 SW 回收窗口不再丢数据。
- 后续如需 batch 优化，可引入持久队列 + 异步消费。
