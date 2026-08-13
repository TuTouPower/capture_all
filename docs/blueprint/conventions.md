# 约定（内容细节）

行为规则和工作顺序见 `AGENTS.md`，操作步骤见 `.agents/skills/`。本文定义命名、记录格式与编码/测试的项目级约定。

## 命名与格式

- `AGENTS.md`、`CLAUDE.md`、`README.md` 是工具入口例外。
- task 编号：占位 `{tid}`，值小写 `t001`、`t042`…。目录 / 分支 / finding / worktree：`docs/tasks/{tid}_{slug}/`、`{tid}_{slug}`、`{tid}_code_fNNN`、`../{repo}_{tid}`。
- spike 编号：占位 `{sid}`，值小写 `s001`、`s003`…。目录：`docs/spikes/{sid}_{slug}/`。
- 总账编号：待办与发现均为一条目一文件，文件名 `pNNN_{slug}.md` / `dNNN_{slug}.md`，编号来自文件名。条目只经 `scripts/repo_template/pending.py new` 与 `findings.py new` 创建——脚本在 git 公共目录的排他锁内完成「扫描全部本地分支与 worktree 取号 → 建文件」，并发执行不会撞号。`pNNN` 跨 `docs/pending/todo/`、`docs/pending/parked/`、`docs/archive/pending/` 共享全局序列，`dNNN` 在 `docs/findings/` 内递增；历史编号均不复用，不维护索引文件。spike 是目录型条目（`docs/spikes/sNNN_{slug}/`），由 `scripts/repo_template/spikes.py new` 同法锁内分配，`sNNN` 与 `docs/archive/spikes/` 共享序列。
- AC 编号：spec 验收标准每条行为 AC 用 `AC-NNN`（三位十进制，task 内从 1 顺序编号）。编号一旦分配永久归属，删除后不复用（允许断号，不强制连续），新增用下一个编号。`handoff.json` 的 `ac_evidence` 键引用同一编号，须精确覆盖 spec 验收标准全部 AC——缺或多都阻断合入。编号规范属 spec 模板门禁，见 `docs/tasks/task_template/spec.md`。
- 占位示例（模板、示例行）不得占用真实 `tid` / `sid` / `pNNN`，也不得当作 active 工作项执行。
- 变量、函数、文件名、目录名、slug 一律 `snake_case`；大写 `TNNN` 仅见于 git 历史与旧文档正文（旧 task 编号体系），磁盘目录与 task.py 索引统一小写 `tNNN`。
- 类型 / 接口 / 类名 `PascalCase`（`CaptureRecord` / `CaptureEvent`）。
- 常量 `UPPER_SNAKE_CASE`（`MAX_BODY_CAPTURE_BYTES` / `DB_VERSION`）。
- 布尔变量用 `is_` / `has_` / `should_` 前缀。
- Markdown 嵌套内容缩进 4 空格，禁止 tab。
- front matter 注释独占整行；行内注释有解析器兜底，但勿依赖。
- 行尾不留空白；文件末尾保留一个换行。
- 时间戳统一使用中国时间，格式 `YYYY-MM-DD HH:MM UTC+8`。
- `docs/archive/tasks_audit.log` 由 `scripts/repo_template/task.py rewind`/`purge` 自动写入。
- 非归档 Markdown 统一用 md_kx 格式化（`scripts/repo_template/md_format.py`），表用 `compact`（`|a|b|`）。改完 md 后跑 `python3 scripts/repo_template/md_format.py --changed`（或点名路径）；commit 前 `--check` 为绿。格式由 `.md_kx.toml` 统一，禁止 prettier / 按列 pad。
- TypeScript strict mode。
- 语言和框架已有稳定惯例时，在本文件补充项目级例外，不强行覆盖生态要求。

## schema 类型落点

按消费方决定落点，`schemas/` 只放跨服务契约。

| 类型 | 例子 | 落点 |
| ---- | ---- | ---- |
| 跨服务接口契约 | OpenAPI、gRPC `.proto`、GraphQL `.graphql`、AsyncAPI | `schemas/`，按协议分子目录：`schemas/openapi/`、`schemas/proto/`、`schemas/graphql/`；单一协议直接扁平 |
| 代码内数据契约 | Pydantic model、TS interface、Zod schema、Go struct tag | 跟模块走：`src/<module>/schemas/` 或语言惯例位置（`src/types/`、`src/models/`） |
| 数据库 schema | Alembic、Prisma schema、SQL migration、Django migration | 工具默认：`migrations/` / `prisma/` / `alembic/`，不另立目录 |
| 配置 schema | JSON Schema 校验 config、CI workflow schema、env schema | 跟配置走：`config/schemas/`，或跟消费方 |
| 文档/元数据 schema | frontmatter、Cosmjs、yaml metadata 校验 | `docs/schemas/`，或跟文档源 |

原则：

- 跨服务契约会触发上下游同步，独立根目录便于发现和工具扫描。
- 代码内契约不外露，跟源码同源，避免双份维护。
- 数据库 schema 跟 migration 工具走，工具约定优先于本文件。
- 多种类型并存时，按主消费方归类；归属不清记入 `docs/blueprint/decisions.md`。

## decisions.md 条目格式

```markdown
## NNN 标题（YYYY-MM-DD）

- 背景：为什么需要决策
- 选项：考虑过什么
- 结论：选了什么，为什么
- 替代：若替代旧决策，填写旧编号；否则写"无"
```

## 编码与测试

