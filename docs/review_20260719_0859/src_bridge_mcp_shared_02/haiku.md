# src_bridge_mcp_shared_02 独立审阅报告

**模型**：haiku
**审阅范围**：`MANIFEST.md` 中 `src_bridge_mcp_shared_02` 批次，共 12 文件、1837 行
**审阅依据**：源文件 + `docs/blueprint/domain.md` + `docs/blueprint/conventions.md`
**日期**：2026-07-19

---

## 1. 模型依据

本次审阅直接阅读全部 12 个源文件以及项目领域模型（domain.md）和编码约定（conventions.md）。未参考任何其他审阅报告。核心校验维度：

- 领域术语合规：禁用术语（session/record/录制/记录）是否仍出现在代码中，对照 domain.md 第 4 节
- 业务不变量一致性：错误码、分类映射、存储常量的值与 domain.md 是否一致
- 类型完备性：分类映射函数是否覆盖 types.ts 中所有 EventType
- 逻辑正确性：边界条件、函数行为、脱敏策略合理性
- 编码规范：命名、缩进、文件组织

---

## 2. 高优先级

### 2.1 `event_category.ts` — 4 个 capture_lifecycle 事件类型映射缺失

- **位置**：`src/shared/event_category.ts:15`
- **现象**：`capture_config_changed`、`permission_missing`、`debugger_attach_status`、`body_capture_status_changed` 在 `category_for_event_type()` 中没有显式分支。这些类型不在 `USER_ACTION_TYPES`、`NAVIGATION_TYPES`、`ERROR_TYPES` 任一集合中，且 `capture_started`/`capture_stopped` 的判断条件（L15）未包含它们，最终落入 L16 `return 'dom_data'` 兜底。
- **影响**：`types.ts` 中 `CaptureEventDataMap`（L574-L579）将这些类型明确绑定到 `CaptureConfigChangedData`、`PermissionMissingData`、`DebuggerAttachStatusData`、`BodyCaptureStatusChangedData`，它们属于 `capture_lifecycle` 类别。当前行为导致运行时被错误归类为 `dom_data`，影响 IndexedDB 写入路由、统计计数 `CaptureStats`、仪表盘 UI 过滤及 MCP 查询结果。
- **建议**：在 L15 条件中补充这四种类型，或将 `capture_lifecycle` 类型独立为一个 SET 进行匹配。
- **置信度**：高（types.ts 和 event_category.ts 对照即可验证）
- **级别**：高

### 2.2 `protocol.ts` — 3 个错误码使用禁用术语

- **位置**：`src/shared/protocol.ts:23-28`
- **现象**：
  - `SESSION_NOT_FOUND`（L23）：domain.md 第 8 节扩展层对应错误码为 `CAPTURE_NOT_FOUND`
  - `RECORDING_ALREADY_RUNNING`（L27）：domain.md 对应 `CAPTURE_ALREADY_RUNNING`，且 domain.md 第 4 节明确禁止 "record/录制/记录" 作为产品术语
  - `NO_ACTIVE_RECORDING`（L28）：domain.md 对应 `NO_ACTIVE_CAPTURE`
- **影响**：违反 domain.md 第 4 节禁用术语规则。MCP 客户端或 Bridge 代码若按 domain.md 记载的正确错误码进行匹配，这些枚举值将无法被识别，错误处理路径失败。
- **建议**：`SESSION_NOT_FOUND` 改为 `CAPTURE_NOT_FOUND`，`RECORDING_ALREADY_RUNNING` 改为 `CAPTURE_ALREADY_RUNNING`，`NO_ACTIVE_RECORDING` 改为 `NO_ACTIVE_CAPTURE`。同步检查所有引用这些枚举值的代码（`agent_bridge_client.ts`、`agent_command_dispatcher.ts`、`server.ts` 等）。
- **置信度**：高
- **级别**：高

### 2.3 `constants.ts` — `MAX_SESSION_SIZE_BYTES` / `MAX_SESSION_DURATION_MS` 使用禁用术语

- **位置**：`src/shared/constants.ts:20-21`
- **现象**：常量名含 `SESSION`。domain.md 第 4 节明确禁止 "session" 作为产品术语，应使用 "capture"。domain.md 第 6 节自身也使用了旧名，但常量层面应引领修正。
- **影响**：命名污染。虽然 domain.md 自身未更新，但常量是代码层面的事实标准，应率先修正。
- **建议**：重命名为 `MAX_CAPTURE_SIZE_BYTES` 和 `MAX_CAPTURE_DURATION_MS`，同步更新 domain.md 第 6 节及所有引用处（`redaction.ts`、`types.ts`、各 extension 模块）。
- **置信度**：高
- **级别**：高

---

## 3. 中优先级

### 3.1 `types.ts` — 数据子类型的 `capture_id` / `event_id` 均为可选

