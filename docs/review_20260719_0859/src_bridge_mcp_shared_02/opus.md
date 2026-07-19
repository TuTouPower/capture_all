# Review opus — src_bridge_mcp_shared_02

- reviewer：opus (model_override_authorized)
- focus：correctness / 安全 / 类型 / 脱敏 / 配置 / 时间处理
- target：`src/shared/constants.ts`、`src/shared/escape.ts`、`src/shared/event_category.ts`、`src/shared/event_utils.ts`、`src/shared/hash.ts`、`src/shared/id.ts`、`src/shared/logger.ts`、`src/shared/protocol.ts`、`src/shared/redaction.ts`、`src/shared/system_time.ts`、`src/shared/types.ts`、`src/shared/user_config.ts`（共 12 文件，1837 行）
- target_owner：—
- branch：main
- base_commit：工作区
- head：工作区
- reviewed_at：2026-07-19 08:59 UTC+8

reviewer 对 target 只读，只能写本报告。结论仅适用于上述改动快照。

## Findings

### opus_f001 — MAX_SESSION_DURATION_MS 定义但从未强制执行

- 严重度：medium
- 位置：`src/shared/constants.ts:21`
- 问题：`MAX_SESSION_DURATION_MS = 24 * 60 * 60 * 1000` 在仓库内仅出现于定义处（`grep -rn MAX_SESSION_DURATION_MS src/ tests/` 无其他引用）。类型层 `CaptureStoppedData.reason`（types.ts:506）保留 `'max_duration'` 语义，storage.ts 强制了 `MAX_SESSION_SIZE_BYTES`（L445），但持续时间路径没有任何触发点。24h 上限形同虚设，采集可无限延长，与 blueprint 中"单次采集 24 小时上限"语义不符。
- 影响：长期采集无法自停，磁盘与 IndexedDB 持续增长，用户若忘记停止会导致资源累积。
- 建议：在 service_worker 主循环或 capture lifecycle 守护逻辑中加入 `Date.now() - started_at_ms >= MAX_SESSION_DURATION_MS` 判断，触发 `stop_capture({ reason: 'max_duration' })`；或在 constants.ts 注释中明确该常量为 UI/规划用途、不强制。二选一，避免声明与行为不一致。
- 置信度：高
- 级别：medium

---

### opus_f002 — event_category 漏分类四种 capture_lifecycle 事件

- 严重度：medium
- 位置：`src/shared/event_category.ts:15`
- 问题：types.ts:124-130 在 EventType 联合中声明了 5 个 capture_lifecycle 类型：`capture_started`、`capture_stopped`、`capture_config_changed`、`permission_missing`、`debugger_attach_status`、`body_capture_status_changed`。`category_for_event_type` 仅把前 2 个归入 `'capture_lifecycle'`，后 4 个未匹配，fallback 到 `'dom_data'`（L16）。当前仓库无 emit 这 4 类事件的代码（grep 无产生点），属预留路径，但一旦后续使用，统计口径与 UI 标签分类会错。
- 影响：未来 emit `permission_missing` / `debugger_attach_status` 等事件时，会被计入 dom_data 分类，dashboard 统计偏离。
- 建议：L15 改为 `if (type.startsWith('capture_') || type === 'permission_missing' || type === 'debugger_attach_status') return 'capture_lifecycle';` 或显式列出全部 6 个类型。
- 置信度：高
- 级别：medium

---

### opus_f003 — migrate_iana_timezone 对超出 ±12 的偏移地区 fallback 为 browser

- 严重度：medium
- 位置：`src/shared/user_config.ts:291, 297, 305, 306, 322, 357, 358`
- 问题：`IANA_TO_OFFSET` 中存在目标值超出 `VALID_UTC_OFFSETS` 集合（最大 ±12）的映射：
  - L291 `'Pacific/Apia': 'UTC+13'`
  - L297 `'Pacific/Fakaofo': 'UTC+13'`
  - L305 `'Pacific/Kanton': 'UTC+13'`
  - L306 `'Pacific/Kiritimati': 'UTC+14'`
  - L322 `'Pacific/Tongatapu': 'UTC+13'`
  - L357 `'Etc/GMT-13': 'UTC+13'`
  - L358 `'Etc/GMT-14': 'UTC+14'`

  `migrate_iana_timezone`（L370-375）逻辑：先 `VALID_UTC_OFFSETS.has(value)` 不命中，再 `IANA_TO_OFFSET[value]` 得到 `'UTC+13'`，再 `VALID_UTC_OFFSETS.has('UTC+13')` 仍不命中，最终 fallback 返回 `'browser'`。系统时区声明上限为 UTC+12，这些映射值实际永远无法被采纳。
