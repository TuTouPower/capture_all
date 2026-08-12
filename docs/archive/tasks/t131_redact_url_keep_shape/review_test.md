# Task review t131（reviewer_focus: 测试）

- task：`t131_redact_url_keep_shape`
- spec：`docs/tasks/t131_redact_url_keep_shape/spec.md`
- diff_anchor：`2b599e343b1ad6952cf4d4ca3c74070a75ab1150`
- target：`git diff 2b599e343b1ad6952cf4d4ca3c74070a75ab1150`
- round：1
- reviewed_at：2026-08-12 14:10 UTC+8

## Findings

### t131_test_f001 - AC-009 枚举字段名覆盖不全（cookie/set-cookie/secret 无直接断言）

- 严重度：minor
- 锚点：AC-009
- 位置：`tests/unit/logger.test.ts:131-154`
- 问题：AC-009 枚举 7 个敏感字段名（authorization/cookie/set-cookie/x-api-key/token/secret/password）。新增两用例直接断言了 authorization、x-api-key、token（经 access_token/refreshToken 子串命中）、password；cookie、set-cookie、secret 三个字段名无直接断言。实现是共享数组 `SENSITIVE_LOG_FIELDS` 驱动（`src/shared/logger.ts:44-48`），代表用例已证明匹配机制，但 AC 逐条列出的字段未全覆盖。属「覆盖可更广」，非阻断。
- 建议：在 f001 两个用例中补 `cookie`/`set-cookie`/`secret` 字段断言，一行一处即可。

### t131_test_f002 - AC-009 敏感字段值为对象形态未测

- 严重度：minor
- 锚点：AC-009（「对象与字符串形态」）
- 位置：`tests/unit/logger.test.ts:131-154`
- 问题：AC-009 括注「对象与字符串形态」。新增用例中敏感字段的值均为字符串（'Bearer xyz'、'KEY123'、'AT'、'pw'）；敏感字段值本身为对象（如 `authorization: { 'client-id': 'x' }`）时是否整体置 '[REDACTED]' 未验证。实现 `sanitize_value` 对命中字段直接返回 `'[REDACTED]'`（`src/shared/logger.ts:82`），与值形态无关，理论行为正确；属覆盖缺口非行为缺陷。
- 建议：补一个敏感字段值为对象的用例，断言整体置 '[REDACTED]' 且不递归泄露内部字段。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（Round 1）
- 改测方向复核：无「迁就实现」改测。`network_hook_config_gate.test.ts` 三处正则更新（AC-001 的 `[^}]*`→`[\s\S]*?`、AC-002 改匹配 redact_data、AC-003 去尾部 `\)`）均为实现签名变更（start_network_hook/start_websocket_capture 新增脱敏配置对象实参）的必然结果——对象字面量实参引入 `{`/`}` 与 `)` 使旧正则无法命中；AC-002 现额外断言 redact_data 接入（断言增强而非弱化），AC-003 仍验证 capture_response_body 传参语义。属结构层变更后的合法同步，非实现驱动测试。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：范围外观察——`is_sensitive_log_field` 采用子串匹配（如 'secretary' 含 'secret' 会误脱敏），属设计取舍、非本 task 缺陷，且当前用例（Content-Type 保留）已防主要误伤。无其他。
- 总体判断：全部 11 条 AC 均有可触达生产逻辑的测试；无危险模式命中（无恒真/弱化/删 expect/skip/静默错误/mock 被测逻辑）；两处 minor 为覆盖扩展建议，不阻断。
- 系统性 follow-up：无

### AC 复验方式

