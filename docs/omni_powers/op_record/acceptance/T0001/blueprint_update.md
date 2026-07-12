# T0001 Blueprint 更新提案

> feature 归属：不确定（task spec frontmatter 缺少 `feature_key` 字段；最相关蓝图文档为 `specs/dashboard.md`）
> 提案时间：2026-07-12（leader 未传入时间戳，closer 自填）
> 验收结果：PASS（吸收验收修正 Round 3 默认值修复）

## specs/dashboard.md

### 新增

- 轨道视图缩放滑块行为 —— 填补当前 `specs/dashboard.md` §3.1 时间线对缩放控制的空白
  ```
  ### 3.1.1 缩放滑块

  轨道视图（trace view）顶部缩放滑块 `#tlZoom` 控制可见时间窗口：

  - 滑块值 0-100 → 窗口百分比 100%-5%（`slider_to_window_pct` 映射）。
  - 默认值 0，对应 100% 窗口（全时间范围可见）。
  - 过滤为纯视图层操作（INV-1）：通过 CSS class `.tl-hidden { display: none; }` 控制标记显隐，不改变事件数据。
  - playhead 为窗口中心锚点（INV-3）：`win_left = playhead_ms - win_width_ms / 2`，两端 clamp 到 [0, maxT]。
  - minimap 窗口 `.tl-mm-window` 的 width/left 随缩放级别同步更新。
  - 切换列表视图再切回轨道视图时 zoom 重置为 0（全可见，INV-2）。轨道视图内切换 tab 时 zoom 保持不变。
  - 滑块快速连续拖动实时响应（input 事件绑定），空事件集时滑块仍可操作。
  - 所有 7 条 lane 使用同一时间窗口过滤。
  ```

### 修改

- 无

### 删除（因被上游覆盖）

- 无

## architecture.md

无更新。新增的 `_dt_zoom` 状态变量、`slider_to_window_pct()`、`apply_zoom_filter()` 均在既有模块 `dashboard_shared.ts` / `dashboard_detail.ts` 内，不改变模块职责边界、数据流或目录结构。

## domain.md

无更新。`_dt_zoom`、`tl-hidden` 为实现细节，非领域概念；不引入新术语。

## conventions.md

无更新。新增代码遵循既有 snake_case 命名、4 空格缩进、原生 HTML/CSS/TS 无框架等全部规范。

## prd.md

无更新。缩放滑块是既有轨道视图的交互增强，产品定位和用户故事未变。

## test.md

无更新。新增测试文件 `tests/detail_zoom_control.test.ts`（22 条行为测试）遵循既有测试分层（vitest 单测）。E2E 测试 `e2e/T0001/zoom-slider.spec.ts` 和 `e2e-T0001-adversarial.spec.ts` 由 task E2E 项目承载，不改变 test.md 的测试策略或项目定义。

## baselines 合入（每条标信号类型：结构化=硬门 / 视觉=锚点）

### 新增

- 无。本轮 E2E 验收由 Playwright 动态执行（`e2e/T0001/zoom-slider.spec.ts`），未产出静态基线快照文件。

### 更新

- 无

### 删除

- 无

## task 归档提案

- TID 标记完成：T0001 永不复用
- 归档：spec 原文入 op_record/specs/、task 目录入 op_record/tasks/T0001/、acceptance 入 op_record/acceptance/T0001/
