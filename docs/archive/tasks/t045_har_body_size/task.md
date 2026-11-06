# Task spec + log - T045 har_body_size

## 背景

`exporter.ts:325,334,340` HAR `request.bodySize`/`response.content.size`/`response.bodySize` 用 JS `.length` 字符数，非 UTF-8 字节；中文/emoji/base64 body 尺寸错误。

## 范围

- 优先使用 `request_body_bytes`/`response_body_bytes`；缺失时 `utf8_byte_len(body)`。
- 新增 `utf8_byte_len` helper（TextEncoder）。

## 验收

- [x] HAR body size 用 UTF-8 字节或持久化 bytes 字段。
- [x] npm test 全绿。

## 进展

- 2026-07-19：HAR size 字段全部改为优先 bytes 字段，fallback utf8_byte_len。
