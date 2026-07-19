# 技术架构

技术栈、目录结构、模块职责、数据流的唯一真相源。命名规则见 `conventions.md`，术语见 `domain.md`。

## 1. 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Chrome Extension Manifest V3 |
| 语言 | TypeScript（strict mode） |
| 构建 | Vite 8 + @crxjs/vite-plugin 2.7 |
| 单元测试 | Vitest 4.x |
| E2E 测试 | Playwright 1.60 |
| Agent 协议 | MCP（@modelcontextprotocol/sdk ^1.29.0） |
| Agent 传输 | 本地 HTTP bridge（监听 127.0.0.1，Node.js + tsx） |
| 数据校验 | Zod ^4.4.3 |
| 存储 | IndexedDB（采集数据，`capture_all_db` v3）+ chrome.storage.local（用户配置） |
| 压缩 | fflate ^0.8.3 |
| 字体 | IBM Plex Sans（正文）+ IBM Plex Mono（数字/URL/代码） |
| CSS | 原生 CSS Custom Properties |
| UI 框架 | 无框架，原生 HTML/CSS/TypeScript |

构建输出 `artifacts/dist/`。遵循 Chrome Extension CSP。

## 2. 系统架构

```mermaid
graph TB
    subgraph "浏览器扩展 (Chrome MV3)"
        SW["Background Service Worker<br/>采集核心协调"]
        CS["Content Scripts<br/>页面事件捕获"]
        POP["Popup<br/>轻量控制面板"]
        DASH["Dashboard<br/>主面板工作台"]
        DT["DevTools Panel<br/>DevTools 集成"]
        IDB[("IndexedDB<br/>capture_all_db<br/>10 stores")]
        BC["Agent Bridge Client<br/>轮询命令 / 回传结果"]
        AQ["Agent Data Queries<br/>数据查询"]
    end

    subgraph "本地 Agent 基础设施"
        BRIDGE["HTTP Bridge<br/>命令队列 / 鉴权 / 超时"]
        MCP["MCP Server<br/>工具注册 / 协议适配"]
    end

    subgraph "外部消费者"
        AGENT["AI Agent<br/>Claude Code / Codex"]
        BROWSER["Chrome 浏览器<br/>用户操作"]
    end

    BROWSER --> CS
    CS -->|chrome.runtime.sendMessage| SW
    BROWSER -->|webRequest / CDP| SW
    SW --> IDB
    POP -->|chrome.runtime.sendMessage| SW
    DASH -->|chrome.runtime.sendMessage| SW
    DT --> SW
    BC <-->|HTTP 轮询 / heartbeat| BRIDGE
    BRIDGE <--> MCP
    MCP <--> AGENT
    IDB <--> AQ
    AQ <--> BC
```

## 3. 目录结构

按三产品 + 扁平 `shared` 组织（见 `decisions.md §002 §003`）。源码 `src/{extension,bridge,mcp,shared}`，扩展专用资源（manifest、`_locales`）随扩展入 `src/extension/`。

