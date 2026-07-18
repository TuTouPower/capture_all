---
status: approved
type: refactor
eval: required
---
# 建立 workspace 与 tooling 骨架

## 一句话意图
把根项目改为 npm workspaces composition root，并集中 TypeScript、构建和测试配置，同时继续从旧源码路径构建相同行为。

## 不变量（INV）
- INV-1: 此 task 不移动任何产品源码或测试文件。
- INV-2: 单一 `package-lock.json`，不引入 pnpm、Nx、Turborepo 或第二套依赖管理。
- INV-3: Extension、Bridge、MCP 与 zip 产物路径保持不变。
- INV-4: 所有入口暂时继续指向旧 `src/**`，避免路径迁移与工具迁移混合。

## 验收场景（AC）
- AC-1: Given 全新工作目录 When 运行 `npm ci` Then workspace 依赖可完整安装且无子 workspace lockfile。
- AC-2: Given browser、Node、test TypeScript project When typecheck Then globals 隔离且现有源码全部通过。
- AC-3: Given 新 tooling 入口 When 运行 test/build/e2e Then 测试发现数、manifest 入口和产物集合符合 T0011 基线。

## 边界与反例
- 任一构建脚本仍依赖被删除的根脚本路径时失败。
- browser project 可无意使用 Node globals、或 Node project依赖 DOM globals时失败。
- `.claude/settings.json` 不在 workset，保持用户修改原样。

## 不做的事
- 不移动 `src/**`、`tests/**`、manifest 或 locales。
- 不建立领域 package 内容。
- 不改变产品功能、消息协议、DB 或鉴权。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- 根 package 只负责 orchestration；运行产品与公共 package 后续进入 `apps/*`、`packages/*`。
- `artifacts/dist` 永久保留为 Extension 输出路径。

### 设计探索结论（命中方案先行信号时）
- 候选: 保持单 tsconfig / project references / 引入 monorepo 工具。
- 推荐: npm workspaces + TypeScript project references —— 足够支撑三产品与三 package，变更最少。
- 已知坑: workspace hoist 会改变 CLI 解析位置，必须用 fresh `npm ci` 验证。

### 实现锚点（坐标集中地）
- `package.json`、`package-lock.json`、`tsconfig.base.json`
- `tooling/typescript/`、`tooling/build/`、`tooling/test/`、`tooling/scripts/`
- `vite.config.ts`、`vitest.config.ts`、`playwright.config.ts`

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm ci && npm test && npm run build && npm run test:e2e`
- AC-1 验收信号: install exit 0 且仅根 lockfile；通道: CLI。
- AC-2 验收信号: 各 project typecheck exit 0 与负向 global fixture；通道: CLI。
- AC-3 验收信号: T0011 manifest/artifact/test-count smoke；通道: CLI + Playwright。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若 workspace 解析错误则 fresh install/build 失败。
  - AC-2 若 lib/types 泄漏则负向 fixture 错误消失。
  - AC-3 若脚本漏跑产品则对应 artifact 缺失。

## 待澄清 [NEEDS CLARIFICATION]
无
