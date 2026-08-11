# p017 redact_url 三元含 = 仍误匹配

- 来源：t100 遗留（t100_code_f006，minor）
- 内容：bare-query 分支 key=value 启发式下，含 `=` 的三元（`cond?token=x:y`）仍被误匹配改写正文。收紧需在 value 段排除 `:`（会漏 base64 等合法 query），属权衡，留作已知局限。
- 处理：未开
