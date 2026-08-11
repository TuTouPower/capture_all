# d002 嵌套 query 递归脱敏解码深度与终止条件

- 来源：s002 spike / t114 task
- 结论：`redact_url` 对非敏感参数值内嵌 query 递归脱敏时，单层 `decodeURIComponent` 识别 `%3F`/`%3D` 编码值并脱敏；双编码（`%253F`）在任意层均不触发（避免重复解码误判）；`MAX_DEPTH=5` 终止深层嵌套链且超限 fail-closed（整体置 `[REDACTED]`，不泄露明文也不谎报状态）。
- 证据：`docs/spikes/s002_nested_query_recursive_redaction/code/spike.ts` 12/12 用例通过；10 种 outer/inner 组合（absolute/base-resolved、path/root/query/protocol-relative、plain/encoded）全部脱敏，双编码 absolute/relative 分支行为一致保持 captured，深层链正常终止，直接传超限 depth 返回 `[REDACTED]`+redacted。
- 影响：嵌套 query 递归脱敏实现依据（`redact_url` 非敏感值递归分支）；后续涉及 URL 递归脱敏或编码处理时复用。
- 现状：有效
