# Task log - T012 redaction_rules_broaden

## 进展

- 2026-07-19：扩展 URL 脱敏规则覆盖 access_token/api_key/client_secret/auth_token/session_token 等组合词与大小写变体；`redact_password` 让 `input_type==='password'` 判断优先于 `enabled`。

## 关键验证

- 单测：`tests/unit/redaction.test.ts` 新增 5 用例覆盖组合参数、大小写、重复参数、非敏感保留；修改 disabled+password 用例期望 `[REDACTED]`。
- 红 → 绿：先失败 5 项 → 修正实现与一处 URL 规范化断言 → 全绿。
- 全量：`npm test` 90 文件 / 1075 用例全绿。

## 决策

- 子串包含匹配：简单覆盖广，常规参数（category、page、sort）不会命中。
- 重复参数保留原数量：用 `getAll → delete → append` 循环。
- 不处理 URL fragment：产品语义未定。
- `redact_password` 调用方审计：仅测试文件引用，无生产调用，行为收紧无回归。

## 验收

- [x] access_token/api_key/client_secret/auth_token/session_token 全部被脱敏。
- [x] 大小写不敏感。
- [x] 重复参数全部脱敏。
- [x] `redact_password('x','password',false) === '[REDACTED]'`。
- [x] `npm test` 全绿。
