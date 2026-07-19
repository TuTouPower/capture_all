# Task spec + log - T041 dashboard_polling

## 背景

`dashboard.ts:113-132` setInterval(async) 不等前一轮；当前采集页 stats 变化（status 不变）不触发 render；ARIA/键盘/focus-visible/reduced-motion 多项缺失。

## 范围

- 轮询单飞（poll_in_flight）：避免重叠。
- 签名含 event_count/request_count，stats 变化也触发 render。

注：ARIA/键盘/focus-visible/reduced-motion 改进属于 UI 大改，本 task 仅修轮询；UI a11y 改进后续按需迭代。

## 验收

- [x] poll_in_flight 防止重叠。
- [x] 当前采集页 stats 变化触发 render。
- [x] npm test 全绿。

## 进展

- 2026-07-19：dashboard.ts init 轮询加 poll_in_flight 单飞；签名扩展含 event_count/request_count。

## 决策

- ARIA/键盘/focus-visible/reduced-motion 留作未来增量改进，本 task 聚焦轮询正确性。
