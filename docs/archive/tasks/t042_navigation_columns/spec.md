# Task spec + log - T042 navigation_columns

## 背景

`dashboard_detail.ts:99` navigation tab 传 6 个表头但 `render_simple_events` 固定 5 列 grid（`tpl = '110px 110px 1fr 1fr 90px'`），每行输出 5 单元格，第六表头进入隐式列错位。

## 范围

- navigation 表头减为 5 个，与 5 列 grid 对齐。

## 验收

- [x] navigation 表头 5 个。
- [x] npm test 全绿。

## 进展

- 2026-07-19：表头改为 `['时间', '类型', '事件', 'URL / 来源 / 详情', '来源']`（5 个）。
