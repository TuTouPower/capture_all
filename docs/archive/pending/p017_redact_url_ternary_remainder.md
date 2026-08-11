# p017 redact_url 三元含 = 仍误匹配

- 来源：t100 遗留（t100_code_f006，minor）；t100 引入 bare-query 扫描后即存在，评审已发现并登记，无后续回归证据。
- 现象：
    - 期望：Logger 净化任意文本时，非 URL 的 JS 三元表达式保持原文；例如 `branch result: cond?token=x:y` 应逐字保留。
    - 实际：`sanitize_log_value('branch result: cond?token=x:y')` 输出 `branch result: cond?token=[REDACTED]`，把三元真值分支误当敏感 query，并吞掉 `:y`。
    - 复现：在仓库根目录运行 `npx tsx .scratch/p017_redact_url_ternary_remainder_repro.ts`；脚本同时验证当前误改和候选收紧规则的 query/base64 权衡。
- 影响：所有经 `Logger.write` 净化的字符串面均受同一误判影响，包括顶层 `message`、字符串或嵌套 `details`、`Error.message`、`Error.stack` 与 error 级自产 stack。日志中碰到 `?<敏感键>=<表达式>:<表达式>` 形态时，原始诊断文本可能被误改、截断，降低排障可信度；不影响直接来自 network/form 等已知 URL 字段的 `redact_url` 调用。
- 根因：
    - 分类：产品缺陷（日志脱敏 false positive / 内容完整性缺陷）。
    - 可验证机制：`src/shared/logger.ts` 的 `URL_SUBSTRING_PATTERN` bare-query 分支只要求 `?` 后存在 `key=value`，没有 URL 来源或 JS 语法上下文；`sanitize_string` 将命中片段直接交给 `redact_url`。`cond?token=x:y` 中 `?token=x:y` 因此被当作相对 query，`redact_url` 又按敏感 key `token` 替换整个 value，得到 `?token=[REDACTED]`。该字符串同时也可解释为合法相对 URL `cond?token=x:y`，只靠子串正则存在不可消除的语义歧义。
    - 合法 query/base64 权衡：URI query value 可合法包含未转义 `:`。仅在 value 字符类排除 `:` 但不要求结束边界时，正则仍会前缀命中 `?token=x`，既不能修复三元，也可能只改写前缀；加入结束边界后可避开三元，但会漏脱敏合法 `?token=abc:def` 与含 base64 data URL 的 `?token=data:text/plain;base64,QUJDRA==`。Base64 字母表本身不含 `:`，普通 `?token=QUJDRA==` 的 `=` padding 仍可匹配；风险来自合法冒号及 data URL，不应笼统归因于 base64 padding。后续修复需明确选择上下文判定或接受部分 bare relative query 覆盖收缩，不能只机械排除 `:`。
    - 已确认位点清单：`src/shared/logger.ts` 的 `URL_SUBSTRING_PATTERN` bare-query 分支及其唯一消费点 `sanitize_string`（同一机制位点 1 处）。
    - 同类扫描：已扫，无新增已确认同类位点。检索轴包括 `URL_SUBSTRING_PATTERN` / `sanitize_string` / `sanitize_log_value` 定义与调用、全仓 `redact_url` 调用、`replace(...redact_url...)` 耦合、`key=value`/bare-query/三元注释与测试、敏感 query pattern 的重复实现。其余 `redact_url` 调用接收 network、form、service worker、bridge 等已知 URL 字段，不扫描任意正文；`src/shared/redaction.ts` 的嵌套 URL 递归及 p018 属漏脱敏机制，不是本 false-positive 同因。
- 测试缺口：
    - 现有 `tests/unit/logger_stack_redact.test.ts` AC-002e 只覆盖 `user?.token` 和不含 `=` 的 `cond?token:x`；`key=value` 门槛恰好让两例通过，却未覆盖 `cond?token=x:y`，形成测试假绿。`tests/unit/logger.test.ts` 只断言真实 URL 被脱敏，没有非 URL `key=value` 反例和原文完整性断言。现有两文件 24 个测试全部通过，但隔离复现稳定失败于期望行为。
    - 补测方向：在 logger 单测增加表驱动回归，直接触达生产 `sanitize_log_value`/`Logger.write`。负例至少断言 `cond?token=x:y` 在 message、嵌套 details 或 Error 文本中逐字保留；正例须同时守住绝对 URL、`/path?token=x`、bare `?token=x`、合法冒号 query `?token=abc:def`、base64 data URL query、普通带 `=` padding 的 base64 query，断言敏感值消失且 `[REDACTED]` 存在。若最终策略明确放弃某类合法 bare query，测试和行为 AC 必须显式记录该隐私覆盖收缩，避免以修 false positive 引入静默 false negative。当前只确认 1 个共享机制位点，以上矩阵覆盖其全部调用面；无需按各 `redact_url` URL 字段调用点重复补测。
- 线索：`.scratch/p017_redact_url_ternary_remainder_repro.ts`
- 处理：t113
