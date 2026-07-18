---
status: approved
type: refactor
eval: required
---
# 纯迁移 Extension 静态入口与 Content

## 一句话意图
把 manifest、locales、图标和 Content 源码机械迁至 `apps/extension`，保持注入时机、消息和采集行为不变。

## 不变量（INV）
- INV-1: manifest permissions、`document_start`、`all_frames` 与 UI 入口语义不变。
- INV-2: Content 文件只移动和更新 import，不拆 capture registry 或新增 interface。
- INV-3: Content 使用的消息 action 与事件字段不变。
- INV-4: 构建输出仍为 `artifacts/dist`。

## 验收场景（AC）
- AC-1: Given 新 manifest/source 路径 When build Then 产物 manifest 的 service worker、content、popup、devtools 与 icon 引用均存在。
- AC-2: Given 真机加载 Extension When 页面在主 frame 与子 frame 打开 Then Content 按原时机注入且无 404/CSP 错误。
- AC-3: Given 鼠标、键盘、DOM、storage、WebSocket 等代表性输入 When 捕获 Then 事件类型与字段符合基线。

## 边界与反例
- 不移动 UI 和 background implementation。
- 静态资源仅移动 Extension 运行所需项，商店 promo/screenshot 保持原位置。
- 构建产物入口变化属于声明内差异，权限或运行时行为变化不属于。

## 不做的事
- 不拆 `content_script.ts`。
- 不改变 privacy/redaction、网络 hook 或事件采样。
- 不新增 manifest permission。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- `apps/extension/manifest.json` 成为唯一源 manifest。

### 设计探索结论（命中方案先行信号时）
- 候选: 一次迁完整 Extension / 分 Content、UI、Background 三批。
- 推荐: 三批迁移 —— 每批可用 manifest/artifact/E2E 独立定位路径错误。
- 已知坑: CRX 插件会生成 loader 名，测试应验证引用存在而非固定 hash 文件名。

### 实现锚点（坐标集中地）
- `manifest.json`、`_locales/`、`assets/icons/`
- `src/content/`
- `apps/extension/manifest.json`、`apps/extension/content/`
- `vite.config.ts`

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm run build && npm run test:e2e`
- AC-1 验收信号: dist manifest 引用文件存在；通道: CLI。
- AC-2 验收信号: Playwright/Chrome console 无加载错误；通道: CDP。
- AC-3 验收信号: Content 行为测试与代表性 E2E 事件记录；通道: 直驱 + CDP。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若 Vite input 未更新则入口缺失。
  - AC-2 若 locale/icon 路径错误则加载错误出现。
  - AC-3 若注入时机变化则早期事件缺失。

## 待澄清 [NEEDS CLARIFICATION]
无
