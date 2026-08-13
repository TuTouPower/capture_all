# Task review t173（reviewer_focus: 测试）

- task：`t173_fix_url_fragment_redaction`
- spec：`docs/tasks/t173_fix_url_fragment_redaction/spec.md`
- diff_anchor：`0a5442480a4d64aed8e4e70d1e55e01c4f6043dd`
- target：`git diff 0a5442480a4d64aed8e4e70d1e55e01c4f6043dd`
- round：1
- reviewed_at：2026-08-13 19:30 UTC+8
reviewed_scope: 944893c1537c7bd3

## Findings

### t173_test_f001 - AC-004 测试验证假行为：fail-closed 整体替换分支未被触达

- 严重度：critical
- 锚点：AC-004（解析失败但命中 credential 模式时替换整个 fragment）
- 位置：`tests/unit/url_fragment_redaction.test.ts:41-46`
- 问题：测试输入 `/path#token=SECRET%ZZ` 并未构造「解析失败」。`redact_hash` 处理链（`src/shared/redaction.ts:248-285`）中：该 hash 不含 `%3D`/`%3F` 不触发 encode 分支、不含 `?` 不触发 route 分支，但含 `=` 走正常解析分支（:275），key `token` 命中 `SENSITIVE_URL_PARAM_PATTERNS`（:11, :227），`redact_query_string` 返回非 null（:277），fail-closed 的 `hash_has_credential(hash_body) ? '[REDACTED]' : null`（:279）永不执行。实测输出为 `/path#token=[REDACTED]`（普通脱敏路径），而真实 fail-closed 行为是整体替换为 `#[REDACTED]`（复现：`https://app.example/#/token/SECRET?state=x` → `#[REDACTED]`；`https://app.example/#token%3DSECRET%ZZ` → `#[REDACTED]`）。断言仅 `url_status='redacted'` + `not.toContain('SECRET')`，在正常脱敏路径下同样通过，无法区分 fail-closed 特有行为（fragment 整体替换、key 一并消失）。测试注释自称「无法按 query 解析但命中 credential → fail-closed」，与事实矛盾——该输入可解析且走普通规则脱敏，AC-004 声明的行为实际未被验证。
- 建议：改用真触发 fail-closed 的输入，任选其一：`https://app.example/#/token/SECRET?state=x`（route 分支 query 无敏感但 route 含凭据，redaction.ts:269-272）或 `https://app.example/#token%3DSECRET%ZZ`（encode 分支 `decodeURIComponent` 失败，:255-257）；断言 `r.url` 含 `#[REDACTED]` 且不包含 `token`/`SECRET`，并保留 `url_status='redacted'`。

### t173_test_f002 - AC-003c 保形断言弱于同族用例

- 严重度：minor
- 锚点：AC-003（普通锚点与无敏感 hash route 保形）
- 位置：`tests/unit/url_fragment_redaction.test.ts:36-39`
- 问题：AC-003a/003b 用 `toBe` 全串相等 + `url_status='captured'` 强断言锁死保形，AC-003c（`#/orders/123`）只断言 `toContain('#/orders/123')` 且未断言 `url_status`。实现把 URL 改写为 `https://app.example/x#/orders/123` 也能通过。不构成 AC 覆盖缺口（AC-003 已由 003a/003b 强覆盖），属断言强度不一致。
- 建议：与 003a/003b 对齐——补 `expect(r.url_status).toBe('captured')`，或直接改 `toBe('https://app.example/#/orders/123')`。

### t173_test_f003 - AC-005a encoded hash 未断言 [REDACTED] 出现

- 严重度：minor
- 锚点：AC-005（encoded hash 回归）
- 位置：`tests/unit/url_fragment_redaction.test.ts:48-52`
- 问题：仅 `not.toContain('SECRET')` + `url_status='redacted'`，若实现把整个 encoded hash 删除（无凭据残留且 status=redacted）测试同样通过，未验证「编码参数被脱敏并回写」。能红旧实现（旧实现 hash 原样保留 → SECRET 残留），非假行为，属断言可更强。
- 建议：补 `expect(r.url).toContain('[REDACTED]')`——`encodeURIComponent` 后字面 `[REDACTED]` 仍保留（`%5B`/`%5D` 之外的字符），可锁格式。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：本轮无
- 改测方向复核：无。diff 仅 4 文件（`docs/archive/specs/privacy_redaction.md` 1 行、`task.md`、`src/shared/redaction.ts`、新增测试文件），无既有测试被修改，「迁就实现」的改测不存在
- 本轮新发现：3 条（1 critical + 2 minor）
- 未进表的提示：无。测试直接 import 并调用真实 `redact_url`（`tests/unit/url_fragment_redaction.test.ts:4`），无 mock、无跳过、无恒真断言、无注释断言，生产逻辑可达；`redact_query=false` 保形用例保护既有语义；AC-001 `token_type` 断言与说明一致（含 `token` 子串随 query 规则脱敏，实测 `token_type=[REDACTED]`）
- 总体判断：AC-001/002/003/005 覆盖闭合且断言强度合格，但 AC-004 测试触达的是正常脱敏路径而非 fail-closed 分支，该 AC 的关键行为（整体替换）未被验证，需修后重审
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。`npx vitest run tests/unit/url_fragment_redaction.test.ts` 10/10 绿；旧实现 absolute 分支不处理 `parsed.hash`（diff 确认），`not.toContain('SECRET')` 必红。
- AC-002：`re_verified`。同上；旧实现 catch 分支 `return { url, url_status: 'captured' }`（diff 确认）hash 原样保留，必红。
- AC-003：`re_verified`。003a/003b 全串相等断言；旧实现保形（既有行为），预期绿，判别点确在敏感 hash。
- AC-004：`re_verified`。tsx 实测 `/path#token=SECRET%ZZ` → `/path#token=[REDACTED]`，fail-closed 分支未触达；对比真实 fail-closed 输入输出 `#[REDACTED]` 确认差异。见 t173_test_f001。
- AC-005：`re_verified`。005a/b/c 跑绿；旧实现 absolute/catch 分支均原样保留 hash，`not.toContain('SECRET')` 必红；encoded hash、query+hash 组合、相对 URL 形态覆盖齐。

