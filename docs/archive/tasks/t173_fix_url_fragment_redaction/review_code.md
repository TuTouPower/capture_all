# Task review t173（reviewer_focus: 代码）

- task：`t173_fix_url_fragment_redaction`
- spec：`docs/tasks/t173_fix_url_fragment_redaction/spec.md`
- diff_anchor：`0a5442480a4d64aed8e4e70d1e55e01c4f6043dd`
- target：`git diff 0a5442480a4d64aed8e4e70d1e55e01c4f6043dd`
- round：1
- reviewed_at：2026-08-13 19:45 UTC+8
reviewed_scope: 944893c1537c7bd3

## Findings

### t173_code_f001 - fail-closed 判定作用于解析成功的 fragment，过度脱敏非敏感内容

- 严重度：minor
- 锚点：AC-003（普通锚点与无敏感 hash route 保持原形）与 spec 范围「解析失败但命中 credential 模式时 fail-closed 替换整个 fragment」
- 位置：`src/shared/redaction.ts:264-282`（`redact_hash` 的 `?` 分支与 `=` 分支）
- 问题：fail-closed 的 `hash_has_credential(hash_body)` 用**全串**子串匹配，且不限于「解析失败」场景。两处可复现：
  - `redact_url('https://app.example/#/oauth/token?client_id=abc', true)` → `https://app.example/#[REDACTED]`。fragment 解析成功（route `/oauth/token` + query `client_id=abc`），query 无敏感 key（`client_id` 不命中 `SENSITIVE_URL_PARAM_PATTERNS`），仅因 route 含 `token` 字串即整体替换，非敏感的 `client_id=abc` 一并丢失（:268-272）。
  - `redact_url('https://app.example/#foo=bar_token_baz', true)` → `https://app.example/#[REDACTED]`。key=value 解析成功（:275），key `foo` 非敏感、value 无嵌套 query，`redact_query_string` 返回 null 后仅因 value 含 `token` 子串整体替换（:277-281）。
  与 AC-003 的保形承诺冲突（该例 query/key 均无敏感项），且与同名无 query route 行为不对称：`redact_url('https://app.example/#/token/abc', true)` 保形（无 `?`/`=` 走 :283-284 普通锚点分支）。spec 风险区已预警「过度脱敏普通 hash route 破坏可读性」，回退方向是「仅对可解析 credential 模式的 fragment 脱敏」——实现把「全串含凭据子串」等同于「可解析 credential 模式」，范围超出字面 fail-closed 条件（解析失败）。安全方向无泄漏（均为过度脱敏），但可用性有损。
- 建议：二选一——(a) 限缩 fail-closed 触发条件至真解析失败场景（encode 分支 `decodeURIComponent` 异常、或无法拆出 `?`/`=` 结构但含凭据），`?`/`=` 分支解析成功时按 query 规则结果保形/脱敏即可；(b) 若保留现状，在 spec 上下文区补一句「结构可解析但含凭据子串的 fragment 也 fail-closed 整体替换」明示该语义（实现合理但超出 spec 字面范围，按 prompt 规则处置为改 spec）。

### t173_code_f002 - redact_url 圈复杂度 ≥15，本 task 继续增加分支

