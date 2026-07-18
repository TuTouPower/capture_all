---
status: approved
type: refactor
eval: required
---
# 纯迁移 Extension UI

## 一句话意图
把 Popup、Dashboard、DevTools 与 UI-only shared 文件迁入 `apps/extension/ui`，保持 DOM、样式、导航和消息行为不变。

## 不变量（INV）
- INV-1: HTML 结构、CSS 视觉、i18n key、主题默认值和可访问性语义不变。
- INV-2: UI 文件只移动与更新 import，不拆 controller、view model 或 gateway。
- INV-3: 现有 UI 到 background logging/snapshot 反向依赖可临时保留并登记，禁止在轨 A 建 seam。
- INV-4: `chrome.runtime.getURL` 和消息 action 可观察语义不变。

## 验收场景（AC）
- AC-1: Given 新 UI 入口 When build Then Popup、Dashboard、DevTools 页面均写入 dist 且资源引用有效。
- AC-2: Given 真机打开各页面 When 执行导航、设置、详情和导出入口 Then 行为与基线一致。
- AC-3: Given 主题、i18n、WCAG 与页面结构测试 When 执行 Then 无测试发现数下降或新增 skip。

## 边界与反例
- `logger`、`capture_data_reader` 等跨层文件只做必要临时路径安排，不改变实现。
- 不借迁移删除旧 UI 卡片、调整布局或重命名 DOM id。

## 不做的事
- 不引入 UI 框架。
- 不消除 background 反向依赖。
- 不改变产品交互或视觉。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- UI 最终只能依赖 `apps/extension/runtime` 与 `packages/*`，但该规则由 T0022 落实。

### 设计探索结论（命中方案先行信号时）
- 候选: 迁移时顺便拆页面 / 机械迁移。
- 推荐: 机械迁移 —— 降低视觉和行为回归定位成本。
- 已知坑: HTML 相对 CSS/JS 路径和 `getURL` 字符串需同时更新。

### 实现锚点（坐标集中地）
- `src/extension/popup/`、`src/extension/dashboard/`、`src/extension/devtools/`
- `src/shared/i18n.ts`、`theme.ts`、`dom_utils.ts`、`design_tokens.css`
- `apps/extension/ui/`

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build && npm run test:e2e:all`
- AC-1 验收信号: dist HTML/CSS/JS 引用 smoke；通道: CLI。
- AC-2 验收信号: Playwright 页面操作与 URL；通道: CDP。
- AC-3 验收信号: UI/WCAG test summary；通道: 直驱 + CDP。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若相对路径错误则页面请求 404。
  - AC-2 若 DOM id 漂移则既有操作失败。
  - AC-3 若 runner 漏发现测试则 count gate 失败。

## 待澄清 [NEEDS CLARIFICATION]
无
