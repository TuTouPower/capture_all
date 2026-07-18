---
status: approved
type: fix
eval: required
---
# 时间线标记点击跳转
## 一句话意图
点击轨道视图时间线上的事件标记（菱形/圆点/竖线）后，playhead 跳到该事件的时间位置并打开事件详情面板。

## 不变量（INV）
- INV-1: 点击标记后 playhead 时间位置必须精确对应所点击事件的 `relative_time_ms` —— 不能偏移到相邻事件
- INV-2: 点击同一标记两次，第二次行为与第一次一致（幂等）—— 不会因为 inspector 已打开而行为异常或重复渲染

## 验收场景（验收标准 AC）
- AC-1: Given 轨道视图有至少一个事件标记 When 点击任意一个标记 Then playhead 红色竖线跳到该标记所在时间位置，playhead 标签时间更新为该事件时间
- AC-2: Given 轨道视图有事件标记 When 点击标记 Then 右侧 inspector 面板打开，显示该事件的类型、时间、来源等字段信息
- AC-3: Given inspector 已打开显示事件 A When 点击事件 B 的标记 Then inspector 内容切换为事件 B 的详情
- AC-4: Given 轨道视图有事件标记 When 在标记上按住拖动（mousedown → mousemove → mouseup，位移超过阈值） Then 行为等同于 lanes 区域拖动 playhead（仅移动播放头，不打开 inspector）

## 边界与反例
- 标记重叠: 同一时间位置有多个标记时（如 network 和 console 事件同时发生），点击应选中对应 lane 的标记而非误触其他 lane
- 点击 lanes 空白区域: 行为不变——仅移动 playhead，不打开 inspector
- 事件已选中再点标记: 若 inspector 已打开且显示的就是该事件，不重复渲染
- 点击已过滤隐藏的标记: 时间窗口外的标记（`.tl-hidden`，`display:none`）不可见也不可点，点击行为等同于空白区域
- 空事件集: 无标记时 lanes 区域点击行为不变

## 不做的事
- 不实现标记拖拽移动（标记位置由事件时间决定，不可修改）
- 不实现多选标记
- 不实现标记右键菜单
- 不改变 minimap 交互

## 技术决策
### 条件强制
- T0001 方案 B（时间窗口过滤）已冻结。标记位置用 `left: N%` 百分比（无 transform），点击命中可直接用标记的百分比坐标计算 playhead 位置

### 设计探索结论
- 候选: A) 仅 seek——playhead 跳到事件时间 / B) seek + 打开 inspector
- 推荐: B，用户已确认 —— 点击后直接看到事件详情比只跳转更有用
- 已知坑: 标记 pointerdown 冒泡到 lanes 触发拖动。用 stopPropagation + 位移阈值区分 click 和 drag
- 完整探索过程见 `docs/omni_powers/op_record/decisions.md`

### 实现锚点
- 标记元素: `.tl-tick`、`.tl-dot`、`.tl-diamond`（`dashboard_detail.ts:206-212`）
- 标记新增 `data-event-idx` 属性，值为事件在 `filtered_events()` 中的索引
- 事件绑定: `wire_trace()` 中对 `.tl-lanes` 做事件委托，判断 `e.target` 是否匹配标记选择器
- click/drag 区分: pointerdown 记起始坐标，pointerup 算位移。≤ 3px → 单击（seek + inspector）；> 3px → 拖动（仅 seek）
- seek: 单击从 `data-event-idx` 取事件，以 `(e.relative_time_ms / maxT) * 100` 设 playhead 位置并调用 seek。缩放后标记 click 仍用事件时间，不依赖物理坐标
- inspector 打开: `set_dt_sel(idx)` + `set_dt_insp_open(true)` + 重新渲染
- 冒泡: 标记 pointerdown 时 `e.stopPropagation()`

### 可测性契约
- 应用启动方式: `npm run build && npm run serve:e2e`，Playwright 加载扩展后导航到 dashboard 详情页轨道视图
- AC-1 验收信号: Playwright 点击可见标记 → 读 `#tlPlayhead` 的 `left` → 与标记 `left` 值一致（容差内）；关键入口: 扩展 dashboard 详情页轨道视图
- AC-1 通道: CDP（Playwright）
- AC-2 验收信号: Playwright 点击标记 → `.dt-insp` 出现在 DOM 且包含事件类型字段
- AC-2 通道: CDP
- AC-3 验收信号: 点标记 A 记 inspector 文本，点标记 B 验证文本已变
- AC-3 通道: CDP
- AC-4 验收信号: Playwright 在标记上 `mousedown → mousemove`（> 3px）→ `mouseup`，验证 inspector 未出现
- AC-4 通道: CDP
- 测试缝: 需有测试数据（至少一条采集记录含多个不同类型事件）
- 预期失败模式:
  - AC-1 若未 stopPropagation，点击标记触发了 lanes 拖动 → playhead 跳到物理坐标而非事件时间
  - AC-4 若位移阈值缺失或过大，拖动误判为点击 → inspector 意外打开

## 待澄清 [NEEDS CLARIFICATION]
无
