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
| MCP | Model Context Protocol | Agent 与 Bridge 间的协议层 |
| Agent | AI Agent | 本地 AI 客户端（如 Claude Code / Codex） |
| Body 捕获 | body capture | 网络请求/响应体采集，三层降级架构 |
| 脱敏 | redaction | 敏感字段替换为 `[REDACTED]`，配置项 |

## 2. MCP 工具命名

MCP 工具名用动词短语（`start_recording` / `list_captures`），底层命令用点分路径：

| MCP 工具 | Bridge 命令 |
|---|---|
| `get_status` | bridge 本地（不下发） |
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
- **Bridge token 必须由用户提供**，禁止硬编码、禁止默认值、禁止示例值。所有 API 请求必须带 token；无效/缺失返回 401。
- **Bridge 端口由用户配置**，禁止硬编码；默认配置中的 `agent_bridge_url` 指向 `http://127.0.0.1:17831` 仅是占位，实际端口以用户配置为准。
- **MCP 不自动脱敏、不自动摘要、不自动过滤**。工具层不替模型做数据判断。
- **MCP 不提供删除采集 / 清空数据能力**。
- **HTML 导出必须转义动态内容**（`</script>` → `<\/script>`，`<`/`>`/`&` 全转义）。
- **type=password input 永远不被采集**（`value_status: 'not_captured'`）。
- **脱敏与截断分离**：`redact_data` 控制脱敏；payload size limit（`max_body_capture_bytes` / `inline_text_max_bytes` / console args 1KB / target_text 100 字符）永远生效，不受脱敏开关影响。
- **所有事件 store 用 `event_id`（UUID）作 keyPath**，`capture_id` 作索引，避免复合主键碰撞。
- **IndexedDB Console 和 Error 分两个独立 store**（`console.error()` ≠ 运行时异常）。
- **停止采集时强制 flush 所有未写入数据**，再更新 status。
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
| target_text 预览 | 100 字符 | `MAX_TARGET_TEXT_CHARS` |
| flush 批次 | 100 条 | `FLUSH_BATCH_SIZE` |
| flush 间隔 | 1000 ms | `FLUSH_INTERVAL_MS` |

数据库 `capture_all_db`，`DB_VERSION = 3`，10 stores。详见 `specs/storage_indexeddb.md`。

## 7. 超时策略（Bridge）

| 命令类 | 超时 |
|---|---|
| 查询类（list/get/timeline/sources） | 30 s |
| 全量类（get_all_data） | 120 s |
| 导出类（export） | 120 s |
| start / stop | 15 s |

超时只返回错误码，不自动降级。

## 8. 错误码

**Bridge 层**：`BRIDGE_UNAVAILABLE`、`EXTENSION_OFFLINE`、`COMMAND_TIMEOUT`、`TOKEN_INVALID`、`COMMAND_CANCELLED`。

**扩展层**：`CAPTURE_NOT_FOUND`、`SOURCE_NOT_FOUND`、`RECORD_NOT_FOUND`、`INVALID_QUERY`、`CAPTURE_ALREADY_RUNNING`、`NO_ACTIVE_CAPTURE`、`EXPORT_FAILED`、`STORAGE_READ_FAILED`、`PAYLOAD_TOO_LARGE`。
