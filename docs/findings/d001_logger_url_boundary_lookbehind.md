# d001 Logger URL 边界 lookbehind 规则

- 来源：s001 spike / t113 task
- 结论：Logger 任意文本 URL 子串扫描加 lookbehind 边界 `(?<=^|[=\s([,<"'])` 后，`cond?token=x:y`、`user?.token` 等 JS 三元/可选链不再误脱敏，同时绝对 URL、独立 `?query`、`/path?...`（含 `=` 前置序列化形态 `path=/login?token=x`）、合法冒号 query、data URL/base64 query 均正常脱敏；代价是「无斜杠相对路径」（`file?token=x`）退出任意文本扫描覆盖，带空格三元（`cond ?token=x:y`）与独立 `?query` 同享 `\s` URL 边界语义会被脱敏。
- 证据：`docs/spikes/s001_logger_url_boundary_heuristic/code/spike.ts` 13/13 用例通过；绝对 URL 脱敏后 `[REDACTED]` 经 URL API 编码为 `%5BREDACTED%5D`。
- 影响：Logger URL 边界判定（`URL_SUBSTRING_PATTERN`）实现依据；后续涉及日志脱敏边界调整时复用。
- 现状：有效
