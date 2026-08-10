# Task spec

## 背景

Logger 对 Error.stack 只截断不 URL 脱敏；`redact_url` 在 `new URL` 失败时 fail-open 返回原串，相对 URL query 可漏脱敏。P1-2/P1-15。

## 契约区

### 范围

- Error.stack 与 logger 产出的 stack 字符串走与 message 相同的 URL/query 脱敏。
- `redact_url` 对无法 parse 的串不 fail-open 泄露 query 敏感键；采用脱敏后返回或标记 redacted。
- 单测覆盖 stack 与相对 URL。

### 非范围

- 不扩展全新敏感键词典（沿用现有 redaction 规则集，除非测试证明必须补键）。
- 不改非 logger 的业务 redaction 调用点（除 redact_url 自身）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：Error.stack 含 `https://example.test/x?access_token=secret` 时，logger 序列化输出中不出现明文 `secret`（应为 redacted 占位）。
- [ ] AC-002：对相对 URL 或无法 `new URL` 的串（如 `path?api_key=abc` 或 `?token=xyz`），在启用 query 脱敏时输出不包含明文敏感值。
- [ ] AC-003：无 query 的普通绝对 URL 脱敏后仍可读 host/path（回归，不整串抹掉除非规则要求）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-2 P1-15；src_shared/review.md f002 f003

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- Map/Set 容器内未扫描对象：规格已允许的局限，有意不测。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 直接调 logger.sanitize / redact_url；无 chrome 依赖。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：fail-closed 过严导致相对 URL 全 [REDACTED] 影响调试。
- 回退：恢复 stack 仅截断与 redact_url fail-open。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
