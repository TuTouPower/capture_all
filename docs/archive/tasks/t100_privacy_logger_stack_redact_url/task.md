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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：Error.stack 含 `https://example.test/x?access_token=secret` 时，logger 序列化输出中不出现明文 `secret`（应为 redacted 占位）。
- [ ] AC-002：对相对 URL 或无法 `new URL` 的串（如 `path?api_key=abc` 或 `?token=xyz`），在启用 query 脱敏时输出不包含明文敏感值。
- [ ] AC-003：无 query 的普通绝对 URL 脱敏后仍可读 host/path（回归，不整串抹掉除非规则要求）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-2 P1-15；src_shared/review.md f002 f003

### 有意不测

- Map/Set 容器内未扫描对象：规格已允许的局限，有意不测。

### 测试策略

- 直接调 logger.sanitize / redact_url；无 chrome 依赖。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：fail-closed 过严导致相对 URL 全 [REDACTED] 影响调试。
- 回退：恢复 stack 仅截断与 redact_url fail-open。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
