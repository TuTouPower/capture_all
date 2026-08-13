# 开发者入门指南

Capture All 是 Chrome MV3 浏览器扩展，结构化采集浏览器内的用户行为、页面导航、网络请求、控制台、错误异常、Storage、Cookie 七类数据，通过本地 Bridge + MCP 服务端对接 AI Agent。所有数据本地 IndexedDB 存储，不入云。

## 技术栈

| 层 | 技术 |
|---|---|
| 语言 | TypeScript（strict mode） |
| 构建 | Vite 8 + @crxjs/vite-plugin 2.7 |
| 单元测试 | Vitest 4.x |
| E2E 测试 | Playwright 1.60 |
| Agent 协议 | MCP（@modelcontextprotocol/sdk ^1.29.0） |
| 数据校验 | Zod ^4.4.3 |
| Node | ^20.19.0 或 >=22.12.0 |

## 快速开始

### 1. 克隆与安装

```bash
git clone https://github.com/TuTouPower/capture_all.git
cd capture_all
npm ci
```

### 2. 构建

```bash
npm run build
```

完整构建链（`package.json` scripts）：`tsc && vite build && npm run copy:locales && npm run build:bridge && npm run build:mcp && npm run build:zip`。

产物：`artifacts/dist/` + `artifacts/extension.zip`（扩展）、`artifacts/bridge/bridge.mjs` 与 `artifacts/mcp/mcp.mjs`（esbuild 单文件，免依赖部署）。

### 3. 加载扩展

打开 Chrome → `chrome://extensions/` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择 `artifacts/dist/`。

### 4. 运行测试

```bash
npm test                    # 单元/集成测试（vitest run，tests/unit 下约 190+ 个用例文件）
npm run test:coverage       # 带覆盖率（v8）
npm run test:e2e            # 基础 E2E（playwright --project=e2e，headless）
npm run test:e2e:all        # 全部 E2E（所有 project）
```

### 5. 启动 Bridge 与 MCP

```bash
npm run bridge -- --port 17831   # 开发模式：tsx src/bridge/main.ts
npm run mcp                      # 开发模式：tsx src/mcp/main.ts
```

生产模式直接运行构建产物：`node artifacts/bridge/bridge.mjs`、`node artifacts/mcp/mcp.mjs`。

## 项目结构

```
capture_all/
├── src/
│   ├── extension/          # Chrome 扩展（MV3）
│   │   ├── background/     #   Service Worker：采集核心、网络/CDP、存储、导出
│   │   ├── content/        #   Content Script：页面事件捕获（14 个捕获模块）
│   │   ├── popup/          #   轻量控制面板
│   │   ├── dashboard/      #   主面板工作台
│   │   ├── devtools/       #   DevTools 面板
│   │   ├── shared/         #   扩展内部共享（i18n、theme、导出工具等）
│   │   └── _locales/       #   国际化资源
│   ├── bridge/             # 本地 HTTP Bridge（Node；命令队列 + CDP 代理）
│   ├── mcp/                # MCP Server（stdio 传输）
│   ├── shared/             # 跨扩展/Bridge/MCP 共享（浏览器兼容，禁 Node API）
│   └── node_shared/        # Node-only 中立层（t187 新增；含 bridge_token_file.ts，仅 Node 侧引用）
├── tests/
│   ├── unit/               # Vitest 单元/集成测试（*.test.ts，约 190+ 个）
│   ├── e2e/                # Playwright E2E（*.spec.ts，含 T0001-T0003 子目录）
│   ├── support/            # 测试辅助（__mocks__/、fixtures/、helpers/）
│   └── repo_template/      # repo 工具链测试（python）
├── scripts/
│   ├── repo_template/      # task 工具链：task.py / pending.py / findings.py / spikes.py 等
│   ├── copy_locales.mjs    # 构建时复制 _locales
│   ├── generate_icons.mjs  # 生成扩展图标
│   ├── scan_tracked_tree.mjs
│   └── capture_store_screenshots.mjs
├── docs/
│   ├── blueprint/          # 长期真相：architecture / conventions / decisions / domain / testing 五件套
│   ├── specs/  guides/  tasks/  findings/  pending/  spikes/  reviews/
│   └── archive/            # 历史归档
└── artifacts/              # 构建产物（不入库）
```