```
src/
├── extension/                    # Chrome 扩展产品（MV3）
│   ├── manifest.json             # 扩展清单源（构建产物仍输出到 artifacts/dist/manifest.json）
│   ├── _locales/                 # i18n 源（en / zh_CN）；构建复制到 artifacts/dist/_locales/
│   ├── background/               # Service Worker - 采集核心
│   │   ├── service_worker.ts     # 主入口，消息路由，生命周期管理
│   │   ├── capture_state.ts      # 采集状态机单例（phase/generation/run_exclusive）
│   │   ├── storage.ts            # IndexedDB CRUD 封装（store 路由 + flush）
│   │   ├── network_capture.ts    # webRequest / CDP 网络采集
│   │   ├── network_webrequest.ts # webRequest 纯工具函数
│   │   ├── network_context.ts    # 网络上下文
│   │   ├── network_correlator.ts # webRequest-CDP 请求关联（非活跃 tab）
│   │   ├── cdp_handler.ts        # CDP 事件处理（复合键 sessionId:requestId）
│   │   ├── console_capture.ts    # CDP console 采集
│   │   ├── exception_capture.ts  # CDP runtime 异常采集
│   │   ├── cookie_capture.ts     # chrome.cookies API 采集（按 tab domain 过滤）
│   │   ├── body_capture_coordinator.ts # Body 捕获协调器（单飞轮询）
│   │   ├── cdp_event_router.ts   # CDP 事件路由分发（session 注册/注销）
│   │   ├── stream_buffer.ts      # SSE / 流式响应增量缓冲（finish 删 entry）
│   │   ├── webrequest_handler.ts # webRequest 事件处理
│   │   ├── external_cdp_bridge_client.ts # 外部 CDP bridge 客户端（URL allowlist）
│   │   ├── agent_bridge_client.ts    # Agent bridge 轮询客户端（结果投递重试）
│   │   ├── agent_command_dispatcher.ts # Agent 命令分发（结构化错误码）
│   │   ├── agent_data_queries.ts # Agent 数据查询（分页聚合 PAGE_SIZE=5000）
│   │   ├── app_log_storage.ts    # 应用日志存储
│   │   ├── exporter.ts           # JSON / JSONL / HTML / HAR 导出
│   │   └── keepalive.ts          # SW 保活（chrome.alarms，幂等注册）
│   ├── content/                  # Content Scripts - 页面内采集
│   │   ├── content_script.ts     # 主入口，消息监听 + 按需激活
│   │   ├── content_event_utils.ts
│   │   ├── mouse_capture.ts / keyboard_capture.ts / scroll_capture.ts
│   │   ├── dom_capture.ts / clipboard_capture.ts / focus_capture.ts
│   │   ├── form_submit_capture.ts / fullscreen_capture.ts / print_capture.ts
│   │   ├── resize_capture.ts / visibility_capture.ts
│   │   ├── storage_capture.ts / websocket_capture.ts / network_hook.ts
│   ├── popup/                    # 弹出窗口（3 状态）
│   │   └── popup.html / popup.ts / popup.css
│   ├── dashboard/                # 主面板
│   │   ├── dashboard.html / dashboard.ts
│   │   ├── dashboard_captures.ts / dashboard_detail.ts / dashboard_settings.ts
│   │   ├── dashboard_integrations.ts / dashboard_shared.ts
│   │   ├── sidebar_resize.ts / icons.ts
│   │   └── *.css                 # Shell / pages / detail / views 样式
│   ├── devtools/                 # DevTools 面板（轻量入口）
│   │   └── devtools.html / devtools.ts / devtools_panel.html / devtools_panel.ts
│   └── shared/                   # 仅扩展专用（依赖 background/content 或扩展 UI）
│       ├── capture_data_reader.ts # 直连 IndexedDB 读取采集快照（依赖 background/storage）
│       ├── i18n.ts / theme.ts    # 国际化 / 主题（扩展 UI 专用）
│       ├── design_tokens.css     # CSS 设计令牌
│       ├── chrome.d.ts           # Chrome API 类型声明
│       ├── export_utils.ts / export_settings.ts  # 导出下载/文件名（扩展侧）
│       ├── archive_builder.ts    # 归档拼装
│       ├── capture_stats.ts      # 采集统计计算
│       ├── poll_capture_status.ts # 扩展轮询状态
│       └── dom_utils.ts          # DOM/xpath（content 用）
├── bridge/                       # Bridge 产品（HTTP 服务器 + 命令队列 + CDP）
│   ├── main.ts                   # 入口（`npm run bridge`）
│   ├── server.ts                 # HTTP 服务器（/health, /mcp/command, /extension/command …）
│   ├── command_queue.ts          # 命令队列
│   ├── config.ts                 # Bridge CLI/环境变量配置
│   └── cdp_handler.ts            # 外部 CDP 检测/启动/停止/事件
├── mcp/                          # MCP 产品（MCP Server + 工具 schema + Bridge 客户端）
│   ├── main.ts                   # 入口（`npm run mcp`）
│   ├── client.ts                 # Bridge HTTP 客户端
│   ├── schemas.ts                # Zod 参数校验 schema
│   └── tools.ts                  # MCP 工具名 → AgentCommandType 映射
└── shared/                       # 跨产品扁平共享（不依赖任何产品目录）
    ├── protocol.ts               # AgentCommandType / AgentCommandResult / AgentStatus 类型（三端线协议）
    ├── types.ts                  # 领域类型（CaptureRecord / CaptureEvent / category+type 体系）
    ├── constants.ts              # DB 名 / Store 名 / 默认配置 / 大小限制
    ├── redaction.ts              # 脱敏规则（bridge CDP 也用）
    ├── logger.ts / system_time.ts / escape.ts / hash.ts / id.ts
    ├── event_utils.ts / event_category.ts / body_routing.ts
    ├── user_config.ts / agent_bridge_config.ts
    └── …
```

依赖方向（见 `decisions.md §002`）：

```
extension ──► src/shared
bridge    ──► src/shared
mcp       ──► src/shared
extension ──✗── bridge / mcp
bridge    ──✗── extension / mcp
mcp       ──✗── extension / bridge（运行时只走 HTTP）
src/shared ──✗── 任何产品目录
```

## 4. 模块职责

### 4.1 Background Service Worker

扩展生命周期管理、消息路由、采集协调、数据持久化。

**采集状态机**（`capture_state.ts`）：单例模块，5 阶段 `idle → starting → capturing → stopping → idle`（失败走 `rolling_back`）。`run_exclusive` 串行化 start/stop。generation token 防 listener 跨采集写入。持久化活跃采集状态到 `chrome.storage.local`，SW 重启时 cleanup 恢复/终止旧采集。

