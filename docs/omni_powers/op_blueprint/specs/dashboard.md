# 主面板 Dashboard

`src/dashboard/`。完整采集工作台，是用户可见的两个界面之一（另一个是 popup）。

## 1. 信息架构

```
左侧边栏（可拖拽调整宽度，sidebar_resize.ts）：
  - 品牌 Logo + "Capture All"
  - 采集记录（默认首页）
  - 导出任务
  - 设置
  - MCP 集成

右侧内容区：按 sidebar 选中项切换页面
```

模块拆分（P2 #11 重构）：`dashboard.ts`（路由 + 主框架）+ `dashboard_captures.ts`（采集列表）+ `dashboard_detail.ts`（详情）+ `dashboard_settings.ts`（设置）+ `dashboard_integrations.ts`（MCP 集成）+ `dashboard_shared.ts`（共享工具）+ `icons.ts`。

## 2. 采集列表页

- 概览统计卡：采集总量、事件量、异常 / 风险。**不展示**"当前采集中"卡片、不展示历史采集分层统计。
- 筛选栏 + 采集列表（可排序表格）。**不展示**"模式"列、不提供模式筛选。
- 批量操作：导出、删除。
- 分页。

## 3. 采集详情页

点击列表条目在主面板内打开，不跳转独立页面。URL：`?capture=xxx&page=detail`。

布局：

```
面包屑（返回采集记录）
7 数据标签统计卡（与 popup 口径完全一致）
Tab 切换：
  概览 | 时间线 | 网络 | 控制台 | 证据 | 存储 | Cookie | 配置
三栏：
  [左侧筛选栏]    [中间事件列表 / 轨道视图]    [右侧检视器]
   时间范围        列表视图                     概览
   数据源过滤      时间线                        详情（请求 / 响应 / 堆栈）
   严重性过滤      搜索 / 分页                   关联事件
```

Tab 定义在 `dashboard_detail.ts`（`DT_TABS`，E2E 契约对齐此常量）。

### 3.1 时间线

- 融合多数据源（用户操作 / 网络 / 控制台 / 错误 / Storage / Cookie）。
- 每条事件含相对时间（`relative_time_ms`）和绝对时间（`absolute_time`）。
- 失败请求和 Console error 红色突出。
- 点击事件展开右侧 Inspector 展示详情和附近相关事件（标记点击交互详见 3.1.1）。

### 3.1.1 标记点击交互

轨道视图 `.tl-lanes` 上的事件标记（`.tl-tick` / `.tl-dot` / `.tl-diamond`）支持点击跳转：

- **点击行为**：playhead 跳到标记对应事件的 `relative_time_ms` 位置，同时打开右侧 inspector 面板显示事件详情
- **click/drag 区分**：pointerdown 记起始坐标，pointerup 计算位移。≤3px 判定为单击（seek + 打开 inspector）；>3px 判定为拖动（仅 seek，沿轨道移动 playhead）
- **冒泡阻止**：标记上 pointerdown 调用 `e.stopPropagation()`，防止冒泡到 lanes 触发拖动
- **幂等性**：若 inspector 已打开且显示的是同一事件（`get_dt_sel() === idx && get_dt_insp_open()`），不重复渲染
- **seek 定位**：单击时从 `data-event-idx` 取事件，以 `(e.relative_time_ms / maxT) * 100` 百分比设 playhead 位置，缩放后仍用事件时间不依赖物理坐标
- **标记索引**：每个标记元素带 `data-event-idx` 属性，值为事件在 `detail_events` 数组中的索引（非 `filtered_events()` 索引，避免 quick filter 切换后错位）
- **空白区域**：点击 lanes 非标记区域仅移动 playhead，关闭 inspector（需同时调用 `router.render_content()` 触发 DOM 更新）

### 3.2 配置 Tab

展示本次采集的 `config_snapshot`（CaptureRecord 字段）。

## 4. 设置页

分组表单：

- 通用：主题、语言、时区。
- 采集默认值。
- 隐私与脱敏。
- 导出：文件名模板、保存位置。
- 存储。
- 集成：MCP Bridge 配置。

设置持久化通过 `chrome.storage.local`（`dashboard_config_sync.test.ts` 验证）。已从设置页移除默认模式选择项。

## 5. MCP 集成页

展示 Bridge 状态、token 配置入口、端口配置。未实现的能力卡片禁用（不做假按钮）。

## 6. 视觉约束

- 不展示历史采集分层。
- 不展示"当前采集中"统计卡。
- 7 标签统计与 popup 完全一致。
- 详情在主面板内打开，不跳转独立页面。
- 主色 `--blue` `#3b82f6`。

## 7. 关键文件

- `src/dashboard/dashboard.html` / `dashboard.ts` / `*.css`（shell + pages + detail + views 四套）。
- `src/dashboard/dashboard_captures.ts` / `dashboard_detail.ts` / `dashboard_settings.ts` / `dashboard_integrations.ts` / `dashboard_shared.ts`。
- `src/dashboard/sidebar_resize.ts` — 可拉伸侧边栏（FEAT-002）。
- `src/dashboard/icons.ts` — 图标。
