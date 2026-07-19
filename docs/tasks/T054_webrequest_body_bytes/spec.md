# Task spec + log - T054 webrequest_body_bytes

## 背景

`webrequest_handler.ts:242-247` build_network_event 无论 body 是否存在都设 response_body_encoding=null/response_body_bytes=null；service_worker 依赖 response_body_bytes 累加 total_body_bytes。

## 范围

- build_network_event：有 response_body 时填 encoding='utf8' + UTF-8 字节长度。

## 验收

- [x] response_body 存在时 encoding/bytes 正确填充。
- [x] npm test 全绿。

## 进展

- 2026-07-19：实施。
