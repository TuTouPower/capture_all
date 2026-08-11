# Task review t114（reviewer_focus: 测试）

- task：`t114_nested_query_redaction`
- spec：`docs/tasks/t114_nested_query_redaction/spec.md`
- diff_anchor：`1c8f570c56af0758afa0ecb6604e3cdc8da8eefa`
- target：`git diff 1c8f570c56af0758afa0ecb6604e3cdc8da8eefa`
- round：1
- reviewed_at：2026-08-11 12:52 UTC+8
- reviewed_scope: da42668a04202d43

## Findings

### t114_test_f001 - AC-003 接线级回归覆盖不足：extension network/CDP/WebSocket 与 external CDP Bridge 运行入口零测试

- 严重度：important
- 锚点：AC-003（form、extension network/CDP/WebSocket、Logger 与 external CDP Bridge 的运行入口在嵌套 query 输入下，最终存储/输出对象不含内层敏感值明文）+ spec 测试策略「接线层按运行入口族补回归：form base-resolved action、extension network/CDP/WebSocket、Logger、external CDP Bridge request/response；…dormant handler 补直调或与删除决策同步处理」
- 位置：`tests/unit/t114_nested_query_redaction.test.ts`（仅 Logger 3 例）+ `tests/unit/t114_form_entry_redaction.test.ts`（仅 form 2 例）；未覆盖位点：`src/extension/background/network_capture.ts:252`（WS connection）、`:338`（WS frame）、`:743`（WS error）、`:845`（CDP body event）、`:904`（webRequest `handle_before_request`）、`:1017`（CDP primary `build_cdp_primary_network_event`）；`src/bridge/cdp_handler.ts:251`（`Network.responseReceived`）、`:288`（`Network.requestWillBeSent`）
- 问题：p018 清点运行入口 10 处（form 1、extension network_capture 6、Logger 1、external CDP Bridge 2），AC-003 要求 4 族运行入口均有接线级回归、断言最终存储/输出对象无明文。本 diff 仅补 form（2 例）与 Logger（3 例，直测 `sanitize_log_value`）两族；extension network/CDP/WebSocket 6 处与 external CDP Bridge 2 处共 8 处运行入口在嵌套 query 输入下无任何接线测试。task 核心范围「为 p018 列出的运行入口补接线级回归，防止 helper 修好后调用链仍泄露」未达成。p018 已说明此类接线测试可写（`network_capture.test.ts`/`network_cdp.test.ts`/`websocket_capture.test.ts`/`external_cdp_bridge_client.test.ts` 等 9 个既有文件 177 例均为顶层敏感 key 输入，均无 `?next=…?token=` 嵌套输入——本次已 grep 复核）；dormant 8 处（`webrequest_handler.ts:47`、`src/extension/background/cdp_handler.ts:533`/`:572`/`:656`/`:693`/`:858`、`network_webrequest.ts:142`、`service_worker.ts:816`）同样无直调测试，且 diff 无删除决策，不满足策略「dormant handler 补直调或与删除决策同步处理」。
- 建议：按策略逐族补接线回归——① extension 族复用现有 `network_capture`/`network_cdp`/`websocket_capture` 测试框架，构造嵌套 query 的 URL（如 `https://outer.example/start?next=/child?token=x` 与 encoded 形态），断言最终存储事件对象的 `url` 字段不含明文且含 `[REDACTED]`；② bridge 族补 request-only 与 response-only 两条分支（p018 指出既有 bridge 测试仅 request 先到、response 新建分支未执行），断言 `session.events` 中 URL 无明文；③ dormant 8 处补直调测试，或明确记录删除决策。

### t114_test_f002 - protocol-relative 外层无测试（AC-002 字面形态缺口）

