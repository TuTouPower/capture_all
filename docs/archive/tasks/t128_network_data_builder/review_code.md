# Task review t128（reviewer_focus: 代码）

- task：`t128_network_data_builder`
- spec：`docs/tasks/t128_network_data_builder/spec.md`
- diff_anchor：`9d36ca0b95e7f8c33922d8af99c8b010c8c8fc37`
- target：`git diff 9d36ca0b95e7f8c33922d8af99c8b010c8c8fc37`
- round：1
- reviewed_at：2026-08-11 22:12 UTC+8

reviewed_scope: 38cb93d7e6c4c09c

## Findings

### t128_code_f001 - web_request 路径（build_network_event）response_body_encoding/bytes 语义被 builder 自动派生改写

- 严重度：important
- 锚点：违反 spec 非范围「不改任何调用点实际输出的数据语义（字段值与事件行为不变）」；行为缺陷：CDP base64 body 匹配进 web_request 事件后被误标 `utf8`。
- 位置：`src/extension/background/network_capture.ts:945-968`（build_network_event）→ `src/shared/network_builder.ts:66-68`
- 问题：迁移前 `build_network_event`（web_request 路径）对 `response_body_encoding` / `response_body_bytes` 恒置 `null`（锚点 commit `9d36ca0` 旧代码显式 `response_body_encoding: null, response_body_bytes: null`）。迁移后 builder 默认 `derive_body=true`（`derive = input.derive_body !== false`），当 `response_body` 非 null 时派生出 `response_body_encoding='utf8'` 与 `response_body_bytes=<TextEncoder 长度>`。
  该路径非 null body 只来自 `cdp_body_results`（handle_completed 匹配 line 1072、try_resolve_deferred line 792），而 `cdp_body_results` 可含 base64 body：`network_capture.ts:602-610` 当 `result.base64Encoded` 时 `body = result.body`（base64 字符串）、`encoding='base64'`、`byte_size=base64_decoded_size(...)`。这些 body_result 经 matched/deferred 路径进入 `build_network_event` 后：
  - 旧输出：`response_body_encoding=null`、`response_body_bytes=null`（不标注，不下结论）。
  - 新输出：`response_body_encoding='utf8'`（对 base64 内容是**错误标注**）、`response_body_bytes`=base64 字符串字节长度（非解码尺寸）。
  即使 body 为 utf8，字段值也从 `null` 变为 `'utf8'`/字节数，直接违背 spec 非范围。`build_cdp_primary_network_event`（line 1022-1025）已用 `extra` 正确保留 `body_result.encoding/byte_size`，同一数据源在 web_request 路径却漏了覆盖，属不对称遗漏。
- 建议：`build_network_event` 的 `build_network_data` 调用补 `extra: { response_body_encoding: null, response_body_bytes: null }` 保持旧 null/null 语义；或把 `body_result.encoding`/`byte_size` 传入并按真实值覆盖（后者会改变旧输出，需与 spec 非范围对齐后再定）。不能简单 `derive_body:false`——那会连带把 request_body 的派生一并关闭（旧代码 request_body 是派生 utf8/字节的，line 955-956 旧文），造成新的不等价。

## 结论

- 前轮 finding 复核（Round 1 无）
- 本轮新发现：1 条（f001）
- 未进表的提示：文件过大、复杂度、范围外观察；无则写「无」
  - 文件行数（仅列本 task 触及文件）：`network_capture.ts` 1206、`service_worker.ts` 1174、`types.ts` 711 均超实现源码 400/800 阈值，但本 task 均净减行数（`network_capture` net -46、`service_worker` net -16），新建 `network_builder.ts` 仅 102 行，不触发「净增堆大」条件，不进 finding 表。
  - 复杂度：`build_network_data` 无复杂分支，各构造点迁移后控制流更清晰，无提示。
  - 范围外观察：无。
- 总体判断：单一构造点迁移未做到逐字段等价——web_request 路径 response body 的 encoding/bytes 被 builder 自动派生改写，违反 spec 非范围且对 base64 body 产生错误标注；存在未解决 important。
- 系统性 follow-up：无

### AC 复验方式

