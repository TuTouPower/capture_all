# Task plan + log - T035 storage_transaction_atomic

## 进展

- 2026-07-19：`src/extension/background/storage.ts`：
  - create_capture / update_capture：tx.oncomplete resolve，tx.onerror/onabort reject（不再 request.onsuccess）。
  - flush_store：tx.oncomplete 后才累计 bytes_written；tx.onerror/onabort 时 batch 按原顺序放回 buffer 头部供下次重试。
  - 周期 flush 错误：flush_store 已自回填，周期调用静默 catch（避免刷屏）。

## 关键验证

- 全量：`npm test` 102 文件 / 1136 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- 写操作统一以 tx.oncomplete 为成功边界，符合 IndexedDB 语义。
- flush_store 失败放回 buffer 头部（不是尾部）保证原顺序重试。
- bytes_written 在 tx.oncomplete 后累计，避免 abort 后虚高。

## 验收

- [x] create_capture/update_capture 用 tx.oncomplete resolve。
- [x] flush_store abort 时 batch 放回 buffer。
- [x] npm test 全绿。
