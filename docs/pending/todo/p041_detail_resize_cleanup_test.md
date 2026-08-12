# p041 dashboard_detail resize 拖拽清理测试

- 来源：t154 遗留（gen_f002 minor）
- 内容：dashboard_detail 的 `wire_rail_resize`/`wire_network_resize` 新增 pointercancel/mouseleave 清理（与 sidebar_resize 同型）无直接测试（代码复核正确）。补 jsdom 拖拽清理测试覆盖两处实现。非阻断。
- 处理：未开