- **位置**：`src/shared/types.ts:320-321`（`NetworkRequestData`）、`:387-388`（`ConsoleEventData`）、`:458-459`（`StorageChangeData`）、`:476-477`（`CookieChangeData`）、`:404-405`（`RuntimeExceptionData`）
- **现象**：所有数据子类型中 `capture_id?: string` 和 `event_id?: string` 为可选字段，而 `CaptureEvent` 基类型（L50-51）中这两个字段为必填。
- **影响**：类型系统不强制赋值，入库时可能产生无归属数据。数据子类型独立声明可选字段，TypeScript 不报告与基类型的不一致，但运行时若入库前的赋值路径遗漏，将产生孤儿记录。
- **建议**：评估是否可改为必填；或至少增加运行时校验确保入库前已赋值。
- **置信度**：中
- **级别**：中

### 3.2 `protocol.ts` — `TARGET_AMBIGUOUS` / `LABEL_DUPLICATE` 未在 domain.md 记录

- **位置**：`src/shared/protocol.ts:35-36`
- **现象**：`TARGET_AMBIGUOUS` 和 `LABEL_DUPLICATE` 两个错误码存在于 protocol.ts 但 domain.md 第 8 节错误码列表中未收录。
- **影响**：domain.md 作为唯一真相源不完整，后续维护者可能不知道这些错误码的存在或语义。
- **建议**：在 domain.md 第 8 节补录这两个错误码及含义。
- **置信度**：高
- **级别**：中

### 3.3 `logger.ts` — `MessageLogTransport` 违反 `LogTransport` 接口契约

- **位置**：`src/shared/logger.ts:114-124`
- **现象**：`MessageLogTransport.get_entries()`、`.count()`、`.clear()` 均直接 `throw new Error(...)`。而 `LogTransport` 接口（L4-10）声明这些方法返回 `Promise<AppLogEntry[]>` / `Promise<number>` / `Promise<void>`，类型签名暗示它们应当可用。
- **影响**：任何持有 `LogTransport` 引用并调用这三个方法的代码在运行时崩溃。当前可能无调用方，但接口设计暗示这些方法是合法操作。
- **建议**：将 `LogTransport` 拆分为 `LogWriter`（write + flush）和 `LogReader`（get_entries + count + clear），让 `MessageLogTransport` 只实现 writer；或至少返回 rejected Promise 而非同步 throw 以保持异步一致性。
- **置信度**：中
- **级别**：中

### 3.4 `redact_url` — OAuth2 常用敏感参数缺失

- **位置**：`src/shared/redaction.ts:11` — `SENSITIVE_URL_PARAMS`
- **现象**：当前仅含 `['token', 'key', 'secret', 'password', 'auth']`，使用精确匹配（`URL.searchParams.has(param)`）。OAuth2 / OpenID Connect 标准参数 `access_token`、`id_token`、`refresh_token`、`code`、`client_secret` 均不被匹配（如 `access_token` 不会被 `'token'` 精确匹配到）。对比同文件 `redact_headers()` 的 `SENSITIVE_HEADER_PATTERNS`（L9）使用子串匹配（`.includes(pattern)`），覆盖更广。
- **影响**：非标准参数名的 OAuth token 经过 URL query string 时不被脱敏，可能被记录到 `NetworkRequestData.url` 并在导出中泄露。
- **建议**：扩展 `SENSITIVE_URL_PARAMS` 列表（加入 `access_token`、`id_token`、`refresh_token`、`code`、`client_secret`、`api_key`），或考虑改用子串匹配策略以覆盖更多变体。需评估 `code` 和 `state` 的误报风险（如 `code` 匹配 `zipcode`）。
- **置信度**：高
- **级别**：中

### 3.5 `user_config.ts` — 半时区（:30/:45 偏移）映射为整时区，丢失精度

- **位置**：`src/shared/user_config.ts:10-360`（`IANA_TO_OFFSET` 表）及 `types.ts:652`（`SystemTimeTimezone` 类型仅含整小时偏移）
- **现象**：以下条目被映射到错误整数偏移：
  - `Asia/Kathmandu`（实际 UTC+5:45）映射到 `UTC+5`，偏差 45 分钟
  - `Australia/Adelaide`（实际 UTC+9:30 / +10:30 DST）映射到 `UTC+9`，偏差 30-90 分钟
  - `Australia/Broken_Hill`（实际 UTC+9:30）映射到 `UTC+9`，偏差 30 分钟
  - `Australia/Darwin`（实际 UTC+9:30）映射到 `UTC+9`，偏差 30 分钟
  - `Australia/Eucla`（实际 UTC+8:45）映射到 `UTC+8`，偏差 45 分钟
  - `Pacific/Chatham`（实际 UTC+12:45 / +13:45 DST）映射到 `UTC+12`，偏差 45-105 分钟
  - `Pacific/Marquesas`（实际 UTC-9:30）映射到 `UTC-9`，偏差 30 分钟