- 影响：萨摩亚、托克劳、基里巴斯、汤加等 UTC+13/+14 地区的旧 IANA 配置无法迁移到固定偏移，只能 fallback 到浏览器本地时区。若用户浏览器所在系统时区设置偏差，时间显示可能与预期不符。
- 建议：明确取舍——
  - 方案 A：扩展 `SystemTimeTimezone` 联合（types.ts:652）与 `VALID_UTC_OFFSETS` 加入 UTC+13 / UTC+14。
  - 方案 B：在 IANA_TO_OFFSET 中将这些条目映射到最近的合法值（`UTC+12`），并在注释说明精度损失。
  - 方案 C：删除这些无效映射条目，注释说明范围限制。
  任选其一，消除"声明值不可能被采纳"的隐性 bug。
- 置信度：高
- 级别：medium

---

### opus_f004 — 半小时偏移时区被截断为整点，无文档提示

- 严重度：low
- 位置：`src/shared/user_config.ts:129, 172, 175, 177, 205, 215, 230, 231, 234, 310` 等
- 问题：系统时区模型（types.ts `SystemTimeTimezone`）只支持整点偏移，但 IANA 映射对半小时偏移地区做了静默截断：
  - `America/St_Johns` (UTC−3:30) → `UTC-3`
  - `Asia/Yangon` (UTC+6:30) → `UTC+6`
  - `Asia/Kabul` (UTC+4:30) → `UTC+4`
  - `Asia/Kathmandu` (UTC+5:45) → `UTC+5`
  - `Asia/Kolkata` (UTC+5:30) → `UTC+5`
  - `Australia/Eucla` (UTC+8:45) → `UTC+8`
  - `Pacific/Chatham` (UTC+12:45) → `UTC+12`
  - `Pacific/Marquesas` (UTC−9:30) → `UTC-9`
  - `Asia/Tehran` (UTC+3:30) → `UTC+3`

  这是系统性设计限制而非 bug，但 user_config.ts 与 blueprint 均未注明此精度损失。印度（Asia/Kolkata）影响用户基数最大，迁移后时间显示会"早 30 分钟"。
- 影响：上述地区用户从 IANA 迁移后，时间戳相对真实本地时间偏移最多 45 分钟，导出文件时间戳、dashboard 时间显示都会失真。
- 建议：在 `migrate_iana_timezone` 函数文档注释或 `docs/blueprint/domain.md` 中明确说明仅支持整点偏移；或在迁移时针对半小时地区输出 logger.warn。
- 置信度：高
- 级别：low

---

### opus_f005 — MAX_SESSION_* 常量命名违反禁用术语约束

- 严重度：low
- 位置：`src/shared/constants.ts:20-21`
- 问题：`docs/blueprint/domain.md` 第 1 节明确"禁止用 record / 录制 / 记录 / session 替代"，术语应为"采集 / capture"。`MAX_SESSION_SIZE_BYTES`、`MAX_SESSION_DURATION_MS` 使用禁用术语 `SESSION` 作为产品级公共 API 常量名，违反术语约束。这与其他模块已迁移的命名（`MAX_BODY_CAPTURE_BYTES`、`FLUSH_BATCH_SIZE`）形成不一致。
- 影响：术语层污染。新代码引用 `MAX_SESSION_*` 时会延续 session 概念；MCP 调用方读到此常量名也会困惑。
- 建议：重命名为 `MAX_CAPTURE_SIZE_BYTES`、`MAX_CAPTURE_DURATION_MS`，全局替换引用点（storage.ts:22、L445）。命名变更不影响 IndexedDB 持久化数据。
- 置信度：高
- 级别：low