- AC-001 `re_verified`：`redaction.test.ts:117-120` 直接断言 `redact_url('http://example.com', true)` 返回原串且 status='captured'；实现 `src/shared/redaction.ts:160` `redacted ? parsed.toString() : url` 与之一致。
- AC-002 `re_verified`：`redaction.test.ts:129-135` 断言 token=%5BREDACTED%5D、name=test 保留、status='redacted'。
- AC-003 `re_verified`：既有 `redaction.test.ts:84-87`（相对 URL 'not-a-url' 原样返回）；实现 catch 分支无 query 时返回原串（`redaction.ts:167`）。
- AC-004 `re_verified`：既有 `t114_form_entry_redaction.test.ts:54-66` 嵌套 query（plain 与 encoded）用例；实现 redacted=true 时仍走 `parsed.toString()`（`redaction.ts:160`），与原路径一致。
- AC-005 `re_verified`：`websocket_capture_page.test.ts:114-128` redact_data && redact_url_query=true 时 url_status='redacted'、ws_url 不含 SECRET；`:130-139` redact_url_query=false 时 status='captured'。
- AC-006 `re_verified`：`websocket_capture_page.test.ts:124-127` data_preview='[REDACTED]'、direction='received'、data_bytes=13 保留。
- AC-007 `re_verified`：`network_hook_gate_behavior.test.ts:78-95` fallback URL query 脱敏、url_status='redacted'、id=1 保留；`:97-112` redact_url_query=false 不脱敏。
- AC-008 `re_verified`：`websocket_capture_page.test.ts:141-150` 与 `network_hook_gate_behavior.test.ts:114-129` redact_data=false 时 URL/data_preview 原样、status='captured'。
- AC-009 `re_verified`：`logger.test.ts:131-154` 断言 authorization/x-api-key/token/password 置 '[REDACTED]'；cookie/set-cookie/secret 无直接用例（见 f001）。
- AC-010 `re_verified`：`logger.test.ts:141` Content-Type 保留 + 既有 plain-object/字符串原样用例（`:46-63`、`:203-210`）；实现 `logger.ts:82` 非敏感字段走原 sanitize 路径。
- AC-011 `re_verified`：各被改测试文件旧用例语义未变（新签名默认不脱敏：redact_data=false 时 URL/预览原样），config_gate 正则更新为新签名适配；实现与既有测试断言逐条核对一致。

coverage = 11 / 11

reviewed_scope: 75de5b6f5077715e

verdict: PASS

## Round 2 (2026-08-12 14:35 UTC+8)

### 前轮 finding 复核（以 diff 为准，不采信处置表）

- **t131_test_f001（cookie/set-cookie/secret 字段名直接断言）**：已消除。新增 `it('redacts cookie/set-cookie/secret fields (H3)')`（`tests/unit/logger.test.ts`），断言 `details.headers.cookie`、`details.headers['set-cookie']`、`details.headers.secret` 均 `toBe('[REDACTED]')`，且 `X-Custom`='keep' 保留。AC-009 枚举 7 字段现全部有直接断言（authorization/x-api-key 首用例、token/password 第二用例、cookie/set-cookie/secret 新用例）。
- **t131_test_f002（敏感字段值为对象形态）**：已消除。新增 `it('redacts sensitive field whose value is an object (H3)')`（`tests/unit/logger.test.ts`），`{ token: { client_id: 'x', secret_key: 'y' } }` 断言 `details.token` 整体 `toBe('[REDACTED]')`，验证命中字段直接置 '[REDACTED]'、不递归泄露内部字段。

### 本轮新发现

- 0 条 blocking。附注（code reviewer 范畴，非本轴 finding）：implementer 随 code_f001 对 `src/extension/content/websocket_capture.ts` 做实现变更——`data_preview` 仅当原始文本非 null 才置 '[REDACTED]'，binary/too_large 保持 null（避免「无文本」与「已脱敏」混淆）。配套新增测试 `redact_data=true 时 binary 消息 data_preview 保持 null（非 [REDACTED]）`（`tests/unit/websocket_capture_page.test.ts`）佐证：断言 `data_preview` 为 null、`data_status` 为 'binary'，走真实 message_listener + 生产逻辑。测试 reviewer 复核：既有 too_large/binary 用例（redact_data 默认 false）语义不变，AC-006（文本 preview 置 '[REDACTED]'、元数据保留）仍满足。

### Round 2 结论

- 前轮 finding 复核：f001 已消除、f002 已消除（均以 diff 核实，非处置表自述）
- 改测方向复核：无（本轮仅新增测试，未改既有测试预期，无「迁就实现」改测）
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：f001/f002 补测到位、断言精确 `toBe`/`toBeNull`、无危险模式命中；无未解决 critical/important
- 系统性 follow-up：无

### AC 复验方式（Round 2 增量）

- AC-006 `re_verified`：binary 边界新增用例断言 redact_data=true 时 `data_preview`=null 保持；文本 preview 置 '[REDACTED]' 由 Round 1 用例保留。实现 `websocket_capture.ts` `redact_data && raw_preview !== null ? '[REDACTED]' : raw_preview` 与断言一致。
- AC-009 `re_verified`：7 个枚举字段现均有直接断言（新增 cookie/set-cookie/secret 用例 + 对象值用例）。

coverage = 11 / 11（Round 1 全项保持，Round 2 增量复验 AC-006/AC-009）

reviewed_scope: 81c4403cb789bbe3

verdict: PASS
