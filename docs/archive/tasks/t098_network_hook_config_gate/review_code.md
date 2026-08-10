# Task review t098（reviewer_focus: 代码）

- task：`t098_network_hook_config_gate`
- spec：`docs/tasks/t098_network_hook_config_gate/spec.md`
- diff_anchor：`6774a8057b94f883181c005194dae48999b5cbf7`
- target：`git diff 6774a8057b94f883181c005194dae48999b5cbf7`
- round：1
- reviewed_at：2026-08-11 04:23 UTC+8

reviewed_scope: 66be2129a8a66dfc

## Findings

### t098_code_f001 - AC-003 未实现且其测试误标（websocket 门控冒充 body 语义）

- 严重度：important
- 锚点：AC-003「当产品配置将 body 采集关闭…行为与配置一致：不采集 response body 字段…须在实现中与 DEFAULT/类型语义一致并在测试断言写明」。
- 位置：`src/extension/content/content_script.ts:108-114`（门控仅判 `config.capture_network`）；`src/extension/content/network_hook.ts:83-133`（`process_response` 与 XHR `loadend` 无条件采集 `response_body`）；`tests/unit/network_hook_config_gate.test.ts:33-37`（标为 AC-003 的测试断言 `start_websocket_capture` 门控）。
- 问题：`capture_network: true` + `capture_response_body: false`（两字段在 CaptureConfig 类型与 DEFAULT_CONFIG 中相互独立）时，`start_capture` 仍安装 network_hook，注入脚本 `process_response` / XHR `loadend` 无条件读 clone.text()/responseText 并转发 `response_body` 字段，与 AC-003「行为与配置一致：不采集 response body 字段」不符。spec 明确要求「在测试断言写明」所选语义，而标为 AC-003 的测试实际断言的是 `start_websocket_capture` 位于 `if (config.capture_network)` 块内（websocket 网络类门控），与 body 语义无关，导致 AC-003 看似覆盖实则未验证。network_hook 文件头自称「Fallback response body capture」，其职责即 body 采集，不能仅按「hook 作网络元数据」豁免 body 字段。
- 建议：执行期以 `CaptureConfig.capture_response_body` 为准：为 false 时 network_hook 的 `process_response` / XHR 分支跳过 response body 采集（或注入脚本按配置不读 body）；并按选定语义重写 AC-003 测试断言（如 mock `start_network_hook` 收 `capture_response_body: false` 配置后断言无 `response_body` 字段 / hook 未安装）。若判定 body 字段仍随 hook 无条件采集属设计意图，则须在测试断言写明该语义并同步 spec 措辞，避免 AC 名实不符。

### t098_code_f002 - AC-001/AC-002 源码断言重复且未串起门控决策

- 严重度：minor
- 锚点：无直接 AC 违反；测试质量。
- 位置：`tests/unit/network_hook_config_gate.test.ts:15-31`
- 问题：AC-001 与 AC-002 断言同一正则（AC-002 是 AC-001 首条断言的严格子集，纯冗余）；测试整体为对源码文本的 regex 匹配，未直接验证「`capture_network: false` 时 `start_capture` 实际不安装 hook」这一门控决策——行为测试 `network_hook_gate_behavior.test.ts` 只覆盖「未 start→不转发 / start→转发」，门控链路仅靠正则连接。正则遇嵌套花括号即截断（`[^}]*`），脆弱。
- 建议：行为层补一条「门控后未安装」断言（如 `start_network_hook` 未注册 listener 或 `is_network_hook_active()` false），删除 AC-002 重复用例；若保留源码断言作为静态回归锚点，注明其局限。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：2 条（f001 important，f002 minor）。
- 未进表的提示：`content_script.ts` 251 行 / 测试两文件 39+61 行，均低于文件膨胀阈值，无；`start_capture` 新增 if/else 分支，圈复杂度未超阈值，无；`logger.debug` 的 modules 列表在 `capture_network: false` 时仍列 network_hook/websocket，纯展示性，范围外观察；注入页面脚本不可卸载为既有行为（t097 nonce 已解耦陈旧转发），非本 task 引入。
- 总体判断：AC-001/002 门控实现与回归正确、else 分支 stop 幂等安全、websocket 归入网络类门控合理、与 t097 nonce 无冲突；但 AC-003 body 语义缺失实现且测试误标，属未解决 important，verdict FAIL。
- 系统性 follow-up：无（AC-003 语义澄清应在本 task 内收敛）。

