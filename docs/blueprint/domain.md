# 领域术语与业务不变量

命名规则（snake_case 等）见 `conventions.md`，技术栈见 `architecture.md`。

## 1. 核心术语（ubiquitous language）

| 术语 | 英文 | 含义 |
|---|---|---|
| 全采 | Capture All | 产品名 |
| 采集 | capture | 核心动词。禁止用 record / 录制 / 记录 / session 替代 |
| 单次采集 | — | 一次 capture 的完整生命周期，标识为 capture_id |
| 采集记录 | CaptureRecord | 单次采集的顶层容器（元信息 + stats + 配置快照） |
| 采集事件 | CaptureEvent | 单条结构化证据（公共字段 + category + type + data 载荷） |
| 采集配置 | CaptureConfig | 单次采集的行为参数（脱敏开关、body 上限、采样率等） |
| 采集标识 | capture_id | 单次采集唯一标识（string） |
| 事件标识 | event_id | 全局唯一 UUID，作为所有事件 store 的 keyPath |
| 分类 | category | 事件一级分类（9 个内部 category，UI 层归并为 7 标签） |
| 类型 | type | 事件二级类型 |
| 数据标签 | label | UI 面向用户的 7 个统计口径，与 popup/dashboard 完全一致 |
| Bridge | — | 本地 HTTP 桥接服务，监听 127.0.0.1 |
| instance_id | — | 扩展实例的唯一机器 ID（UUID 或 `inst_<hex>`）；enroll 时由 Bridge 分配或扩展提供；AI 路由用 |
| instance_token | — | 扩展实例鉴权令牌，enroll 时由 Bridge 生成（`ext_` 前缀），后续 heartbeat/command/result 用此 token；Bridge 仅存储 sha256 hash |
| browser_label | — | 浏览器备注。人填的自定义值（如"work"）优先；未填时 Bridge 按到达顺序自动分配中文默认编号（一、二、三…）。AI 路由的 `target_label` 候选；非空且唯一时与 `instance_id` 等价可达 |
| MCP | Model Context Protocol | Agent 与 Bridge 间的协议层 |
| Agent | AI Agent | 本地 AI 客户端（如 Claude Code / Codex） |
| Body 捕获 | body capture | 网络请求/响应体采集，三层降级架构 |
| 脱敏 | redaction | 敏感字段替换为 `[REDACTED]`，配置项 |

## 2. MCP 工具命名

MCP 工具名用动词短语（`start_recording` / `list_captures`），底层命令用点分路径：

| MCP 工具 | Bridge 命令 |
|---|---|
| `get_status` | bridge 本地（不下发） |
| `list_browsers` | bridge 本地（从 status 提取） |
| `start_recording` | `capture.start` |
| `stop_recording` | `capture.stop` |
| `list_captures` | `captures.list` |
| `get_capture` | `captures.get` |
| `list_data_sources` | `sources.list` |
| `list_records` | `data.list` |
| `get_record` | `data.get` |
| `get_timeline` | `timeline.list` |
| `get_timeline_item` | `timeline.get` |
| `get_all_capture_data` | `capture.get_all_data` |
| `export_capture` | `capture.export` |

兼容别名：`list_sessions` / `get_session` / `get_all_session_data` / `export_session` 映射到同命令。

## 3. 内部分类 vs UI 标签

内部分类 9 个：`user_action`、`navigation`、`network`、`console`、`error`、`storage`、`cookie`、`dom_data`、`capture_lifecycle`。

UI 层 7 个标签：用户行为 / 页面导航 / 网络请求 / 控制台 / 错误异常 / Storage / Cookie。

`dom_data` 和 `capture_lifecycle` 不在 UI 标签中展示。

## 4. 禁用术语

以下历史概念已从 UI 与文档完全移除，禁止在产品代码、用户文案、文档中使用：

