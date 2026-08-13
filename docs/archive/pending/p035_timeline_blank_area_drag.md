# p035 timeline 空白区 playhead 拖拽保护缺失

- 来源：t144 遗留（gen_f007 minor）
- 内容：dashboard 时间线空白区（非 marker）点击拖拽 playhead 时未置 `_tl_dragging`，且该分支 pointerdown 自身调 `render_content()` 使 seek 读 detached overlay 失效。2s 轮询重渲染在拖拽期间会打断。非关键（拖拽不崩溃，仅体验），登记留待 t154 dashboard 小修复集或独立处理。
- 处理：t197
