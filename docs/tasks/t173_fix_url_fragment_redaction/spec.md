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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：`https://app/callback#access_token=SECRET&token_type=bearer` 脱敏后不保留 SECRET。
- [ ] AC-002：`#/route?token=SECRET` 形式 hash route 的 token 被脱敏。
- [ ] AC-003：普通锚点 `#section` 与无敏感 hash route 保持原形。
- [ ] AC-004：解析失败但命中 credential 模式时替换整个 fragment。
- [ ] AC-005：新增 OAuth implicit、encoded hash、hash-router、普通 `#section` 回归测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：纯函数 `redact_url` 单测多形态 fixture。

## 上下文区

- 来源：SEC-006（2026-08-13 核实，初版未覆盖 fragment，后续 query 增强均保留 hash）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 纯函数测试，覆盖 OAuth implicit、encoded hash、hash-router、普通锚点。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：过度脱敏普通 hash route 破坏可读性。
- 回退：仅对可解析 credential 模式的 fragment 脱敏，其余保形。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- `docs/archive/specs/privacy_redaction.md`：更新「不处理 fragment」的语义为结构感知脱敏。
