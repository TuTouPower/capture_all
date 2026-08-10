# Task plan — T015 logger_redaction

## 步骤

1. 红：扩展 `tests/unit/logger.test.ts`（如不存在则新建），覆盖 4 项验收。
2. 红：跑测试失败。
3. 绿：
   - `src/shared/constants.ts` 加 `MAX_LOG_ENTRY_BYTES = 64 * 1024`。
   - `src/shared/logger.ts` 加 `sanitize_log_value()` 递归扫描：字符串尝试 redact_url，超长截断；对象/数组递归；Error message/stack 也处理；循环引用守护。
   - `Logger.write` 在生成 entry 前对 message 与 details 调用 sanitize。
4. 跑测试变绿。
5. 全量 `npm test` + `tsc --noEmit`。
6. log + commit + 归档。

## 风险与回退

- 风险：循环引用对象栈溢出。缓解：WeakSet 守护已访问对象，遇到返回 `'[Circular]'`。
- 风险：redact_url 对非 URL 字符串原样返回（catch 分支），无副作用。
- 风险：序列化失败的函数/symbol 字段。缓解：递归时跳过非 plain 类型。
- 回退：`git revert <commit>`。