- 严重度：minor
- 锚点：AC-002「path-relative、root-relative、query-relative、protocol-relative 外层中内嵌 query 递归脱敏」
- 位置：`tests/unit/t114_nested_query_redaction.test.ts` cases 表（12 例）
- 问题：12 例矩阵中 protocol-relative 仅出现在内层（`root_relative_outer_protocol_relative_nested_url`，输入 `/outer?next=//inner.example/login?token=…`）；无 protocol-relative 外层（`//outer.example/start?next=child?token=…`）用例。已实测当前实现对该形态正确脱敏（`{"url":"//outer.example/start?next=child?token=[REDACTED]","url_status":"redacted"}`），属纯覆盖缺口，非行为缺陷。p018/s002 的 10 组合矩阵本身未含该外层形态，但 AC-002 字面将其列为外层。
- 建议：cases 表补 1 例 `//outer.example/start?next=child?token=secret_proto_outer`。

### t114_test_f003 - MAX_DEPTH=5 终止守卫无测试

- 严重度：minor
- 锚点：spec 未知契约清单「MAX_DEPTH=5 终止深层嵌套链」；对应实现 `src/shared/redaction.ts:14`、`:99`
- 位置：`tests/unit/t114_nested_query_redaction.test.ts` `deep_chain_terminates` 用例
- 问题：`deep_chain_terminates` 输入仅 3 层（`?next=?next=?next=?token=secret_deep`），每层递归消费一个 `?next=`、长度严格递减，天然终止，不触达 `_depth > NESTED_QUERY_MAX_DEPTH` 守卫。已实测 5 层链正常脱敏、6 层链触达守卫返回 `captured`（敏感值保留，为文档化 fail-open 边界）。守卫被误删/改值时现有测试全绿，终止边界行为无任何约束。
- 建议：补 1 例超限链（≥6 层，如 `?next=?next=?next=?next=?next=?next=?token=x`），断言按文档化契约终止且 `url_status` 语义与 fail-open 行为一致。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 改测方向复核：无（diff 未改任何既有测试，仅新增文件；不存在「迁就实现」改测）
- 本轮新发现：3
- 未进表的提示：
  - Logger 接线测试直测 `sanitize_log_value` 而非 `Logger` 类实例的最终 entry（`Logger.write` 的 message/details 均经同一 `sanitize_string`/`sanitize_log_value`，判为同生产路径，可接受）；p018 方向③提的 Error stack 分支未覆盖，可加 case，非阻断。
  - form 接线测试用 absolute action 输入，未显式用相对 action 走 document base 解析；`form.action` getter 恒返回解析后 absolute URL，生产路径一致，判为可接受。
  - AC-004「既有内嵌 absolute URL 不回退」由既有 `tests/unit/logger_stack_redact.test.ts:53`（`?next=https://app.example.com/login?token=abc123`）与新增 `absolute_outer_absolute_nested_url` 共同兜住；本次已重跑该文件及相关 9 文件 177 例全绿。
  - 主循环断言强度：`expect(result.url).not.toContain(secret)` + `expect(decodeURIComponent(result.url)).toContain('REDACTED')` + `url_status` 三连，decode 检查覆盖 encoded 写回的 `%5BREDACTED%5D` 形态，无双编码假绿（`expect_redacted:false` 分支另断言 `captured` + 原样返回）；form 测试对 `events[0].data.form_action` 断无明文 + REDACTED，listener 未挂载时 `''` 会令第二条断言失败，无存在即通过。