- AC-001（已知构造点不再内联 ~40 字段样板，统一经 builder）：`re_verified`。grep `src/` 仅 `network_builder.ts` 内出现 `status_text: null`；6 个源文件均 import 并调用 `build_network_data`，9 处构造点（build_network_event / build_cdp_primary_network_event / send_ws_connection_event / convert_bridge_event_to_request / merge_matched / build_cdp_only_request / build_web_request_only_request / handle_fallback_body_event / network_hook）全部迁移。
- AC-002（网络捕获事件数据不变，网络相关测试全绿，断言覆盖字段值）：`re_verified`。`npm test` 131 文件 1377 用例全绿；但「数据不变」前提被 f001 打破（web_request 路径 response_body_encoding/bytes 从 null 变派生值），AC-002 不视为满足。
- AC-003（`npm test` 全绿，`npx tsc --noEmit` 通过）：`re_verified`。`npm test` 1377 通过（5.47s）；`npx tsc --noEmit` exit 0。

coverage = 3 / 3

verdict: FAIL

## Round 2 (2026-08-11 22:26 UTC+8)

reviewed_scope: af65b28e482eeea3

### 前轮 finding 复核

#### t128_code_f001 - 已消除

- 修复 diff 实证：`src/extension/background/network_capture.ts:968-972`，`build_network_event` 的 `build_network_data` 调用新增 `extra: { response_body_encoding: null, response_body_bytes: null }`。
- builder 尾部 `...input.extra`（`src/shared/network_builder.ts:100`）覆盖派生值，web_request 路径 response_body 非 null（含 CDP base64 body）时输出回到旧 null/null 语义，不再误标 `utf8` / base64 字符串字节长。
- request_body 派生未受影响：`build_network_event` 未设 `derive_body:false`，extra 只覆盖 response 两字段；request_body_encoding/bytes 仍按旧语义派生（`network_builder.ts:75-76`）。
- 与 Round 1 建议的最小修复方向（补 extra 覆盖，非 `derive_body:false`）一致，未引入连带关闭 request_body 派生的新不等价。
- 独立复验：`npx tsc --noEmit` exit 0；`npx vitest run` 131 文件 1378 用例全绿。

### 本轮新发现

#### t128_code_f002 - response_body_status 防御默认值从 'failed' 漂移到 'not_enabled'（三处构造点）

- 严重度：minor
- 锚点：spec 非范围「不改任何调用点实际输出的数据语义」；仅当输入缺 response_body_status 时可观测。
- 位置：`src/extension/background/body_capture_coordinator.ts:299`、`src/extension/background/service_worker.ts:837`、`src/extension/content/network_hook.ts:375`
- 问题：三处旧代码 `response_body_status: X || 'failed'` 在输入缺失时默认 `'failed'`；builder 统一 `?? 'not_enabled'`（`network_builder.ts:80`），缺失时输出 `'not_enabled'`。可达性核查：`convert_bridge_event_to_request` 的 `BridgeBodyEvent.response_body_status` 类型必填（`external_cdp_bridge_client.ts:61`）；`network_hook` 每分支显式设置（`network_hook.ts:67/90/107/130/144/159/194/252`），两者结构上不可达。`handle_fallback_body_event` 的 `network_body_hook` 事件仓库内无 emitter（外部/遗留路径），缺失不可证实。对全部良构输入实际输出不变；且 `normalize_network_request` 本就对 undefined 归一为 `'not_enabled'`（`service_worker.ts:850`），新默认更贴近管道规范。故不构成可观测行为缺陷，非 blocking。
- 建议：三处构造点若需守住旧 `'failed'` 语义，改传 `extra: { response_body_status: 'failed' }`；或接受新默认（'not_enabled' 为管道归一默认），在 task.md 处置表记录处置。

### 结论（Round 2）

