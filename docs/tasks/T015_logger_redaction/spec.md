# Task spec — T015 logger_redaction

## 背景

`src/shared/logger.ts:40-67` `Logger.write` 把任意 `message`/`details` 原样写入 transport，仅特殊处理 `Error` 对象。生产调用方把 `window.location.href`、tab URL、URL 变更前后值原样放日志：

- `src/extension/content/content_script.ts:41` 等
- `src/extension/background/service_worker.ts:465,838,868`

URL 可含 `token`/`password`/`auth` 等 query（已通过 T012 扩展脱敏规则覆盖常见组合词）。即使采集配置启用 `redact_url_query`，诊断日志仍会在 IndexedDB 留存明文凭据，形成旁路泄露。`details` 也无递归敏感字段脱敏或单条大小上限。

## 范围

代码/配置：

- `src/shared/logger.ts`：
  - `Logger.write` 入口对 `message` 与 `details` 应用统一净化：递归扫描字符串值，URL 形态走 `redact_url(redact_query=true)`；超过单条字节上限（如 `MAX_LOG_ENTRY_BYTES = 64 * 1024`）截断并标 `[TRUNCATED]`。
  - 单条上限常量加入 `src/shared/constants.ts`。
  -净化逻辑独立函数 `sanitize_log_value(value, max_bytes)` 便于测试。

测试：

- `tests/unit/logger.test.ts` 新增：
  - URL 含 `?token=SECRET` 进入 details 后日志中为 `[REDACTED]`。
  - 嵌套对象/数组中的 URL 也被脱敏。
  - 超长字符串截断 + 标记。
  - Error 对象的 message/stack 中的 URL 也脱敏。

文档：

- 无 blueprint 改动。

## 非范围

- 不改 transport（IndexedDB/Message）的实现。
- 不引入日志配置开关（默认启用 URL 脱敏 + 大小上限）。
- 不改日志容量统计（T037/T049 处理）。

## 验收标准

- [ ] URL 含 `?token=SECRET` 作为 details 字段值时，日志中该值为 `https://...?token=%5BREDACTED%5D`。→ 验证：单测。→ 预期：details.url 不含 'SECRET'。
- [ ] 嵌套对象 `{a:{b:'https://x?token=Z'}}` 中 URL 也脱敏。→ 验证：单测。→ 预期：嵌套值不含 'Z'。
- [ ] 单条字符串超过 MAX_LOG_ENTRY_BYTES 截断并含 `[TRUNCATED]`。→ 验证：单测。→ 预期：长度 <= MAX + 标记长度。
- [ ] Error message 含 `https://x?token=Z` 时也脱敏。→ 验证：单测。→ 预期：entry.details.message 不含 'Z'。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：日志不能成为隐私旁路；redact_url_query 行为统一适用。
- 无数据迁移。
- 无平台限制。
