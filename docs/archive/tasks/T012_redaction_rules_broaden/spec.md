# Task spec — T012 redaction_rules_broaden

## 背景

`src/shared/redaction.ts:11` 的 `SENSITIVE_URL_PARAMS = ['token','key','secret','password','auth']` 配合 `URLSearchParams.has(param)` 精确匹配，导致：

- `access_token`、`api_key`、`client_secret`、`auth_token`、`session_token`、大小写变体（`Token`、`AUTH`）等常见凭据参数不被脱敏。
- 用户开启 `redact_url_query` 后仍可能采集到常见凭据。

另外 `redact_password(value, input_type, enabled)` 在 `enabled=false` 时返回明文，违反"`type=password` 永远不采集"硬约束。当前 DOM 采集路径另有保护未生产泄露，但共享 API 与测试固化了不安全行为。

## 范围

代码/配置：

- `src/shared/redaction.ts`：
  - URL 脱敏改为遍历所有 query key，小写后做子串/包含规则匹配，覆盖 `token/key/secret/passwd/password/auth/credential/jwt/api_key` 等常见组合词。
  - `redact_password()` 让 `input_type === 'password'` 判断优先于 `enabled`，password 永远脱敏。

测试：

- `tests/unit/redaction.test.ts`：
  - 新增覆盖 `access_token`/`api_key`/`client_secret`/`auth_token`/`session_token`、大小写、重复参数、URL fragment 行为。
  - 修改 `redact_password` 用例：`enabled=false` + `input_type='password'` 仍返回 `[REDACTED]`。

文档：

- 无 blueprint 改动；行为符合 `docs/blueprint/domain.md` 现有"`type=password` 永远不采集"约束。

## 非范围

- 不处理 URL fragment 内的敏感参数（产品语义待定；fragment 通常不上传服务器）。
- 不改 header 脱敏规则。
- 不改网络/WebSocket 调用方传递逻辑（T014 处理）。

## 验收标准

- [ ] `redact_url('https://x?a=1&access_token=Z', true)` 的 `access_token` 值被替换。→ 验证：单元测试断言。→ 预期：url 含 `access_token=%5BREDACTED%5D`。
- [ ] `redact_url('https://x?API_KEY=Z', true)` 大小写不敏感命中。→ 验证：单测。→ 预期：url 含 `API_KEY=%5BREDACTED%5D`。
- [ ] `redact_password('x', 'password', false) === '[REDACTED]'`。→ 验证：单测。→ 预期：返回 `[REDACTED]`。
- [ ] `npm test -- tests/unit/redaction.test.ts` 全绿。

## 依赖与约束

- 受影响业务不变量：`type=password` 永远不采集；`redact_url_query` 启用时常见凭据应被脱敏。
- 无数据迁移。
- 无平台限制。