- 前轮 finding 复核：f001 已消除（diff + 复验见上）。
- 本轮新发现：1 条（f002，minor）
- 未进表的提示：无（无新文件过大、复杂度；`network_builder.ts` 102 行远低于阈值）。
- 总体判断：f001 修复正确还原 web_request 路径旧语义且未破坏 request_body 派生；本轮仅 1 条 minor，无未解决 critical / important。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001（构造点统一经 builder，无内联样板）：`re_verified`。grep `src/` 无 `NetworkRequestData = {` 内联字面量残留；9 处构造点均经 `build_network_data`，含 f001 修复点。
- AC-002（网络捕获事件数据不变，网络测试全绿，断言覆盖字段值）：`re_verified`。`npx vitest run` 131 文件 1378 用例全绿（较 Round 1 的 1377 增 1，为新增 builder 单测）；f001 修复后 web_request 路径 response_body_encoding/bytes 恢复 null 旧语义；f002 仅 minor 且对良构输入无可观测差异，不破坏「数据不变」。
- AC-003（`npm test` 全绿，`npx tsc --noEmit` 通过）：`re_verified`。`npx vitest run` 1378 通过（6.26s）；`npx tsc --noEmit` exit 0。

coverage = 3 / 3

verdict: PASS

## Round 3 (2026-08-11 22:32 UTC+8)

reviewed_scope: 62b2fd09f54897c1

### 前轮 finding 复核

#### t128_code_f002 - 已消除

- 三处构造点现均显式传 `X || 'failed'`，builder 默认 `?? 'not_enabled'`（`network_builder.ts:80`）不再触发：
  - `src/extension/background/body_capture_coordinator.ts:299`：`response_body_status: evt.response_body_status || 'failed'`
  - `src/extension/background/service_worker.ts:837`：`response_body_status: data.response_body_status || 'failed'`（`handle_fallback_body_event`）
  - `src/extension/content/network_hook.ts:375`：`response_body_status: d.response_body_status || 'failed'`（message_listener 构造点，page 侧 `post()` 载荷 67/90/107/130/144/159/194/252 每分支显式设值，`d.response_body_status` 恒为具体值）
- 三处均传具体字符串，输入缺失时 `|| 'failed'` 兜底为 `'failed'`，与锚点旧代码逐字一致；builder 默认不再生效，漂移消除。`||` truthiness 语义与旧代码相同，无 `''`/`0` 误兜风险（status 为字符串枚举）。
- 附带修复验证：`body_capture_coordinator.ts:300` `capture_method: 'external_cdp_bridge'` 已补回，与 `body_capture_mode` / `correlation_status` / `cdp_request_id` 顺序与锚点一致，无重复无遗漏。
- 独立复验：`npx tsc --noEmit` exit 0；`npx vitest run` 131 文件 1378 用例全绿。

### 本轮新发现

- 无。其余 8 处构造点（network_capture 的 send_ws_connection_event / build_network_event（含 f001 extra 覆盖）/ build_cdp_primary_network_event、network_correlator 的 merge_matched / build_cdp_only_request / build_web_request_only_request）与 Round 2 一致：body 派生、null 默认、extra 覆盖均保持旧语义，无新增回归。

### 结论（Round 3）

- 前轮 finding 复核：f002 已消除（diff + 复验见上）；f001 在 Round 2 已消除，本轮未回归。
- 本轮新发现：0 条
- 未进表的提示：无（无新文件过大、复杂度提示；`network_builder.ts` 102 行远低于阈值）。
- 总体判断：三处 response_body_status 显式传值后 `|| 'failed'` 语义完整还原，capture_method 行补回；无未解决 critical / important，无 minor。
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-001（构造点统一经 builder，无内联样板）：`re_verified`。grep `src/` 无 `NetworkRequestData = {` 内联字面量残留；9 处构造点均经 `build_network_data`，含 f001 修复点与 f002 三处。
- AC-002（网络捕获事件数据不变，网络测试全绿，断言覆盖字段值）：`re_verified`。`npx vitest run` 131 文件 1378 用例全绿；f002 修复后三处 response_body_status 缺失兜底回到旧 `'failed'` 语义，良构输入输出与锚点一致；f001 extra 覆盖保持 web_request 路径 response_body_encoding/bytes null 旧语义。
- AC-003（`npm test` 全绿，`npx tsc --noEmit` 通过）：`re_verified`。`npx vitest run` 1378 通过（4.97s）；`npx tsc --noEmit` exit 0。

