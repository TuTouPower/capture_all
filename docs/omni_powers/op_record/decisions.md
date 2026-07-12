# 历史决策

> 有架构决策才追加。记"为什么这样选"，不记"做了什么"（那在 progress）。

## [来源标记 | {TID} | Round-{N} | YYYY-MM-DD HH:mm:ss UTC+8] {决策标题}

**决策**：...

**理由**：...

**被否方案**：...

**影响**：...

## [red-attribution | T0001 | Round-2 | 2026-07-12 UTC+8] 9 条 readFileSync + toContain 源码字符串断言不测行为

- reviewer 指出 `tests/detail_zoom_control.test.ts` 中 9 条断言使用 `readFileSync` + `toContain` 检查源文件字符串存在性，纯存在性断言，不验证缩放过滤的实际行为效果 —— 归因结论：b 测试写错（源码字符串存在性断言替代行为测试）

## [red-attribution | T0001 | Round-3 | 2026-07-12 UTC+8] AC-3 FAIL：默认 _dt_zoom=50 不满足 INV-2 "全时间范围可见"

- evaluator 发现 `set_dt_view('list')` 将 `_dt_zoom` 复位为 50，导致 `window_pct = 100 - 50 = 50%`，仅一半时间范围可见；INV-2 要求切换列表视图后缩放重置为"全时间范围可见" —— AC-3 / INV-2 依据，归因结论：a 实现bug（默认值语义错误，应为 0 而非 50，使得 reset 后 `window_pct = 100%`）
## [red-attribution | T0002 | Round-3 | 2026-07-12 23:40:17 UTC+8] T0002 验收红灯归因：标记载体索引错位 + inspector 关闭缺渲染 + E2E 坐标漂移

- filtered_events() 索引错位导致 AC-3 FAIL —— AC-3 依据：`data-event-idx` 用 `filtered_events()` 的索引赋值，但点击处理 `wire_trace()` 中拿 `detail_events[idx]` 取值，quick filter 切换后两数组索引不再对应，inspector 展示错误事件。归因结论：a 实现bug。修复：改用 `detail_events.indexOf(e)` 统一索引源。
- 非标记区域点击后 inspector 不关闭导致 AC-4 FAIL —— AC-4 依据：`wire_trace()` 中 lanes 空白区域 pointerup 判断位移>3px 后调用了 `set_dt_insp_open(false)`，但缺失 `router.render_content()` 调用，DOM 不更新，inspector 面板仍可见。归因结论：a 实现bug。修复：在 `set_dt_insp_open(false)` 后追加 `router.render_content()`。
- E2E inspector 打开后标记坐标漂移 —— AC-3 依据：inspector 面板插入 DOM 后改变了轨道视图容器宽度，导致已获取的标记 B 的 bounding box 坐标漂移、点击落空。归因结论：b 测试写错。修复：点击标记 A 后重新获取标记 B 坐标。
