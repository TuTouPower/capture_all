# Record All 项目指令

## 构建

- `npm run build` — 输出到 `artifacts/dist/`
- Chrome MV3 扩展，使用 @crxjs/vite-plugin

## 测试

- `npm test` — vitest 单元测试
- `npm run test:e2e` — Playwright E2E

## 关键路径

- `src/background/service_worker.ts` — 入口，录制核心
- `src/agent/` — Bridge + MCP 服务端（AI Agent 接口）
- `src/content/` — 页面事件捕获
- `manifest.json` — 扩展清单

## 约定

- TypeScript strict 模式
- 命名 snake_case
- 缩进 4 空格
- 生成物放 `artifacts/`
