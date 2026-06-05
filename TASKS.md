# Record All — 待完成任务

已完成任务见：`docs/archive/record_all_completed_tasks.md`

## 七、导出格式

### 7.3 导出文件位置与路径选择 — ✅ 已完成
- 已完成：导出 JSON / JSONL / HTML / HAR 使用 `chrome.downloads.download({ saveAs })`，默认允许用户选择保存位置
- 已完成：设置面板允许配置导出目录和文件名模板
- 说明：Chrome 扩展只能指定下载目录内的相对路径；固定绝对路径仍由浏览器保存对话框决定
- 文件名模板支持 `{session_id}` / `{date}` / `{ext}`

### 7.4 导出数据追加系统时间字段 — ✅ 已完成
- 已完成：JSON / JSONL / HTML / HAR 导出保留原始时间字段，并追加可读系统时间字段
- 已完成：`session.start_time` / `session.end_time` 追加 `*_system_time`
- 已完成：事件、网络请求、控制台日志的 `absolute_time` 追加 `absolute_time_system_time`
- 已完成：HAR 保留标准 ISO 时间，并追加 `_startedDateTimeSystemTime`
- 系统时间按用户设置的时区格式化

## 十、设置完善

### 10.4 时间显示与系统时区设置 — ✅ 已完成
- 已完成：设置面板新增详情页时间显示模式
  - 相对时间：按录制开始时间计算，例如 `0:01.234`
  - 系统时间：按用户设置的时区显示真实时间
- 已完成：用户可设置系统时间使用的时区；默认跟随浏览器 / 系统时区
- 已完成：支持 UTC 和中国时间（UTC+8 / Asia/Shanghai）
- 已完成：详情页、HTML 导出、JSON / JSONL / HAR 导出中的系统时间字段使用同一设置
- 设置值存 `chrome.storage.local.user_config`

---

## 剩余优先级排序

### P0：MCP 扩展闭环（未完成）

目标：完成 `docs/superpowers/specs/2026-06-05-record-all-mcp-agent-design.md` 的 MVP，让 AI Agent 真的能通过 MCP 连接浏览器扩展，直接查询扩展 IndexedDB 数据，不依赖导出文件。

#### 11.1 扩展 bridge 配置 — ✅ 已完成
- 在 `UserConfig` 增加：
  - `agent_bridge_enabled: boolean`
  - `agent_bridge_url: string`
  - `agent_bridge_token: string`
  - `agent_bridge_poll_interval_ms: number`
- 在默认配置中提供安全默认值：默认关闭 bridge；URL 只允许本地 `127.0.0.1` / `localhost`；token 默认为空，必须用户填写或显式生成。
- 在 popup 设置区增加配置项：
  - 是否启用 MCP bridge
  - bridge URL
  - bridge token
  - poll interval
- 保存配置到 `chrome.storage.local.user_config`。
- 测试：配置默认值、保存/读取、非法 URL 拒绝或不连接。

#### 11.2 扩展 bridge client — ✅ 已完成
- 新增 `src/background/agent_bridge_client.ts`。
- 后台 service worker 根据用户配置启动/停止 bridge polling。
- 定时 POST `/extension/heartbeat`，上报：
  - extension version
  - active session
  - enabled 状态
- 定时 GET `/extension/command` 获取命令。
- 执行命令后 POST `/extension/result` 回传结果。
- 所有请求带 `Authorization: Bearer <token>`。
- 网络失败、401、超时要返回明确状态，不静默吞掉。
- 测试：heartbeat、poll command、result 回传、bridge 关闭时不请求、token 缺失时不请求。

#### 11.3 扩展命令 dispatcher — ✅ 已完成
- 新增 `src/background/agent_command_dispatcher.ts`。
- 支持设计文档中的全部命令：
  - `recording.start`
  - `recording.stop`
  - `sessions.list`
  - `sessions.get`
  - `sources.list`
  - `records.list`
  - `records.get`
  - `timeline.list`
  - `timeline.get`
  - `session.get_all_data`
  - `session.export`
- dispatcher 只调用现有录制、存储、导出能力，不在工具层默认脱敏、过滤、摘要或删除字段。
- 错误必须用明确错误码：`SESSION_NOT_FOUND`、`SOURCE_NOT_FOUND`、`RECORD_NOT_FOUND`、`INVALID_QUERY`、`EXPORT_FAILED`、`STORAGE_READ_FAILED` 等。
- 测试：每个命令至少覆盖成功路径和一个错误路径。