- 总体判断：helper 层 12 例矩阵 + 回退保护 + 结构/url_status 断言强且直接触达生产 `redact_url`/`sanitize_log_value`/`form_submit_capture`；但 AC-003 4 族运行入口仅覆盖 2 族，task 核心目的（调用链不泄露）对 extension network/CDP/WebSocket 与 external CDP Bridge 未验证，f001 未解决 → FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 重跑 `npx vitest run tests/unit/t114_nested_query_redaction.test.ts tests/unit/t114_form_entry_redaction.test.ts` 22/22 通过；absolute/base-resolved 4 组合用例 + 结构保留（keep=1/#frag//start）与 url_status 一致性用例直接核对断言。
- AC-002：`re_verified`（f002 缺口除外）— path/root/query-relative 与 plain/`%3F`/`%3D` encoded 6 组合用例通过；protocol-relative 外层缺 1 例，已实测行为正确。
- AC-003：`re_verified`（部分）— form 2 例、Logger 3 例接线测试通过且触达真实模块；extension network/CDP/WebSocket 与 external CDP Bridge 8 处运行入口无测试（f001，blocking）。
- AC-004：`re_verified` — 3 条回退用例 + 既有 `logger_stack_redact.test.ts:53`（T100 内嵌 absolute URL）本次重跑通过；`url_status` 与改写一致性断言（redacted 时 redacted、无改写时 captured）存在。
- coverage = 4/4 re_verified（AC-003 复验以现有测试为限，缺口由 f001 承载）

verdict: FAIL

## Round 2 (2026-08-11 13:01 UTC+8)

- round：2
- reviewed_at：2026-08-11 13:01 UTC+8
- reviewed_scope: 33812c1b97b6911e

## 前轮 finding 复核（以 `git diff 1c8f570c56af0758afa0ecb6604e3cdc8da8eefa` 与代码/测试为准）

### t114_test_f001（important）— 核心已消除，残留位点级缺口转 f004

逐位点核实（`network_capture.ts` 与 `cdp_handler.ts` 生产路径 + 新用例断言字段来源）：

| 运行入口 | 位点 | Round 2 覆盖情况 |
|----------|------|------------------|
| external CDP Bridge request 新建分支 | `cdp_handler.ts:288` | ✓ 新用例（`cdp_handler_redaction.test.ts:164-206`）requestWillBeSent 先到触发 `:288` redact，`poll_session` 断言 `session.events[0].url` decode 后无明文 + 含 REDACTED |
| external CDP Bridge response 更新分支 | `cdp_handler.ts:270-276` | ✓ 新用例 responseReceived 后到执行（url 复用 request 已脱敏值） |
| extension WS connection | `network_capture.ts:252-254` | ✓ 新用例（`t114_nested_query_redaction.test.ts:153-167`）webSocketCreated 触发 `send_ws_connection_event`，断言 `data.url`（`:273` 来自 `:254` redact 结果）无明文 + REDACTED |
| extension CDP primary | `network_capture.ts:1017` | ✓ 新用例（`:169-188`）requestWillBeSent+responseReceived+loadingFinished → `:644 build_cdp_primary_network_event`，断言 `data.url` 无明文 + REDACTED |
| extension WS error | `network_capture.ts:743` | △ 新用例发 webSocketFrameError 触发执行，但未断言 error 事件输出（url 与 connection 同源，风险低） |
| external CDP Bridge response 新建分支 | `cdp_handler.ts:247-254` | ✗ 新用例 request 先到 → response 走 `:270` 更新分支，`response.url` redact 新建分支仍未执行（正是 f001 建议② 所指分支） |
| extension webRequest | `network_capture.ts:904` | ✗ 无嵌套 query 回归（`onBeforeRequest` 为活跃接线，非 dormant） |
| extension WS frame | `network_capture.ts:338` | ✗ 无嵌套 query 回归（未发 frameSent/frameReceived） |
| extension CDP body event | `network_capture.ts:845` | ✗ 无嵌套 query 回归（新用例有 meta 走 primary 分支，不触发 body 事件） |
| dormant 8 处 | `webrequest_handler.ts:47`、`cdp_handler.ts:533/572/656/693/858`、`network_webrequest.ts:142`、`service_worker.ts:816` | △ 无直调测试；已逐一核实 8 处均调用 `redact_url`，继承 helper 修复，未来启用不泄露（证据：`git diff` 未改这些文件 + 位点源码 grep 确认），直调测试仅剩加固价值 |

