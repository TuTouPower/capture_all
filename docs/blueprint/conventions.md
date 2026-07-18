# 编码约定

本文件只管编码规范。技术栈在 `architecture.md`，术语在 `domain.md`，测试在 `test.md`。

## 1. 命名

- 变量、函数、文件名、目录名一律 `snake_case`。
- 例外：`CLAUDE.md`、`README.md` 等既定大写文件名保持原样。
- 类型 / 接口 / 类名 `PascalCase`（`CaptureRecord` / `CaptureEvent`）。
- 常量 `UPPER_SNAKE_CASE`（`MAX_BODY_CAPTURE_BYTES` / `DB_VERSION`）。
- 自定义 hook 风格函数（若有）用 `use_` 前缀。
- 布尔变量用 `is_` / `has_` / `should_` 前缀。

## 2. 缩进与格式

- 缩进 4 空格，禁止 tab。
- TypeScript strict mode。
- 行尾不留空白。
- 文件末尾保留一个换行。

## 3. 文件组织

- 按功能 / surface 组织，不按文件类型堆叠（见 `architecture.md` 目录结构）。
- 高内聚低耦合，单文件聚焦一个职责。
- 共享代码放 `src/shared/`，跨 surface 复用的类型放 `src/shared/types.ts`。

## 4. UI 编码

- 无框架，原生 HTML / CSS / TypeScript。
- CSS 用 Custom Properties（设计令牌在 `src/shared/design_tokens.css`）。
- 语义化 HTML 优先（`<header>` / `<main>` / `<section>` / `<nav aria-label=...>`），避免无意义 div 堆叠。
- 国际化通过 `data-i18n` 属性 + `t()` 函数，禁止在组件里硬编码中文/英文字符串。
- 主题通过 token 切换，支持浅色 / 深色 / 跟随系统。
- 主色 `#3b82f6`（蓝），通过 `--blue` token 引用，不硬编码。

## 5. 浏览器扩展 API 规范

### 5.1 消息通信

- Popup / Dashboard 与 Service Worker 通过 `chrome.runtime.sendMessage` 通信。
- 请求统一形如 `{ action: string, payload?: {...} }`，响应统一 `{ success: boolean, data?: {...}, error?: string }`。
- Content Script 收到 start 消息才激活采集，不主动启动。
- `postMessage` 必须指定 `targetOrigin`，接收方必须校验 `event.origin`。

### 5.2 Service Worker 保活

- MV3 SW 30s 超时杀进程，用 `chrome.alarms` 保活（`keepalive.ts`）。
- 长时操作（采集、轮询）必须能在 SW 重启后恢复状态。

### 5.3 CDP / debugger

- `chrome.debugger.attach` 一次只 attach 一个 tab（`dbg_tab_id` 单值）。
- 受限 URL（`chrome://` / `chrome-extension://` / `about:`）attach 必然失败，监听 `tabs.onActivated` / `tabs.onUpdated` 在切到普通 URL 时自动重试。
- stop 时先对所有 attached session 发 `runIfWaitingForDebugger`，防止子 target 冻结。

### 5.4 Storage

- 采集数据进 IndexedDB（`capture_all_db`），用户配置进 `chrome.storage.local`。
- 事件按 category 路由到对应 store，`event_id` 作 keyPath。
- 写入走批量 flush（批次 100，间隔 1000 ms），stop 时强制 flush。

## 6. 安全编码

- 禁止硬编码 secret / token / 密码 / 弱口令 / API key。公网开放的密钥必须由用户提供随机生成值。
- HTML 导出必须转义动态内容（`escape.ts`）。
- 敏感 header / URL query / password input 必须脱敏（`redaction.ts`）。
- 输入校验在系统边界进行，外部数据（API 响应、用户输入、文件内容）不可信。
- Zod schema 用于 MCP 工具参数校验（`mcp/schemas.ts`）。

## 7. 日志

- 优先用 `logger.ts` 模块，禁止 `console.log` / `print` 调试输出进入提交。
- 应用日志进 IndexedDB `app_logs` store（`app_log_storage.ts`），支持 level / module / timestamp 索引。
- 日志 level / max_size 由用户配置控制。

## 8. 适配器 / 模块新增步骤

新增一个 content capture 模块（参考已实现的 `clipboard_capture.ts` 等）：

1. 在 `src/extension/content/` 新建 `xxx_capture.ts`，导出 `start_xxx_capture()` / `stop_xxx_capture()`。
2. 在 `src/shared/types.ts` 声明新的 `EventType` 与对应 `XxxEventData` 接口，加入 `CaptureEventDataMap`。
3. 在 `src/shared/event_category.ts` 注册 type → category 映射。
4. 在 `src/extension/content/content_script.ts` 的激活序列中接入 start/stop。
5. 在 `src/extension/background/storage.ts` 确认 store 路由覆盖新 category（多数归入既有 store）。
6. 补单测 `tests/xxx_capture.test.ts`（mock Chrome API）。
7. 若该事件应计入 UI 标签计数，更新 `capture_stats.ts` / `label_counts` 映射。

新增一个 background capture 模块（参考 `console_capture.ts`）：

1. 在 `src/extension/background/` 新建 `xxx_capture.ts`，暴露 start / stop 接口。
2. 在 `service_worker.ts` 的 startCapture / stopCapture 序列中接入。
3. 类型与 store 路由同上。
4. 补单测。

## 9. 错误处理

- 显式处理错误，不静默吞掉。
- UI 层给用户友好提示，后台层记详细上下文到 `app_logs`。
- 边界校验失败 fail fast，返回明确错误码（见 `domain.md` §8）。
- 异步操作用 `async/await` + `try/catch`，`unknown` 类型安全 narrow。

## 10. 提交规范

- commit message 格式 `<type>: <description>`，type：feat / fix / refactor / docs / test / chore / perf / ci。
- 改代码后检查 `docs/` 与 `CLAUDE.md` 是否受影响，一并更新。
- 生成物放 `artifacts/`，不入版本库。
