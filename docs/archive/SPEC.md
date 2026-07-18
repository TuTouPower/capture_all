# Capture All 全采 -- 技术规格

## 产品概述

Capture All（全采）是一个 Chrome MV3 浏览器扩展，用于本地采集浏览器页面交互、页面状态、网络请求、控制台输出、运行时异常、Storage 变更和 Cookie 变更等调试证据。采集数据以时间线为核心组织，支持结构化查看、筛选、导出，并通过本地 MCP bridge 暴露给 AI Agent 使用。

**核心价值**：把浏览器问题复现过程转成可检索、可导出、可被 Agent 使用的本地证据链。

**目标用户**：开发者、测试/QA、技术支持、AI Agent 使用者。

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Chrome Extension Manifest V3 |
| 语言 | TypeScript (strict mode) |
| 构建 | Vite 5 + @crxjs/vite-plugin (v2.0.0-beta.25) |
| 单元测试 | Vitest 2.x |
| E2E 测试 | Playwright 1.60 |
| Agent 协议 | MCP (@modelcontextprotocol/sdk 1.29) |
| Agent 传输 | 本地 HTTP bridge (监听 `127.0.0.1`, Node.js + tsx) |
| 数据校验 | Zod 4.x |
| 存储 | IndexedDB (浏览器本地) |
| 字体 | IBM Plex Sans + IBM Plex Mono |
| CSS | 原生 CSS Custom Properties |
| UI 框架 | 无框架，原生 HTML/CSS/TypeScript |

## 规格文档索引

| 文档 | 内容 | 查阅场景 |
|---|---|---|
| [architecture.md](specs/architecture.md) | 架构总览 + 模块设计 | 理解系统结构、找文件路径 |
| [data_model.md](specs/data_model.md) | 数据模型 + IndexedDB | 改类型/加 store |
| [data_flow.md](specs/data_flow.md) | 数据流 + Agent/MCP 流程 | 调试采集管线/Agent 通信 |
| [design_system.md](specs/design_system.md) | UI 设计 + 导出 + 安全 + 配置 + 约定 | 改 UI/配置/安全策略 |

## 项目约定

| 约定 | 规则 |
|---|---|
| 命名风格 | snake_case (变量、函数、文件、目录) |
| 缩进 | 4 空格，禁止 tab |
| 类型系统 | TypeScript strict mode |
| UI 框架 | 无框架，原生 HTML/CSS/TS |
| 生成物目录 | `artifacts/` |
| 产品名 | 英文 "Capture All"，中文 "全采" |
| 核心动词 | "采集" |
| i18n | 支持 en/zh，通过 `data-i18n` 和 `t()` 函数 |

## 第三方依赖

### 运行时

| 包 | 版本 | 用途 |
|---|---|---|
| `@modelcontextprotocol/sdk` | `^1.29.0` | MCP 协议实现 |
| `zod` | `^4.4.3` | 数据校验 |

### 开发

| 包 | 版本 | 用途 |
|---|---|---|
| `@crxjs/vite-plugin` | `^2.0.0-beta.25` | Chrome 扩展 Vite 插件 |
| `@playwright/test` | `^1.60.0` | E2E 测试 |
| `@types/node` | `^25.9.1` | Node.js 类型 |
| `tsx` | `^4.22.4` | TS 直接执行 |
| `typescript` | `^5.5.0` | TS 编译器 |
| `vite` | `^5.4.0` | 构建工具 |
| `vitest` | `^2.1.0` | 单元测试 |

### 外部字体

- IBM Plex Sans + IBM Plex Mono (Google Fonts)

## 技术决策记录

| 决策 | 理由 | 来源 |
|---|---|---|
| `session_id` -> `capture_id` | 对齐产品命名 | chat4 |
| `type` 扁平 -> `category + type` 两级 | 支持 UI 按大类分标签 | spec-0608 |
| IndexedDB 用 `event_id` 作 keyPath | 避免复合主键碰撞 | spec-0608 |
| Console 和 Error 分两个独立 store | console.error ≠ 运行时异常 | spec-0608 |
| 删除模式概念从 UI 移除 | 用户需求：简化交互 | chat10 |
| Detail.html 合并入 Dashboard | 减少页面数，统一入口 | chat9 |
| 主色 `#3b82f6` | 用户指定 | chat9 |
| Popup 操作区固定高度 108px | 按钮变化但行高不变 | chat8 |
| 响应体捕获三层降级 | 普通用户不要求远程调试端口 | spec-0607 |
| 脱敏与截断分离 | 关闭脱敏不应关闭大小截断 | spec-0607 |
| MCP 不自动脱敏/摘要 | 工具层不替模型做数据判断 | spec-0605 |
| 7 个数据标签（非 8 个） | 用户确认：脱敏是配置项 | chat10 |
| Bridge 仅绑定 `127.0.0.1` | 安全：不外露 | spec-0605 |
| `capture_mode` 值域保持 `'basic'/'advanced'` | 减少变更面 | spec-0608 |

## 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| 0.1.0 | 2026-06-09 | 初始技术规格，基于 chat1-chat10 设计记录、类型系统对齐文档、当前代码库状态 |