判定：f001 的核心目标（AC-003 四族接线回归、防 helper 修好后调用链泄露）已达成——form 2 / Logger 3 / WS 1 / CDP 1 / bridge 1，全部触达真实生产模块与事件输出，断言强；Round 1 的「4 族中 2 族零测试」全局缺口已消除。残留 4 处（response-only 新建分支 + webRequest/WS frame/CDP body）为族内位点级覆盖扩展 + dormant 加固，转 f004（minor）。

### t114_test_f002（minor）— 已消除

新增 `protocol_relative_outer_nested_path` 用例（`t114_nested_query_redaction.test.ts:42`，`//outer.example/start?next=/child?token=…`），断言沿用主循环强三连（not.toContain + decode 含 REDACTED + `url_status: 'redacted'`）。实测通过。

### t114_test_f003（minor）— 已消除

新增 `deep_chain_max_depth_fail_closed`（`:36`，`'?next='.repeat(6) + '?token=secret7'`，7 层链）断言 `url_status: 'redacted'` + secret7 消失 + REDACTED 存在。手推递归：depth 0→5 逐层消费 `?next=`，第 7 层 `redact_nested_value(depth=5)` 命中 `depth >= NESTED_QUERY_MAX_DEPTH` 返回 `[REDACTED]`（fail-closed），实测 32/32 全绿。该用例能捕获 fail-open 退化（守卫分支返回原值/null → 明文出现）与守卫删除导致的崩溃；固有局限见未进表提示。

## 本轮新发现

### t114_test_f004 - 接线级覆盖残留：bridge response-only 新建分支与 extension webRequest/WS frame/CDP body 无嵌套 query 回归

- 严重度：minor
- 锚点：AC-003「extension network/CDP/WebSocket 与 external CDP Bridge 的运行入口在嵌套 query 输入下，最终存储/输出对象不含内层敏感值明文」+ 测试策略「external CDP Bridge request/response」
- 位置：`tests/unit/cdp_handler_redaction.test.ts:164`（新用例仅 request 先到）；无测试位点 `src/bridge/cdp_handler.ts:247-254`（response-only 新建分支）、`src/extension/background/network_capture.ts:338`（WS frame url）、`:845`（CDP body event url）、`:904`（webRequest url）
- 问题：f001 建议② 要求「request-only 与 response-only 两条分支」，新 bridge 用例 requestWillBeSent 先到、responseReceived 后到走 `:270` 更新分支，`response.url` 新建分支（`:247-254`，response 先于 request 到达的场景）仍未执行——与 f001 指出的「response 新建分支未执行」是同一分支，修复未彻底。extension 侧 webRequest（`:904`，活跃接线）、WS frame（`:338`）、CDP body（`:845`）三个运行入口在嵌套 query 输入下仍无接线回归。dormant 8 处无直调测试（已核实全部调用 `redact_url`，属加固缺口）。均为防未来接线回归的覆盖缺口，非当前行为缺陷——helper 层修复已被 12 例矩阵验证，这些位点接线均为单行 `redact_url(...).url` 写回。
- 建议：① bridge 补 1 例 response-only（仅发 `Network.responseReceived`，断言 `session.events` 新建事件的 url 无明文）；② extension 族补 webRequest 用例（走 `chrome.webRequest.onBeforeRequest` 回调，断言事件 url 无明文），WS frame 与 CDP body 可选；③ dormant 直调测试或记录加固决策。

## 结论

- 前轮 finding 复核：f001 核心已消除（残留位点级缺口转 f004，minor）；f002 已消除；f003 已消除。
- 改测方向复核：无（`cdp_handler_redaction.test.ts` 仅新增 test 块，未改既有 2 例断言；另两个文件为新增）。
- 本轮新发现：1（f004，minor）
- 未进表提示：
  - f003 用例对 `MAX_DEPTH=5` 精确值无约束力：有限深嵌套链在任何守卫值下均自然终止且敏感 key 分支脱敏，7 层链在守卫被改大/删除时输出不变、用例仍绿。属固有不可测（无法构造「无守卫即泄露」的有限输入），用例已最大化约束力（拦截 fail-open 化与崩溃类退化）。
  - WS error 用例（`:743`）触发执行但未断言 error 事件输出；url 与 connection 同源（`:254` 已断言），风险低。
  - 范围外观察（code 侧，供参考）：`redact_url` 顶层 `_depth > NESTED_QUERY_MAX_DEPTH` 守卫返回原样 `url` + `status: 'redacted'`（`src/shared/redaction.ts:104-105`）；当前全部调用方均不传 `_depth`（默认 0），分支仅外部显式传深度时可达，无测试覆盖。不归测试 reviewer 判定。
