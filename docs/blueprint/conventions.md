# 约定（内容细节）

行为规则和工作顺序见 `AGENTS.md`。本文只定义各类文档字段、命名和记录格式；流程不再重复，需要时引用 AGENTS.md 对应 step。

## 命名与格式

- 变量、函数、文件名、目录名、slug 一律 `snake_case`。
- 例外：`AGENTS.md`、`CLAUDE.md`、`README.md` 等既定大写文件名。
- `TNNN_`、`SNN_` 是工作项类型前缀例外；前缀后 slug 仍使用小写 `snake_case`。
- 类型 / 接口 / 类名 `PascalCase`（`CaptureRecord` / `CaptureEvent`）。
- 常量 `UPPER_SNAKE_CASE`（`MAX_BODY_CAPTURE_BYTES` / `DB_VERSION`）。
- 布尔变量用 `is_` / `has_` / `should_` 前缀。
- Markdown 嵌套内容缩进 4 空格，禁止 tab。
- 行尾不留空白；文件末尾保留一个换行。
- 时间戳统一使用中国时间，格式 `YYYY-MM-DD HH:MM UTC+8`。
- TypeScript strict mode。

## task 文件模板

所有 active task 固定使用以下文件。任务很小时内容可以简短，但不合并文件。创建与使用流程见 AGENTS.md 单 task 流程。

| 文件 | 字段 |
|------|------|
| `spec.md` | 背景；范围；非范围；验收标准；依赖与约束 |
| `plan.md` | 步骤及验证；风险与回退；完结时需更新的 blueprint 条目 |
| `log.md` | 进展；踩坑；中途决策；偏离 plan 的原因；关键验证结果 |
| `review_code.md` | task review 报告（文档+代码 agent 写） |
| `review_test.md` | task review 报告（测试 agent 写） |
| `adoption.md` | review 处置清单 |
| `task_report.md` | task 完结报告 |

- `log.md` 记录有追溯价值的事项，不写命令流水账。

## review 报告字段

`review_code.md` / `review_test.md` 共用以下字段；流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。

- task：`TNNN_slug`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：`文档+代码` / `测试`
- reviewed_at：`YYYY-MM-DD HH:MM UTC+8`
- findings：分类别前缀的 `TNNN_code_fNNN` / `TNNN_test_fNNN`，每条含严重度、位置、问题、建议
- conclusion：本 agent 总体判断

`reviewer_focus` 与 finding 前缀映射：`文档+代码` → `code`，`测试` → `test`。

## adoption 字段

`adoption.md` 字段表；处置流程见 AGENTS.md step 7。

| finding_id | decision | rationale | status |
|------------|----------|-----------|--------|
| TNNN_code_f001 | 采纳 / 不采纳 | {一句话理由} | 已修 / 遗留 / 无需修改 |

字段说明：

- `decision`：采纳 / 不采纳。
- `rationale`：一句话理由；`遗留` 项在此写未修原因。
- `status`：
    - `已修`：在本 task commit 内修复。
    - `遗留`：未在本 commit 修复。
    - `无需修改`：不采纳项专用。

## specs_index 字段

`docs/specs_index.md` 字段表；首次写入规则与状态流转见 AGENTS.md。

| slug | 状态 | task 清单 | spec 路径 | 归档路径 |
|------|------|----------|----------|---------|
| `<slug>` | active / done / dropped | T001, T002 | `docs/specs/<slug>.md` | `docs/archive/specs/<slug>.md` |

## spike 文件模板

`report.md` 包含：问题；成功判据；尝试；证据；结论；是否采纳；后续 task ID。

实验代码存在时创建 `code/`。实验代码入库保留，仅作为验证材料。

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
- 修 bug 时在对应测试层补回归用例，文件名带任务 ID，如 `tests/unit/T042_empty_token.test.ts`。

## 浏览器扩展 API 规范

### 消息通信

- Popup / Dashboard 与 Service Worker 通过 `chrome.runtime.sendMessage` 通信。
- 请求统一形如 `{ action: string, payload?: {...} }`，响应统一 `{ success: boolean, data?: {...}, error?: string }`。
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

- commit message 格式 `<type>(<task_id>): <description>`，type：feat / fix / refactor / docs / test / chore / perf / ci。task_id 如 `T091`。
- 改代码后检查 `docs/` 与 `AGENTS.md` 是否受影响，一并更新。
- 生成物放 `artifacts/`，不入版本库。
