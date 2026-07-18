# 弹出窗口三状态

`src/extension/popup/`。轻量采集控制面板，宽度约 360-400px，不出现垂直滚动条。

## 1. 布局（从上到下）

1. 标题栏：左 "Capture All 全采"，右上角「主面板」入口（`open_in_new` 图标，背景色与外部白色一致）。
2. 操作区（固定高度 108px，三种状态按钮行高一致）。
3. 数据标签区：7 个 MetricCard，三列网格（3 + 3 + 1，Cookie 居中独占末行，无占位卡）。
4. 最近采集列表：最近 3 条，每条含时间、时长、事件数、「查看详情」。

## 2. 三状态

### 2.1 状态 1：开始采集

- 操作区：整宽蓝色大按钮「开始采集」（主色 `--blue` `#3b82f6`，14px 圆角）。
- 标签区：7 卡片仅图标 + 名称，无数字、无分隔线、居中。

### 2.2 状态 2：采集中

- 操作区：红色计时按钮（`--red`），格式 `00:03:28`，含「点击结束」提示，整块即结束键。右侧白色描边按钮「实时详情」。
- 标签区：7 卡片图标 + 名称 + 分隔线 + 实时计数（来自 `capture_stats.ts`，非固定 0）。
- 计数随采集实时更新（popup 每秒轮询 `get_status`，`poll_capture_status.ts`）。

### 2.3 状态 3：采集完成

- 操作区：绿色时长块（`--green`，含勾选标记）。右侧两按钮叠放：「查看详情」「开始新采集」。
- 标签区：与采集中一致（图标 + 名称 + 分隔线 + 计数）。

## 3. 状态切换

- popup 打开 → `get_status` 决定初始状态（无活跃采集 → 状态 1；有活跃 → 状态 2；刚停止 → 状态 3）。
- 点击「开始采集」→ `sendMessage({ action: 'start', config })` → SW 返回 capture_id → 切换状态 2。`storage.set` 必须在 start 成功回调后（P2 #15 修复）。
- 点击红色区域 → `sendMessage({ action: 'stop' })` → 切换状态 3。
- 采集状态打开时立即刷新标签统计（BUG-012 修复）。

## 4. MetricCard 组件

三列网格，卡片高度约 64px，圆角 14px，内边距 16px，间距 12px。浅色背景 + 对应数据源色边框 + 主色文字。三种状态卡片尺寸统一。

数据源色 token 见 `design_system.md`。

## 5. 入口

- 「主面板」按钮：打开 dashboard（`src/extension/dashboard/dashboard.html`）。
- 「实时详情」/「查看详情」：打开 dashboard 详情视图（`?capture=xxx&page=detail`），不跳转独立页面。
- 「查看全部」按钮：与「查看详情」右对齐。

## 6. 禁止

- 不出现垂直滚动条。
- 不出现「就绪」状态行。
- 不出现"深度采集 / 标准采集 / 模式切换"字样。
- 最近采集列表不展示历史采集分层徽章。
- 不硬编码中文 / 英文字符串，走 i18n（`data-i18n` + `t()`）。

## 7. 关键文件

- `src/extension/popup/popup.html` / `popup.ts` / `popup.css`。
- `src/shared/poll_capture_status.ts` — 状态轮询。
- `src/shared/capture_stats.ts` — 7 标签计数。