---

### opus_f006 — truncate 在 UTF-8 多字节字符边界切片可能产生乱码尾部

- 严重度：low
- 位置：`src/shared/redaction.ts:70-77`
- 问题：`truncate` 用 `TextEncoder().encode(str)` 取字节切片，再用 `TextDecoder().decode(bytes.slice(0, max_bytes))`。当 `max_bytes` 落在多字节字符（中文、emoji）中间时，`TextDecoder` 默认在流末尾遇到不完整字节会输出 U+FFFD replacement character。例如 `"你好"`（6 字节）截断到 4 字节会得到 `"你�"`。同时此实现对超大 body（`MAX_BODY_CAPTURE_BYTES = 100MB`）会先 encode 整个字符串到 Uint8Array（峰值内存 ×3-×4），在 SW 内存敏感环境下有压力。
- 影响：截断 body 的末尾字符可能为 U+FFFD，导致后续解析或预览显示乱码；大 body 截断时内存峰值显著。
- 建议：
  - 解码使用 `new TextDecoder('utf-8', { fatal: false })` 并接受 U+FFFD（当前行为，可保留但应在函数注释说明）。
  - 或对临界字节做回退到上一完整字符边界（找最后一个 `< 0x80 || >= 0xC0` 的位置）。
  - 大 body 场景建议流式截断而非全量 encode。
- 置信度：中（功能性影响小，性能影响视场景）
- 级别：low

---

### opus_f007 — Logger stack 切片偏移多保留一层调用栈

- 严重度：low
- 位置：`src/shared/logger.ts:61-63`
- 问题：`new Error().stack?.split('\n').slice(2).join('\n')`。V8 Error.stack 第一行是 "Error"，第二行是 `Logger.write`（private 方法），第三行才是 `Logger.debug/info/warn/error`（wrapper），第四行才是真正的调用方。`slice(2)` 保留了 wrapper 这一层，调用方实际位置是输出的第 3 行而非第 1 行。日志排查时多一层噪音。
- 影响：error 级日志的 stack trace 首行不是真正的错误抛出位置，定位时需多看一行。
- 建议：改为 `slice(3)`，或使用 `Error.captureStackTrace` 配合 `Logger.write` 之外的跳过帧（V8 专有，需评估兼容性）。
- 置信度：高
- 级别：low

---

### opus_f008 — MessageLogTransport.flush 可能死循环

- 严重度：low
- 位置：`src/shared/logger.ts:107-112`
- 问题：
  ```ts
  async flush(): Promise<void> {
      while (this.buffer.length > 0) {
          this.send_batch();
          await new Promise(r => setTimeout(r, 50));
      }
  }
  ```
  `send_batch` 是同步方法，内部 `this.buffer.splice(0)` 清空整个 buffer。第一次循环：splice 清空 buffer → sendMessage 异步入队 → setTimeout(50) → 下一轮判断 `this.buffer.length > 0`。若 50ms 内没有新 write，循环结束；若持续有新 write 且写入速度 > 每 50ms batch_size 条，理论上会持续循环。实际场景下 SW 写入频率不会这么高，但 `splice(0)` 与 `send_batch` 的 batch_size 语义不一致——`write` 时 `>= batch_size` 触发 send_batch 只 splice 20 条，flush 时 splice 全部，意味着 flush 会把 buffer 全量塞进一条 sendMessage，可能超出 SW message 大小限制。
- 影响：
  1. flush 与 write 触发的 send_batch 行为不一致（前者无批次限制）。
  2. 极端情况下单条 sendMessage 携带数万条 entry，触发 SW 消息大小限制。
- 建议：flush 内部循环按 `batch_size` 切片发送，与 write 路径一致：
  ```ts
  while (this.buffer.length > 0) {
      this.send_batch(); // 改为只 splice batch_size 条
      await new Promise(r => setTimeout(r, 50));
  }
  ```
  将 `send_batch` 改为 `splice(0, this.batch_size)`。
- 置信度：中
- 级别：low

---

