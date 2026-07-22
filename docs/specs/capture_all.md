# Spec — capture_all（总览）

Chrome MV3 扩展，采集浏览器内的用户行为、页面导航、网络请求、控制台、错误异常、Storage、Cookie 7 类数据，并通过本地 Bridge + MCP 服务端供 AI Agent 调用。所有数据本地 IndexedDB，不入云。

## 模块 spec

| 模块 | spec | 覆盖 |
|------|------|------|
| 采集（扩展侧） | [extension_capture.md](./extension_capture.md) | content script 事件采集、background CDP/webRequest、3 级网络路径、CaptureConfig、子目标 auto-attach |
| 隐私脱敏 | [privacy_redaction.md](./privacy_redaction.md) | URL/header/data 脱敏、password 永不采集、cookie scope、logger 净化 |
| 存储 | [storage.md](./storage.md) | IndexedDB v3、10 stores、keyPath/索引、写入语义、容量限制、升级路径 |
| Bridge | [bridge.md](./bridge.md) | HTTP 路由、双 token 模型、命令队列、CDP proxy、配对、体积限制 |
| MCP 服务端 | [mcp_server.md](./mcp_server.md) | 17 工具、schema、路由参数、错误码 |
| SW 生命周期 | [sw_lifecycle.md](./sw_lifecycle.md) | capture_state 状态机、串行化、generation、持久化恢复、stop drain、start 回滚 |
| 导出 | [export.md](./export.md) | JSON/JSONL/HTML/HAR、分页聚合、转义、HAR 字节口径 |
| Dashboard | [dashboard.md](./dashboard.md) | 5 页面、轮询单飞、详情 tabs、搜索筛选 |

## 架构

```
src/
├── extension/          # Chrome MV3 扩展
│   ├── background/     # Service Worker（采集调度、CDP、IndexedDB）
│   ├── content/        # Content Script（页面事件采集）
│   ├── dashboard/      # 管理 UI
│   ├── devtools/       # DevTools 面板入口
│   ├── popup/          # 弹出窗口
│   ├── shared/         # 扩展专用工具
│   └── manifest.json   # MV3 清单
├── bridge/             # 本地 HTTP Bridge（Node.js）
├── mcp/                # MCP 服务端（stdio → Bridge）
└── shared/             # 跨产品共享类型/常量/工具
```

构建产物（`npm run build`）：`artifacts/dist/`（扩展）、`artifacts/bridge/`（bridge.mjs）、`artifacts/mcp/`（mcp.mjs）、`artifacts/extension.zip`。

## Chrome 权限

`permissions`: storage, webRequest, debugger, tabs, alarms, downloads, cookies。
`host_permissions`: `<all_urls>`。
`content_scripts`: 匹配 `<all_urls>`，`document_start`，`all_frames: true`。

## 硬约束

- Bridge 仅绑定 `127.0.0.1`。
- token 必须是用户提供或 Bridge 安全随机生成的强 token（默认零配置：Bridge 自生成并持久化到 `$XDG_RUNTIME_DIR/capture-all/bridge_token`，mode 0600；MCP 客户端按 `env > 持久化文件`自动读取）。
- 扩展 enroll 默认零配置：loopback 内凭 chrome-extension origin 直通（`/^chrome-extension:\/\/[a-p]{32}$/`），无需 Token / pairing code；pairing 端点保留为可选增强（跨机 / 高安全场景）。
- browser_label 默认按到达顺序自动编号（`1 号` / `2 号` / `3 号` …）；自定义 label 优先；自动编号 label 不触发顶替逻辑。
- instance_token 不得访问 MCP/CDP 路由。
- IndexedDB 升级路径不得丢 records。
- HTML 导出必须转义动态内容。
- `type=password` 永远不采集。
- 脱敏与截断分离。
- 同一时间只允许一次活跃采集。
- MCP 不自动脱敏/摘要/过滤/删除。
- 生成物放 `artifacts/`，不入版本库。

## 术语

- 英文 `capture`，中文"采集"。
- 禁用 `session`/`record`/`录制`/`记录` 作产品术语（兼容别名保留至 v2.0）。
- 类型 `CaptureRecord`/`CaptureEvent`/`CaptureConfig`，标识 `capture_id`。