| 禁用术语 | 替代 |
|---|---|
| 深度采集 / 标准采集 | 无（模式概念已删除） |
| 模式切换 / 模式列 / 模式筛选 / 模式徽章 | 无 |
| "当前采集中"统计卡 | 无 |
| compact 密度 | 仅 regular |
| session / record（作为产品术语） | capture |
| 录制 / 记录（作为产品动词） | 采集 |
| `session_id` | `capture_id` |
| `detail.html` 独立详情页 | 合并入 dashboard（`?page=detail`） |

代码内 `Session` / `RecordEvent` 类型保留为 `@deprecated` 兼容层（指向 `CaptureRecord` / `CaptureEvent`），仅为旧数据迁移，禁止在新代码中使用。

`capture_mode` 字段值域保持 `'basic'` / `'advanced'`（减少变更面），但 UI 不暴露此概念。

## 5. 业务不变量

跨功能强制约束，修改任一模块都必须保持：

- **同一时间只允许一次活跃采集**。start 时若已有活跃采集，返回 `CAPTURE_ALREADY_RUNNING`。
- **Bridge 只监听 127.0.0.1**，禁止绑定 `0.0.0.0` 或公网接口。
- **Bridge token 必须是用户提供或 Bridge 安全随机生成的强 token**，禁止硬编码、禁止默认值、禁止示例值。所有 API 请求必须带 token；无效/缺失返回 401。
- **instance_token 与 MCP token 分离**：MCP 路由仅接受 MCP token，扩展数据端点接受 MCP token 或 instance_token。instance_token 不能冒充 MCP 访问 `/mcp/*` / `/cdp/*`。
- **loopback + chrome-extension origin 直通 enroll**（T091）：默认零配置，扩展首次连接无需 Token / 配对码；Bridge 仅校验 `chrome-extension://<32-char-id>` origin。pairing code 保留为可选增强（跨机 / 高安全场景），扩展显式传 `pairing_code` 时才校验。MCP token 路径仍可作 bootstrap。
- **browser_label 自动编号**（T091）：扩展 enroll 时未传 label，Bridge 按 `next_default_label` 分配中文数字（一/二/三…，跳过自定义 label，取已用最大序号 +1）。heartbeat 未传 label 时保留 Bridge 已分配的默认编号（不再清空为 null）。
- **同 browser_label 再次 enroll 顶替旧实例**（自定义 label 非空时）：删除旧实例注册及命令队列（cancel_all 以 COMMAND_CANCELLED resolve），旧 instance_token 立即失效。heartbeat 携带 browser_label 同步变更。自动编号 label 由 `next_default_label` 保证唯一，不触发顶替。
- **外部 Bridge URL 仅允许 127.0.0.1 / localhost / [::1]**（external_cdp_bridge_client allowlist）。
- **CDP 状态按 `${sessionId ?? 'root'}:${requestId}` 复合键索引**，跨子目标（iframe/worker/OOPIF）隔离。
- **Cookie 按 tab domain 过滤**：仅采集目标 tab URL domain 及其父域的 cookie 变更。
- **Bridge 仅存储 instance_token 的 sha256 hex hash**，不保留明文。校验使用恒时比较。
- **Bridge 端口由用户配置**，禁止硬编码；默认配置中的 `agent_bridge_url` 指向 `http://127.0.0.1:17831` 仅是占位，实际端口以用户配置为准。
- **MCP 不自动脱敏、不自动摘要、不自动过滤**。工具层不替模型做数据判断。
- **MCP 不提供删除采集 / 清空数据能力**。
- **HTML 导出必须转义动态内容**（`</script>` → `<\/script>`，`<`/`>`/`&` 全转义）。
- **type=password input 永远不被采集**（`value_status: 'not_captured'`）。
- **脱敏与截断分离**：`redact_data` 控制脱敏；payload size limit（`max_body_capture_bytes` / `inline_text_max_bytes` / console args 1KB / target_text 100 字符）永远生效，不受脱敏开关影响。
- **所有事件 store 用 `event_id`（`crypto.randomUUID()`）作 keyPath**，`capture_id` 作索引，避免复合主键碰撞。
- **IndexedDB Console 和 Error 分两个独立 store**（`console.error()` ≠ 运行时异常）。
- **write_events / write_network_requests / write_console_events 每次调用立即 await flush_store**（不依赖批量 buffer），保证 MV3 SW 回收不丢数据。
- **停止采集时先停生产者 → drain → 再翻 is_capturing**（stop drain 顺序），stopped event 在 drain 后写入含最终 stats。
- **SW 通过 chrome.alarms 保活**，避免 MV3 30s 超时杀进程。
- **禁止 `taskkill /F /IM chrome.exe`** 类破坏性操作（历史事故）。
- **所有面向用户文案使用 Capture All / 全采 / 采集**，不出现禁用术语。