- 严重度：minor
- 锚点：无 AC（复杂度本身不 blocking）
- 位置：`src/shared/redaction.ts:109`（`redact_url`）
- 问题：手算近似 McCabe ≈ 18（try/catch、absolute 分支敏感 key 双循环 + 嵌套 value map、hash 块 `if (parsed.hash)` + `if (redacted_hash !== null)`、catch 分支 `query_marker === -1` + 两处 `if (hash_part)`/`if (redacted_hash !== null)`），超过 ≥15 阈值；t173 净增 absolute +2、relative +2 分支（hash 处理块）。当前分支密度使双路（absolute/relative）维护与复核成本上升，但未观察到由此产生的行为缺陷。
- 建议：将 catch 分支（相对 URL 手动拆 path/query/hash）抽为私有函数（如 `redact_relative_url`），`redact_url` 收敛为「try 绝对分支 / catch 调相对分支」的薄分发；absolute 分支的 query 与 hash 处理已足够独立，可不动。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：本轮无
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - **文件膨胀**：无。`src/shared/redaction.ts` 330 行（含 t173 净增 ~107 行）未达 400 阈值；`tests/unit/url_fragment_redaction.test.ts` 73 行远低于 600。
  - **复杂度**：`redact_hash` CC ≈ 8（空判断、encode 分支 try/catch + null 判断、`?`/`=` 分支各一 null 判断），未达 10；`redact_query_string` CC ≈ 4。不进表。
  - **编码回写形态（审阅重点）**：encoded 分支 `encodeURIComponent(inner)` 把 `[REDACTED]` 回写为 `%5BREDACTED%5D`（实测 `#access_token%3DSECRET%26type%3Dbearer` → `#access_token%3D%5BREDACTED%5D%26type%3Dbearer`）。与 t114 既有先例一致（`redact_nested_value` :104 编码嵌套 value 同样整体 `encodeURIComponent` 回写），解码后可见 `[REDACTED]`，URL 编码合法性保持，可接受。补充观察：同一 URL 中 query 侧（searchParams 序列化）用 `%5BREDACTED%5D`、hash 侧（字面赋值）用 `[REDACTED]`，形态不一致但各自符合既有约定，非 t173 引入的缺陷。
  - **absolute 分支 hash × toString() 交互（审阅重点）**：hash 脱敏后 `redacted=true` → `parsed.toString()` 重建 URL。探针确认 hash 内 `[`/`]` 不被 URL 序列化额外编码（输出字面 `[REDACTED]`），`?next=1#access_token=SECRET` → `https://app.example/?next=1#access_token=[REDACTED]`，query 不受影响；H3 保形逻辑（无敏感时返回原串）在 hash 无敏感时不触发 toString，普通锚点原样保留（`#section`、`#/dashboard` 全串相等）。无规范化副作用。
  - **范围外观察（交 test reviewer 跟进，不重复进表）**：AC-004 的三条 fail-closed 实现路径（encode decode 异常 :255-257、route 含凭据 :269-272、`=` 无敏感但 body 含凭据 :278-281）实现正确（探针：`/x#token%3DSECRET%ZZ` → `/x#[REDACTED]`），但仓库测试 `tests/unit/url_fragment_redaction.test.ts:41-46` 的输入 `/path#token=SECRET%ZZ` 走 `=` 分支普通脱敏，未触达 fail-closed；该问题已由 test reviewer 以 `t173_test_f001`（critical）提出。
  - **相对分支等价性核对（审阅重点）**：`redact_query_string` 为旧 inline 逻辑逐字抽取，`?? query_part` 在无敏感时精确恢复原 query 串，`out_params.join('&')` ≡ 原串；既有 68 条 redaction 测试（`redaction.test.ts` 36、`t114_*` 30、`form_entry` 2）全绿，无回归。
  - **泄漏扫描**：无。`%3D`/`%3F` 编码、双层编码（`%253D` 逐层解码递归）、嵌套 URL 值（字面 `?` 与编码两种形态）、key decode 后匹配等路径均验证有敏感项必被脱敏；`redact_query=false` 时 fragment 保形语义未变（测试覆盖）。
- 总体判断：AC-001~005 实现齐备且行为正确，未发现泄漏或回归；2 条 minor（fail-closed 过度脱敏边界、复杂度）不阻断，实现层可 PASS。
- 系统性 follow-up：无（fail-closed 边界为 spec 语义澄清问题，如采纳 f001 选项 (b) 走本 task 处置，不需新建 task）

### AC 复验方式