消息协议（`chrome.runtime.sendMessage`）：

```typescript
// 请求
{ action: 'start' | 'stop' | 'get_status' | 'list_captures' | ... , payload: {...} }
// 响应
{ success: boolean, data?: {...}, error?: string }
```

### 4.2 Content Scripts

`manifest.json` 声明 `matches: ["<all_urls>"]`、`run_at: "document_start"`、`all_frames: true`。启动后仅注册消息监听，收到 start 消息后才激活采集。所有事件通过 `create_content_event()` 统一构造（含 event_id/source/severity）。详见 `docs/specs/extension_capture.md`。

### 4.3 Popup / Dashboard / DevTools

见 `docs/specs/dashboard.md`。

### 4.4 Agent / MCP 系统

见 `docs/specs/mcp_server.md` + `docs/specs/bridge.md`。

### 4.5 Body Capture 三层架构

Extension CDP → External CDP Bridge → Fallback Hook。详见 `docs/specs/extension_capture.md` "网络采集路径"。

## 5. 数据流

### 5.1 采集流程

```
用户点击"开始采集"
  → Popup sendMessage({ action: 'start', config })
  → capture_state.begin_start（phase=starting，generation++，run_exclusive 串行化）
  → SW 创建 CaptureRecord + 写 capture_started lifecycle 事件
  → SW 持久化 active_capture_id/config/generation 到 chrome.storage.local
  → SW 通知所有 tab content script 激活
  → SW 按需 attach CDP（console / exception / body）
  → SW 启动 agent bridge 轮询
  → capture_state.commit（phase=capturing）
  → Popup 切换"采集中"状态，每秒轮询 get_status

采集中
  → Content Script 捕获事件 → sendMessage → SW 规范化（create_base_event 生成 event_id）→ 按 category 路由到 store → 每次 write_events 立即 await flush_store → IndexedDB
  → CDP 网络事件 → 复合键 ${sessionId}:${requestId} 索引 → 脱敏 → IndexedDB
  → CDP Runtime.consoleAPICalled → should_handle_event(source, tab_id) 过滤 → console_events store
  → CDP Runtime.exceptionThrown → 同上过滤 → error_events store
  → chrome.cookies.onChanged → 按 tab domain 过滤 → cookie_changes store
  → Content Script storage hook → storage_changes store

用户点击"结束采集"
  → Popup sendMessage({ action: 'stop' })
  → capture_state.begin_stop（phase=stopping，不立即翻 is_capturing）
  → 先停生产者（network/body/cookie/console/exception + notify content scripts）
  → drain：stop_periodic_flush + flush_all（剩余事件落库）
  → 翻 is_capturing=false
  → 写 stopped event + update_capture（drain 后最终 stats）+ flush
  → 清空持久化键 + current_capture_id/start_time/config
  → capture_state.commit（phase=idle）
  → Popup 切换"采集完成"状态
```

### 5.2 Agent 数据读取流程

```
Agent → MCP 工具调用
  → MCP POST /mcp/command 到 Bridge
  → Bridge queue.enqueue（命令 ID 全局唯一 cmd_<counter>_<uuid>）
  → 扩展 Bridge Client 轮询 GET /extension/command 取命令
  → Client 调用 Agent Data Queries（分页聚合 PAGE_SIZE=5000）
  → Data Queries 读 IndexedDB
  → 结果 POST /extension/result 回 Bridge（失败重试 3 次）
  → Bridge 返回 MCP → Agent
```

### 5.3 响应体捕获流程

见 `docs/specs/extension_capture.md` "网络采集路径"。

## 6. Chrome 权限

`manifest.json` 声明：`storage`、`webRequest`、`debugger`、`tabs`、`alarms`、`downloads`、`cookies`；`host_permissions: ["<all_urls>"]`。`tabs` 用于读取和广播全部标签页；内容脚本通过 `content_scripts` 声明式注入，因此不需要 `activeTab` 或 `scripting`。CSP：`script-src 'self'; object-src 'self'`。

## 7. 构建产物与依赖

- 扩展输出：`artifacts/dist/` + `artifacts/extension.zip`。
- Vite 多入口：background、content、popup、dashboard、devtools。
- Bridge 输出：`artifacts/bridge/bridge.mjs`（esbuild 单文件，`npm run build:bridge`）。
- MCP Server 输出：`artifacts/mcp/mcp.mjs`（esbuild 单文件，`npm run build:mcp`）。
- 测试输出：`artifacts/test-results/`。

Bridge/MCP 产物为 esbuild bundled ESM，不依赖 tsx 和 node_modules，可直接 `node bridge.mjs` 运行。
MCP Server 通过 Claude Code 的 `.claude/settings.json` `mcpServers` 注册，启动后自动加载 17 个 MCP 工具（15 主工具 + 2 别名对）。
