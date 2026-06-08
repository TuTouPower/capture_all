# 类型系统全量对齐 — 设计文档 + 实施计划审阅

审阅日期：2026-06-08
审阅对象：
- `docs/superpowers/specs/2026-06-08-type-system-alignment-design.md`
- `docs/superpowers/plans/2026-06-08-type-system-alignment-plan.md`

## 总体评价

设计方向正确，4 阶段拆分合理。以下列出发现的问题，按严重程度排列。

---

## 严重问题（必须修复）

### 1. `mode` 字段与 `capture_mode` 值域不一致

设计文档定义 `CaptureRecord.mode: 'standard' | 'deep' | 'custom'`，计划 task 3 也说 `DEFAULT_CONFIG.capture_mode` 从 `'basic'` 改为 `'standard'`。但看 types.ts 计划写的类型定义（task 1），`RecordConfig` 仍写的是 `capture_mode: 'standard' | 'deep'`。而现有代码 `RecordConfig.capture_mode` 是 `'basic' | 'advanced'`。

**问题**：`RecordConfig.capture_mode` 和 `CaptureRecord.mode` 是不同字段但值域高度相似（`standard`/`deep` vs `standard`/`deep`/`custom`）。文档没有解释两者关系：`CaptureRecord.mode` 是从 `config.capture_mode` 映射而来？还是独立设置？如果是映射，`custom` 何时使用？

**建议**：在计划中补充 `mode` 与 `capture_mode` 的映射关系说明，并确保 `RecordConfig` 类型也同步更新。

### 2. `ConsoleEventData.level` 丢失了 `'error'` 值

现有 `ConsoleLog.level = 'log' | 'warn' | 'error' | 'info' | 'debug'`。计划中 `ConsoleEventData.level = 'log' | 'warn' | 'info' | 'debug'`，去掉了 `'error'`。

意图是让 console.error 走 `error` 分类而非 `console`。但 CDP `Runtime.consoleAPICalled` 事件参数包含 `type: 'error'`，**代码需要在采集端做分流**：level=`error` 的输出转为 `error/runtime_exception` 事件。

**建议**：
- 计划 task 11（console_capture.ts）应明确写："level=`error` 的 console API 调用，转为 `error/runtime_exception` 事件，走 error 通道"
- 或者在 `ConsoleEventData.level` 保留 `'error'`，但注释说明 "deprecated, 应为空"
- 同时检查 `console_capture.ts` 和 `service_worker.ts` 中的 level 分发逻辑

### 3. IndexedDB 复合主键 keyPath 可行但不实用

计划 task 4 设计 `keyPath: ['capture_id', 'relative_time_ms']`。复合主键在 IndexedDB 中合法，但有两个隐患：

- `relative_time_ms` 可能在同一 capture 内重复（高频 mouse/scroll 事件、flush 批处理）。如果两事件同一毫秒到达，后者会覆盖前者。
- 现有代码 `keyPath: ['session_id', 'relative_time']` 同样有这个问题。因为 `relative_time` 以 ms 为单位，高频事件会产生碰撞。

**建议**：使用 `autoIncremented` 的自增主键 + `capture_id` 索引，或者 `keyPath: 'event_id'`（event_id 已是唯一 UUID）。避免事件静默丢失。

### 4. `CookieChangeData.cause` 枚举值与现有代码不同

现有 `types.ts`：`'explicit' | 'expired_overwrite' | 'evicted' | 'expired' | 'overwrite' | 'unknown'`（6 项）

设计文档：`'explicit' | 'expired' | 'evicted' | 'overwrite' | 'unknown'`（5 项，去掉 `expired_overwrite`）

计划（task 1）：列出 `'explicit' | 'expired' | 'evicted' | 'overwrite' | 'unknown'`（5 项）

**问题**：Chrome `cookies.onChanged` API 的 `cause` 实际值是 `"explicit" | "overwrite" | "expired" | "evicted" | "expired_overwrite"`。所以 `expired_overwrite` 是真实存在的，不应删除。这是 Chrome API 的 5 个合法值。

**建议**：在设计文档和计划中恢复 `expired_overwrite`，保持与 Chrome API 一致。

---

## 中等优先级问题

### 5. 缺少 `expiration_date` 类型说明

Chrome `cookies.onChanged` 返回的 `expirationDate` 是 `number`（epoch seconds），而 `sameSite` 是 `"unspecified" | "no_restriction" | "lax" | "strict"`。设计文档 `same_site` 写的是 `no_restriction/lax/strict`，缺少 `unspecified`。这也是 Cookie API 的合法返回值。

**建议**：`same_site` 加上 `'unspecified'`，`expiration_date` 明确注释单位为 epoch seconds。

### 6. `session_id` → `capture_id` 改名遗漏：文件名和函数名