- **影响**：这些时区用户（尼泊尔、南澳、中澳、查塔姆群岛、法属波利尼西亚）的导出时间戳偏差 30-105 分钟。
- **建议**：属于 P0.34 从 IANA 迁移到固定偏移的已知设计取舍。可在 decisions.md 中记录此限制。
- **置信度**：高
- **级别**：中

### 3.6 `DEFAULT_CONFIG` 与 `DEFAULT_USER_CONFIG` 的 `keyboard_capture_mode` 默认值不一致

- **位置**：`src/shared/constants.ts:33`（`DEFAULT_CONFIG.keyboard_capture_mode: 'shortcuts'`）vs `:47`（`DEFAULT_USER_CONFIG.keyboard_capture_mode: 'none'`）
- **现象**：CaptureConfig（采集级配置）默认 `'shortcuts'`，UserConfig（用户全局配置）默认 `'none'`。字段语义相同，类型相同，但默认值不同。
- **影响**：新用户首次采集时实际行为取决于采集启动时的 config 合并逻辑。若合并逻辑优先取 UserConfig，则实际按键采集为 none；若以 CaptureConfig 覆盖，则为 shortcuts。不一致造成行为不可预测。
- **建议**：统一默认值（建议 `'none'`，隐私更保守），或添加注释说明差异原因。
- **置信度**：中（需检查采集启动流程中的合并逻辑确认实际影响）
- **级别**：中

---

## 4. 低优先级

### 4.1 `redaction.ts` — 响应头值脱敏过于激进，可能误判

- **位置**：`src/shared/redaction.ts:43-45`
- **现象**：`SENSITIVE_HEADER_PATTERNS.some(pattern => lower_value.includes(pattern))` 检查 header 值中是否包含 "token"、"key"、"secret"、"bearer" 子串。由于 header key 已在 L40-42 做了子串匹配（对 key），对 value 的额外匹配可能误伤（如 `x-request-id: req-token-abc123`、`x-cache-key: cache-hit`）。
- **影响**：合法 header 值被标记为 `[REDACTED]`，丢失调试信息。
- **建议**：移除对 header value 的模糊匹配，仅保留对 key 的检查；或将 value 匹配限制为更精确的模式（如 `/^bearer\s+/i`）。
- **置信度**：中
- **级别**：低

### 4.2 `system_time.ts` — `get_locale_formatter` 名称和注释与实现不一致

- **位置**：`src/shared/system_time.ts:46-66`
- **现象**：函数名为 `get_locale_formatter`，注释说 "For browser path, use no timeZone option / For UTC, use 'UTC'"，但代码始终硬编码 `timeZone: 'UTC'`，参数 `_user_offset_minutes` 以 `_` 前缀标记未使用。实际调用方（L94）仅在 offset===0 时调用此函数，行为正确但命名误导。
- **影响**：未来维护者可能误用此函数于非 UTC 场景。
- **建议**：重命名为 `get_utc_formatter`，更新注释。
- **置信度**：高
- **级别**：低

### 4.3 `event_utils.ts` — `frame_id` 默认值为 0（与"未知"语义冲突）

- **位置**：`src/shared/event_utils.ts:48`
- **现象**：`frame_id: params.frame_id ?? 0`。Chrome extension API 中 frame ID 0 是 top-level frame 的合法值，用 0 作为"未传入"的默认值导致无法区分"确实是 top frame"和"frame 信息缺失"。
- **建议**：改为 `frame_id: params.frame_id ?? -1`，或修改类型为 `number | null`。
- **置信度**：中
- **级别**：低

### 4.4 `event_utils.ts` 与 `id.ts` — 重复的随机字符串生成逻辑

- **位置**：`src/shared/event_utils.ts:6-10`（`random_chars`）、`src/shared/id.ts:3-7`（`random_suffix`）
- **现象**：两个函数实现完全相同（`Math.random().toString(36).slice(2, 2+len)` + 补零循环）。
- **建议**：合并为一个共享函数，或从 `id.ts` 导出复用。
- **置信度**：高
- **级别**：低

### 4.5 `save_user_config()` — read-modify-write 竞态条件

- **位置**：`src/shared/user_config.ts:404-408`
- **现象**：`save_user_config` 先 `load_user_config()`（读）再 `chrome.storage.local.set()`（写），非原子操作。两个并发调用（如 popup 和 settings 页同时修改不同字段）时，后完成的写入覆盖先完成的写入。
- **影响**：Chrome 扩展中 popup 和 dashboard 可能同时打开，概率低但存在。丢失用户设置变更。
- **建议**：改用 `chrome.storage.local.get` 直接 merge，或使用乐观锁（version 字段）。
- **置信度**：中
- **级别**：低