- 总体判断：f001/f002/f003 已按 diff 核实消除，新增用例断言强（not.toContain + decode 含 REDACTED + `url_status`）、真实触达生产 `redact_url`/`sanitize_log_value`/`start_network_capture`/`handle_cdp_start` 路径，危险模式扫描无命中；残留仅 f004（minor 覆盖扩展）→ PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001：`re_verified` — 重跑 `t114_nested_query_redaction.test.ts`（27 例含结构保留 `keep=1/#frag//start` 与 url_status 一致性）全绿；重跑 `logger_stack_redact.test.ts` 等 5 文件 140 例全绿（无回退）。
- AC-002：`re_verified` — 12 例矩阵 + protocol-relative 外层新用例（f002 修复）通过；plain/`%3F`/`%3D` encoded 与 4 种相对外层均在列。
- AC-003：`re_verified`（f004 缺口除外）— form 2 / Logger 3 / WS 1 / CDP primary 1 / bridge 1 共 8 例接线测试全部触达真实生产模块与事件输出；bridge response-only 新建分支与 extension webRequest/WS frame/CDP body 无直接测试（f004，minor）。
- AC-004：`re_verified` — 回退保护 3 例 + 既有 `logger_stack_redact.test.ts:53`（T100 内嵌 absolute URL）+ `network_capture.test.ts` 93 例全绿。
- coverage = 4/4 re_verified（AC-003 复验以现有测试为限，缺口由 f004 承载，非阻断）

verdict: PASS

## Round 3 (2026-08-11 13:09 UTC+8)

- round：3
- reviewed_at：2026-08-11 13:09 UTC+8

reviewed_scope: a764e756057565d6

### 前轮 finding 复核（以 `git diff 1c8f570c56af0758afa0ecb6604e3cdc8da8eefa` 与代码/测试为准）

#### t114_test_f004（minor）— 处置成立（已修）

处置表 rationale 三项事实逐一核实：

1. **bridge response-only 新建分支非 AC 缺口**：`src/bridge/cdp_handler.ts:251-254` 的 response 新建分支直接调用 `redact_url(response.url, session.redact_url_query).url`，与 request 分支（`:288-291`）同一 helper、同一写回模式，无明文写入路径。CDP 协议下 requestWillBeSent 恒先于 responseReceived 到达（同 requestId），response-only 场景实际不可达（防御代码）。AC-003「最终存储/输出对象不含明文」由代码保证，该位点无直接测试属纯覆盖缺口，不构成 AC 违反。
2. **dormant 8 处继承 helper 修复**：逐一核对 8 个位点（`webrequest_handler.ts:47`、`extension/background/cdp_handler.ts:533/572/656/693/858`、`network_webrequest.ts:142`、`service_worker.ts:816`）全部调用 `redact_url(...).url` 写回；git diff 未改这些文件，helper 修复后均继承，未来启用不泄露。
3. **补 f005/f006 行为一致性用例 3 个**：`second_level_double_encoded_consistent` / `second_level_double_encoded_absolute` / `f006 直接传超限 depth fail-closed`，见下节核验。

判定：f004 处置成立，无遗留。

### 本轮新发现

无（0 条）。

### 新增用例核验（f005/f006 行为一致性，`tests/unit/t114_nested_query_redaction.test.ts`）

