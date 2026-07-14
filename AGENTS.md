# Capture All 全采

Chrome MV3 扩展，采集浏览器内的用户行为、页面导航、网络请求、控制台、错误异常、Storage、Cookie 7 类数据，并通过 Bridge + MCP 服务端供 AI Agent 调用。

## 命令

构建与开发：

- `npm run dev` — Vite 开发
- `npm run build` — `tsc && vite build`，输出到 `artifacts/dist/`
- `npm run bridge` — 启动 Bridge（`tsx src/agent/bridge/main.ts`）
- `npm run mcp` — 启动 MCP 服务端（`tsx src/agent/mcp/main.ts`）

测试：

- `npm test` — vitest 全量单测
- `npm run test:watch` — vitest watch
- `npm run test:e2e` — 基础 E2E（`playwright test --project=e2e`，headless）
- `npm run test:e2e:all` — 全部 E2E 项目（含 ext/real/cdp/mcp/p1/streaming）
- `npm run serve:e2e` — 构建 + 预览（127.0.0.1:4174，E2E webServer）

E2E 项目（`playwright.config.ts` 定义，按需 `--project=<name>` 指定）：

| 项目 | workers | 说明 |
|------|---------|------|
| `e2e` | 默认 | headless 基础 |
| `e2e-ext` | 1 | 扩展场景多 spec（baidu/toutiao/qq/sina 等串行） |
| `e2e-real` | 默认 | 真机 |
| `e2e-cdp-capture` | 默认 | CDP body capture |
| `e2e-mcp` | 默认 | MCP 闭环 |
| `e2e-p1` | 1 | P1 场景串行 |
| `e2e-streaming` | 1 | WebSocket / streaming |

并发策略详见 `docs/omni_powers/op_blueprint/test.md`。

## 导航

规格文档集中在 `docs/omni_powers/op_blueprint/`：

| 主题 | 文档 |
|------|------|
| 产品需求 / 用户故事 | `op_blueprint/prd.md` |
| 架构总览 / 模块设计 / 技术栈 / 目录结构 | `op_blueprint/architecture.md` |
| 领域模型 / 术语统一 / 数据标签 / 已删除概念 | `op_blueprint/domain.md` |
| 命名规范 / 缩进 / 日志 / 调试 / 适配器步骤 | `op_blueprint/conventions.md` |
| 测试计划 / 并发策略 / E2E 细节 | `op_blueprint/test.md` |
| 全部 spec 索引 | `op_blueprint/spec_index.md` |
| 单项 spec（采集核心 / MCP / Storage / Cookie / 网络 body / popup / dashboard / 设计系统 …） | `op_blueprint/specs/*.md` |

## 关键约束

项目特有约束（详情见对应 spec / `domain.md` / `conventions.md`）：

- Bridge 仅绑定 `127.0.0.1`，token 由用户提供，禁止硬编码（详见 `op_blueprint/specs/agent_mcp.md`、`redaction_security.md`）
- CDP body capture 走固定端口（详见 `op_blueprint/specs/network_body_capture.md`）
- 术语：英文 `capture`，中文"采集"；禁用 `session`/`record`/`录制`/`记录` 作产品术语；类型名 `CaptureRecord`/`CaptureEvent`/`CaptureConfig`，单次采集标识 `capture_id`，MCP 命令 `capture.start`/`captures.list`/`data.list`（详见 `op_blueprint/domain.md`）
- 生成物放 `artifacts/`

## omni_powers

本项目启用 omni_powers 工作流，工作区在 `docs/omni_powers/`（blueprint / execution / record）。