### opus_f009 — generate_event_id 全局可变状态 + Math.random 非密码学强度

- 严重度：low
- 位置：`src/shared/event_utils.ts:4-20`
- 问题：
  1. `event_counter` 是模块级可变状态，SW 重启后归零。由于 `event_id = evt_<ts36>_<random6>_<counter>`，counter 归零不会导致全局碰撞（ts + 6 字符随机已足够），但 ID 排序语义（若消费方按 counter 递增假设）会失效。
  2. `Math.random()` 非密码学强度，理论碰撞概率虽低（36^6 ≈ 21 亿），但与 `hash.ts` 使用 `crypto.subtle` 的高安全标准不一致。
  3. `id.ts` 的 `generate_capture_id` 同样使用 `Math.random()`。
- 影响：ID 碰撞概率极低但非密码学保证。同一毫秒内 + 相同 6 字符随机（概率 ~1/2^31）会碰撞。
- 建议：若 ID 用于数据库 keyPath 唯一性，`Math.random` 已足够；若考虑防枚举/防碰撞，改用 `crypto.getRandomValues`。当前业务场景下可保留，但应在注释中说明非密码学强度。
- 置信度：高（行为描述准确）
- 级别：low

---

### opus_f010 — load_user_config catch 静默吞所有异常

- 严重度：low
- 位置：`src/shared/user_config.ts:399-401`
- 问题：`load_user_config` 的 try/catch 捕获所有异常并返回 `{...DEFAULT_USER_CONFIG}`，无日志输出。chrome.storage.local 读取失败（quota 超限、storage 损坏、扩展权限被收回等）时，用户配置静默丢失，表现为"配置无故恢复默认"，难以排查。
- 影响：storage 异常时无任何信号，用户与开发者均无法感知配置读取失败。
- 建议：catch 块至少 `console.warn('[user_config] load failed, using defaults:', err)`，或注入可选 logger 依赖避免循环依赖。`console.warn` 在 SW 中可写入扩展诊断，符合"日志优先"原则。
- 置信度：高
- 级别：low

---

### opus_f011 — redact_headers 对 header value 做关键词匹配易过度脱敏

- 严重度：low
- 位置：`src/shared/redaction.ts:42-44`
- 问题：脱敏逻辑对 header value 做 `lower_value.includes('token' | 'key' | 'secret' | 'bearer')` 匹配。常见合法 value 会误伤：
  - `Content-Disposition: attachment; filename="secret-report.pdf"`
  - `User-Agent: ... Bearer/1.0 ...`
  - `X-Request-ID: token-abc`（业务自定义 ID）
  - `Accept-Language: en-US,en;q=0.5,key=...`（不常见但可能）

  这些会被替换为 `[REDACTED]`，丢失原始诊断信息。
- 影响：网络请求诊断时，部分合法 header value 被误脱敏，调试困难。安全侧倾向于过度脱敏而非泄露，但影响可用性。
- 建议：移除对 value 的关键词匹配，仅按 header name 脱敏；或仅当 value 形似 JWT/long-base64 时才脱敏（更高精准度）。如果刻意保留 value 检查，应将关键词集合收紧为 `'bearer ' | 'apikey ' | 'secret='` 等更显式模式。
- 置信度：中
- 级别：low

---

### opus_f012 — parse_utc_offset 未校验 hours 范围

- 严重度：low
- 位置：`src/shared/system_time.ts:35-39`
- 问题：`/^UTC([+-])(\d{1,2})$/.exec(tz)` 只校验 1-2 位数字，不校验数值范围。`UTC+99`、`UTC+15` 会通过并返回 `99 * 60`、`15 * 60`，进入 `format_system_time` 的 `offset_minutes !== 0` 分支后，时间会偏移 15/99 小时。

  实际通过路径受限：`SystemTimeTimezone` 联合（types.ts:652）只允许 `UTC+1..UTC+12` 与 `UTC-1..UTC-12`，类型层禁止；但 `parse_utc_offset` 函数签名接受 `SystemTimeTimezone | string`，运行时若来自 storage 损坏数据或测试 fixture 传入非法字符串，无防护。