- AC-001：`re_verified`。`npx vitest run tests/unit/url_fragment_redaction.test.ts` 10/10 绿；tsx 实测 `#access_token=SECRET&token_type=bearer` → `access_token=[REDACTED]&token_type=[REDACTED]`，无 SECRET 残留。
- AC-002：`re_verified`。实测 `#/route?token=SECRET&state=abc` → `/route?token=[REDACTED]&state=abc`；route query 递归处理正确。
- AC-003：`re_verified`。实测 `#section`、`#/dashboard`、`#/orders/123` 全串保形且 `url_status='captured'`；`#foo=bar`、`#state=abc&error=access_denied` 亦保形。
- AC-004：`re_verified`（实现层）。三条 fail-closed 路径逐一探针验证：decode 失败 `/x#token%3DSECRET%ZZ` → `/x#[REDACTED]`、route 凭据 `#/token/SECRET?state=x` → `#[REDACTED]`、值凭据 `#foo=bar_token_baz` → `#[REDACTED]`。注意：仓库内测试未触达该分支（见结论段范围外观察，test reviewer 已标 critical）。
- AC-005：`re_verified`。encoded hash（`%3D/%3F` 解码递归 + 编码回写）、query+hash 组合、相对 URL 双脱敏均实测通过；`not.toContain('SECRET')` 对旧实现（hash 原样保留）必红。

coverage = 5 / 5

verdict: PASS

## Round 2 (2026-08-13 19:50 UTC+8)

### 前轮 finding 复核（以 `git diff 0a5442480a4d64aed8e4e70d1e55e01c4f6043dd` 为准）

- **t173_code_f001**：主锚点已修，'=' 分支残留记录在案。
  - route query 分支判定已从全串 `hash_has_credential` 改为值泄漏形 `route_has_credential_value`（`src/shared/redaction.ts:290-293`）。探针复验：`#/oauth/token?client_id=abc`、`#/settings/tokens?page=1` 保形（f001 主锚点解决）；`#/token/SECRET?state=x`、`#/password/xxx?from=1` 整体替换 `#[REDACTED]`。正则 `/\/(token|password|passwd|secret|api[-_]?key|jwt)\/[^\/?#]+/` 固定模式、无嵌套量词，无 ReDoS；大小写经 `toLowerCase()` 处理；编码值（`/token/SEC%45CRET`）仍匹配。`/tokens/abc` 复数、`/jwt-token/abc` 连字符路由名均不误伤。
  - 残留：'=' 分支与 encode decode 失败分支按处置决策保留全串 `hash_has_credential` 判定（`src/shared/redaction.ts:276-281`、:253-261），Round 1 f001 第二案例 `#foo=bar_token_baz` → `#[REDACTED]` 的过度脱敏仍在（探针确认）。属 implementer 显式范围决策且安全方向保守，severity 维持 minor，不阻断；建议采纳 Round 1 选项(b)——在 spec 上下文区明示「key=value 解析后全串含凭据子串亦 fail-closed」语义，或处置表标「遗留」。
- **t173_code_f002**：已修。catch 分支抽为 `redact_relative_url(url, depth, allow_encoded)`（`src/shared/redaction.ts:176-212`），`redact_url` 收敛为 try 绝对分支 + catch 薄转发。手算 CC：`redact_url` ≈ 13（<15，较 Round 1 的 18 下降）、`redact_relative_url` ≈ 6、`redact_hash` ≈ 8、`redact_query_string` ≈ 4，均低于阈值。参数透传（`_depth`→`depth`、`_allow_encoded`→`allow_encoded`）无语义变化。

### 本轮新发现

- 无新 blocking；无新 minor 进表（见下「未进表的提示」）。

### 验证证据

- `npx vitest run tests/unit/url_fragment_redaction.test.ts tests/unit/redaction.test.ts tests/unit/t114_nested_query_redaction.test.ts tests/unit/t114_form_entry_redaction.test.ts` → 4 文件 80 测试全绿（新测试 12：AC-001/002/003a-c/004a-c/005a-c/保形）。
- `npx tsc --noEmit` → exit 0。
- AC-004b 测试输入已改为 `#token%3DSECRET%ZZ`（含 `%3D` 触发 encode 分支 decode 失败 → 真 fail-closed `#[REDACTED]`），正确触达此前未覆盖的 fail-closed 分支；AC-004a 覆盖 route 值泄漏形、AC-004c 锁定 f001 保形回归（测试层修复由 test reviewer 复核，脚本 `test_verdict=PASS`）。

