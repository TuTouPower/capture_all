# Task spec + log - T040 exports_page_wiring

## 背景

`dashboard.ts:82-83` `page === 'exports'` 时只 `innerHTML = render_exports()`，`dashboard_integrations.ts:29-39` 渲染 `data-export` 按钮但无 wiring 函数，按钮点击无响应。

## 范围

- dashboard_integrations.ts: 新增 `wire_exports()` 绑定 `[data-export]` click 复用 `export_capture(id)`。
- dashboard.ts: imports + `page === 'exports'` 调 wire_exports()。

## 验收

- [x] 导出按钮点击触发 export_capture。
- [x] npm test 全绿。

## 进展

- 2026-07-19：实现 wire_exports，dashboard.ts 集成。

## 决策

- 复用 dashboard_shared.export_capture（已实现进行中/成功/失败态）。
- 暂不引入"防止重复点击"逻辑，export_capture 内部可后续加 busy 标记（T041 配套）。