### AC 复验方式

- AC-001：`re_verified` — 查证 `content_script.ts:108-114` 门控与 `stop_network_hook` 幂等（`network_hook.ts:369-370`），行为测试「未 start 不转发」通过；`npx vitest run` 两文件 6 例全过。
- AC-002：`re_verified` — 行为测试 `start_network_hook` 后合法消息转发 1 次，测试通过。
- AC-003：`re_verified`（结论：未达标）— 查证 network_hook 无条件采集 response_body，且标为 AC-003 的测试断言 websocket 门控而非 body 语义。

coverage = 3 / 3

verdict: FAIL

## Round 2 (2026-08-11 04:40 UTC+8)

reviewed_scope: 248a4c52c1b24c72

### 前轮 finding 复核

- t098_code_f001（important）：已消除。diff 核实：`build_page_script` 增参并注入 `var CAPTURE_BODY = ${capture_response_body}`（`network_hook.ts:14-19`）；`process_response` 在 clone 成功后加 `if (!CAPTURE_BODY) { post(元数据, response_body_status:'not_enabled'); return; }`（`network_hook.ts:84-99`）；XHR `loadend` 分支用 `if (CAPTURE_BODY) { ... }` 包裹 body 采集（`network_hook.ts:207-222`）；`start_network_hook` 第 5 参 `new_capture_response_body = true` 默认参（`network_hook.ts:315`），`content_script.ts:109` 传 `config.capture_response_body`；`content_postmessage_nonce.test.ts` 调用点已改传 `true`。AC-003 核心语义（body 关闭时不采集 response_body）在 fetch/XHR 两分支均已实现。
- t098_code_f002（minor）：已消除。AC-002 改为断言完整 5 参调用签名（`network_hook_config_gate.test.ts:24`），不再与 AC-001 门控正则重复。

### 本轮新发现

### t098_code_f003 - XHR 分支 CAPTURE_BODY=false 时 response_body_status 仍标 'captured'

- 严重度：minor
- 锚点：AC-003（行为与配置一致：不采集 response body 字段）。核心行为已满足，状态元数据与配置不一致。
- 位置：`src/extension/content/network_hook.ts:206,222-229`
- 问题：`body_status` 默认初始化为 `'captured'`（`network_hook.ts:206`）；`if (CAPTURE_BODY) { ... }` 关闭时跳过采集，`body` 保持 `null` 但 `body_status` 仍为 `'captured'`，最终 post `response_body_status: 'captured'` 而 `response_body: null`。与 fetch 分支 `if (!CAPTURE_BODY)` 提前 return 的 `response_body_status: 'not_enabled'`（`network_hook.ts:91`）不一致。下游按 `response_body_status:'captured'` 会误判 body 已采集。
- 建议：CAPTURE_BODY 为 false 时置 `body_status = 'not_enabled'`（或将默认改为 'not_enabled'，仅采集路径内设 'captured'/'too_large'/'failed'），与 fetch 分支语义对齐。

### 结论

