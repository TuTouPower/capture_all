# Spec — 详情时间线搜索保留输入

详情时间线搜索 debounce 重绘后，输入框保留用户已输入字符串，过滤结果随输入更新。

## 语义

- `render_dt_rail` 渲染 `#dtSearch` input 时，`value` 从重绘前 DOM 读当前值并转义（`&`/`"`/`<`），重绘不丢输入。
- `filtered_events` 用 `#dtSearch.value` 过滤，重绘后 value 保留故过滤语义不变。
- 空输入重绘 value 为空。

## 相关实现

- `src/extension/dashboard/dashboard_detail.ts`：`render_dt_rail` value 保留
- `tests/unit/detail_search_preserve_input.test.ts`：value 保留/空/转义测试
