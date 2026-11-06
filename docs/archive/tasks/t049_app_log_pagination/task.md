# Task spec + log - T049 app_log_pagination

## 背景

`app_log_storage.ts:54-104` 终止条件 `counted >= limit + offset` 跳过 offset 后多返回 offset 条；`estimate_entry_bytes` 不计 details/stack 且不按 UTF-8 字节；flush 先 splice 再开 tx 失败永久丢批次。

## 范围

- get_entries 终止改为 `results.length >= limit`。
- estimate_entry_bytes 用 TextEncoder JSON 全字段。
- flush 失败 batch unshift 回 buffer + tx.onabort。

## 验收

- [x] 跳过后只返回 limit 条。
- [x] bytes 估算含 details/stack UTF-8。
- [x] flush 失败 batch 回 buffer。
- [x] npm test 全绿。

## 进展

- 2026-07-19：实施。
