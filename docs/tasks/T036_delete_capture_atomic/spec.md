# Task spec + log - T036 delete_capture_atomic

## 背景

`src/extension/background/storage.ts:201-241` delete_capture 跨 9 个独立事务顺序删除 CaptureRecord + 8 类事件，任一失败留半删除；游标 `cursor.delete()` 无 error 处理，结束时 resolve 而非等 tx.oncomplete。

## 范围

- delete_capture 改为单一 readwrite 事务覆盖全部 store；oncomplete resolve，onerror/onabort reject；游标 delete 在事务内完成。

## 验收

- [x] delete_capture 单事务覆盖 9 stores。
- [x] tx.oncomplete resolve。
- [x] npm test 全绿。

## 进展

- 2026-07-19：delete_capture 重写为单一事务，所有 store 删除操作在同一 tx 内，tx.oncomplete resolve；游标 delete 错误由 tx.onerror 捕获。

## 关键验证

- 全量：`npm test` 102 文件 / 1136 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。
