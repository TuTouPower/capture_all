# Task review t128（reviewer_focus: 测试）

- task：`t128_network_data_builder`
- spec：`docs/tasks/t128_network_data_builder/spec.md`
- diff_anchor：`9d36ca0b95e7f8c33922d8af99c8b010c8c8fc37`
- target：`git diff 9d36ca0b95e7f8c33922d8af99c8b010c8c8fc37`
- round：1
- reviewed_at：2026-08-11 22:14 UTC+8

reviewed_scope: 38cb93d7e6c4c09c

## Findings

### t128_test_f001 - build_network_event webRequest 路径 response_body_encoding/bytes 语义变化，AC-002「数据不变」未被测试验证

- 严重度：important
- 锚点：AC-002（网络捕获事件数据不变 + 断言覆盖字段值）；spec 非范围（不改任何调用点实际输出的数据语义）
- 位置：`src/extension/background/network_capture.ts:962`（`build_network_event` 的 `build_network_data` 调用，response_body 传入但无 `extra` 保留原语义）；派生逻辑 `src/shared/network_builder.ts:81-82`；旧行为在 diff 中被删除的 `response_body_encoding: null` / `response_body_bytes: null`
- 问题：旧 `build_network_event` 对 response body **硬编码 `response_body_encoding: null` / `response_body_bytes: null`**（即使在 CDP body 捕获成功、response_body 非空时）。迁移到 builder 后这两字段由 `derive && response_body ? 'utf8' : null` 派生，`build_network_event` 未像 `build_cdp_primary_network_event`（network_capture.ts:1023-1024 经 `extra` 保留 `body_result.encoding`）那样用 `extra` 保留旧语义。该路径真实可达：`network_capture.ts:792`、`:1072` 在 webRequest 完成且匹配到 CDP body 时以 `body_result.body`（非空字符串）调用。因此实际输出数据变化：`response_body_encoding: null → 'utf8'`，`response_body_bytes: null → <TextEncoder 字节数>`（二进制 base64 body 还会被误标 utf8）。这违反非范围「不改任何调用点实际输出的数据语义」与 AC-002「网络捕获事件数据不变」。
  测试轴缺口：对 webRequest 路径的 `response_body_encoding` / `response_body_bytes`，`tests/unit/network_capture.test.ts` 全文件**零断言**（`grep response_body_encoding|response_body_bytes` 仅命中 network_cdp.test.ts 的 cdp_primary 路径与 network_builder.test.ts），故该语义变化对测试套件静默，AC-002 的「数据不变」对该字段未验证。
- 建议：在 `build_network_event` 的 builder 调用加 `extra: { response_body_encoding: null, response_body_bytes: null }` 恢复旧输出语义（若新派生值确为有意改进，则需走 spec 非范围变更流程，不能默认可）；并在 `tests/unit/network_capture.test.ts` 对 webRequest+body 路径补 `response_body_encoding` / `response_body_bytes` 字段值断言，使 AC-002 对该路径可验证。

### t128_test_f002 - network_builder 单测缺多字节（非 ASCII）字节数用例

