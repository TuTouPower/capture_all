# Task spec + log - T056 correlator_merge

## 背景

`network_correlator.ts:80-81` `web_meta.request_headers || cdp_event.request_headers`：空对象 {} 为 truthy 不回退到 CDP Header，MIME 提取也返回 null。

## 范围

- merge_matched 用 has_headers（Object.keys.length > 0）判断而非 || 真值。

## 验收

- [x] 空 headers 对象时回退到 CDP headers。
- [x] npm test 全绿。

## 进展

- 2026-07-19：实施。
