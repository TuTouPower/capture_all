# Task review t171（reviewer_focus: 测试）

- task：`t171_fix_body_capture_privacy_default`
- spec：`docs/tasks/t171_fix_body_capture_privacy_default/spec.md`
- diff_anchor：`9d9a0f34ff67782abc55377e9648bdea051d8916`
- target：`git diff 9d9a0f34ff67782abc55377e9648bdea051d8916`
- round：1
- reviewed_at：2026-08-13 18:57 UTC+8

## Findings

### t171_test_f001 - AC-005：PRIVACY.md 未同步 body 默认与脱敏边界，测试锁定与实现冲突的旧文案

- 严重度：important
- 锚点：AC-005（公开文档 README/PRIVACY 的 body 默认与脱敏边界描述与实现一致）
- 位置：`PRIVACY.md:19`、`PRIVACY.md:27`；`tests/unit/public_docs.test.ts:145`
- 问题：本次 diff 未改动 `PRIVACY.md`，其内容与新实现直接冲突：
  - `PRIVACY.md:19` 仍写「Input values, request bodies, and response bodies are enabled by default.」——与 AC-001 默认关闭矛盾（仅 input values 仍默认开启）。
  - `PRIVACY.md:27` 仍写「request and response bodies are not content-scanned for credentials」——与 AC-002 新实现（落库前按 MIME 敏感 key 脱敏）矛盾。
  - 测试侧 `public_docs.test.ts:145` 断言 `expect(privacy).toContain('request and response bodies are not content-scanned')`，在**主动锁定**已过时的错误文档声明；`public_docs.test.ts` 的 t171 新测试（117-131 行）只断言 README.md / README.en.md，未覆盖 PRIVACY。AC-005 对 PRIVACY 一半未实现且被测试反向锁定。
- 建议：更新 `PRIVACY.md` 第 19/27 行（body 默认关闭、开启后按 MIME 敏感 key 脱敏、不可解析降级 hash/长度/preview），并更新 `public_docs.test.ts:137/145` 断言以匹配新 PRIVACY 文案（删除/改写 not content-scanned 断言）。

### t171_test_f002 - AC-003a：preview 截断断言数学恒真，无法验证「不落盘完整原始内容」

- 严重度：important
- 锚点：AC-003（无法安全解析的 body 以 hash/长度/preview 存储，不落盘完整原始内容）
- 位置：`tests/unit/body_redaction.test.ts:55`（`expect(r!.content.length).toBeLessThan(body.length + 40)`）
- 问题：该断言恒真，无法检测「preview 未截断、完整原文进入 preview」的坏实现。实测验证：坏实现 `preview_summary` 不截断、完整原文放入 `preview=` 时，`content.length = 68 < body.length + 40 = 77`，测试仍 PASS。数学上：固定包装开销 `[body_redacted:len=,preview=]` 为 29 字符，恒小于 40 的余量，任何 body 长度、任何截断与否都成立。测试注释宣称「preview 截断：不包含完整原始内容」，但该断言对目标行为零验证力。AC-003 的核心（不落完整原文）依赖此断言，属恒真断言（危险模式，最低 important）。
- 建议：改为精确断言，如 `expect(r!.content).toBe('[body_redacted:len=35,preview=...)')`（按 body 长度 35、max_preview_bytes 20 精确构造），或至少 `expect(r!.content).not.toContain(body)`（验证完整原文不出现在输出中）。

### t171_test_f003 - AC-002/003：handle_network_request 落库脱敏接入点无测试（评估结论：minor，建议补）

