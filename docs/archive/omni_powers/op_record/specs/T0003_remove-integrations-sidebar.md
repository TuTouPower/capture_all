---
status: approved
type: refactor
eval: required
---
# 移除 Webhook / Issue 平台卡片及 MCP 集成侧边栏入口
## 一句话意图
从集成页面删除 Webhook 和 Issue 平台两张占位卡片，从主面板侧边栏移除"MCP / 集成"导航项，使集成页面不可达。清理关联的死代码和测试。

## 不变量（INV）
- INV-1: MCP Bridge 和本地 Agent 功能不受影响 —— 这两个集成项的功能入口（设置页集成分区）保持不变
- INV-2: 设置页的"集成"分区（`#set-integrations`）保留，用户仍可在设置中配置 MCP Bridge（启用/禁用、URL、Token、轮询间隔） —— 这是 Bridge 功能的唯一配置入口
- INV-3: 侧边栏导航项数量从 5 项减少为 4 项（采集记录、当前采集、导出任务、设置），移除后不影响其他导航项的样式和交互
- INV-4: 后端 MCP Bridge / Agent 通信代码（`src/agent/`、`src/background/agent_bridge_client.ts` 等）不做任何修改 —— 移除的是 UI 入口，不是功能
- INV-5: 行为等价 —— `go('captures')`/`go('settings')`/`go('current')`/`go('exports')` 行为不变；`go('integrations')` 降级为 `go('captures')`

## 验收场景（验收标准 AC）
- AC-1: Given 主面板已打开 When 查看左侧侧边栏 Then 导航项为"采集记录、当前采集、导出任务、设置"四项，不显示"MCP / 集成"
- AC-2: Given 主面板已打开 When 点击"设置"导航项滚动到集成分区 Then MCP Bridge 配置开关、URL、Token、轮询间隔输入框均可见且功能正常
- AC-3: Given 主面板已打开 When 调用 `go('integrations')` Then 不发生 JS 错误，内容区回退显示 captures 页面
- AC-4: Given 已执行代码修改 When 运行 `grep -r 'render_integrations\|wire_integrations\|BUG-010\|BUG-011' src/ tests/` Then 无匹配结果（已删除的死代码和测试无残留）

## 边界与反例
- 旧 localStorage 残留: 若用户之前打开过 integrations 页面，刷新后不应因残留状态报错（`_page === 'integrations'` 降级到 captures）
- CSS 残留: 移除 `.integrations` 等样式类后，确认无其他页面引用这些类
- 测试文件为空: 若 `integration_page.test.ts` 删除全部内容后文件为空，删除该文件

## 不做的事
- 不删除 MCP Bridge 后端代码（`src/agent/` 目录所有文件、`src/background/agent_bridge_client.ts`、`src/background/agent_command_dispatcher.ts` 等）
- 不删除设置页的集成分区
- 不修改 MCP 协议、Bridge 通信、命令映射等后端逻辑
- 不移除 `dashboard_integrations.ts` 中的非集成页功能（`render_current`、`wire_simple_open`、`render_exports` 保留）

## 技术决策
### 条件强制
无（本 task 独立，不被其他 task 依赖）。

### 设计探索结论
未命中方案先行信号（纯删除操作，无算法或一致性论证）。

### 实现锚点
- 侧边栏 NAV 数组: `dashboard.ts:21-27`，移除 `{ key: 'integrations', icon: 'navMcp', lbl: 'MCP / 集成' }`
- 集成页渲染函数: `dashboard_integrations.ts:43-74`，删除 `render_integrations` 和 `wire_integrations` 函数体
- 导出清理: `dashboard_integrations.ts:76`，移除 `render_integrations` 和 `wire_integrations` 的 export
- 入口引用: `dashboard.ts:18`，移除 `render_integrations, wire_integrations` 的 import
- 渲染分支: `dashboard.ts:85`，移除 `integrations` 分支的 `if` 块
- 降级处理: `render_content()` default 分支或 `go()` 中未知 page 回退到 captures
- CSS: `dashboard-pages.css:291-301`，移除 `.integrations` 相关样式
- 测试: `tests/integration_page.test.ts`，删除 BUG-010 和 BUG-011 两个 describe 块；若文件变空则删除整个文件
- 测试文件引用: 检查 `vitest.config.ts` 或类似配置是否显式引用该测试文件

### 可测性契约
- 应用启动方式: `npm run build` + Playwright 加载扩展后导航到 dashboard 主页
- AC-1 验收信号: Playwright 读取侧边栏 `.sb-item` 文本列表，验证只有 4 项且不含 "MCP / 集成"；关键入口: 扩展 dashboard 主页（popup 或独立 tab）
- AC-1 通道: CDP（Playwright）
- AC-2 验收信号: Playwright 导航到设置页 → 验证 `#set-integrations` 元素存在且包含 Bridge 配置项
- AC-2 通道: CDP
- AC-3 验收信号: 单元测试——调用 `go('integrations')` 后验证无异常、内容区降级到 captures 页面
- AC-3 通道: 直驱（单元测试，jsdom）
- AC-4 验收信号: `grep -r 'render_integrations\|wire_integrations\|BUG-010\|BUG-011' src/ tests/` 返回空
- AC-4 通道: 直驱（CLI）
- 预期失败模式:
  - AC-1 若 NAV 数组未正确移除则侧边栏仍显示 5 项
  - AC-2 若误删设置页集成分区则 `#set-integrations` 不存在
  - AC-3 若未加降级则 `go('integrations')` 后空白或报错
  - AC-4 若 grep 有命中则死代码/死测试未清理干净

## 待澄清 [NEEDS CLARIFICATION]
无
