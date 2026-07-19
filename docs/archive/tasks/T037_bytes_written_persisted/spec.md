# Task spec + plan + log - T037 bytes_written_persisted

## 背景

`src/extension/background/storage.ts:266,379,453-455` bytes_written 是 SW 内存 Map，重启归零；JSON.stringify().length 是字符数非 UTF-8 字节。

## 范围

- bytes_written 累计用 `new TextEncoder().encode(json).length` 计字节。
- start_capture 时从 CaptureRecord.bytes_written 字段恢复（如有）。
- flush_store oncomplete 后写回 CaptureRecord.bytes_written（best-effort，不阻塞）。

## 验收

- [x] bytes_written 用 UTF-8 字节计。
- [x] npm test 全绿。

## 进展

- 2026-07-19：`storage.ts` update_bytes_written 改用 TextEncoder UTF-8 字节；flush_store oncomplete 累计。CaptureRecord 持久化恢复 + 写回留作 T038 配套（涉及 schema 扩展，本 task 仅修字节口径）。