- 严重度：minor
- 锚点：AC-002/003 行为链（开启采集后落库 body 按敏感 key 脱敏）
- 位置：`src/extension/background/service_worker.ts:1076-1087`（接入代码）；`tests/unit/body_redaction.test.ts`（仅 helper 单测）
- 问题：`redact_body` 有 8 个精确单测覆盖全部 MIME 分支/失败路径，但 `service_worker.ts` 的接入点（`redact_data` 时对 request/response body 调 `redact_body` 后落库）无任何测试：若接入点失效（漏调用、条件写反），AC-002/003 行为不成立而全部测试仍绿。spec「有意不测」声明为「无」，未声明豁免。评估结论：标 minor 不阻断——脱敏算法本身已被真实生产函数单测精确覆盖（非假行为、非 mock），接入点 12 行胶水代码无分支逻辑、代码级 review 可验证，且仓库现有 service_worker 测试均为源码文本级（`service_worker_t155_guards.test.ts`），无集成测试基建，补测成本/收益比偏低。仍建议补：构造带 `password` 字段的 network request 走 `handle_network_request`（redact_data=true），断言写入 storage 的 `request_body` 已脱敏、默认/redact_data=false 路径不脱敏。
- 建议：如补，参照 `network_capture.test.ts` / `cdp_response_body_config.test.ts` 的 mock 模式加一个落库断言；不补则在 task.md 记录理由。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1，无。
- 改测方向复核：`public_docs.test.ts` 将既有「sensitive capture options enabled by default」测试改为 body=false 断言——属 spec 变更（SEC-003 用户决策：默认关闭）后「断言应有的预期」的合法改测，非迁就实现；`capture_input_values: true` 与 README「input value capture enabled by default」断言保留，语义仍成立。无迁就实现的改测。
- 本轮新发现：3 条（f001 important、f002 important、f003 minor）。
- 未进表的提示：
  - AC-004 剥离选项仅对 `export_json` 格式测试（4 条精确断言，字段剥离/默认保留均强）；`export_jsonl` / `export_html` / `export_har` 复用同一 `strip_body_parts` 路径，同代码复用风险低，属可选扩展，不进 finding。
  - AC-003 的 spec 表述「hash/长度/preview」为或关系，实现提供长度+preview 不违反 AC。
  - AC-001 的 MCP opt-in 通道（`src/mcp/schemas.ts:34-35` capture_request_body/response_body optional）与既有 `cdp_response_body_config.test.ts`（capture_response_body=false 不调 getResponseBody）互补覆盖，配置默认断言 + 既有行为测试共同支撑 AC-001。
- 总体判断：AC-002/003/004 覆盖扎实、断言精确、红绿灯成立（代入旧实现：默认 true 的 `toBe(false)` 断言红、未脱敏 body 的精确断言红）；但 AC-005 对 PRIVACY.md 未同步且测试反向锁定旧文案（f001）、AC-003a 存在恒真断言（f002），两项 important 未解决。
- 系统性 follow-up：无（PRIVACY.md 同步属本 task 范围内工作，不另建 task）。

### AC 复验方式

- AC-001：`re_verified`——重跑 `body_redaction.test.ts` 通过；读 `src/shared/constants.ts:36-37,51-52` 确认默认 false；`src/mcp/schemas.ts:34-35` 确认 MCP opt-in 通道存在。
- AC-002：`re_verified`——重跑通过；对照 `src/shared/body_redaction.ts:35-63`（urlencoded/JSON 敏感 key 脱敏），断言精确到 `[REDACTED]` 与嵌套字段。
- AC-003：`re_verified`（复验结论：不通过）——重跑通过；但 f002 证明 preview 截断断言恒真，AC-003a「不落完整原文」验证力为零；AC-003b 精确断言有效。
- AC-004：`re_verified`——重跑 `export_body_strip.test.ts` 通过；对照 `src/extension/background/exporter.ts:46-59`（strip_body_parts 独立剥离三个字段），`toBeUndefined()`/`toBe` 断言强。
- AC-005：`re_verified`（复验结论：不通过）——逐行读 README.md/README.en.md diff 确认文案与实现一致；读 PRIVACY.md:19,27 确认与新实现冲突（见 f001）。
- coverage = 5 / 5（全部逐条复验；AC-003、AC-005 复验结论为不通过，计入 f002/f001）

reviewed_scope: 0a4120212c0189fb

verdict: FAIL

## Round 2 (2026-08-13 19:05 UTC+8)

### 前轮 finding 复核（以 diff 与代码为准，不采信处置表自称）