- 严重度：minor
- 锚点：非 AC，覆盖扩展
- 位置：`tests/unit/network_builder.test.ts` `body 派生字节与 utf8 编码`（第 48-53 行）
- 问题：builder 核心职责是 `TextEncoder` 字节派生（`utf8_bytes`，network_builder.ts:45-47），现有用例只用单字节 ASCII（`'abc'`/`'def'` 断言 3）。若实现退化为 `.length` 或按码点计数，ASCII 用例全部通过，无法暴露多字节编码字节数错误。CJK/emoji body 恰是字节数最易出错处。
- 建议：补一个非 ASCII body 用例，断言 `TextEncoder().encode('中文').length === 6`（或等值），锁定字节派生真实性。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：`tests/unit/network_correlator.test.ts` 仅改动 fixture `make_cdp_event` 增加 `response_preview: null`，断言未改弱。该补全合理：`CdpBodyEvent.response_preview` 为必填 `string | null`（network_correlator.ts:20），生产路径（redaction.ts:221-225、network_capture.ts:836、service_worker.ts:836）始终产出 `string | null` 非 undefined；builder 将 `undefined ?? null` 归一为 null，旧 fixture 省略字段导致的 undefined 属类型谎言而非真实数据形态。此为 fixture 对齐类型与运行时真相，非「迁就实现」。其余改测（改断言预期以适配新输出）无。
- 本轮新发现：2 条（f001 important，f002 minor）
- 未进表的提示：`build_network_event` 的 `request_body_status: pending.request_body_status`（去掉了 `|| 'not_enabled'`）由 builder `?? 'not_enabled'` 兜底，`||` 与 `??` 仅对空串有差异，BodyCaptureStatus 枚举无空串，判定非语义变化，未出 finding。其余构造点 `|| 'failed'` 默认（body_capture_coordinator.ts:299、service_worker.ts:839、network_hook.ts:375）均显式保留，`??` 不触发，无变化。
- 总体判断：builder 单测与 fixture 补全质量合格，无假绿；但 f001 显示 webRequest 路径 response body 编码/字节语义被无测试覆盖地改变，违反非范围且 AC-002 未验证，需处置后复审。
- 系统性 follow-up：无

### AC 复验方式

- AC-001（构造点统一经 builder）：`re_verified`。grep 全 src 无 `: NetworkRequestData = {` 内联字面量；6 个构造点（network_capture.ts x3、network_correlator.ts x3、body_capture_coordinator.ts、network_hook.ts、service_worker.ts）全部迁移 `build_network_data`。
- AC-002（网络测试全绿、断言字段值、数据不变）：`re_verified`（部分）。重跑 `npm test`：131 files / 1377 tests 全绿；network_cdp.test.ts 断言 cdp_primary 路径 `response_body_encoding/bytes`（含 base64），network_correlator.test.ts 断言 `correlation_status`/`capture_method`/`resource_type`/字段完整性。但 webRequest 路径 `response_body_encoding`/`response_body_bytes` 无断言，且 f001 证实该路径实际数据已变化，AC-002 对该字段未成立。
- AC-003（npm test 全绿 + tsc）：`re_verified`。`npm test` 131/1377 全绿；`npx tsc --noEmit` 退出码 0。

coverage = 3 / 3（AC-002 仅部分验证，见 f001）

verdict: FAIL

## Round 2 (2026-08-11 22:23 UTC+8)

- round：2
- reviewed_at：2026-08-11 22:23 UTC+8

reviewed_scope: af65b28e482eeea3

## 前轮 finding 复核

- t128_test_f001（important）：**修不彻底**。语义还原部分已消除：`build_network_event`（network_capture.ts:955-961）已传 `extra: { response_body_encoding: null, response_body_bytes: null }`，diff 核实输出恢复旧语义 null/null（`request_body_encoding/bytes` 由 builder derive 保持 `'utf8'`/字节数，与旧内联一致，无额外覆盖）。但测试轴缺口未补：`build_network_event` 全函数无任何测试引用（`grep build_network_event` 全 tests 仅命中 network_builder.test.ts 的 `build_network_data`），webRequest 路径 `response_body_encoding/bytes` 仍零断言（network_capture.test.ts 两字段计数 0）。删除该 extra 即无测试失败、复现 Round 1 静默数据变化。残余以 f003 承接。
- t128_test_f002（minor）：**已修**。network_builder.test.ts 新增「多字节 utf8 按字节数计算」（第 62-71 行）：`'你好'` → `request_body_bytes` 6（2×3 字节）✓；`'👋'` → `response_body_bytes` 4（UTF-8 4 字节）✓；并断言 `request_body_encoding='utf8'`。字节数均正确，锁定 TextEncoder 真实派生，ASCII 用例无法覆盖的退化（`.length`/码点计数）现可暴露。

## 本轮新发现

### t128_test_f003 - webRequest 路径 response_body_encoding/bytes 仍零断言，f001 修复依赖无测试的 extra 覆盖