### 未进表的提示

- 无。文件行数：`redaction.ts` 336 行未达 400 阈值；复杂度均低于阈值；无死代码/未用 import；`route_has_credential_value` 无 ReDoS 风险。
- 设计取舍观察（不标）：`#/token/SECRET`（无 query）按 AC-003 保形、`#/token/SECRET?state=x`（有 query）fail-closed，两者行为不对称——前者属「无敏感 hash route 保形」spec 语义内，后者为值泄漏形 fail-closed，均符合各自规则。

### AC 复验方式（Round 2）

- AC-001：`re_verified`。测试重跑绿；探针 `#access_token=SECRET&token_type=bearer` → `access_token=[REDACTED]&token_type=[REDACTED]`。
- AC-002：`re_verified`。探针 `#/callback?token=SECRET&state=abc` → `/callback?token=[REDACTED]&state=abc`。
- AC-003：`re_verified`。003a/b/c 全串相等断言绿；探针 `#/oauth/token?client_id=abc`、`#/settings/tokens?page=1`、`#/orders/123`、`#section` 全保形。
- AC-004：`re_verified`。AC-004a（route 值泄漏形 `#[REDACTED]`）、AC-004b（decode 失败 `#[REDACTED]`）测试绿且探针输出一致；AC-004c 锁定 route 名保形。
- AC-005：`re_verified`。005a/b/c 绿；`toContain('REDACTED')` 已补，锁编码回写形态。

coverage = 5 / 5

reviewed_scope: 02938f0764b2b54e

verdict: PASS

### Round 2 补充（f003 新增，2026-08-13 19:55 UTC+8）

复核 test reviewer Round 2「未进表的提示」（`route_has_credential_value` 词表缺 `credential`/`access_token`/`id_token`/`refresh_token`，归 code reviewer）后，探针确认该缺口成立，且为 f001 修复引入的**覆盖回退**，进表。

### t173_code_f003 - route 值泄漏形词表与 CREDENTIAL_HASH_PATTERNS 不同步，凭据路由段漏 fail-closed（修复引入的回归）

- 严重度：important
- 锚点：spec 范围「解析失败但命中 credential 模式时 fail-closed 替换整个 fragment」；行为缺陷锚点见下
- 位置：`src/shared/redaction.ts:290-293`（`route_has_credential_value` 词表 `(token|password|passwd|secret|api[-_]?key|jwt)`）
- 问题：同一任务新增的 `CREDENTIAL_HASH_PATTERNS`（:13，含 `access_token`/`id_token`/`refresh_token`/`credential`/`apikey`）是 fail-closed 判定模式，但 f001 修复引入的 route 值泄漏形判定词表未同步，四类凭据路由段漏拦截。可复现（探针实测）：
  - `redact_url('https://app.example/#/access_token/abc?x=1', true)` → 保形 `url_status='captured'`，凭据值 `abc` 原样采集（`token` 段可拦截、`access_token` 段不可，因段匹配要求 `/token/` 而 `access_token` 中 `token` 前为 `_`）。
  - 同漏：`#/refresh_token/abc?x=1`、`#/id_token/abc?x=1`、`#/credential/abc?x=1`。
  - **回归性**：Round 1 版本该分支用全串 `hash_has_credential`，对上述输入全部 fail-closed 拦截；f001 收窄为段匹配词表后放行。修过度脱敏的同时造成欠脱敏回退。
  - 已覆盖（对照确认）：`#/token/SECRET`、`#/api_key/abc`、`#/apikey/abc`（`[-_]?` 允许零分隔符）均正确 fail-closed。
- 建议：词表补齐为 `(token|password|passwd|secret|api[-_]?key|apikey|credential|access_token|id_token|refresh_token|jwt)`。无新误伤面：`/oauth/token/abc` 的 `oauth` 非词、`/settings/tokens/abc` 复数不在词表，均不命中；`access_token` 等作为路由段本身就是凭据语义。同步补测试（如 `#/access_token/abc?x=1` → `#[REDACTED]`）。
- 注：`credential` 在 `SENSITIVE_URL_PARAM_PATTERNS`（query key 规则）与 `CREDENTIAL_HASH_PATTERNS` 均为凭据词，作为路由段漏判更无歧义。