- 命名、格式、lint 规则以项目实际工具为准（TypeScript strict mode、4 空格缩进）。
- 日志优先用 `logger.ts` 模块，禁止 `console.log` / `print` 调试输出进入提交。
- 应用日志进 IndexedDB `app_logs` store（`app_log_storage.ts`），支持 level / module / timestamp 索引。
- 修 bug 时在对应测试层补回归用例，文件名带任务 ID，如 `tests/unit/t042_empty_token.test.ts`。

## 浏览器扩展 API 规范

### 消息通信

- Popup / Dashboard 与 Service Worker 通过 `chrome.runtime.sendMessage` 通信。
- 请求统一 `{ action, payload? }`，响应统一 `{ success: boolean, data?, error?: string }`；UI 侧一律经 `send_ui_message(action, payload)` 类型化收发（共享类型与 action 清单见 `src/shared/message_contract.ts`），禁止裸调 `chrome.runtime.sendMessage` 依赖 any 返回。
- action 语义：`start` / `stop` 的 `data` 为操作结果；`get_status` 的 `data` 为状态对象（`tab_id` 以请求方 `sender.tab.id` 权威回填）；`list_captures` 的 `data` 为数组；`get_capture_data` 的 `data` 为 capture 记录（仅元数据，不含全量事件）。
- 内容脚本内部消息（`event` / `app_log_batch`）保持扁平（非 `{ action, payload }`），不套 payload；content→SW 的 `get_status` 请求响应同样为 `{ success, data }`，由 content_script 解包 `data`。
- Content Script 收到 start 消息才激活采集，不主动启动。
- `postMessage` 必须指定 `targetOrigin`，接收方必须校验 `event.origin`。

### Service Worker 保活

- MV3 SW 30s 超时杀进程，用 `chrome.alarms` 保活（`keepalive.ts`）。
- 长时操作（采集、轮询）必须能在 SW 重启后恢复状态（capture_state 持久化键）。

### CDP / debugger

- `chrome.debugger.attach` 一次只 attach 一个 tab（`dbg_tab_id` 单值）。
- 受限 URL（`chrome://` / `chrome-extension://` / `about:`）attach 必然失败，监听 `tabs.onActivated` / `tabs.onUpdated` 在切到普通 URL 时自动重试。
- stop 时先对所有 attached session 发 `runIfWaitingForDebugger`，防止子 target 冻结。

### Storage

- 采集数据进 IndexedDB（`capture_all_db`），用户配置进 `chrome.storage.local`。
- 事件按 category 路由到对应 store，`event_id` 作 keyPath。
- write_events / write_network_requests / write_console_events 每次调用立即 await flush_store（不依赖批量 buffer）。

## UI 编码

- 无框架，原生 HTML / CSS / TypeScript。
- CSS 用 Custom Properties（设计令牌在 `src/extension/shared/design_tokens.css`）。
- 语义化 HTML 优先（`<header>` / `<main>` / `<section>` / `<nav aria-label=...>`）。
- 国际化通过 `data-i18n` 属性 + `t()` 函数，禁止在组件里硬编码中文/英文字符串。
- 主题通过 token 切换，支持浅色 / 深色 / 跟随系统。

## 安全编码

- 禁止硬编码 secret / token / 密码 / 弱口令 / API key。公网开放的密钥必须由用户提供随机生成值。
- HTML 导出必须转义动态内容（`escape.ts`）。
- 敏感 header / URL query / password input 必须脱敏（`redaction.ts`）。
- 输入校验在系统边界进行，外部数据（API 响应、用户输入、文件内容）不可信。
- Zod schema 用于 MCP 工具参数校验（`mcp/schemas.ts`）。

## 适配器 / 模块新增步骤

新增一个 content capture 模块（参考已实现的 `clipboard_capture.ts` 等）：

1. 在 `src/extension/content/` 新建 `xxx_capture.ts`，导出 `start_xxx_capture()` / `stop_xxx_capture()`。
2. 在 `src/shared/types.ts` 声明新的 `EventType` 与对应 `XxxEventData` 接口，加入 `CaptureEventDataMap`。
3. 在 `src/shared/event_category.ts` 注册 type → category 映射。
4. 在 `src/extension/content/content_script.ts` 的激活序列中接入 start/stop。
5. 在 `src/extension/background/storage.ts` 确认 store 路由覆盖新 category（多数归入既有 store）。
6. 补单测 `tests/unit/xxx_capture.test.ts`（mock Chrome API）。
7. 若该事件应计入 UI 标签计数，更新 `capture_stats.ts` / `label_counts` 映射。

新增一个 background capture 模块（参考 `console_capture.ts`）：

1. 在 `src/extension/background/` 新建 `xxx_capture.ts`，暴露 start / stop 接口。
2. 在 `service_worker.ts` 的 startCapture / stopCapture 序列中接入。
3. 类型与 store 路由同上。
4. 补单测。

## 错误处理

- 显式处理错误，不静默吞掉。
- UI 层给用户友好提示，后台层记详细上下文到 `app_logs`。
- 边界校验失败 fail fast，返回明确错误码（见 `domain.md`）。
- 异步操作用 `async/await` + `try/catch`，`unknown` 类型安全 narrow。

## 提交规范

- commit message 格式 `<type>(<task_id>): <description>`，type：feat / fix / refactor / docs / test / chore / perf / ci。task_id 如 `t091`（历史大写 `T091` 不追改）。
- 改代码后检查 `docs/` 与 `AGENTS.md` 是否受影响，一并更新。
- 生成物放 `artifacts/`，不入版本库。