- 严重度：important
- 锚点：AC-002（网络捕获事件数据不变 + 断言覆盖字段值）；前轮 f001「测试轴缺口」部分
- 位置：`src/extension/background/network_capture.ts:955-961`（build_network_event 的 extra 覆盖）；`tests/unit/network_capture.test.ts`（`response_body_encoding`/`response_body_bytes` 计数 0）
- 问题：f001 建议含两条修法（extra 还原语义 + webRequest 路径补字段断言），实施仅完成前者。现状：该路径的编码/字节语义由一条**无测试的** extra 覆盖 + 注释维护；`build_network_event` 全函数无测试引用，删除 extra 即无测试失败、复现 Round 1 的静默数据变化（`response_body_encoding: null → 'utf8'`、`response_body_bytes: null → <字节数>`）。对照 cdp_primary 路径（network_cdp.test.ts:400/429-431/459-461 断言 binary base64 / too_large / 字节数）与 builder 单测均已被测试锁定，唯独 webRequest 路径保持 Round 1 暴露的缺口。AC-002「数据不变」对该字段、该路径仍不可回归验证。
- 建议：在 `tests/unit/network_capture.test.ts` 增一条经 `build_network_event`（或其调用链）构造 webRequest + 非空 response_body（CDP base64）事件的用例，断言 `response_body_encoding` / `response_body_bytes` 为 null（还原语义锁定）；同时断言 `request_body_encoding/bytes` 派生仍生效，覆盖 extra 只影响 response 字段的边界。

## 结论

- 前轮 finding 复核：f001 修不彻底（语义已还原，测试轴缺口以 f003 承接）；f002 已修。
- 改测方向复核：无「迁就实现」。本轮新增仅：network_capture.ts 的 extra 覆盖（生产代码，恢复旧语义）；network_builder.test.ts 多字节用例（断言真实 TextEncoder 字节派生，方向正确）。无既有测试被改弱。
- 本轮新发现：1 条（f003 important）。
- 未进表的提示：无。
- 总体判断：f001 实际数据损坏已修复、f002 已修，但 f001 的测试轴缺口未补，AC-002 对 webRequest 路径 body 编码/字节仍不可验证，且该路径是 Round 1 实证发生静默语义变化的精确位置，需补断言后复审。
- 系统性 follow-up：无。

### AC 复验方式（Round 2）

- AC-001（构造点统一经 builder）：`re_verified`。同 Round 1，本轮未改动构造点迁移。
- AC-002（网络测试全绿、断言字段值、数据不变）：`re_verified`（部分）。重跑 `npm test`：131 files / 1378 tests 全绿；cdp_primary 路径 encoding/bytes 断言仍覆盖（network_cdp.test.ts:400/429-431/459-461）；builder 多字节用例通过。但 webRequest 路径 `response_body_encoding/bytes` 仍零断言（f003），数据不变对该路径仍未锁定。
- AC-003（npm test 全绿 + tsc）：`re_verified`。`npm test` 131/1378 全绿；`npx tsc --noEmit` 退出码 0。

coverage = 3 / 3（AC-002 对 webRequest 路径 body 编码/字节仍部分未验证，见 f003）

verdict: FAIL

## Round 3 (2026-08-11 22:36 UTC+8)

- round：3
- reviewed_at：2026-08-11 22:36 UTC+8

reviewed_scope: 62b2fd09f54897c1

## 前轮 finding 复核