coverage = 3 / 3

verdict: PASS

## Round 4 (2026-08-11 23:01 UTC+8)

reviewed_scope: 52336a441954cde3

### 本轮 scope 说明

- 独立复算当前指纹：`git diff --binary 9d36ca0b95e7f8c33922d8af99c8b010c8c8fc37` 排除 task 流程文件后 sha1 前 16 位 = `52336a441954cde3`，与注入指纹一致。
- Round 3（PASS）后 implementer 仅新增 `tests/unit/network_cdp.test.ts` 判别性用例（`web_request 路径命中非空 CDP body 仍不派发 body 字节/编码`）。src 侧文件本轮无内容变更：`network_capture.ts` 1211 行（= Round 2/3 加 f001 extra 后状态），f001/f002 修复点逐一核实仍在原位。

### 前轮 finding 复核

#### t128_code_f001 - 未回归

- `src/extension/background/network_capture.ts:968-972` `build_network_event` 的 `extra: { response_body_encoding: null, response_body_bytes: null }` 覆盖仍在；新建判别性测试正是锁定此语义（见下），并已通过，行为未漂移。

#### t128_code_f002 - 未回归

- 三处 `|| 'failed'` 兜底仍在原位：`body_capture_coordinator.ts:299`、`service_worker.ts:837`、`network_hook.ts:375`。本轮无改动触及。

### 本轮新发现

- 无。新增测试仅改 `tests/unit/network_cdp.test.ts`，未引入任何 src 改动；其余构造点（send_ws_connection_event / build_cdp_primary_network_event / merge_matched / build_cdp_only_request / build_web_request_only_request / convert_bridge_event_to_request / handle_fallback_body_event / network_hook）与 Round 3 一致，无回归。
- 判别性用例本身核查（测试层归属 test reviewer，此处仅确认不构成代码侧问题）：
  - 复用锚点既有的测试注入导出 `_cdp_request_meta_for_test` / `_cdp_body_results_for_test`（`network_capture.ts:42/45`，锚点 commit 已存在），非新增 src 面。
  - 走真实生产链路 handle_before_request → handle_completed → find_matching_cdp_request → build_network_event，未 mock 被测逻辑；base64 body `'aGVsbG8='` 断言 `response_body` 透传且 `response_body_encoding`/`response_body_bytes` 为 null——若移除 f001 extra 覆盖，builder 会派生 `'utf8'`/6 字节，该用例即红，判别力真实。
  - 状态卫生：该 describe 的 `beforeEach` 调 `stop_network_capture()`（`network_capture.ts` 内 `cdp_request_meta.clear()`/`cdp_body_results.clear()`），且 handle_completed 消费后删除注入条目，无跨用例污染。

### 结论（Round 4）

- 前轮 finding 复核：f001、f002 均未回归（diff + 复验见上）。
- 本轮新发现：0 条
- 未进表的提示：无（无新文件过大、复杂度；`network_builder.ts` 102 行远低于阈值）。
- 总体判断：Round 4 变更仅新增判别性测试，src 构造点与 Round 3 完全一致，无任何回归；新用例如实锁定 f001 的「web_request 路径不派发 body 字节/编码」语义。无未解决 critical / important，无 minor。
- 系统性 follow-up：无

### AC 复验方式（Round 4）

- AC-001（构造点统一经 builder，无内联样板）：`re_verified`。grep `src/` 无 `NetworkRequestData = {` 内联字面量残留；9 处构造点均经 `build_network_data`。
- AC-002（网络捕获事件数据不变，网络测试全绿，断言覆盖字段值）：`re_verified`。`npx vitest run` 131 文件 1379 用例全绿（较 Round 3 的 1378 增 1，即本轮判别性用例）；f001/f002 修复语义保持，web_request 路径 response_body_encoding/bytes 仍 null 旧语义。
- AC-003（`npm test` 全绿，`npx tsc --noEmit` 通过）：`re_verified`。`npx vitest run` 1379 通过（5.46s）；`npx tsc --noEmit` exit 0。

coverage = 3 / 3

verdict: PASS
