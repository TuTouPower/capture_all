# 设计系统

UI 视觉规范。令牌定义在 `src/shared/design_tokens.css`。

## 1. 字体

- Sans：IBM Plex Sans（正文，系统 UI 兜底）。
- Mono：IBM Plex Mono（时间 / URL / 方法 / 状态码）。

来源：Google Fonts。

## 2. 色板（浅色主题）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--canvas` | `#e7e6e3` | 页面背景 |
| `--surface` | `#ffffff` | 卡片 / 面板背景 |
| `--ink` | `#1b1b18` | 主文字 |
| `--ink-2` | `#56564f` | 副文字 |
| `--ink-3` | `#8c8c83` | 辅助文字 |
| `--border` | `#e7e7e3` | 边框 |
| `--green` | `#15a04a` | 成功 / 完成 |
| `--red` | `#e0352b` | 危险 / 错误 / 采集中 |
| `--blue` | `#3b82f6` | 主色（品牌蓝） |
| `--purple` | `#6d33e0` | 网络数据源色 |
| `--amber` | `#d98510` | 控制台数据源色 |

## 3. 数据源色板（7 标签）

| 令牌 | 值 | 对应标签 |
|---|---|---|
| `--src-user` | `#2563eb` | 用户行为 |
| `--src-nav` | `#4a52d6` | 页面导航 |
| `--src-network` | `#6d33e0` | 网络请求 |
| `--src-console` | `#d98510` | 控制台 |
| `--src-error` | `#e0352b` | 错误异常 |
| `--src-storage` | `#15a04a` | Storage |
| `--src-cookie` | `#b88407` | Cookie |

## 4. 圆角 / 阴影

- `--radius`: 12px。
- `--radius-sm`: 8px。
- `--radius-xs`: 6px。
- `--shadow-card`: 卡片阴影。
- `--shadow-pop`: 弹窗阴影。

## 5. 主色应用

品牌主色 `#3b82f6`（`--blue`）应用于：开始采集按钮、Logo、选中态。语义紫色（`--purple` 网络数据源色）保持不变。

## 6. MetricCard 规范

- 圆角 14px。
- 内边距 16px，间距 12px。
- 浅色背景 + 对应数据源色边框 + 主色文字。
- 图标左，名称其后，数字靠右（字号略大，字重 600）。
- 三列网格（3 + 3 + 1）。
- 三种状态（popup 三状态）卡片尺寸统一。

## 7. 密度

仅 regular。compact 密度选项已删除（禁用术语）。

## 8. 已删除概念

以下已从 UI 完全移除：

- 深度采集 / 标准采集 模式切换。
- 模式 badge / 模式列 / 模式筛选。
- "当前采集中" 统计卡。
- 密度（compact / regular）切换。
- 脱敏作为独立数据标签（脱敏是配置项）。
- `detail.html` 独立详情页（合并入 dashboard）。

## 9. CSS 组织

原生 CSS Custom Properties，无预处理器。Dashboard CSS 拆分：

- `dashboard.css` — Shell + 基础。
- `dashboard-pages.css` — 页面级。
- `detail-shell.css` — 详情 Shell 布局。
- `detail-views.css` — 详情视图组件。