- t128_test_f001（important）：**已消除**。`build_network_event` 的 extra 覆盖（network_capture.ts:968-972 `response_body_encoding: null` / `response_body_bytes: null`）仍在，diff 核实语义还原保持 Round 2 状态；本轮无构造点改动。
- t128_test_f002（minor）：**已修**。network_builder.test.ts 多字节用例（'你好'→6 字节、'👋'→4 字节）自 Round 2 起未变，锁定 TextEncoder 真实派生。
- t128_test_f003（important）：**修不彻底（换形式弱化）**。implementer 在 `network_cdp.test.ts:605`「webRequest handle_completed emits for non-attached tab」用例尾部补 2 断言（`:644-646`）：
  ```ts
  expect(emitted[0].data.response_body_encoding).toBeNull();
  expect(emitted[0].data.response_body_bytes).toBeNull();
  ```
  但该用例走的是 **webRequest 延迟超时路径（response_body = null）**：`handle_completed` 对 tabId=99 无 CDP body 匹配（测试未触发任何 CDP loadingFinished），落入 deferred 分支，`DEFERRED_TIMEOUT_MS=1500` 超时后 `build_network_event(pending, details, null, 'not_enabled')`（network_capture.ts:1124），`response_body` 恒为 null。builder 中 `response_body=null` 时派生本就产出 null（network_builder.ts:81-82 `derive && response_body ? 'utf8' : null` / `utf8_bytes(null)→null`），**与 extra 覆盖存在与否无关**。已用 scratch 实验实证：`build_network_data({response_body: null, response_body_status:'not_enabled'})` 无任何 extra 时两字段即为 null、断言通过。故删除 extra（network_capture.ts:968-972）该测试仍绿，Round 1 的静默数据变化（非空 body → 'utf8'/字节数）依旧无测试可回归验证——f003 要求的「webRequest + 非空 response_body（CDP base64）路径锁定 null 语义」未实现。测试轴缺口未闭合。
- 判别性测试应驱动的路径：network_capture.ts:1077-1079（`build_network_event(pending, details, body_result.body, ...)`，`body_result.body` 非空）——该处无 extra 时派生 'utf8'/字节数、有 extra 时 null，是 extra 唯一可观测场景；全 tests 无任何用例驱动此分支并断言两字段（network_capture.test.ts 两字段计数 0，`build_network_event` 无测试引用）。

## 本轮新发现

- 0 条新 gap；f003 残余（新断言不可判别 extra）即本轮 FAIL 依据。无 `.skip`/`.only`/`@ts-ignore`/`eslint-disable`/删断言等危险模式命中（已扫描本轮 diff）。

## 结论

- 前轮 finding 复核：f001 已消除；f002 已修；f003 **修不彻底**——新增断言落在 response_body=null 路径，派生默认与 extra 覆盖结果相同，断言恒真，删除 extra 无测试失败，测试轴缺口未闭合。
- 改测方向复核：无「迁就实现」的既有断言修改；本轮仅新增 2 断言（`:644-646`），但新增断言为不可判别形式，属 f003 复核范畴，非独立改弱。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：f001 数据语义已还原、f002 已修；但 f003 的 webRequest 路径 body 编码/字节测试轴缺口仍开，AC-002「数据不变」对该字段该路径仍不可回归验证，且该路径正是 Round 1 实证发生静默语义变化的精确位置，需补非空 body 判别用例后复审。
- 系统性 follow-up：无。

### AC 复验方式（Round 3）

- AC-001（构造点统一经 builder）：`re_verified`。同前轮，本轮无构造点迁移改动，grep 无内联 `: NetworkRequestData = {` 字面量。
- AC-002（网络测试全绿、断言字段值、数据不变）：`re_verified`（部分）。重跑 `npm test`：131 files / 1378 tests 全绿；cdp_primary 路径 encoding/bytes 断言仍覆盖（network_cdp.test.ts:400/429-431/459-461）；builder 多字节用例通过（f002）。但 webRequest 路径**非空 body** 的 `response_body_encoding/bytes` 仍零断言，新增断言（`:645-646`）不可判别 extra（scratch 实证），数据不变对该路径仍未锁定（f003）。
- AC-003（npm test 全绿 + tsc）：`re_verified`。`npm test` 131/1378 全绿；`npx tsc --noEmit` 退出码 0。

coverage = 3 / 3（AC-002 对 webRequest 路径 body 编码/字节仍部分未验证，见 f003）

verdict: FAIL

## Round 4 (2026-08-11 22:49 UTC+8)

- round：4
- reviewed_at：2026-08-11 22:49 UTC+8

reviewed_scope: 52336a441954cde3

## 前轮 finding 复核

