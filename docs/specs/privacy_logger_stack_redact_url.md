# Spec — Logger stack 脱敏与 redact_url fail-open 修复

Logger 产出的文本（message / details / Error.stack）走 URL/query 脱敏；`redact_url` 对相对或无法 `new URL` 解析的串按 query 脱敏，不 fail-open 泄露敏感键。

## 脱敏语义

- `redact_url(url, redact_query)`：
  - `new URL` 可解析：`searchParams` 中敏感键（token/key/secret/password/passwd/auth/credential/jwt）值替换 `[REDACTED]`。
  - 无法解析（相对 URL / 纯 query）：手动拆分 path、query、fragment；key 先 `decodeURIComponent` 再匹配；param 值内嵌绝对 URL 时递归脱敏；仅递归实际脱敏才标 `redacted`。
- Logger：
  - `URL_SUBSTRING_PATTERN` 匹配绝对 URL 与相对 query（key=value 形态，排除 JS 可选链/三元）。
  - `Error.stack` 与 logger 自产 stack 均经 `sanitize_string`（脱敏 + 截断）。

## 任意文本 URL 扫描边界（t113，2026-08-11）

Logger 对任意文本的 URL 子串扫描采用边界启发式：bare-query 与 path-query 前须为明确 URL 上下文（行首/空白/左括号/逗号/引号/`=`），绝对 URL 分支不受限。已知边界：

- 紧邻三元（`cond?token=x:y`）与可选链（`user?.token`）逐字保留，不误脱敏。
- 无斜杠相对路径（`file?token=x`）退出任意文本扫描（隐私覆盖收缩，用户确认）。
- 带空格三元（`cond ?token=x:y`）与独立 `?query` 同享 `\s`=URL 边界语义，会被当作 query 脱敏（已知权衡）。

## 已知局限

- param 值内嵌相对 query（`?next=path?token=secret`）不递归（登记 p018，t114 处理）。

## 相关实现

- `src/shared/redaction.ts`：`redact_url`
- `src/shared/logger.ts`：`sanitize_string` / `sanitize_log_value`
- `tests/unit/logger_stack_redact.test.ts`：脱敏与回归测试