## npm scripts（`package.json` 唯一来源）

| 命令 | 说明 |
|---|---|
| `npm run dev` | Vite dev（扩展热更新） |
| `npm run build` | `tsc && vite build && npm run copy:locales && npm run build:bridge && npm run build:mcp && npm run build:zip` |
| `npm run copy:locales` | 复制 `_locales` 到构建产物 |
| `npm test` / `test:watch` / `test:coverage` | `vitest run` / watch / coverage |
| `npm run scan:tracked-tree` | 扫描 git 跟踪文件树 |
| `npm run generate:icons` | 生成扩展图标 |
| `npm run serve:e2e` | build + `vite preview --host 127.0.0.1 --port 4174`（E2E webServer） |
| `npm run bridge` | `tsx src/bridge/main.ts`（开发） |
| `npm run mcp` | `tsx src/mcp/main.ts`（开发） |
| `npm run test:e2e` | `playwright test --project=e2e`（基础 headless） |
| `npm run test:e2e:all` | `playwright test`（全部 project） |
| `npm run test:e2e:server` | 启动 E2E 测试服务器（`tests/support/fixtures/server.ts`） |
| `npm run build:bridge` / `build:mcp` | esbuild bundle → `artifacts/{bridge,mcp}/*.mjs` |
| `npm run build:zip` | `cd artifacts/dist && zip -r ../extension.zip .` |

## 端口与 token 模型

**端口**：Bridge 默认监听 `http://127.0.0.1:17831`（`src/shared/constants.ts` 的 `agent_bridge_url`），可用 `--port` 覆盖。只绑 loopback，拒绝其他 bind 地址。

**two-token 零配置**（详见 `SECURITY.md`）：

- **MCP token**：保护 Bridge 的 MCP/CDP 路由。解析优先级：CLI `--token` → env `CAPTURE_ALL_BRIDGE_TOKEN` → token 文件 → 自动生成并持久化。默认文件 `$XDG_RUNTIME_DIR/capture-all/bridge_token`（mode 0600，非 0600 拒绝读取）。MCP 客户端同源读取（env 优先，缺省读同一文件），零配置开箱即用。
- **instance_token**：扩展 enroll 时 Bridge 生成，per-instance，只保护 `/extension/*` 数据路由，独立于 MCP token，不授 MCP/CDP 权限。

## 核心模块

- **`extension/background/`**（Service Worker）：`service_worker.ts` 入口与消息路由；`network_capture.ts` / `network_webrequest.ts` / `cdp_handler.ts` 网络捕获（CDP + webRequest）；`storage.ts` IndexedDB 存储；`exporter.ts` 导出（JSON/JSONL/HTML/HAR）；`agent_bridge_client.ts` / `agent_command_dispatcher.ts` / `agent_data_queries.ts` 与 Bridge 的命令轮询与数据查询；`console_capture.ts` / `exception_capture.ts` / `cookie_capture.ts` 等采集与状态模块。
- **`extension/content/`**（Content Script）：`content_script.ts` 启动 14 个捕获模块——mouse / keyboard / scroll / dom / storage / network_hook / clipboard / form_submit / focus / visibility / resize / fullscreen / print / websocket，事件统一汇聚后回传 background。
- **`extension/popup` / `dashboard` / `devtools`**：popup 为开始/停止采集的轻量控制面板；dashboard 为主面板工作台（列表、详情、设置、集成）；devtools 为 DevTools 面板入口。
- **`bridge/`**（本地 HTTP Bridge）：`server.ts` HTTP 服务（健康检查 + 命令分发 + 扩展数据路由 + CORS 白名单）；`command_queue.ts` 命令队列；`cdp_handler.ts` CDP 代理；`config.ts` 端口/token 解析（`resolve_bridge_token`）。
- **`mcp/`**（MCP Server）：`main.ts` stdio 传输入口；`tools.ts` 定义 17 个工具（`MCP_TOOL_NAMES`）；`client.ts` / `token_resolver.ts` Bridge 客户端与 token 自动读取。
- **`shared/`**：跨扩展/Bridge/MCP 共享（`logger.ts` / `redaction.ts` / `types.ts` / `protocol.ts` / `constants.ts`）。**浏览器 bundle 会引用，禁止使用 Node API。**
- **`node_shared/`**：Node-only 中立层（t187），含 `bridge_token_file.ts`（token 文件读写契约），仅 Node 侧引用。