- t128_test_f001（important）：**已消除**。本轮无构造点改动；`build_network_event` 的 extra 覆盖（network_capture.ts:968-972）仍在，语义还原保持前轮状态。
- t128_test_f002（minor）：**已修**。network_builder.test.ts 多字节用例自 Round 2 起未变，字节数正确锁定 TextEncoder 派生。
- t128_test_f003（important）：**已消除**。implementer 新增判别性用例「web_request 路径命中非空 CDP body 仍不派发 body 字节/编码」（network_cdp.test.ts:651-711）：
  - **触达真实匹配与构造逻辑**：测试预置 `_cdp_request_meta_for_test` / `_cdp_body_results_for_test` 两 map（即 network_capture.ts:41-45 的模块级 `cdp_request_meta` / `cdp_body_results` 别名，非独立 mock 表），随后驱动真实 `handle_completed` 监听器 → `find_matching_cdp_request`（真实 url/method/status/time 关联，seed meta 与 webRequest 参数完全匹配，时间窗内返回 `root:cdp_body`）→ `build_network_event(pending, details, 'aGVsbG8=', 'captured', null)`（body 非空）→ `build_network_data`。预置仅模拟 CDP 事件应写入的状态，匹配路径与构造路径全为真实生产逻辑，未 mock 被测逻辑本身。
  - **判别力实证**：scratch 实验（.scratch 临时用例，已删）对 `build_network_data({response_body:'aGVsbG8='})` 无任何 extra 时得到 `response_body_encoding='utf8'`、`response_body_bytes=8`（非空字节）；新用例断言 `toBeNull()`，故移除 `build_network_event` 的 extra（network_capture.ts:968-972）该用例必失败。判别方向正确，非恒真。
  - **非假绿**：用例断言 `response_body === 'aGVsbG8='`，证明非空 body 真实经 webRequest 路径流出（区别于 Round 3 误用的 null-body 延迟超时路径）；且 `emitted.toHaveLength(1)` 在 handle_completed 后立即断言、无 1600ms await，若关联失败落入 1500ms deferred 超时分支则 emitted 为空、断言失败，故测试强制走同步匹配路径。Round 1 静默数据变化（非空 body → 'utf8'/字节数）现可回归捕获。
  - 对照 Round 3 要求：测试轴缺口闭合，extra 唯一可观测场景（network_capture.ts:1077-1079 非空 body 分支）已被驱动并断言。

## 本轮新发现

- 0 条。危险模式扫描（新用例无 `.skip`/`.only`/`@ts-ignore`/`eslint-disable`；断言全为 `toBe`/`toBeNull` 精确比较，无弱化；无删/反转 expect；seed map 为真实模块 map 别名，非绕过匹配的 mock）无命中。

## 结论

- 前轮 finding 复核：f001 已消除；f002 已修；f003 已消除（判别性用例锁死 webRequest 路径非空 body 的 encoding/bytes null 语义，且实证删 extra 会失败）。
- 改测方向复核：无「迁就实现」的既有断言修改；本轮仅新增判别性用例与 import 行，无既有测试被改弱。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：f003 判别性缺口已闭合，webRequest 路径 body 编码/字节语义现由可判别测试锁定，AC-002「数据不变」对该字段该路径可回归验证；本轮全绿，无未解决 blocker。
- 系统性 follow-up：无。

### AC 复验方式（Round 4）

- AC-001（构造点统一经 builder）：`re_verified`。同前轮，本轮无构造点迁移改动。
- AC-002（网络测试全绿、断言字段值、数据不变）：`re_verified`。重跑 `npm test`：131 files / 1379 tests 全绿；新增判别性用例（network_cdp.test.ts:651-711）覆盖 webRequest 路径非空 CDP body，断言 `response_body_encoding/bytes` 为 null（scratch 实证删 extra 即失败）；cdp_primary 路径（network_cdp.test.ts:400/429-431/459-461）与 builder 多字节用例（f002）保持。webRequest 路径 body 编码/字节语义现被测试锁定。
- AC-003（npm test 全绿 + tsc）：`re_verified`。`npm test` 131/1379 全绿；`npx tsc --noEmit` 退出码 0。

coverage = 3 / 3

verdict: PASS
