# Spike report

## 问题

Logger 任意文本 URL 子串扫描（`URL_SUBSTRING_PATTERN`）只用 `?key=value` 判 URL，把 `cond?token=x:y` 这类 JS 三元误当敏感 query。用户确认采用边界启发式：只对具备明确 URL 上下文的片段启用任意文本扫描。需要验证：候选 lookbehind 边界规则能否同时守住三元反例与合法 URL/冒号 query/data URL/base64 正例，及确认隐私覆盖收缩面。

## 成功判据

- 候选正则对三元、可选链、无斜杠相对路径反例逐字保留；
- 对绝对 URL、独立 `?query`、`/path?...`、合法冒号 query、data URL/base64 query 正例脱敏；
- 收缩面（无斜杠相对路径 `file?token=x` 不再脱敏）被用户接受的边界启发式语义覆盖。

## 尝试

- 候选规则：bare-query 与 path-query 分支前加 lookbehind `(?<=^|[=\s([,<"'])`，要求 `?`/`/` 前是字符串开头/空白/左括号/逗号/引号/等号；绝对 URL 分支不变。`=` 纳入边界以保证 `path=/login?token=x`、`url=?token=x` 等序列化形态脱敏。
- 实现于 `code/spike.ts`（13 用例表驱动），用 `redact_url(m, true)` 校验改写结果。
- 注意：绝对 URL 经 `new URL` 重组，`[REDACTED]` 被编码为 `%5BREDACTED%5D`，断言按 `REDACTED` 子串匹配。

## 证据

- 13/13 用例通过（`npx tsx code/spike.ts`）：
  - PASS：ternary、ternary details、ternary error、optional chain、absolute、bare query standalone、path query、path query paren、colon value、data url value、base64 padding、comma path、relative no slash (shrink)。
  - 关键行为：`cond?token=x:y`、`user?.token` 均零匹配；`https://example.com/p?token=abc:def`、`?token=data:text/plain;base64,QUJDRA==`、`?token=QUJDRA==` 均脱敏。

## 结论

lookbehind 边界规则满足契约：仅以明确 URL 上下文（行首/空白/括号/逗号/引号/=）开头的 `?query` 与 `/path?...` 参与任意文本扫描。已确认收缩面：无斜杠相对路径（`file?token=x`）退出任意文本扫描，且带空格三元（`cond ?token=x:y`）与独立 `?query` 同享 `\s` URL 边界语义会被脱敏——两者均为 `\s`=URL 边界判定的已知权衡（用户确认的边界启发式语义），非静默 false negative；紧邻三元（`cond?token=x:y`）与可选链不受影响。正则引擎为 ES2018 lookbehind，Node 24 / TS target 兼容。

## 是否采纳

- 决定：是
- 理由：13/13 用例验证边界规则满足全部正例与反例，收缩面与用户确认语义一致。
- 后续 task：t113