- 影响：`migrate_iana_timezone` 已保证 `VALID_UTC_OFFSETS` 集合（仅 ±1..±12），但若配置被外部写入绕过该校验，时间偏移可能超过 ±12 小时。
- 建议：在 `parse_utc_offset` 中加 `if (hours < 1 || hours > 14) return null;`（IANA 最大偏移为 UTC+14）。防御性编程，零成本。
- 置信度：高
- 级别：low

---

### opus_f013 — get_locale_formatter 缓存键设计不严谨

- 严重度：low
- 位置：`src/shared/system_time.ts:43-66`
- 问题：
  1. 参数 `_user_offset_minutes` 前缀下划线表示未使用（函数内确实没用），但仍出现在签名中，API 模糊。
  2. 函数体硬编码 `timeZone: 'UTC'`，与函数名 `get_locale_formatter` 暗示的"按用户 locale"不符。缓存键只用 `user_tz`，但由于函数体不依赖 user_tz（直接用 'UTC'），缓存实际是单例。第一次调用后所有 user_tz 共用同一 formatter。当前调用点仅 `offset_minutes === 0`（即 UTC）分支进入，行为正确，但代码意图与实现严重脱节。
- 影响：现状无功能性 bug，但维护风险高——未来若误用此函数处理非 UTC tz，会返回错误的 UTC formatter。
- 建议：简化为 `function get_utc_formatter(): Intl.DateTimeFormat`，移除两个误导性参数与缓存键比较。或彻底内联到调用点。
- 置信度：高
- 级别：low

---

### opus_f014 — escape_for_html_embed 未处理 U+2028 / U+2029

- 严重度：low
- 位置：`src/shared/escape.ts:4-10`
- 问题：`escape_for_html_embed` 用于 `<script>` 内 JSON 嵌入，转义了 `</script>`、`<`、`>`、`&`，但未处理 U+2028（LINE SEPARATOR）和 U+2029（PARAGRAPH SEPARATOR）。这两个字符在 JSON 字符串中合法，但在 JavaScript 字符串字面量中是行终止符，会导致 `JSON.parse` 之前的 JS 解析阶段抛 `SyntaxError`。导出 HTML 内联 JSON 时若原始数据含这些字符（部分中文/日文输入法、富文本粘贴可能产生），页面脚本崩溃。
- 影响：含 U+2028/U+2029 的用户内容（如剪贴板捕获）在导出 HTML 中可能导致 `<script>` 块解析失败。
- 建议：补充 `.replace(/ /g, '\\u2028').replace(/ /g, '\\u2029')`。
- 置信度：高
- 级别：low

---

### opus_f015 — CaptureEvent.source 字面量联合与 EventSource 类型重复定义

- 严重度：info
- 位置：`src/shared/types.ts:60, 132`
- 问题：L60 `source: 'content_script' | 'background'` 直接写字面量；L132 又 `export type EventSource = 'content_script' | 'background'`。两处声明相同联合，维护时需同步修改两处，违反 DRY。`event_utils.ts` 已 `import { EventSource }` 使用 L132 版本，但 CaptureEvent 接口本身用 L60 字面量。
- 影响：未来若扩展 source（如新增 `'devtools'`），需修改两处，遗漏会导致类型不一致。
- 建议：CaptureEvent.source 改为 `source: EventSource`。
- 置信度：高
- 级别：info

---

### opus_f016 — 向后兼容别名仍在使用，注释"Phase 2 后删除"过期

- 严重度：info
- 位置：`src/shared/types.ts:705-719`
- 问题：注释 "Backward-compatible aliases (temporary, remove after Phase 2)"，但实际使用点：
  - `src/extension/background/storage.ts:539-543` 仍导出 `get_session`/`list_sessions`/`update_session`
  - `src/extension/popup/popup.ts:3` 仍 `import { Session }`

  blueprint/decisions.md 显示 src 三产品重构已完成，按计划这些别名应已清理。当前处于"声明废弃但未删除"的中间状态。