设计文档说"session_id → capture_id：直接改名，不做兼容层"，但计划只改了**字段名**和**类型名**，没有改**文件名**：
- `src/background/session_manager.ts` — 文件未列入修改列表
- 函数 `create_session` → `create_capture` 在计划中提到了，但 `get_session`、`list_sessions`、`update_session`、`delete_session` 的全部调用方是否都已覆盖？

**建议**：grep 全仓 `session` 关键字，确保没有遗漏的文件/函数/变量。

### 7. 计划缺少测试文件更新任务

计划 task 20 step 2 只说"运行单元测试"和"修复失败"，但没有列出具体测试文件。`npm test` 跑的是 vitest，测试文件可能在 `tests/` 或 `__tests__/` 下，引用了 `Session`、`RecordEvent` 等同名旧类型。

**建议**：在执行前 grep 测试文件中的旧类型名，评估测试改造工作量。

### 8. 缺少 `relative_time_ms` 计算规范

`event_utils.ts` 中 `create_base_event` 接收 `relative_time_ms` 参数，但未定义计算方式。各采集模块需要统一用 `Date.now() - capture_start_time_ms`。如果不同模块用不同基准（`performance.now()` vs `Date.now()`），数据会不一致。

**建议**：在 event_utils.ts 中导出 `get_relative_time(capture_start_epoch_ms: number): number` 函数，统一计算逻辑。

### 9. `TabSwitchData` 字段与现有代码差异大

现有 `TabSwitchData`：`{ action: 'activate' | 'deactivate'; tab_title: string }`

设计文档：`{ from_tab_id: number | null; to_tab_id: number; from_url: string | null; to_url: string | null }`

**问题**：`action` 和 `tab_title` 完全丢失。现有采集代码中 `tab_switch` 只传 `action` 和 `tab_title`，新设计需要 `from/to_tab_id` 和 `from/to_url`，这需要 service_worker 保存 tab 状态才能获取。`from_url` 在此模型中尤其复杂——需要在每次切换时记住上一个活跃 tab 的 URL。

**建议**：要么在 service_worker.ts 中增加 tab 状态管理逻辑，要么在 `TabSwitchData` 中保留 `action` 字段作为可选字段。

---

## 轻微问题 / 建议

### 10. `event_utils.ts` 中 `event_counter` 的并发安全

`event_counter` 是模块级变量，增量无锁。Content script 和 background service worker 在不同上下文，各自有独立计数器——这没问题。但在同一进程中，如果有并发调用 `create_base_event` 不会出问题（JS 单线程）。只是 event_id 格式带有 `event_counter` 尾巴确保唯一性，实际上 `Date.now().toString(36) + Math.random().toString(36)` 已经足够。

**建议**：可简化，去掉 `event_counter`。或者保留当前设计也行。

### 11. 计划 Task 1 types.ts 中 `DomReadyData` 缺失 `timestamp`

现有代码有 `DomReadyData: { timestamp: number }`，计划中的 `DomReadyData` 增加了 `url`、`title`、`ready_state`，但没了 `timestamp`。时间信息在 `CaptureEvent.relative_time_ms` 和 `absolute_time` 中已有，不算丢失。但需确认现有 `content_script.ts` 中构建 DomReadyData 的逻辑是否需要改。

### 12. `store_name` 大小写不一致

计划中的 store name 用 `UPPER_SNAKE`（`USER_ACTION_EVENTS`），现有代码也是 `UPPER_SNAKE`。没问题。

### 13. 计划 task 4 step 5 commit message 缺少对新 flush 函数的描述

commit subject 可以，但 body 应该更详细说明 9 个 store 的结构。

### 14. 文档中的打印样式

计划中 types.ts 的 `print_width` 不一致（单行 vs 多行注释风格混合）。这是文档表示的问题，不影响代码。

---

## 现有代码中发现的相关问题（不在评审范围内但值得注意）

- `src/background/storage.ts` 中 `Session` 的 `keyPath: 'id'`，但 `Session` 接口用的是 `id` 字段。计划改为 `CaptureRecord.capture_id`，但 store 的 keyPath 会从 `'id'` 变为 `'capture_id'`。DB migration 需要处理这个不兼容变更——升级 DB 时必须删除旧 sessions store 或用新 store 名创建。当前计划 task 4 说"保留旧 store 不删，新 store 只在新版本创建"，这个策略合理。

- 现有 `src/shared/constants.ts` 中有 `ERROR_LOG`（单数），而 `STORE_NAMES.EVENTS`、`CONSOLE_LOGS` 这些是复数。新设计统一用复数，一致性好。

---

## 总结

| 类别 | 数量 |
|------|------|
| 严重 | 4 |
| 中等 | 5 |
| 轻微 | 5 |

设计方向 OK。4 个严重问题中：
- #3（复合主键）是潜在的运行时 bug
- #4（cookie cause 枚举）是数据丢失风险
- #1 和 #2 是设计遗漏

建议先修复 4 个严重问题再开始实施。
