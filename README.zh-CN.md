<div align="center">
  <img src="assets/icons/icon128.png" width="96" height="96" alt="Capture All 图标">
  <h1>Capture All 全采</h1>
  <p>面向浏览器问题取证、分析和 AI Agent 查询的 Chrome MV3 调试黑盒。</p>
  <p><a href="README.md">English</a></p>
</div>

Capture All 将浏览器活动采集为本地结构化数据：用户行为、页面导航、网络请求、控制台、错误异常、Storage 变更和 Cookie 变更。配套本地 Bridge 与 MCP Server，可供 AI Agent 控制采集并查询证据。

> [!WARNING]
> 扩展申请高影响浏览器权限，可能采集页面敏感内容。使用前阅读[权限与数据](#权限与数据)。仅在有权检查的浏览器、Profile 和网站中使用。

## 项目状态

Capture All 仍处于早期阶段，尚未发布到 Chrome Web Store 或 npm。当前安装方式为从源码构建并加载已解压的扩展程序。

仓库暂不包含公开产品截图，避免把开发采集中的私密浏览器内容发布到 GitHub。

## 功能

- 采集 7 组数据：用户行为、页面导航、网络请求、控制台、错误异常、Storage、Cookie。
- 在 popup、主面板、时间线、请求检视器和 DevTools 面板中检查采集结果。
- 导出 JSON、JSONL、HTML 或 HAR。
- 通过 MCP 分页查询采集元信息和数据条目。
- 本地 Bridge 仅绑定 `127.0.0.1`，使用 Token 鉴权。
- 采集数据存入本地 IndexedDB，设置存入 `chrome.storage.local`。
- 支持 URL、Header、数据脱敏配置，并始终应用大小限制。

## 环境要求

- 支持 Manifest V3 的 Chrome 或 Chromium 浏览器。
- Node.js `^20.19.0` 或 `>=22.12.0`。
- npm。

## 从源码安装

```bash
git clone https://github.com/TuTouPower/capture_all.git
cd capture_all
npm ci
npm run build
```

加载扩展：

1. 打开 `chrome://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择仓库中的 `artifacts/dist`。

重新构建后，如果 manifest 或 Service Worker 变化未自动生效，在 `chrome://extensions` 中重新加载扩展。

## 开发命令

```bash
npm run dev          # Vite 开发服务
npm test             # 单元和集成测试
npm run build        # 构建扩展、Bridge 和 MCP 产物
npm run test:e2e     # 基础 headless Playwright 测试
npm run scan:tracked-tree  # 扫描待提交文件中的 Secret 和私有路径
npm run bridge       # 从 TypeScript 源码启动 Bridge
npm run mcp          # 从 TypeScript 源码启动 MCP Server
```

构建输出：

- 扩展：`artifacts/dist`
- Bridge：`artifacts/bridge/bridge.mjs`
- MCP Server：`artifacts/mcp/mcp.mjs`

实现细节见[技术架构](docs/omni_powers/op_blueprint/architecture.md)和[测试计划](docs/omni_powers/op_blueprint/test.md)。

## Bridge 与 MCP

先构建项目，再创建仅供当前项目使用的 MCP 配置：

```bash
cp .mcp.json.example .mcp.json
```

将 `.mcp.json` 中的 `<YOUR_BRIDGE_TOKEN>` 替换为自行提供的随机 Token。扩展设置和 Bridge 使用同一 Token：

```bash
CAPTURE_ALL_BRIDGE_TOKEN='<你的 Token>' \
    node artifacts/bridge/bridge.mjs --port 17831
```

Bridge 仅绑定 `127.0.0.1`。`.mcp.json` 已被 Git 忽略，只应保存在本机。禁止把真实 Token 写入源码、文档、Issue 或采集导出文件。

MCP Server 提供状态检查、采集控制、分页数据查询、时间线查询和导出命令。完整工具和配置字段见 [MCP 使用指南](docs/mcp_usage.md)。

## 权限与数据

| 权限 | 用途 |
|---|---|
| `storage` | 将用户配置存入 `chrome.storage.local`。 |
| `webRequest` | 观察请求和响应元信息。 |
| `debugger` | 通过 Chrome DevTools Protocol 采集控制台、运行时异常和已配置的 body。 |
| `tabs` | 查询标签页并协调 Content Script 采集。 |
| `alarms` | 维持 MV3 Service Worker 采集生命周期。 |
| `downloads` | 保存本地导出文件。 |
| `cookies` | 采集 Cookie 变更。 |
| `<all_urls>` | 在各来源页面运行声明式 Content Script 并观察网络请求。 |

采集数据保存在扩展本地 IndexedDB 数据库 `capture_all_db`，设置保存在 `chrome.storage.local`。Bridge 只在扩展与 `127.0.0.1` 上通过鉴权的本地客户端之间传输数据；使用 MCP 时，被查询的数据可能发送给所连接的 AI Agent。

通过主面板采集列表删除采集，或在设置页管理存储。移除扩展或清除扩展站点数据也会删除本地扩展存储。已导出的文件是独立副本，需要单独删除。

## 已知限制

- `<all_urls>` 和 `all_frames: true` 允许声明式 Content Script 在顶层页面及嵌入式第三方 iframe 中运行。授权采集可能包含支付、身份认证、聊天、广告等嵌入式 frame 的活动或元数据。
- `<all_urls>`、`debugger`、`tabs`、`cookies` 属于高影响权限，当前采集模型需要这些权限。
- 脱敏只能降低风险，无法保证清除所有 Secret 或个人信息。
- 输入值、请求 body、响应 body 采集默认开启，可能包含凭据、Token、私密消息或个人信息。不需要这些数据时，应在首次采集前检查并关闭对应选项。
- Bridge 普通 JSON body 上限为 1 MiB，扩展结果回传上限为 32 MiB。更大的采集应使用分页 `list_records` 或扩展本地导出。
- 单次采集上限为 500 MB、24 小时；单条 body 上限为 100 MB。
- MCP 不提供删除采集或清空数据库命令。
- 尚无 Chrome Web Store 包、npm 发布、兼容性保证或支持 SLA。

采集、存储、MCP/AI、导出和删除规则见 [PRIVACY.md](PRIVACY.md)。当前私密漏洞报告渠道状态见 [SECURITY.md](SECURITY.md)，禁止在 Issue 中公开敏感证据。

## 贡献

修改前阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，运行 `npm test`、`npm run build` 和 `npm run test:e2e`，并遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。禁止向公开 Issue 上传未脱敏采集、Token、请求 body 或浏览器数据。版本变化见 [CHANGELOG.md](CHANGELOG.md)。

## License

项目使用 [Apache-2.0 License](LICENSE)。
