# Task spec

## 背景

`redact_url` 的 absolute URL 分支只遍历 `searchParams`，不检查 `parsed.hash`；相对 URL 分支拆出 `hash_part` 后原样拼回。OAuth implicit flow、密码重置、magic link、SPA hash route 中的 token/API key/PII 在 `redact_data && redact_url_query` 下仍保留 secret。

## 契约区

### 范围

- fragment 采用结构感知策略：hash 可解析为 `key=value`/`&` 参数则按 query 敏感 key 规则脱敏；`#/route?token=...` 递归处理 route query。
- 普通锚点与无敏感 hash route 保形。
- 解析失败但命中 credential 模式时 fail-closed 替换整个 fragment。

### 非范围

- 不改变 query 部分的既有脱敏规则。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：`https://app/callback#access_token=SECRET&token_type=bearer` 脱敏后不保留 SECRET。
- [ ] AC-002：`#/route?token=SECRET` 形式 hash route 的 token 被脱敏。
- [ ] AC-003：普通锚点 `#section` 与无敏感 hash route 保持原形。
- [ ] AC-004：解析失败但命中 credential 模式时替换整个 fragment。
- [ ] AC-005：新增 OAuth implicit、encoded hash、hash-router、普通 `#section` 回归测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：纯函数 `redact_url` 单测多形态 fixture。

## 上下文区

- 来源：SEC-006（2026-08-13 核实，初版未覆盖 fragment，后续 query 增强均保留 hash）。

### 有意不测

- 无。

### 测试策略

- 纯函数测试，覆盖 OAuth implicit、encoded hash、hash-router、普通锚点。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：过度脱敏普通 hash route 破坏可读性。
- 回退：仅对可解析 credential 模式的 fragment 脱敏，其余保形。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- `docs/archive/specs/privacy_redaction.md`：更新「不处理 fragment」的语义为结构感知脱敏。