### 4.6 `truncate()` — 多字节 UTF-8 字符边界切割可能产生 U+FFFD

- **位置**：`src/shared/redaction.ts:70-77`
- **现象**：`bytes.slice(0, max_bytes)` 可能在多字节 UTF-8 字符中间切割。`TextDecoder.decode()` 对不完整序列输出替换字符 U+FFFD（�）。如中文字符 "你"（UTF-8 E4 BD A0，3 字节），若 `max_bytes` 切掉第 3 字节，结果为 `�`。
- **影响**：截断处最后一个字符可能显示为乱码替代符，但 `...[TRUNCATED]` 后缀明确标注了截断，不影响下游理解。`MAX_CONSOLE_ARG_BYTES=1024`，中文字符约 3 字节/字，截断概率约 1/3。`MAX_BODY_CAPTURE_BYTES=100MB`，尾部单字符损坏可忽略。
- **建议**：低优先级，可考虑截断前回溯到上一个完整 UTF-8 字符边界。
- **置信度**：中
- **级别**：低

### 4.7 `Logger.write()` — Error 对象转换不捕获 `cause` 属性

- **位置**：`src/shared/logger.ts:46-52`
- **现象**：`details` 为 `Error` 实例时只序列化 `name`、`message`、`stack`。ES2022 引入的 `cause` 属性（`new Error('msg', { cause: originalError })`）不被捕获。Chrome MV3 支持 `Error.cause`。
- **影响**：使用 `cause` 链式传递的错误根源在日志中丢失。
- **建议**：递归序列化 `cause` 链（控制深度防循环），或至少包含 `cause.message`。
- **置信度**：高
- **级别**：低

### 4.8 `protocol.ts` — `parse_record_id` 对含多余冒号的 record_id 静默产生错误结果

- **位置**：`src/shared/protocol.ts:137-147`
- **现象**：`parse_record_id` 使用 `indexOf(':')` 获取第一个冒号位置分割 source 和 native_id。若 native_id 本身包含冒号（如 URL），返回的 native_id 不完整。当前 source 值（store name）不含冒号，实际不受影响，但属于稳健性隐患。
- **建议**：在文档中约定 source 不含冒号，或使用更健壮的解析。
- **置信度**：中
- **级别**：低

### 4.9 `constants.ts` — `STORE_NAMES` 对象为 `as const` 但值未在类型层面约束

- **位置**：`src/shared/constants.ts:7-18`
- **现象**：`STORE_NAMES` 使用 `as const` 获得字面量类型，但 IndexedDB store 名称与 `category_for_event_type()` 返回的 `CategoryKey` 之间无编译期映射。新增 category 或 store 时容易遗漏同步。
- **建议**：非紧急。可考虑建立 `CategoryKey → store_name` 的编译期映射表。
- **置信度**：高
- **级别**：低

---

## 5. 建议

1. **最优先**：修复 `event_category.ts` 缺失的 4 个 lifecycle 事件映射（第 2.1 节），这是运行时数据归类错误。
2. **次优先**：修复 `protocol.ts` 中 3 个禁用术语错误码（第 2.2 节）和 `constants.ts` 中 2 个 `SESSION` 常量名（第 2.3 节）。
3. **domain.md 同步**：补录 `TARGET_AMBIGUOUS` 和 `LABEL_DUPLICATE` 错误码（第 3.2 节）；记录固定偏移不处理 DST 和半时区精度的限制（第 3.5 节）。
4. **类型收紧**：评估数据子类型的 `capture_id`/`event_id` 从可选改为必填的可行性（第 3.1 节）。
5. **URL 脱敏增强**：扩展 `SENSITIVE_URL_PARAMS` 覆盖 OAuth2 常用参数（第 3.4 节）。
6. **接口重构**：`LogTransport` 拆分为读写两个接口（第 3.3 节）。

---

## 6. 不确定项

1. **禁用术语改名的影响面**：`SESSION_NOT_FOUND`、`RECORDING_ALREADY_RUNNING`、`NO_ACTIVE_RECORDING`、`MAX_SESSION_SIZE_BYTES`、`MAX_SESSION_DURATION_MS` 的改名需要全局搜索所有引用点（extension、bridge、mcp、E2E 测试），确认影响范围后方可执行。

2. **`escape_for_html_embed` 中的 `<` 全量编码**：当前实现对 `</script>` 做专门处理后仍对 `<` 做全量转义，输出 `<\/script>`。从 HTML 规范看是安全的，但建议在安全评审中二次确认 JSON embedded in `<script>` 的边缘场景。

3. **`RECORD_NOT_FOUND` 的 "record" 语义**：domain.md 第 4 节将 "record" 列为禁用术语，但第 8 节又将其作为有效错误码。此处 "record" 指数据记录（data record，如单条网络请求），非产品术语。需在 domain.md 中澄清此区分。
