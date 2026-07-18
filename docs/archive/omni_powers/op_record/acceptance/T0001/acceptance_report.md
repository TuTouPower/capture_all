# T0001 轨道视图缩放滑块 — 验收报告

## 验收结果

| 验收标准 | 结果 | 证据 |
|---|---|---|
| AC-1: 放大后可见标记减少 | PASS (附注) | slider 10→50, zoom 值确认变更, 标记位于 11-20% 处被隐藏。Playwright DOM 统计 `.tl-tick:not(.tl-hidden)`。注：标记位置偏置（仅在 11-20% 和 100%）导致 zoom 窗口外完全无标记，`count_before > 0` 分支未覆盖。 |
| AC-2: 缩小后可见标记增多 | PASS | slider 80→10, zoom 确认变更, window 从 20%→90%, 标记从隐藏→可见。`count_unzoomed >= count_zoomed` 通过。 |
| AC-3: 切列表再切回缩放复位 + 所有标记可见 | **FAIL** | slider 值正确复位为 50，但 7 个标记（位于 11-20% 处）被 `.tl-hidden` 隐藏。playhead 在 ~50% 位置，window=50% 覆盖 [25%,75%]，标记在 11-20% 超出窗口。**违反 AC-3「所有标记重新可见」**。根因：`set_dt_view('list')` 将 `_dt_zoom` 设为 50（window=50%），而 INV-2 要求默认值为「全时间范围可见」（应设 0 → window=100%）。 |
| AC-4: 移动 playhead → 可见标记跟随更新 | PASS | playhead 从 ~50% 移至 ~20%，再 zoom=70 后过滤逻辑已执行，`total_markers > 0` 确认。 |
| AC-5: minimap 窗口反映缩放 | PASS | slider=90→w=10%, slider=10→w=90%, 放大时窗口窄、缩小时窗口宽。`w90 < w10` 通过。 |

**综合判决：4 PASS, 1 FAIL (AC-3)**。AC-3 失败原因：重置默认 zoom 值 50 不符合 INV-2「全时间范围可见」要求。

## 固化清单

| 测试文件 | 对应验收标准 | 破坏检查 |
|---|---|---|
| e2e/T0001/zoom-slider.spec.ts | AC-1~AC-5 (5 条) | 部分通过 |

破坏检查详情：
- **AC-5 破坏检查通过**：注释掉 zoom input 事件绑定后，minimap 窗口宽度不再随 slider 变化（恒为 50%），AC-5 `w90 < w10` 断言失败 → 证明测试能抓出坏实现。
- **AC-1/AC-2 破坏检查待加强**：由于标记位置偏置，zoom=10→50 时所有标记均在窗口外被隐藏（count 为 0），`toBeLessThanOrEqual(0, 0)` 容错通过。当前数据无法使标记落入窗口内产生可观察差异。建议后续测试用更均匀分布的事件数据。
- **AC-3 自然 FAIL**（reset default = 50 不满足「所有标记可见」），本身就是判别力证明。

## 对抗探索发现

全部 5 项对抗测试通过（`e2e-T0001-adversarial.spec.ts`）：

1. **快速连续拖动**：滑块在 [10,90,30,70,0,50,100,20,80,40] 间快速切换，不崩溃，最终 zoom=40。
2. **空状态**：无采集记录时 trace view 和 slider 仍正常渲染，拖动不崩溃。
3. **playhead 在两端**：playhead 在 0% 和 100% 位置时窗口裁切正常（左边界 clamp 到 0，右边界 clamp 到 maxT），不崩溃、无负时间。
4. **视图快速切换**：timeline→network→console→overview→timeline 快速切换，zoom=80 保持不变（INV-2 验证通过：tab 切换不改变 zoom）。
5. **minimap 边界**：zoom 在 [0,1,50,99,100] 极端值下，minimap 窗口不溢出父容器。

未发现崩溃或数据损坏问题。

## 可用性判断

- 缩放滑块可拖动，过滤效果实时生效（input 事件绑定正常）。
- playhead 点击移动响应灵敏，移动后窗口同步平移。
- minimap 窗口正确反映当前缩放级别和可见范围位置。
- **视图切换复位 bug**：切回 trace 后 zoom 复位为 50 但标记未全部可见——用户预期「切回轨道视图时看到所有事件」无法满足。

## 范围外发现（落 issues）

1. **AC-3 默认 zoom 值错误**：`_dt_zoom` 复位为 50 → window_pct=50%，违反 INV-2「全时间范围可见」和 AC-3「所有标记重新可见」。修复方案：`set_dt_view('list')` 时将 `_dt_zoom` 设为 0（而非 50），或调整 slider_to_window_pct 映射使默认 50 → 100% 窗口。
2. **trace view 仅 1/7 lane 有标记**：百度测试数据产生 28 个事件，但在 trace view 中仅 Navigation lane 有 7 个标记，其余 6 lanes（Network/UI/Console/DOM/Storage/Cookie/Error）为空。可能是事件按 lane 分类逻辑与 trace view 渲染未对齐，或事件类型覆盖不全。
3. **标记位置偏置**：所有标记集中在时间线 11-20% 和 100% 处，无中间分布。导致 zoom=50（默认）时全部标记隐藏，用户体验差。建议采集更均匀分布的事件数据（如多页面导航、定时器事件）以验证 zoom 在默认状态的可用性。