- 前轮 finding 复核：f001 已消除（以 diff 核实两分支 + 默认参兼容 + 调用链），f002 已消除。
- 本轮新发现：1 条（f003 minor）。
- 未进表的提示：文件过大 —— `network_hook.ts` 402 行（≥400 阈值）且本 task 净增 22 行，按降级规则仅提示不进 finding；`content_script.ts` 251 行、两测试文件 32+72 行均低于阈值。圈复杂度：`start_capture` 新增 if/else 分支，`process_response` / XHR 分支新增一层条件，均未超阈值。`build_page_script` 模板串内 `if (CAPTURE_BODY) {` 后 `try` 缩进不齐，属模板字符串内格式，非代码问题。`logger.debug` modules 列表在 `capture_network:false` 时仍列 network_hook/websocket，纯展示性，范围外。
- 总体判断：Round 1 的 AC-003 语义缺失（f001 important）已正确实现，fetch/XHR 两分支均按 CAPTURE_BODY 跳过 body 采集，`start_network_hook` 默认参保持调用兼容，`npx tsc --noEmit` 通过、4 文件 18 用例全绿；仅剩 1 条 minor（XHR 分支状态元数据），verdict PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 查证 `content_script.ts:108-114` `if (config.capture_network)` 包裹 `start_network_hook`/`start_websocket_capture`，else 分支 `stop_network_hook` 幂等（`network_hook.ts:391-398` `if (!is_capturing) return`）。
- AC-002：`re_verified` — `content_script.ts:109` 门控内传 5 参 `config.capture_response_body`；行为测试 start 后合法事件转发 1 次通过。
- AC-003：`re_verified` — `network_hook.ts` fetch（:84-99）与 XHR（:207-222）两分支均按 CAPTURE_BODY 跳过 body 采集；行为测试 `build_page_script(false/true)` 断言通过。

coverage = 3 / 3

verdict: PASS

## Round 3 (2026-08-11 04:33 UTC+8)

reviewed_scope: f45e76886f3ed435

### 前轮 finding 复核

- t098_code_f003（minor）：已消除。diff 核实：`network_hook.ts:206-207` 默认改为 `var body_status = CAPTURE_BODY ? 'captured' : 'not_enabled'`，`if (CAPTURE_BODY) { ... }`（:208-223）包裹采集路径（其内 try/catch 才置 `'too_large'`/`'failed'`）；CAPTURE_BODY=false 时 `body` 保持 `null`、post 出 `response_body_status:'not_enabled'`，与 fetch 分支 `:91` 的 `'not_enabled'` 语义一致。XHR 分支在 body 关闭时不再误标 `'captured'`。`npx tsc --noEmit` 通过、全量 111 文件 1193 用例全绿。

### 本轮新发现

无。

### 结论

- 前轮 finding 复核：f003 已消除（以 diff 核实 XHR 分支默认状态与 if 包裹范围，并与 fetch 分支对齐）。
- 本轮新发现：0 条。
- 未进表的提示：`network_hook.ts` 408 行 ≥400 阈值且本 task 净增 30 行，按降级规则仅提示不进 finding（与 Round 2 同源）；`if (CAPTURE_BODY) {` 后 `try` 缩进不齐，属模板字符串内格式，非代码问题；`logger.debug` modules 列表在 `capture_network:false` 时仍列 network_hook/websocket，纯展示性，范围外。
- 总体判断：f003 修复正确，XHR 与 fetch 两分支 body 关闭语义已一致，无未解决 critical/important，verdict PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — `content_script.ts:108-114` 门控 + else 显式停用，`stop_network_hook`/`stop_websocket_capture` 幂等（`websocket_capture.ts:204` 定义）；行为测试「未 start 不转发」通过。
- AC-002：`re_verified` — `content_script.ts:109` 传 5 参 `config.capture_response_body`；行为测试 start 后合法事件转发 1 次通过。
- AC-003：`re_verified` — fetch（:84-99）与 XHR（:206-223）均按 CAPTURE_BODY 门控，XHR 关闭时 `response_body_status:'not_enabled'`（f003 修复点）；行为测试 `build_page_script(false/true)` 断言通过。

coverage = 3 / 3

verdict: PASS
