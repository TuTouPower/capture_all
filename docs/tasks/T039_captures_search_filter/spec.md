# Task spec + log - T039 captures_search_filter

## 背景

`src/extension/dashboard/dashboard_captures.ts:52-54,67-71` 渲染 `#capSearch` 输入、状态筛选按钮、`#capReset`，但 `wire_captures()` 无对应事件绑定，输入文字/点击按钮不改变列表。

## 范围

- `dashboard_shared.ts`：新增 `_cap_search` / `_cap_status_filter` 状态 + get/set。
- `dashboard_captures.ts`：
  - 新增 `filter_captures(all)`：按搜索词 + 状态过滤。
  - `render_captures`：用过滤后 captures 渲染行；搜索框回填当前值；状态按钮标记 data-cur。
  - `wire_captures`：绑定 `#capSearch` input（debounce 300ms + 焦点恢复）、`#capReset` 重置、`.fb-status-btn` 状态切换。

## 验收

- [x] 输入搜索词后列表按名称/URL/标签过滤。
- [x] 状态按钮切换 all/capturing/completed。
- [x] 重置清空搜索与状态过滤。
- [x] 搜索框保留输入值与焦点。
- [x] npm test 全绿。

## 进展

- 2026-07-19：实现搜索/状态过滤/重置完整 wiring。状态过滤从下拉改为 3 按钮直选。

## 决策

- 状态过滤用 3 按钮直选替代原设计的下拉（更简单可访问）。
- debounce 300ms 避免每次按键触发 render_content。
- render_content 后手动恢复焦点与光标位置（DOM 重建会丢失）。
