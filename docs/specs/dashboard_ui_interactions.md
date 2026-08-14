# spec: dashboard_ui_interactions

## 背景

Dashboard UI 三处交互缺陷（pending 总账，均为既有 task 遗留）：timeline 空白区（非 marker）拖拽 playhead 未置 `_tl_dragging` 且 pointerdown 内直接调 `render_content()`，使 seek 读 detached overlay 失效、2s 详情轮询重渲染打断拖拽（p035）；captures 批量删除中途失败时已成功项仍残留 selected 集合，用户重点删除会重复触发删除（p040）；`wire_rail_resize`/`wire_network_resize` 的 pointercancel/mouseleave 清理（t154 新增行为）此前无直接测试（p041）。

## 验收标准

- AC-001：timeline 空白区拖拽期间 `_tl_dragging` 为 true，拖拽结束（pointerup/cancel）清理；拖拽期间无中间 render_content 干扰 seek，2s 轮询不打断拖拽。
- AC-002：批量删除中途失败后，selected 集合不再含已删除成功的 capture（失败项保留）。
- AC-003：`wire_rail_resize`/`wire_network_resize` pointercancel/mouseleave 清理拖拽状态（jsdom 行为测试）。
- AC-004：新增测试全绿，既有 dashboard 测试无回归。

## 可测试性

全部 AC 可自动测试：AC-001/003 用 jsdom 派发 pointer 事件序列断言拖拽标记与清理；AC-002 用 mock `send_ui_message` 部分失败断言 selected 集合。

## 实现约定

- normal-lane 拖拽与 marker 拖拽共用同一清理模式：pointerup/pointercancel/lostpointercapture/blur 统一 finish，首次调用即移除全部 listener；拖拽结束统一 `router.render_content()`，pointerdown 不再直接渲染。
- 批量删除循环内成功项即时 `selected.delete(id)`（失败 return 前），全成功路径 `selected.clear()`；删除幂等语义由 SW 层保持，本 task 不改变。

## 测试钩子约定

`src/` 测试钩子导出须带 `_for_test` 命名约定。