- 影响：代码冗余，新人阅读时困惑。无功能影响。
- 建议：评估 popup.ts 与 storage.ts 是否能切换到新名称 `CaptureRecord`/`get_capture` 等，若可则一次性清理；若需保留兼容性，删除"remove after Phase 2"过期注释，改为"保留兼容"说明。
- 置信度：高
- 级别：info

---

### opus_f017 — protocol.ts AgentErrorCode 含禁用术语 RECORDING

- 严重度：info
- 位置：`src/shared/protocol.ts:27-28`
- 问题：`'RECORDING_ALREADY_RUNNING' | 'NO_ACTIVE_RECORDING'` 两个错误码使用禁用词 `RECORDING`。domain.md 明确"禁止用 record / 录制 / 记录"。但 `protocol.ts` 注释表示 AgentErrorCode 是协议层公共契约，重命名会破坏 MCP 客户端兼容。
- 影响：术语层污染，但协议契约稳定性优先级更高。
- 建议：在 blueprint/decisions.md 记录"AgentErrorCode 协议字段保留 RECORDING 以兼容 MCP 客户端"作为显式决策；或下一版本协议升级时改名（需提供别名兼容层）。
- 置信度：高
- 级别：info

---

### opus_f018 — protocol.ts AgentStatus 三个 @deprecated 字段无清理计划

- 严重度：info
- 位置：`src/shared/protocol.ts:122-127`
- 问题：`extension_online`、`extension_version`、`active_capture_id` 三个字段标记 `@deprecated use extensions`，但仍保留在接口中。无对应的 removal 版本/里程碑。AgentStatus 是协议返回类型，外部 MCP 客户端可能依赖这些字段。
- 影响：接口冗余，类型消费者无法判断是否应使用 deprecated 字段。
- 建议：在 decisions.md 记录 deprecated 字段的移除时间表；或评估是否可安全删除。
- 置信度：高
- 级别：info

---

## 安全专项

### SEC-1 — Bridge host 字面量类型约束
- 位置：`src/shared/protocol.ts:60`
- 结论：`AgentBridgeConfig.host: '127.0.0.1'` 字面量类型，编译期强制，无法误配为 `0.0.0.0`。符合 blueprint 硬约束。

### SEC-2 — agent_bridge_token 默认空串合规
- 位置：`src/shared/constants.ts:64`
- 结论：`DEFAULT_USER_CONFIG.agent_bridge_token = ''` 是"未设置"状态而非弱口令，token 由用户提供后覆盖。符合 CLAUDE.md "禁止助手自设默认值"约定。

### SEC-3 — redact_password 严格按 input_type 判定
- 位置：`src/shared/redaction.ts:79-83`
- 结论：`type=password` 永远脱敏，与 blueprint 硬约束一致。

### SEC-4 — chrome.storage.local 持久化 token 的明文存储
- 位置：`src/shared/user_config.ts:377-402`
- 观察：`agent_bridge_token` 通过 `chrome.storage.local.set` 明文持久化。扩展存储有 origin 隔离，但其他扩展若获 management 权限理论上可读。
- 建议：考虑用 `chrome.storage.session`（SW 生命周期内）或加密存储；如保留 local，在 docs 中明确说明威胁模型。当前为可接受设计取舍。
- 级别：info

---

## 类型专项

### TYPE-1 — CaptureEventDataMap 覆盖完整 EventType
- 位置：`src/shared/types.ts:542-580`
- 结论：33 个 EventType 全部在 `CaptureEventDataMap` 中有对应 data 类型。`TypedCaptureEvent<T>` discriminated union 设计正确。

### TYPE-2 — generate_event_id 返回值与 event_id 字段语义一致
- 位置：`src/shared/event_utils.ts:12-16`
- 结论：`evt_<ts36>_<rand6>_<counter>` 格式，符合 blueprint 中 `event_id` 全局唯一约定。

---

## 时间处理专项

### TIME-1 — format_system_time 三路径分流正确
- 位置：`src/shared/system_time.ts:71-109`
- 结论：browser / UTC / 固定偏移三分支正确。browser 用 Intl 无 timeZone，UTC 用 Intl 'UTC'，固定偏移手动算 `ms + offset * 60 * 1000` 再用 getUTC*。逻辑正确。

