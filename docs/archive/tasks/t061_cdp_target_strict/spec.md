# Task spec + log - T061 cdp_target_strict

## 背景

`src/bridge/cdp_handler.ts:111-114` tab_url 精确匹配失败后自动退回首个 page target，可能采集错误标签页。

## 范围

- tab_url 非空时精确匹配，无匹配则 fail fast 返回 cdp_target_not_found。
- tab_url 为空时退回首个 page target（保留旧行为）。

## 验收

- [x] tab_url 非空无匹配时返回错误。
- [x] npm test 全绿。

## 进展

- 2026-07-19：实施。
