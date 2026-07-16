# 开发者入门指南

## 概述

Capture All 是 Chrome MV3 浏览器扩展，用于结构化捕获浏览器活动并通过 MCP/Bridge 对接 AI Agent。

## 技术栈

- **语言**：TypeScript (strict mode)
- **构建**：Vite 8 + @crxjs/vite-plugin
- **测试**：Vitest 4 + Playwright 1.60
- **MCP**：@modelcontextprotocol/sdk 1.29
- **校验**：Zod 4

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

构建产物：
- `artifacts/dist/` - Chrome 扩展
- `artifacts/bridge/` - Bridge 服务
- `artifacts/mcp/` - MCP 服务

### 3. 加载扩展

1. 打开 Chrome → `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序" → 选择 `artifacts/dist/`

### 4. 运行测试

```bash
npm test                    # 单元测试
npm run test:coverage       # 带覆盖率
npm run test:e2e            # 基础 E2E
npm run test:e2e:all        # 全部 E2E
```

## 项目结构

```
capture_all/
├── src/
│   ├── agent/              # MCP/Bridge Agent 层
│   │   ├── bridge/         # Bridge 服务器（WebSocket + HTTP）
│   │   ├── mcp/            # MCP 工具/Schema
│   │   └── shared/         # 协议定义
│   ├── background/         # Service Worker（17 个模块）
│   ├── content/            # Content Script（16 个捕获模块）
│   ├── dashboard/          # 仪表盘 UI
│   ├── devtools/           # DevTools 面板
│   ├── popup/              # 弹出窗口
│   └── shared/             # 跨层共享（24 个模块）
├── tests/                  # 单元/集成测试（89 文件）
├── e2e/                    # E2E 测试（按任务分目录）
├── docs/
│   ├── omni_powers/        # 项目管理文档
│   │   ├── op_blueprint/   # 规格文档
│   │   ├── op_execution/   # 任务执行
│   │   └── op_record/      # 历史记录
│   └── specs/              # 技术规格
└── artifacts/              # 构建产物
```

## 核心模块

### background/（Service Worker）

- `service_worker.ts` - 入口，消息路由
- `network_capture.ts` - 网络请求捕获（CDP + webRequest）
- `storage.ts` - IndexedDB 存储（10 个对象存储区）
- `exporter.ts` - 导出（JSON/JSONL/HTML/HAR）

### content/（Content Script）

- `content_script.ts` - 入口，启动 14 个捕获模块
- `mouse_capture.ts` - 鼠标事件
- `keyboard_capture.ts` - 键盘事件
- `dom_capture.ts` - DOM 变更

### agent/（MCP/Bridge）

- `bridge/server.ts` - WebSocket 桥接服务器
- `mcp/main.ts` - MCP 标准输入传输

## 编码规范

### 命名

- 变量/函数：`snake_case`
- 类型/接口：`PascalCase`
- 文件名：`snake_case.ts`

### 日志

使用统一的 Logger 类，禁止 `console.log`：

```typescript
import { Logger } from '../shared/logger';
const logger = new Logger('background/my_module', get_app_log_transport());
logger.info('Operation completed', { key: 'value' });
```

### 类型安全

使用区分联合体：

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

### 扩展调试

1. 打开 `chrome://extensions/`
2. 点击"Service Worker"链接查看日志
3. 使用 `chrome://inspect/#workers` 调试

### Bridge 调试

```bash
# 启动 Bridge 并查看日志
CAPTURE_ALL_BRIDGE_TOKEN=test npm run bridge 2>&1 | tee bridge.log

# 测试 Bridge 健康
curl http://127.0.0.1:3000/health
```

### 测试调试

```bash
# 运行单个测试文件
npx vitest run tests/network_capture.test.ts

# 运行 E2E 测试（有头模式）
npx playwright test --project=e2e-ext --headed

# 调试 E2E 测试
npx playwright test --project=e2e-ext --debug
```

## 添加新模块

### 1. 创建捕获模块

```typescript
// src/content/my_capture.ts
import { Logger } from '../shared/logger';

const logger = new Logger('content/my_capture');

export function start(send_event: (event: any) => void): void {
    // 注册事件监听
}

export function stop(): void {
    // 清理事件监听
}
```

### 2. 注册到 content_script.ts

在 `content_script.ts` 的 `start_capture` 函数中添加：

```typescript
import { start as start_my_capture, stop as stop_my_capture } from './my_capture';

// 在 start_capture 中
start_my_capture(send_event);

// 在 stop_capture 中
stop_my_capture();
```

### 3. 添加测试

```typescript
// tests/my_capture.test.ts
import { describe, it, expect, vi } from 'vitest';
import { start, stop } from '../src/content/my_capture';

describe('my_capture', () => {
    it('should capture events', () => {
        const send_event = vi.fn();
        start(send_event);
        // 触发事件并验证
        expect(send_event).toHaveBeenCalled();
        stop();
    });
});
```

## 常见问题

### 构建失败

- 检查 Node.js 版本：`node --version`
- 清理缓存：`rm -rf node_modules artifacts && npm ci`

### 测试失败

- 检查依赖：`npm install`
- 运行单个测试：`npx vitest run tests/failing.test.ts`

### 扩展加载失败

- 检查 `manifest.json` 格式
- 查看 Chrome DevTools 错误日志

## 相关文档

- [部署指南](deployment.md)
- [故障排查](troubleshooting.md)
- [API 文档](mcp_usage.md)
- [测试指南](../docs/omni_powers/op_blueprint/test.md)