#### 11.4 扩展数据查询 API — ✅ 已完成
- 新增 `src/background/agent_data_queries.ts`。
- 实现 `list_data_sources(session_id)`：
  - 返回 `record_events`、`network_requests`、`console_logs`、`error_logs` 等实际存在 source。
  - 返回每个 source 的 count、time_range、types。
- 实现 `list_records(session_id, source, offset?, limit?, start_time?, end_time?, order?)`：
  - offset 从 0 开始。
  - index 从 1 开始。
  - 支持 asc / desc。
  - 返回粗略列表：record_id、source、index、time、absolute_time、type、summary、preview。
- 实现 `get_record(session_id, source, record_id)`：
  - 返回完整原始记录。
  - 不截断、不脱敏、不删除字段。
- 实现 `get_timeline(session_id, sources?, offset?, limit?, start_time?, end_time?, order?)`：
  - 合并多个 source。
  - 按时间排序。
  - 返回可继续深挖的 record_id / item_id。
- 实现 `get_timeline_item(session_id, item_id)`：
  - 等价于按 source + record_id 获取详情。
- 实现 `get_all_session_data(session_id)`：
  - 返回完整 session 和所有 source 数据。
  - 不强制分页、不自动摘要、不自动脱敏。
  - 大数据、超时、读取失败时返回明确错误，不静默降级。
- 测试：source 统计、分页、时间范围、顺序、record_id 稳定性、timeline 合并排序、全量读取。

#### 11.5 MCP 真实闭环验证 — ✅ 已完成
- Bridge server 启动正常，API 端点全部响应正确
- Playwright E2E 11/11 测试通过：health、heartbeat/online、sessions.list、recording.start/stop、sources.list、session.get_all_data、export、sessions.get、auth rejection
- 修复了 CORS headers（bridge 缺少 Access-Control-Allow-Origin）
- 修复了 heartbeat body（需要 extension_version + active_session_id）
- 分析路径直接通过扩展 API / IndexedDB 获取数据，不通过导出文件

#### 11.6 `record-all-agent` skill 文档 — ✅ 已完成
- 新增 `docs/superpowers/skills/record-all-agent.md`。
- 写明推荐调用顺序：
  1. `get_status()`
  2. `list_sessions()`
  3. `list_data_sources(session_id)`
  4. `get_timeline(session_id, limit=20)`
  5. `list_records(session_id, source, offset, limit)`
  6. `get_record(session_id, source, record_id)`
  7. 必要时 `get_all_session_data(session_id)`
  8. 用户需要文件时 `export_session(session_id, format)`
- 写明风险：
  - `start_recording` / `stop_recording` 会改变录制状态。
  - `get_all_session_data` 可能返回大量数据，可能超时或爆上下文。
  - headers、cookies、body、storage 可能包含敏感信息。
  - `export_session` 会生成文件。
  - 列表 API 只是粗略 preview，详情必须用 `get_record`。
- 明确原则：skill 只说明能力和风险；不替模型限制调用；模型按用户任务自行决定。

#### 11.7 MCP/bridge 测试补齐 — ✅ 已完成
- Bridge 单测：命令队列、token、超时、heartbeat
- MCP 单测：工具转发、错误透传
- 扩展单测：source 统计、records list/get、timeline、full data、dispatcher、bridge client（141 tests）
- Playwright E2E：启动 bridge + Chrome extension，11/11 全过
- 修复了 CORS 和 heartbeat body 后闭环验证通过

### P1：目录重组收尾（待确认）

#### 12.1 docs archive 移动状态收尾 — ✅ 已完成
- `docs/errors.md` → `docs/archive/errors.md`
- `docs/review_gpt.md` → `docs/archive/review_gpt.md`
- `docs/review_mimo.md` → `docs/archive/review_mimo.md`
- `docs/superpowers/skills/record-all-agent.md`：修正 MCP 工具名（`recording_start` → `start_recording` 等），与 `src/agent/mcp/tools.ts` 对齐
- `docs/design/design_ai_brief.md`：更新所有文件路径引用从旧目录结构到 `src/` 目录