### TIME-2 — format_system_time 对非法 ts 有 fallback
- 位置：`src/shared/system_time.ts:72-73`
- 结论：`Number.isFinite(ms)` 校验失败时返回 `String(ts)`，避免 NaN 污染。

### TIME-3 — add_absolute_system_time 类型擦除
- 位置：`src/shared/system_time.ts:141-148`
- 观察：函数签名 `<T>(record: T): T`，内部 `record as Record<string, unknown>` 后 spread，运行时正确但类型层不安全——若 record 有 readonly 字段或复杂类型，TS 无法感知 absolute_time 被替换。
- 建议：可保留当前实现（工程务实），但函数注释应说明"仅替换 absolute_time 字段，其他字段保持引用"。
- 级别：info

---

## 配置专项

### CFG-1 — DEFAULT_CONFIG 与 DEFAULT_USER_CONFIG 字段部分重叠
- 位置：`src/shared/constants.ts:29-69`
- 观察：`DEFAULT_CONFIG`（CaptureConfig）与 `DEFAULT_USER_CONFIG`（UserConfig）共享 9 个字段（mouse_precision、keyboard_capture_mode、capture_input_values、capture_request_body、capture_response_body、max_body_capture_bytes、inline_text_max_bytes、redact_data 等）。但 `DEFAULT_CONFIG.capture_console = true`、`DEFAULT_CONFIG.redact_sensitive_headers = true`、`DEFAULT_CONFIG.redact_url_query = true` 不在 UserConfig 中；`DEFAULT_CONFIG.keyboard_capture_mode = 'shortcuts'` 而 `DEFAULT_USER_CONFIG.keyboard_capture_mode = 'none'`——两套默认值不一致，存在认知陷阱。
- 影响：用户首次启动时，UI 配置 `keyboard_capture_mode = 'none'`，但若直接用 DEFAULT_CONFIG 启动一次 capture（非通过 UI 配置），会用 `'shortcuts'`，行为差异用户无感知。
- 建议：在 constants.ts 注释说明 DEFAULT_CONFIG 是 fallback when UserConfig absent，UI 启动应通过合并 DEFAULT_USER_CONFIG → CaptureConfig。或显式统一两者默认值。
- 级别：low

### CFG-2 — save_user_config 不校验 patch 字段类型
- 位置：`src/shared/user_config.ts:404-408`
- 观察：`save_user_config(patch: Partial<UserConfig>)` 直接 `{...current, ...patch}` 无类型校验。若调用方传入 `agent_bridge_poll_interval_ms: '1000'`（字符串），TS 编译期会拒绝，但运行时来自 chrome.runtime.sendMessage 反序列化数据无防护。
- 建议：若 save_user_config 只在扩展内部 TS 上下文调用，可保留；若暴露给消息处理边界，应加 runtime validation（如 zod）。
- 级别：info

---

## 总结

### 统计
- 文件数：12
- 总行数：1837
- Findings 总数：18
- 按级别：
  - medium：3（opus_f001、f002、f003）
  - low：11（f004、f005、f006、f007、f008、f009、f010、f011、f012、f013、f014、CFG-1）
  - info：4（f015、f016、f017、f018、SEC-4、TIME-3、CFG-2）

### 关键问题
1. **24 小时采集上限缺失强制执行**（f001）——声明与行为不符，长期采集无法自停。
2. **event_category 漏分类 4 种 lifecycle 事件**（f002）——预留路径但未对齐，未来 emit 即错。
3. **IANA 时区迁移对 UTC+13/+14 无效**（f003）——声明值永远 fallback，4 个太平洋地区用户受影响。

### 整体评价
shared 层 12 个文件实现质量高：
- 类型定义完整、discriminated union 设计正确。
- 脱敏、截断、时间格式化等核心逻辑无功能性 bug。
- Bridge host 字面量约束、token 默认空串、password 强制脱敏符合硬约束。
- 主要问题集中在"声明与行为不一致"（f001、f003、f016）和命名/兼容性技术债（f005、f015、f017、f018）。

建议优先处理 f001、f002、f003 三个 medium 问题，其余可在下一轮清理中批量处理。