### 结论（Round 2 补充）

- 前轮 finding 复核：f001 主锚点已修（route 名保形正确），'=' 分支全串判定残留（minor，记录在案）；f002 已修（CC 达标、行为等价、80 测试绿、tsc 0）。
- 本轮新发现：1 条（t173_code_f003，important——route 值泄漏形词表覆盖回退）。
- 未进表的提示：无新增。
- 总体判断：f001/f002 修复方向正确且经测试验证，但 f003 为未解决 important（f001 修复引入的 fail-closed 覆盖回退，凭据路由段值泄漏），需 implementer 修复后进入下一轮复核。
- 系统性 follow-up：无（f003 在本 task 内修复即可）。

verdict: FAIL

## Round 3 (2026-08-13 19:58 UTC+8)

### 前轮 finding 复核（以 `git diff 0a5442480a4d64aed8e4e70d1e55e01c4f6043dd` 为准）

- **t173_code_f003**：**已修**。`route_has_credential_value` 词表补齐为 `(token|password|passwd|secret|api[-_]?key|jwt|credential|access_token|id_token|refresh_token)`（`src/shared/redaction.ts:293`），与 `CREDENTIAL_HASH_PATTERNS`（:13）完全对齐（`api[-_]?key` 另覆盖 `api-key`，无妨）。探针复验：`#/access_token/abc?x=1`、`#/refresh_token/abc?x=1`、`#/id_token/abc?x=1`、`#/credential/abc?x=1`、`#/apikey/abc?x=1` 全部 `#[REDACTED]`（Round 2 泄漏案例已闭合）。无新误伤：`#/oauth/token?client_id=abc`、`#/settings/tokens?page=1`、`#/tokens/abc?x=1`（复数）、`#/user-token/abc?x=1`、`#/jwt-token/abc?x=1` 均保形。AC-004d（`tests/unit/url_fragment_redaction.test.ts:57-64`）表驱动枚举 4 形态断言 `#[REDACTED]` + 无 `SECRET`，带 `leak` 消息参数区分失败项，非弱断言。
- **t173_code_f001**：维持已修（主锚点）。AC-004c 保形断言与探针一致；'=' 分支全串判定残留（`#foo=bar_token_baz` → `#[REDACTED]`，minor）按处置决策保留，Round 3 不复核改动。
- **t173_code_f002**：维持已修。`redact_url` CC ≈13、`redact_relative_url` ≈6；80 测试 + tsc 0 无回归。

### 本轮新发现

- 无。词表扩展未引入新分支（单行正则），正则仍无 ReDoS；测试编号 004a/004b/004d/004c 非递增仅编号顺序问题（AC 唯一性无冲突），不进 finding。

### 验证证据

- `npx vitest run tests/unit/url_fragment_redaction.test.ts tests/unit/redaction.test.ts tests/unit/t114_nested_query_redaction.test.ts` → 3 文件 79 测试全绿（含 AC-004d）。
- `npx tsc --noEmit` → exit 0。
- 探针：4 形态 fail-closed + 5 路由名保形 + 主路径，全部符合预期。

### 未进表的提示

- 无。

### AC 复验方式（Round 3）

- AC-001/002/003：`re_verified`。测试绿；AC-003c 全串相等保形；探针 `#/oauth/token`、`#/settings/tokens` 保形。
- AC-004：`re_verified`。AC-004a/b（`#[REDACTED]` 整体替换）、AC-004d（4 形态词表补齐）测试绿且探针一致；AC-004c 锁 f001 保形。
- AC-005：`re_verified`。005a/b/c 绿，`REDACTED` 占位断言锁编码回写。

coverage = 5 / 5

reviewed_scope: 71e1eeb86a771436

verdict: PASS
