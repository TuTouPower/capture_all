# Task plan — T012 redaction_rules_broaden

## 步骤

1. 红：扩展 `tests/unit/redaction.test.ts`，新增 access_token/api_key/client_secret/auth_token/session_token/大小写/重复参数用例；修改 `redact_password disabled+password` 用例期望 `[REDACTED]`。
2. 红：跑测试确认失败。
3. 绿：改 `src/shared/redaction.ts`：
   - 用 `SENSITIVE_URL_PARAM_PATTERNS = ['token','key','secret','password','passwd','auth','credential','jwt']` + 小写包含匹配，遍历所有 searchParams。
   - `redact_password`：先判 `input_type === 'password'`，再判 `enabled`。
4. 跑测试变绿。
5. 黑盒：`npm test`。
6. log + commit + 归档。

## 风险与回退

- 风险：过宽匹配误杀（如 URL 含 `keys` 普通参数）。缓解：使用单词边界或保留普通 `key`/`token` 字面命中。已选 "包含" 策略，常规参数名通常不会包含 `token`/`secret` 等模式。
- 风险：已有调用方依赖旧 `redact_password(enabled=false, password)` 返回明文。审计调用方：grep `redact_password` 调用，确认 DOM 采集路径已独立保护。
- 回退：`git revert <commit>`。