coverage = 5 / 5

verdict: FAIL

## Round 2 (2026-08-13 19:41 UTC+8)

### 前轮 finding 复核（以 diff 与实测为准）

- t173_test_f001（critical）：**已修**。AC-004a（`tests/unit/url_fragment_redaction.test.ts:42-48`）输入 `#/token/SECRET?state=x` 经 `route_has_credential_value`（`src/shared/redaction.ts:297-299`，round 1 后新增的 f001 细化）命中值泄漏形，tsx 实测输出 `https://app.example/#[REDACTED]`；断言 `toContain('#[REDACTED]')` 能区分「整体替换」与「逐 key 脱敏」（逐 key 会保留 route/参数结构，不含 `#[REDACTED]`），fail-closed 特有行为被真实验证。AC-004b（:50-55）输入 `#token%3DSECRET%ZZ` 走 encode 分支 `decodeURIComponent` 失败（:255-261），实测输出 `/path#[REDACTED]`。两条 fail-closed 实现路径（route 值泄漏形、encode decode 失败）均有覆盖。另新增 AC-004c（:57-62）锚定普通路由名 `#/oauth/token?client_id=abc` 保形（实测 captured + 原串），把「值泄漏形 fail-closed / 路由名保形」行为分界锁进测试，与生产代码 route 分支细化（:273-277）语义一致，非迁就实现。
- t173_test_f002（minor）：**已修**。AC-003c（:36-40）补 `expect(r.url_status).toBe('captured')` 与 `toBe('https://app.example/#/orders/123')` 全串相等，与 003a/003b 断言强度对齐。
- t173_test_f003（minor）：**已修**。AC-005a（:68）补 `expect(r.url).toContain('REDACTED')`。实现用 `'REDACTED'` 而非 `'[REDACTED]'` 是正确选择——encoded 回写后 `[`/`]` 被 `encodeURIComponent` 编码为 `%5B`/`%5D`，字面 `[REDACTED]` 不出现，`'REDACTED'` 精确命中「参数脱敏并回写」，且拒绝「整体删除 hash」形态。

### 改测方向复核

无迁就实现的改测：本轮全部为新增测试与断言增强，003c/005a 只加断言、未改既有预期值；生产代码 route 分支改动由 code reviewer f001 细化驱动（区分值泄漏形与普通路由名），AC-004a/c 测试与之一致。

### 本轮新发现

0 条。危险模式扫描全干净（无 skip/only/恒真断言/注释断言/条件跳过/阈值掩盖；无 mock，直接调用真实 `redact_url`）。`npx vitest run tests/unit/url_fragment_redaction.test.ts` 12/12 绿。AC-001/002/003/005 断言强度维持 Round 1 水平，AC-004 补齐为双路径 fail-closed + 防过度脱敏回归。

### 未进表的提示

`route_has_credential_value` 正则词表 `(token|password|passwd|secret|api[-_]?key|jwt)`（`src/shared/redaction.ts:297`）不含 `credential`/`access_token`/`id_token`/`refresh_token`（`CREDENTIAL_HASH_PATTERNS` 已含），`#/credential/abc` 形态值泄漏不触发 fail-closed。属实现层覆盖面，归 code reviewer（`review_code.md` 已在场，是否已覆盖未知）；测试层 AC-004 已闭合，不进 finding。

### AC 复验方式（Round 2）

- AC-001：`re_verified`。测试绿（:7-14），断言未变。
- AC-002：`re_verified`。测试绿（:16-22），断言未变。
- AC-003：`re_verified`。003a/b/c 全部 `captured` + 全串相等（:24-40）。
- AC-004：`re_verified`。tsx 实测 004a/004b/004c 三输入输出与断言一致：`#[REDACTED]`（整体替换）/`/path#[REDACTED]`（整体替换）/原串保形，fail-closed 分支真实触达。
- AC-005：`re_verified`。005a/b/c 测试绿，005a 补 `REDACTED` 占位断言（:68）。

coverage = 5 / 5

reviewed_scope: 71e1eeb86a771436

verdict: PASS