## 编码规范

### 命名

- 变量/函数/文件名/目录名：`snake_case`
- 类型/接口/类名：`PascalCase`
- 常量：`UPPER_SNAKE_CASE`

### 日志

使用统一的 `Logger` 类，禁止 `console.log`。background 模块用 IndexedDB transport，content 模块经消息回传 SW：

```typescript
// src/extension/background/my_module.ts
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/my_module', get_app_log_transport());
logger.info('Operation completed', { key: 'value' });
```

### 类型安全

使用区分联合体（discriminated union）：

```typescript
interface CaptureEventDataMap {
    network_request: NetworkRequestData;
    ws_frame: WsFrameData;
    // ...
}
type TypedCaptureEvent = {
    [K in keyof CaptureEventDataMap]: { type: K } & CaptureEventDataMap[K];
}[keyof CaptureEventDataMap];
```

## 调试技巧

- **扩展**：`chrome://extensions/` → 「Service Worker」查看日志；`chrome://inspect/#workers` 调试。
- **Bridge**：`npm run bridge -- --port 17831`，`curl http://127.0.0.1:17831/health` 健康检查（无需 token）。首次启动 Bridge 自动生成 MCP token 并打印保存路径（`mcp token saved to ...`）；MCP 端同源自动读取，无需手工同步。
- **测试**：

```bash
npx vitest run tests/unit/network_capture.test.ts                      # 单个测试文件
npx playwright test e2e-states.spec.ts --project=e2e-ext --headed      # 单个 E2E（有头）
npx playwright test e2e-states.spec.ts --project=e2e-ext --debug       # Playwright inspector
```

E2E trace 输出到 `artifacts/test-results/`。

## 添加新模块

1. 创建捕获模块 `src/extension/content/my_capture.ts`：

```typescript
import { Logger, MessageLogTransport } from '../../shared/logger';

const logger = new Logger('content/my_capture', new MessageLogTransport());

export function start(send_event: (event: any) => void): void {
    // 注册事件监听
}

export function stop(): void {
    // 清理事件监听
}
```

2. 注册到 `content_script.ts`：

```typescript
import { start as start_my_capture, stop as stop_my_capture } from './my_capture';

// 启动处
start_my_capture(send_event);
// 停止处
stop_my_capture();
```

3. 添加测试 `tests/unit/my_capture.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { start, stop } from '../../src/extension/content/my_capture';

describe('my_capture', () => {
    it('captures events', () => {
        const send_event = vi.fn();
        start(send_event);
        // 触发事件并验证
        expect(send_event).toHaveBeenCalled();
        stop();
    });
});
```

## 常见问题

- 构建失败：检查 Node 版本（需 ^20.19.0 或 >=22.12.0）；`rm -rf node_modules artifacts && npm ci && npm run build`
- 测试失败：单测单跑 `npx vitest run tests/unit/<file>.test.ts`；E2E 单跑 `npx playwright test <spec> --project=e2e-ext --headed`
- 扩展加载失败：检查 `manifest.json` 格式；查看 Chrome DevTools / Service Worker 错误日志

## 相关文档

- [测试指南](test.md)
- [部署指南](deployment.md)
- [MCP 使用](mcp_usage.md)
- [故障排查](troubleshooting.md)
- 架构与约定真相源：`docs/blueprint/`（architecture / conventions / decisions / domain / testing）
- 行为规则与 task 状态机：`AGENTS.md`