- `second_level_double_encoded_consistent`（`?next=child?next=keep%253Ftoken%253Dx`）与 `second_level_double_encoded_absolute`（absolute 同形）：断言 `url_status: 'captured'` + `url === input`（字节级原样，本文件最强断言形态）。修复前（code f005）absolute 分支手动段硬编码 `allow_encoded=true`，第二层双编码被两层解码误判改写并注入 `[REDACTED]`、状态谎报 redacted——absolute 用例修复前 FAIL（status 非 captured、url 非原样）；修复后（`_allow_encoded` 透传，`redaction.ts:188` + 递归继承语义 `:91`）两分支均 captured 原样。用例同时钉住「相对分支契约不回归」与「absolute 与相对行为一致」。
- `f006 直接传超限 depth fail-closed`：`redact_url('?token=abc', true, 6)` 断言 `url === '[REDACTED]'` + `not.toContain('abc')` + `url_status: 'redacted'` 三连。修复前旧守卫（`_depth > 5`）返回原文 + 谎报 redacted（code f006）——该用例 FAIL（url 含明文）；修复后（`>=` + 整体置 `[REDACTED]`，`redaction.ts:109-111`）通过，钉住 fail-closed 语义与「不谎报状态」。直调公共 API `redact_url` 经 `_depth` 参数触达生产守卫（文档化契约，非 import 内部函数凑数）。

### 危险模式扫描（3 个新用例）

无命中：无 `.skip` / `.only` / ignore / eslint-disable；无删、反转或弱化断言（captured 分支为字节级 `toBe(input)`，redacted 分支为 not.toContain + decode 含 REDACTED + status 三连）；`expect_redacted` 分支为参数化期望表，两分支均有具体断言，非条件跳过弱化；未 mock 被测逻辑。

## 结论（Round 3）

- 前轮 finding 复核：f001/f002/f003 已在 Round 2 核实消除，无变化；f004 处置成立（三项事实逐一核实）。
- 改测方向复核：无（Round 2 后 diff 仅新增 3 个测试用例，未改既有断言）。
- 本轮新发现：0
- 未进表的提示：
  - f006 用例 depth=6 区分「超限 vs 未超限」；`>=` 与 `>` 在恰好 depth=5 的边界差异无测试可区分（7 层链触达顶层守卫时若退化 `>`，仍被 `redact_nested_value` 入口守卫 `:83` 兜住，输出不可观测差异）——Round 2 f003 已记录同类固有局限（MAX_DEPTH 精确值不可测），不重复出 finding。
  - 前两轮 test 报告 `reviewed_scope` 以列表项 `- reviewed_scope:` 写入，不匹配 checker 正则 `^reviewed_scope:`（仅裸行匹配）；本轮已按规范裸行写入。
  - Round 2 code 审阅后 `redaction.ts` 又有 f005/f006 修复，`review_code.md` 末条指纹仍为 `33812c1b97b6911e`，check_review_status 对 code 轴仍判 stale——需 code 轴 Round 3 回写新指纹后 overall 方可 PASS。
- 总体判断：3 个新增用例断言强、真实触达生产守卫与递归路径，精确钉住 f005/f006 修复；t114 35 例 + 相关回归 6 文件 158 例全绿；危险模式扫描无命中；无未解决 critical/important → PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-001：`re_verified` — 重跑 t114 三文件 35/35 通过；absolute/base-resolved 组合用例与结构保留、url_status 一致性断言直接核对。
- AC-002：`re_verified` — 4 种相对外层 + plain/`%3F`/`%3D` encoded + 双编码不触发 + 第二层一致性 2 例全绿；protocol-relative 外层用例在列。
- AC-003：`re_verified`（f004 残余位点除外，minor）— form 2 / Logger 3 / WS 1 / CDP primary 1 / bridge 1 共 8 例接线 + f005/f006 行为一致性用例；相关 6 文件 158 例全绿。
- AC-004：`re_verified` — 回退保护 3 例 + `logger_stack_redact.test.ts` 9 例 + `network_capture.test.ts` 93 例全绿（helper 改动后无回退）。
- coverage = 4/4 re_verified

verdict: PASS
