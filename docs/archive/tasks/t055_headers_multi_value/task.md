# Task spec + log - T055 headers_multi_value

## 背景

`network_webrequest.ts:78-85` headers_array_to_map 同 name 直接赋值，重复字段（Set-Cookie/Warning/Link）被后值覆盖。`network_capture.ts:765-767` headers_map_from_cdp 同样。

## 范围

- headers_array_to_map 对重复 name 用逗号合并保留所有值。

## 验收

- [x] 重复 header 不再被覆盖。
- [x] npm test 全绿。

## 进展

- 2026-07-19：headers_array_to_map 重复 header 用 `, ` 合并。NetworkRequestData schema 仍为 string（避免下游大改）。
