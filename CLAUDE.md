# Capture All 全采

## 构建

- `npm run build` — 输出到 `artifacts/dist/`
- Chrome MV3 扩展，使用 @crxjs/vite-plugin

## 测试

### 单元测试

- `npm test` — vitest 全量单测（并行）

### E2E 测试

- `npm run test:e2e -- --project=e2e-p0` — P0 E2E（4 workers 并发）
- `npm run test:e2e -- --project=e2e-p1` — P1 E2E（2 workers）
- `npm run test:e2e` — 全部 E2E

并发策略见 `docs/TEST.md` §16。4 网站 spec（baidu/toutiao/qq/sina）完全并发。

### 测试文档

- `docs/PRD.md` — 产品需求 + 用户故事
- `docs/SPEC.md` — 技术规格索引
- `docs/TEST.md` — 测试计划 + 并发策略
- `docs/TASKS.md` — 缺陷列表 + 测试任务

### 测试目录

```
tests/
├── *.test.ts         # vitest 单元测试
├── e2e-*.spec.ts     # Playwright E2E（每个网站/场景独立文件）
├── e2e.spec.ts       # 基础 E2E（headless）
├── e2e-mcp.spec.ts   # MCP 闭环
└── e2e-cdp-capture.spec.ts  # CDP body capture 验证
```

## 关键路径

- `src/background/service_worker.ts` — 入口，采集核心
- `src/agent/` — Bridge + MCP 服务端（AI Agent 接口）
- `src/content/` — 页面事件捕获
- `src/popup/` — 弹出窗口（3 状态）
- `src/dashboard/` — 主面板
- `src/shared/types.ts` — 全部类型定义
- `manifest.json` — 扩展清单

## 规格文档

| 文档 | 内容 |
|------|------|
| `docs/specs/architecture.md` | 架构总览 + 模块设计 |
| `docs/specs/data_model.md` | 数据模型 + IndexedDB |
| `docs/specs/data_flow.md` | 采集/Agent/Body Capture 流程 |
| `docs/specs/design_system.md` | UI 设计 + 安全 + 配置 |

## 约定

- TypeScript strict 模式
- 命名 snake_case（变量、函数、文件、目录）
- 缩进 4 空格，禁止 tab
- 生成物放 `artifacts/`
- UI 无框架，原生 HTML/CSS/TypeScript
- 产品名 "Capture All"，中文 "全采"，核心动词 "采集"
- 主色 `#3b82f6`（蓝），字体 IBM Plex Sans + Mono
- 7 数据标签：用户行为/页面导航/网络请求/控制台/错误异常/Storage/Cookie
- 已删除概念：深度采集/标准采集/模式切换/密度/当前采集中卡片
- Bridge 仅绑定 `127.0.0.1`，token 由用户提供，禁止硬编码
