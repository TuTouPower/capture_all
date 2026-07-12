---
status: approved
type: fix
eval: required
---
# 轨道视图缩放滑块修复
## 一句话意图
轨道视图（trace view）的缩放滑块目前渲染但无事件绑定，修复后拖动滑块可改变时间线可见时间窗口，放大时只显示 playhead 附近的一段区间，缩小时显示更长时间范围。

## 不变量（INV）
- INV-1: 缩放仅改变可见事件集合（时间窗口过滤），不改变事件数据、顺序或相对时间 —— 过滤是纯视图层操作
- INV-2: 切换列表视图再切回轨道视图时，缩放重置为默认值（全时间范围可见）。轨道视图内切换 tab（timeline↔network↔console↔overview）时缩放保持不变
- INV-3: 时间窗口中心跟随 playhead —— playhead 所在时刻始终在可见窗口内，缩放放大以 playhead 为锚

## 验收场景（验收标准 AC）
- AC-1: Given 轨道视图已加载且有至少一个事件 When 向右拖动缩放滑块（值增大、放大） Then 可见标记的数量减少（部分标记因超出时间窗口被隐藏），playhead 附近标记间距视觉上变大
- AC-2: Given 轨道视图已加载 When 向左拖动缩放滑块（值减小、缩小） Then 可见标记的数量增多，标记间距变小
- AC-3: Given 缩放已修改为非默认值 When 切换到列表视图再切回轨道视图 Then 缩放恢复默认值，所有标记重新可见
- AC-4: Given 轨道视图已放大（滑块值 > 默认） When 点击 lanes 空白区域移动 playhead Then 可见标记集合随 playhead 平移而更新（新进入窗口的事件变为可见，离开窗口的事件被隐藏）
- AC-5: Given 轨道视图已放大 When 查看 minimap Then minimap 窗口的高亮区域宽度反映当前缩放级别（放大时窗口窄，缩小时窗口宽），位置反映可见范围在总时间线中的位置

## 边界与反例
- 滑块快速连续拖动: 过滤结果实时响应，不应有明显延迟或跳动
- 缩放级别上限: 滑块最大值对应最小时间窗口（约为总时间跨度的 5%），此时 playhead 附近至少能看到该 lane 内的最近事件
- 缩放级别下限: 滑块最小值对应全量事件可见（100% 时间跨度），无需过滤
- 空事件集: 当轨道视图无事件时，缩放滑块仍然可见和可操作（无事件可过滤，所有 lane 保持为空）
- 多 lane 同步: 所有 7 条 lane 使用同一时间窗口过滤，各 lane 内超出窗口的事件标记设置 `display:none`
- playhead 在时间线两端: 当 playhead 在 t=0 附近时窗口左边界裁切到 0（不出现负时间）；在 maxT 附近同理

## 不做的事
- 不实现 minimap 窗口的拖拽平移（mm-window 拖拽） —— 时间窗口过滤使此功能成为可能，但本次仅实现高亮区域跟随缩放变化
- 不实现离散 +/- 缩放按钮（CSS 中预留了 `.tl-zoom-btns` 类但未使用，本次不引入）
- 不实现键盘快捷键缩放
- 不实现鼠标滚轮缩放

## 技术决策
### 条件强制
无（本 task 独立，不被其他 task 依赖）。

### 设计探索结论
- 候选: A) CSS `transform: scaleX()` 拉伸 lanes 容器 / B) 时间窗口过滤，只显示窗口内事件
- 推荐: B（时间窗口过滤），用户已确认。理由：
  - minimap 窗口可反映当前缩放级别和可见范围，为后续 minimap 拖拽平移留接口
  - 各 lane 独立过滤，标记 `left` 百分比坐标不变，点击命中无偏移
  - 与 DAW / 视频编辑器的 "zoom to playhead" 行为一致
- 已知坑:
  - playhead 在两端的窗口裁切逻辑
  - 过滤和 playhead 移动共享状态，需确保两者不互相覆盖
  - 完整探索过程见 `docs/omni_powers/op_record/decisions.md`

### 实现锚点
- 滑块元素: `#tlZoom` range input（`dashboard_detail.ts:217`）
- 状态: `_dt_zoom` 存入 `dashboard_shared.ts` 模块级变量，默认值 50（= slider 默认位置）
- 映射: `slider_value` 0–100 → `window_pct` = 100 − `slider_value`。即 slider=0 → 100%（全可见），slider=100 → 5%（最大放大），默认 50 → 50%
- 窗口计算: `win_width_ms = maxT * window_pct / 100`，`win_left = clamp(playhead_ms − win_width_ms/2, 0, maxT − win_width_ms)`，`win_right = win_left + win_width_ms`
- 过滤实现: 各 lane-track 内标记 span 通过 CSS class `.tl-hidden`（`display:none`）控制显隐。`apply_zoom_filter()` 遍历标记：`left` 百分比在窗口范围内 → 移除 hidden，否则 → 加 hidden
- 事件绑定: `wire_trace()` 中为 `#tlZoom` 添加 `input` 事件监听，调用 `apply_zoom_filter()`
- playhead 移动联动: 现有 `seek()` 逻辑末尾调用 `apply_zoom_filter()`，保证移动 playhead 时窗口同步平移
- minimap 窗口: 渲染时根据 `_dt_zoom` 计算 `.tl-mm-window` 的 `width` 和 `left`（`width: window_pct%`, `left: (win_left/maxT)*100%`），HTML 模板中默认值用 slider=50 时的值
- 重置: `set_dt_view('list')` 时设 `_dt_zoom = 50`

### 可测性契约
- 应用启动方式: `npm run build && npm run serve:e2e`，Playwright 加载扩展后导航到 dashboard 详情页
- AC-1 验收信号: Playwright 统计缩放前可见标记数（不含 `.tl-hidden`），拖动滑块放大后再次统计，验证减少；关键入口: 扩展 dashboard 详情页轨道视图
- AC-1 通道: CDP（Playwright，扩展自有页 DOM）
- AC-2 通道: CDP
- AC-3 验收信号: 修改缩放后切到 list 再切回 trace，验证滑块 value=50 且无 `.tl-hidden` 标记
- AC-3 通道: CDP
- AC-4 验收信号: 放大后点击 lanes 右侧空白区域，playhead 右移 → 验证左侧部分标记变 hidden、右侧新标记变 visible
- AC-4 通道: CDP
- AC-5 验收信号: 放大后读取 `.tl-mm-window` 的 `width` 值，验证小于默认；缩小后验证变大
- AC-5 通道: CDP
- 测试缝: 需有测试数据（至少一条采集记录含多个事件）才能渲染轨道视图
- 预期失败模式:
  - AC-1 若过滤未生效则标记数不变
  - AC-4 若 playhead 移动未触发重新过滤则窗口位置不随 playhead 平移
  - AC-5 若 minimap 窗口未更新则 width/left 恒为初始值

## 待澄清 [NEEDS CLARIFICATION]
无