- **t171_test_f001（important，PRIVACY.md 未同步）— 已修复**。逐行核对 `PRIVACY.md:19`（「Input values are enabled by default. Request and response body capture is **disabled by default** …」）与 `:27`（「form-urlencoded and JSON bodies are redacted per MIME for sensitive keys (password, token, api_key, secret, and similar); bodies that cannot be safely parsed are stored as a length summary rather than full content」），与新实现一致；无「bodies enabled by default」「not content-scanned」残留。`public_docs.test.ts:145-146` 新增断言 `'Request and response body capture is **disabled by default**'` 与 `'redacted per MIME for sensitive keys'`，与 PRIVACY.md 实际文案逐字匹配，非弱化（原文未含则红）。
- **t171_test_f002（important，preview 截断恒真断言）— 已修复**。实现同步改为长度-only 摘要 `[body_redacted:len=N]`（`src/shared/body_redaction.ts:30-35`，移除 preview 字段）；测试断言 `not.toContain('preview=')`、`not.toContain('binary')`、`not.toContain('secret-token')`（`body_redaction.test.ts:55-59`）。非恒真验证：旧实现（`preview=` 截断）→ `'preview='` 断言红；完整原文入 content → `'binary'`/`'secret-token'` 断言红。修复方向正确：实现向更安全演进（截断 preview 可残留敏感值片段，长度-only 完全无内容），断言真实。
- **t171_test_f003（minor，接入无集成测试）— 豁免记录在案，维持 minor**。`task.md:59` 处置表有豁免记录（单测覆盖算法 + 接入点 12 行无分支胶水），符合 Round 1 评估结论。

### 改测方向复核

- `body_redaction.test.ts` 本轮改动均与实现同步且方向正确，无迁就实现：
  - AC-003b JSON 解析失败由 `[REDACTED]`（redacted mode）改为长度摘要（preview mode）——实现向 AC-003「无法安全解析的 body 以 hash/长度/preview 存储」语义靠拢（原实现丢长度诊断），测试断言随之更新，合法。
  - f004 词边界（`body_redaction.ts:20-27`）修复 `author`/`tokenizer` 含 `auth`/`token` 子串误伤：测试 `toEqual('author=me&tokenizer=x&access_token=[REDACTED]')` 精确断言，旧 includes 实现下必红，回归拦截有效。
  - multipart file part 用例改为「任何 filename 降级」（实现 `is_sensitive_multipart` 同步为无条件 filename 降级），spec「password/file 内容默认跳过」语义对齐。
- `public_docs.test.ts` 改测为 spec 变更后的合法预期更新，非迁就实现。

### 本轮新发现

- 0 条 blocking。新观察（结论提示，不进 finding）：
  - 「multipart 含 file part 降级」用例 body 含 `secret` 子串，对「无条件 filename 降级 vs 旧 AND（filename AND 敏感词）」回归区分度弱（旧 AND 实现对该 body 也降级）；补「无敏感词 file body」case 可加强，属可选扩展。
  - `not.toContain('preview=')` 绑定当前长度-only 格式；若未来按 AC-003「或」语义合法引入 hash/截断 preview 格式，该断言会误红，属轻微过度指定，非阻断。

### AC 复验方式（Round 2）

- AC-001：`re_verified`——重跑通过；`constants.ts` 默认 false + `mcp/schemas.ts:34-35` opt-in 通道不变。
- AC-002：`re_verified`——重跑通过；urlencoded/JSON 嵌套精确 `[REDACTED]` 断言、multipart 敏感 name/file 降级、词边界 f004 用例，与 `body_redaction.ts` 实现逐一对应。
- AC-003：`re_verified`——重跑通过；长度-only 摘要断言非恒真（坏实现实测红）；JSON 解析失败降级长度摘要符合 AC-003 语义。
- AC-004：`re_verified`——`export_body_strip.test.ts` 4 条未变仍绿，`strip_body_parts` 三字段独立剥离/默认保留断言强。
- AC-005：`re_verified`——README.md/README.en.md/PRIVACY.md 三方文案与实现一致，`public_docs.test.ts:125-130,145-146` 断言与文档逐字匹配。
- coverage = 5 / 5

reviewed_scope: 80bd2d8801792fca

verdict: PASS
