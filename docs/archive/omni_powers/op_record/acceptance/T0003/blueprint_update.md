# T0003 Blueprint 更新提案

> feature 归属：dashboard（spec frontmatter 缺 feature_key，据 T0003 改动范围推断为 dashboard；leader 确认）
> 提案时间：2026-07-13 04:00:00 UTC+8
> 验收结果：PASS（吸收验收修正 / Round 2 修复后形态）

## specs/dashboard.md

### 修改
- 1 信息架构 — 侧边栏列表：补全"当前采集"项，移除"MCP 集成"项 —— T0003 从 NAV 数组删除 integrations 键，侧边栏从 5 项减为 4 项；原 blueprint 列表已漏写"当前采集"，本次一并修正。
  ```
  左侧边栏（可拖拽调整宽度，sidebar_resize.ts）：
    - 品牌 Logo + "Capture All"
    - 采集记录（默认首页）
    - 当前采集
    - 导出任务
    - 设置
  ```

- 1 信息架构 — 模块拆分行：`dashboard_integrations.ts` 描述从"MCP 集成"改为"当前采集 / 导出任务" —— T0003 删除了该文件中的 `render_integrations` 和 `wire_integrations` 函数，文件仅保留 `render_current`、`wire_simple_open`、`render_exports`，不再承担集成页职责。
  ```
  dashboard_integrations.ts（当前采集 / 导出任务）
  ```

- 5 "MCP 集成页"节 → 降级为简注 —— T0003 移除 Webhook/Issue 平台卡片，删除 `render_integrations`/`wire_integrations` 函数体（`dashboard_integrations.ts` 原 43-74 行），`go('integrations')` 静默降级为 `go('captures')`，MCP 集成页已不可达。MCP Bridge 后端代码完整保留，Bridge 配置入口仅存在于设置页集成分区（`#set-integrations`，`dashboard_settings.ts:91-99`）。
  ```
  ## 5. MCP 集成页（已移除）

  MCP 集成页已从主面板移除（T0003）。Webhook / Issue 平台占位卡片已删除。
  MCP Bridge 配置入口保留在设置页集成分区（§4），Bridge 后端功能（`src/agent/`、`src/extension/background/agent_bridge_client.ts`）不受影响。
  ```

### 新增
- 1 信息架构 — 补充降级路由说明 —— T0003 在 `go()` 函数中添加 `if (p === 'integrations') p = 'captures'`（`dashboard.ts:74`），`render_content()` 中移除 integrations 分支后以 `else` 回退到 captures 页面（`dashboard.ts:84`）。验收通过真实 `router.go('integrations')` + `get_page()` 行为测试确认降级正确，旧 localStorage 残留 `_page === 'integrations'` 场景同样适用降级路径。
  ```
  go() 函数中 `integrations` 降级为 `captures`（`dashboard.ts:74`），
  `render_content()` 的 `else` 分支回退到 captures 页面（`dashboard.ts:84`）。
  旧 localStorage 残留 `_page === 'integrations'` 同样走降级路径，不会导致空白/报错。
  ```

## architecture.md

### 修改
- 3 目录结构 — `dashboard_integrations.ts` 注释：从 `# MCP 集成页` 改为 `# 当前采集 / 导出任务` —— T0003 删除了该文件的 `render_integrations`/`wire_integrations`，现仅导出 `render_current`/`wire_simple_open`/`render_exports`。
  ```
  dashboard_integrations.ts # 当前采集 / 导出任务
  ```

## prd.md

### 修改
- 4.3 主面板 — 侧边栏描述：移除 "MCP 集成"，补全 "当前采集" —— T0003 后侧边栏为 4 项（采集记录 / 当前采集 / 导出任务 / 设置）。
  ```
  左侧边栏：采集记录 / 当前采集 / 导出任务 / 设置。
  ```

## domain.md

无更新。

## conventions.md

无更新。

## test.md

无更新。

## baselines 合入

### 新增
- `dashboard/AC-1_nav_items.txt` —— 结构化 —— T0003 验收 E2E Playwright 脚本验证侧边栏 nav items = ["采集记录","当前采集","导出任务","设置"]，count=4
- `dashboard/AC-2_integrations.html` —— 结构化 —— T0003 验收 E2E Playwright 脚本验证 `#set-integrations` 可见，`data-sw="agent_bridge_enabled"`/`data-cfg="agent_bridge_url|token|poll_interval_ms"` 全部可见
- `dashboard/AC-3_unit_test.txt` —— 结构化 —— T0003 验收单元测试 25/25 PASS（含 Round 2 新增的 AC-2 设置页 5 条测试 + AC-3 真实函数调用 8 条测试）
- `dashboard/AC-4_grep.txt` —— 结构化 —— T0003 验收 `grep -r 'render_integrations\|wire_integrations\|BUG-010\|BUG-011' src/` 返回 0 匹配（`tests/` 中的断言引用属测试自身验证，非死代码残留）

## task 归档提案
- TID 标记完成：T0003 永不复用
- 归档：spec 原文入 `op_record/specs/`、task 目录入 `op_record/tasks/T0003/`、acceptance 入 `op_record/acceptance/T0003/`