## 6. 存储 / 大小限制

| 限制 | 值 | 来源 |
|---|---|---|
| 单采集大小 | 500 MB | `MAX_SESSION_SIZE_BYTES` |
| 单采集时长 | 24 小时 | `MAX_SESSION_DURATION_MS` |
| 单条 body 截断 | 100 MB | `MAX_BODY_CAPTURE_BYTES` |
| 单条 inline_text | 32 KB | `INLINE_TEXT_MAX_BYTES` |
| 单条 console arg | 1 KB | `MAX_CONSOLE_ARG_BYTES` |
| 单条日志上限 | 64 KB | `MAX_LOG_ENTRY_BYTES` |
| target_text 预览 | 100 字符 | `MAX_TARGET_TEXT_CHARS` |
| flush 批次 | 100 条 | `FLUSH_BATCH_SIZE`（周期 flush 兜底用） |
| flush 间隔 | 1000 ms | `FLUSH_INTERVAL_MS`（周期 flush 兜底用） |
| 导出分页 | 5000 条/页 | `PAGE_SIZE`（循环至耗尽） |
| CDP events 单次轮询 | 100 条 | `MAX_EVENTS_PER_POLL` |
| 命令 timeout 上限 | 300000 ms | `validate_command_request` |
| Bridge body 上限 | 1 MiB | `read_json` |
| 扩展结果回传上限 | 64 MiB | `MAX_EXTENSION_RESULT_BODY_BYTES` |

数据库 `capture_all_db`，`DB_VERSION = 3`，10 stores。详见 `docs/specs/storage.md`。

## 7. 超时策略（Bridge）

| 命令类 | 超时 |
|---|---|
| 查询类（list/get/timeline/sources） | 30 s |
| 全量类（get_all_data） | 120 s |
| 导出类（export） | 120 s |
| start / stop | 15 s |

超时只返回错误码，不自动降级。

## 8. 错误码

**Bridge 层**：`BRIDGE_UNAVAILABLE`、`EXTENSION_OFFLINE`、`COMMAND_TIMEOUT`、`TOKEN_INVALID`、`ORIGIN_NOT_ALLOWED`、`PAYLOAD_TOO_LARGE`、`COMMAND_CANCELLED`、`TARGET_REQUIRED`、`TARGET_NOT_FOUND`、`PAIRING_REQUIRED`。

**扩展层**：`CAPTURE_NOT_FOUND`、`SOURCE_NOT_FOUND`、`RECORD_NOT_FOUND`、`INVALID_QUERY`、`CAPTURE_ALREADY_RUNNING`、`NO_ACTIVE_CAPTURE`、`EXPORT_FAILED`、`STORAGE_READ_FAILED`、`PAYLOAD_TOO_LARGE`。

**错误码别名**（渐进迁移，旧码兼容至 v2.0）：`SESSION_NOT_FOUND` -> `CAPTURE_NOT_FOUND`、`RECORDING_ALREADY_RUNNING` -> `CAPTURE_ALREADY_RUNNING`、`NO_ACTIVE_RECORDING` -> `NO_ACTIVE_CAPTURE`。映射表见 `src/shared/protocol.ts` `ERROR_CODE_ALIASES`。
