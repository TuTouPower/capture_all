# Evaluator Brief: T0003

> 机械组装（op_assemble_eval_brief.sh），leader 不参与内容，主会话污染传不过来。
> 你只读本文件 + 启动应用。src/**、tasks/** 不在你的 worktree（结构隔离）。

## 工作 spec（AC/INV/边界/可测性契约/预期失败模式——剥设计探索结论，防 evaluator 被过程带偏，design §2.5/G2）

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
- INV-4: 后端 MCP Bridge / Agent 通信代码（`src/agent/`、`src/extension/background/agent_bridge_client.ts` 等）不做任何修改 —— 移除的是 UI 入口，不是功能
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
- 不删除 MCP Bridge 后端代码（`src/agent/` 目录所有文件、`src/extension/background/agent_bridge_client.ts`、`src/extension/background/agent_command_dispatcher.ts` 等）
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

## 生效规格（开工前基线）

（spec_index.md 索引；按 TID 定位对应 specs/{feature}.md）
# 功能规格索引

每功能一行，指向 `specs/{feature}.md`。blueprint 定义即"已实现"，不设状态列。

| 功能 | 规格 |
|---|---|
| 采集核心（生命周期 / 消息路由 / SW 协调） | [specs/capture_core.md](specs/capture_core.md) |
| 页面事件捕获（content scripts 各 capture 模块） | [specs/content_events.md](specs/content_events.md) |
| 网络请求与 Body 捕获（webRequest / CDP / 三层降级） | [specs/network_body_capture.md](specs/network_body_capture.md) |
| Storage（IndexedDB schema / flush / store 路由） | [specs/storage_indexeddb.md](specs/storage_indexeddb.md) |
| Cookie 捕获 | [specs/cookie.md](specs/cookie.md) |
| Agent MCP（Bridge + MCP Server + 命令映射） | [specs/agent_mcp.md](specs/agent_mcp.md) |
| 弹出窗口三状态 | [specs/popup_3states.md](specs/popup_3states.md) |
| 主面板（采集列表 / 详情 / 设置 / 集成） | [specs/dashboard.md](specs/dashboard.md) |
| DevTools 面板 | [specs/devtools.md](specs/devtools.md) |
| 导出（JSON / JSONL / HAR / HTML） | [specs/export_zip.md](specs/export_zip.md) |
| 脱敏与安全 | [specs/redaction_security.md](specs/redaction_security.md) |
| 设计系统（令牌 / 主题 / 字体） | [specs/design_system.md](specs/design_system.md) |
| 国际化与主题 | [specs/i18n_theme.md](specs/i18n_theme.md) |
| 应用日志 | [specs/app_logging.md](specs/app_logging.md) |

## baselines 索引（重验对照；首次为空）

# baselines 索引

> 基准文件索引：功能名 → 验收标准→ 文件 + 更新说明。
> 验收标准的文字定义在 spec（`op_execution/specs/{TID}_{slug}.md` 的「验收场景」段，功能名 = task spec frontmatter `feature_key`，闸门 A 阶段定，D10），本文件**只索引基准快照文件**，不存 spec 内容。
> baselines 按功能名存（与 `specs/{feature}.md` 同键，1:1 零桥接）；TID 永不复用（op_execution 层）。

<!-- 每个功能一个 section，按验收标准列基准文件 -->

## {功能名}（{YYYY-MM-DD HH:mm:ss UTC+8}）

| 文件 | 对应验收标准 | 类型 | 说明 |
|---|---|---|---|
| {功能名}/AC-N_desc.dom.html | AC-N | DOM/advisory | {flaky，D7：CSS/组件重组触发不匹配，不机械阻断} |
| {功能名}/AC-N_desc.txt | AC-N | 结构化 | {stdout/CLI 原文} |
| {功能名}/AC-N_desc.png | AC-N | 视觉 | {截图锚点，advisory} |

<!--
类型语义：
- 结构化信号（stdout/API 响应体/DB 查询/进程日志；**DOM/a11y 降 advisory，D7**）→ 进机械硬门，夜跑回归判定以此为准
- 视觉锚点（截图）→ advisory，重验时 evaluator 多模态对照，不机械阻断
新增/更新/删除走 closer per-task 提案 + leader 自审（A18）。
-->

## 应用启动方式

从上方工作 spec 的「可测性契约」段提取。

## ⚠️ 构建产物新鲜度（强制自检，本轮改进——防跑旧代码伪绿）

验收前必须确认加载的构建产物来自**当前 task 分支最新源码**，而非 leader 预放的旧产物：
- **自建优先**：能自己从当前分支跑 build（见可测性契约的构建命令）就自建，别信别人放的 artifacts/dist。
- **无法自建时校验指纹**：对比构建产物与源码的时间戳/hash——`find <src> -newer <artifacts/dist入口文件>` 若有输出，说明源码比产物新 = 产物陈旧，判 INSUFFICIENT_EVIDENCE 并报告，不得用旧产物验收。
- **E2E 脚本路径校验**：E2E 用相对路径（$__dirname 等）定位产物时，脚本内必须先 `fs.existsSync` 断言产物入口存在，不存在直接抛错——禁止静默跑不存在/错位的产物（T0002 事故直接教训）。
- 加载产物后，先截图/取版本标识确认是新代码再跑 AC。

## 执行后端（按 AC 通道字段选，CDP 优先）

- 通道字段在上方可测性契约每条 AC 上（CDP | cua | 直驱）。能用 CDP 一律 CDP。
- CDP: Playwright（Electron 用 _electron.launch；扩展用 launchPersistentContext + --load-extension，headed）
- cua: **不可用**（本机未装）。cua 通道的 AC 一律判 INSUFFICIENT_EVIDENCE 并写明缺失，禁止跳过或降级推断。
- 直驱: Bash/HTTP/SQL（CLI/DB/API/进程类 AC）

