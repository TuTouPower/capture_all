# Task log - T015 logger_redaction

## 进展

- 2026-07-19：`src/shared/logger.ts` 在 `Logger.write` 入口对 message 与 details 统一净化：递归扫描字符串值，URL 子串（`scheme://...` 形态）走 `redact_url(redact_query=true)`，超过 `MAX_LOG_ENTRY_BYTES=64KB` 截断并标 `[TRUNCATED]`。循环引用用 WeakSet 守护返回 `[Circular]`。Error 对象 message/stack 也净化。

## 关键验证

- 红 -> 绿：logger.test.ts 新增 8 用例 -> 7 红 -> 全绿。
- 全量：`npm test` 92 文件 / 1097 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- 默认启用 URL 脱敏 + 大小上限，无配置开关（隐私保护不应可关）。
- URL 子串模式 `[a-z][a-z0-9+.-]*:\/\/[^\s"'<>\`)]+` 覆盖 message 文本中嵌入的 URL。
- Error 不再走旧 `safe_details` 分支，统一进 `sanitize_value`，保留 P0.59 的 Error 转 plain object 行为（name/message/stack）。
- Date/RegExp/ArrayBuffer/TypedArray/Map/Set 等原样保留，避免破坏诊断价值。

## 验收

- [x] details 字符串 URL 含 token 被脱敏。
- [x] 嵌套对象/数组中的 URL 也脱敏。
- [x] 超长字符串截断 + 标记。
- [x] Error message 中 URL 被脱敏。
- [x] top-level message 字符串中 URL 被脱敏。
- [x] 循环引用不抛错。
- [x] 非 URL 非超长 primitive 保留原值。
- [x] npm test 全绿。
