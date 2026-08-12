# Task review t131（reviewer_focus: 代码）

- task：`t131_redact_url_keep_shape`
- spec：`docs/tasks/t131_redact_url_keep_shape/spec.md`
- diff_anchor：`2b599e343b1ad6952cf4d4ca3c74070a75ab1150`
- target：`git diff 2b599e343b1ad6952cf4d4ca3c74070a75ab1150`
- round：1
- reviewed_at：2026-08-12 13:57 UTC+8

reviewed_scope: 75de5b6f5077715e

## Findings

### t131_code_f001 - redact_data=true 时 ws data_preview 无条件置 '[REDACTED]'，覆盖 binary/too_large 的 null

- 严重度：minor
- 锚点：AC-006（data_preview 不落明文），实现已合规，但语义边界被覆盖
- 位置：`src/extension/content/websocket_capture.ts:200`
- 问题：`data_preview: redact_data ? '[REDACTED]' : (d.data_preview ?? null)`。修前 `data_status='binary'` / `'too_large'` 时注入脚本传 `data_preview: null`（无文本）；现在 `redact_data=true`（默认配置）时统一改写为 `'[REDACTED]'`，丢失「无文本」与「文本已脱敏」的区分。当前无消费者依赖 `data_preview === null` 判 binary（grep 确认 data_preview/data_status 仅 types 与 websocket_capture 引用），无现时可观测缺陷，故 minor。
- 建议：仅当 `d.data_preview !== null` 时置 `'[REDACTED]'`，即 `data_preview: redact_data ? (d.data_preview != null ? '[REDACTED]' : null) : (d.data_preview ?? null)`；或由 implementer 判定为可接受语义并在处置表记录。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：1 条（f001）
- 未进表的提示：
  - 文件过大：无命中阈值。`network_hook.ts` 399 行（未达 400）；`types.ts` 712 行为共享契约单文件（协议一体），本 task 仅 +1 行（WsMessageData.url_status 必填字段）。均不进表。
  - 复杂度：`redact_url` 手算 CC ≥10（约 15，含本 task 新增的三元分支）。本 task 只改返回语句，未增加分支复杂度，不进表，建议后续拆分 try/catch 双分支。
  - 范围外观察：
    1. 脱敏路径 URL 仍走 `parsed.toString()` 规范化（参数重排、尾斜杠、host 降写）。H3 只修「无敏感参数」路径；脱敏路径沿用既有规则，符合 AC-002「按既有规则脱敏」字面。若后续要求脱敏时也保形，需扩展（建议 follow-up）。
    2. logger 字段级脱敏仅覆盖对象 key（AC-009 范围）；裸字符串（如 `{ headers: 'authorization: Bearer xyz' }`）与 Map/Set 的 key 不脱敏，H-19 精神上仍可泄漏，AC 未要求，留作潜在扩展。
    3. spec「Finalization 时更新的 blueprint」要求更新 `docs/blueprint/domain.md` 脱敏条目，属收尾步骤，本 diff 未含。
- 总体判断：11 条 AC 全部有实现且测试通过（74 passed / tsc clean），无未解决 critical/important，PASS。
- AC 复验方式：
  - AC-001：re_verified。重跑 `redaction.test.ts`，`preserves absolute URL shape when no sensitive params` 断言原串返回 + captured；读代码确认 `redacted ? parsed.toString() : url`。
  - AC-002：re_verified。`still normalizes when redaction happens` 断言脱敏 + 其余参数保留。
  - AC-003：re_verified。catch 分支未改，既有相对 URL 用例通过。
  - AC-004：re_verified。嵌套 query 递归逻辑未动，既有 redaction 全量用例通过。
  - AC-005：re_verified。`websocket_capture_page.test.ts` 三个 H3 用例覆盖 ws_url 脱敏/开关矩阵 + url_status。
  - AC-006：re_verified。用例断言 data_preview='[REDACTED]' 且 direction/data_bytes 保留。
  - AC-007：re_verified。`network_hook_gate_behavior.test.ts` 断言 fallback URL 脱敏 + url_status='redacted'。
  - AC-008：re_verified。redact_data=false 用例断言 URL/data_preview 与修前一致。
  - AC-009：re_verified。`logger.test.ts` 两个 H3 用例断言对象/嵌套 credential 字段置 '[REDACTED]'。
  - AC-010：re_verified。重跑 logger 既有用例全部通过；grep 各 logger 调用点的详情 key，无合法 key 命中敏感子串。
  - AC-011：re_verified。5 个触碰测试文件 74 用例全过，`tsc --noEmit` 干净。
  - coverage = 11 / 11
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-12 14:00 UTC+8)

### 前轮 finding 复核

- t131_code_f001（ws data_preview 覆盖 binary/too_large null）：已消除。核实 `git diff`：websocket_capture.ts:200 改为 `data_preview: redact_data && raw_preview !== null ? '[REDACTED]' : raw_preview`，binary/too_large 原本 `data_preview=null` 不再被改写；新增用例 `redact_data=true 时 binary 消息 data_preview 保持 null（非 [REDACTED]）` 锁定该语义。重跑 websocket_capture_page.test.ts 通过。

### 本轮新发现

- 0 条

### 结论

- 前轮 finding 复核：f001 已修（上述，以 diff 为准）；未产生新 blocker。
- 本轮新发现：0 条
- 未进表的提示：
  - 无。修复未触碰其他生产文件（仅 websocket_capture.ts 1 行语义 + 测试）。
  - 附带新增 2 个 logger 测试（cookie/set-cookie/secret、token 值为对象），断言为合法强断言（`toBe('[REDACTED]')` / `toBe('keep')`），无弱化。
- 总体判断：f001 minor 已消除，无未解决 critical/important，PASS。
- AC 复验方式（Round 2 补充）：
  - AC-006：re_verified。binary 消息 `data_preview` 保持 null、`data_status='binary'` 断言通过；文本消息 redact 开启置 '[REDACTED]' 保留。
  - AC-009：re_verified。新增 `token: { client_id, secret_key }` 对象形态用例断言整体置 '[REDACTED]'，确认对象形态脱敏。
  - coverage（累计）= 11 / 11

reviewed_scope: 81c4403cb789bbe3

verdict: PASS
