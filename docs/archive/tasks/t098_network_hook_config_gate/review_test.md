# Task review t098（reviewer_focus: 测试）

- task：`t098_network_hook_config_gate`
- spec：`docs/tasks/t098_network_hook_config_gate/spec.md`
- diff_anchor：`6774a8057b94f883181c005194dae48999b5cbf7`
- target：`git diff 6774a8057b94f883181c005194dae48999b5cbf7`
- round：1
- reviewed_at：2026-08-11 04:30 UTC+8

reviewed_scope: 66be2129a8a66dfc

## Findings

### t098_test_f001 - 静态扫描「无条件调用不应存在」断言恒真，无法防「门控旁新增无条件调用」回归

- 严重度：important
- 锚点：AC-001（`capture_network === false` 时 content 不安装 page network hook）
- 位置：`tests/unit/network_hook_config_gate.test.ts:19`
- 问题：`expect(start_section).not.toMatch(/^\s+start_network_hook\(/)` 中 `^` 非 multiline，只锚定字符串首。`start_section` 是 `function start_capture` 之后的全部源码，首字符为 `(`（函数签名），`^\s+start_network_hook\(` 永不匹配，该断言恒真。实测（node 复算）：
  - 正确代码下断言通过（trivially）；
  - 在门控 `if (config.capture_network) {...}` 之后**追加一条无条件 `start_network_hook(...)`** 的变异代码，本测试仍全绿（conditional 匹配到门控内调用 + 恒真断言通过），但此时 `capture_network=false` 也会安装 hook，恰好复现本 task 要修的 P0-7 缺陷。
  - 若补 `m` 标记，`^\s+start_network_hook\(` 会命中门控内缩进调用行，正确代码反而转红——即现写法既无效又无法简单修正，属于「想断言但实际没断言」。
- 建议：改为断言 `start_capture` 段内 `start_network_hook(` 出现次数 == 1，且该次调用位于 `if (config.capture_network)` 块内（例如：`(start_section.match(/start_network_hook\(/g) ?? []).length === 1` 叠加现有 conditional 检查）。或删除该无效断言并说明依赖 conditional 检查承担回归防御。

### t098_test_f002 - AC-003（body 采集关闭语义）无测试；标为 AC-003 的测试实为 websocket 门控

- 严重度：important
- 锚点：AC-003
- 位置：`tests/unit/network_hook_config_gate.test.ts:28-32`（标 AC-003 的用例）+ 全 diff 无 body 语义测试
- 问题：AC-003 要求「产品配置将 body 采集关闭时，行为与配置一致：不采集 response body 字段或不安装 body 相关 hook；须在实现中与 DEFAULT/类型语义一致并在测试断言写明」。spec 可测试性声明「全部 AC 可自动测试」，未列入「有意不测」。但：
  1. 标为 `AC-003` 的测试断言的是 `websocket_capture` 受 `capture_network` 门控——AC 全文未提 websocket，属实现细节回归守卫，与 AC-003 正文（body 采集关闭语义）无关，属于错误映射。
  2. diff 无任何测试断言 `capture_response_body === false` 时 response_body 不被采集/不被转发。
  3. 实现侧 `network_hook.ts` / `websocket_capture.ts` 均不读 `capture_response_body`，仅以 `capture_network` 门控；`capture_network=true && capture_response_body=false` 时 hook 仍转发 `response_body`。spec 风险区明确要求「执行期以 CaptureConfig 字段为准并在测试写死期望」，此要求未兑现。
- 建议：补一条（静态或行为级）测试把 AC-003 语义钉死：断言 body 关闭时 `network_hook` 不产生 `response_body` 字段（或按实现取舍明确断言「该 hook 非 body-only、capture_network=true 允许含 body 的元数据」，并写明依据）。若实现需配合改 `network_hook` 门控条件，属 code reviewer 职责，但 AC-003 的测试断言缺失本身为覆盖缺口。

## 结论

- 前轮 finding 复核（Round 1）：无
- 改测方向复核：无（本轮未修改任何既有测试，均为新增文件 + `content_script.ts` 门控改动）
- 本轮新发现：2 条（f001、f002），均 important
- 未进表的提示：
  - 行为测试 `network_hook_gate_behavior.test.ts` 只测 `network_hook` 模块的 start/stop 转发语义（AC-002 用例与 T097 `content_postmessage_nonce.test.ts:67-85` 重复），不直接触达 content_script 依据 `capture_network` 是否调 `start_network_hook` 的门控决策。此为 content_script 顶层副作用无法 import 的既有静态扫描模式（`content_script_uses_poll.test.ts` 同款），测试策略区亦认可「mock start_network_hook 是否调用；或查 listener 是否注册」，故不单列 finding；AC-001 的「未 start 不转发」是可达行为层最近代理，可接受。
  - 「门控关闭分支调用 stop_network_hook」（`network_hook_config_gate.test.ts:34-38`）为超出 AC 的附加守卫，方向正确；但「start→stop→再 dispatch 不转发」这一停止语义无行为测试，属可选扩展，不阻断。
- AC 复验方式：
  - AC-001：`re_verified`。读 `content_script.ts:108-114` 确认 `if (config.capture_network)` 包裹 `start_network_hook`/`start_websocket_capture`、else 分支 `stop_*`；静态测试 `network_hook_config_gate.test.ts:13-20` 断言门控块存在；行为测试 `network_hook_gate_behavior.test.ts:33-46` 断言未 start 不转发。已跑 `vitest run`（2 文件 6 用例全绿）。但「无条件调用不应存在」一侧依赖 f001 恒真断言，不构成完整独立复验。
  - AC-002：`re_verified`。`content_script.ts:109` 门控内调用；行为测试 `network_hook_gate_behavior.test.ts:48-60` start 后合法事件转发 1 次，断言 `sender` 被调一次。
  - AC-003：`未复验（缺测试）`。全 diff 无 body 采集关闭语义测试；标 AC-003 的用例测的是 websocket 门控。
  - coverage = 2 / 3
- 总体判断：AC-003 完全无对应测试（f002），且静态扫描存在恒真断言（f001），均有未解决 important，测试尚不足以证明 AC-003 满足，FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-11 04:40 UTC+8)

reviewed_scope: 248a4c52c1b24c72

### 前轮 finding 复核

- t098_test_f001（important）：已消除。无效断言 `expect(start_section).not.toMatch(/^\s+start_network_hook\(/)` 已删除，替换为 `if (config.capture_network)` 门控正则 + else stop 正则（`network_hook_config_gate.test.ts:15-20`）。node 实测：该正则对当前源码匹配（conditional=true, else_branch=true），非恒真；`npx vitest run` 4 文件 18 用例全绿。残余缺口（未断言 `start_network_hook(` 出现次数，P0-7 回归变异可逃逸）以本轮 f003 承接。
- t098_test_f002（important）：已消除。行为测试补 AC-003 / AC-003b（`network_hook_gate_behavior.test.ts:60-71`）：`build_page_script(false)` 断言 `CAPTURE_BODY = false` 与 `response_body_status: 'not_enabled'`；`build_page_script(true)` 断言 `CAPTURE_BODY = true` 与 `clone.text()`。AC-003 的 body 采集关闭语义已用断言钉住。

### 本轮新发现

### t098_test_f003 - AC-001 静态测试未断言 start_network_hook 出现次数，P0-7 回归变异可逃逸

- 严重度：minor
- 锚点：AC-001（capture_network=false 时不安装 page network hook）。非恒真断言，但回归防御不完整。
- 位置：`tests/unit/network_hook_config_gate.test.ts:13-20`
- 问题：AC-001 静态用例只验证门控块内存在 `start_network_hook`/`start_websocket_capture`，未断言 `start_capture` 段内 `start_network_hook(` 出现次数。node 模拟：在门控块后追加一条无条件 `start_network_hook(...)`（复现本 task 要修的 P0-7 缺陷）时，conditional 正则仍匹配、AC-002 正则仍匹配，全部测试仍绿（实测出现次数 1→2 未被检出）。f001 原建议的 `count === 1` 断言未采纳。
- 建议：补 `(start_section.match(/start_network_hook\(/g) ?? []).length === 1`，叠加现有 conditional 检查，防「门控外新增无条件调用」回归。

### 结论

- 前轮 finding 复核：f001 已消除（恒真断言移除，非 multiline 失效点已不存于报告），f002 已消除（AC-003 行为级断言补齐）；f001 的回归防御缺口以 f003 承接（minor）。
- 改测方向复核：无。`content_postmessage_nonce.test.ts` 两处 `build_page_script()` → `build_page_script(true)` 为签名变更的必需更新（原隐式 true 语义不变），非迁就实现。
- 本轮新发现：1 条（f003 minor）。
- 未进表的提示：AC-003 行为测试断言的 `response_body_status: 'not_enabled'` 字符串仅存在于 fetch 分支，XHR 分支（CAPTURE_BODY=false 时默认 'captured'）未被该测试钉住，与 code f003 同源（代码层 minor，不影响 AC-003 核心「不采集 body」）；行为测试不直接触达 content_script 依据 `capture_network` 的门控决策，属既有静态扫描模式（测试策略区已认可）。
- 总体判断：Round 1 两个 important（恒真断言、AC-003 无测试）均已消除，AC-003 已有行为级断言；仅剩 1 条 minor（AC-001 静态回归防御可加计数断言），verdict PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 静态门控正则对当前源码实测匹配；行为测试「未 start 不转发」（`network_hook_gate_behavior.test.ts:33-44`）通过。
- AC-002：`re_verified` — 静态断言 5 参调用签名；行为测试 start 后转发 1 次通过。
- AC-003：`re_verified` — `build_page_script(false/true)` 断言通过；fetch 分支 'not_enabled' 语义在脚本字符串中可查证（XHR 分支状态不一致为代码层 minor，不影响核心 body 不采集行为）。

coverage = 3 / 3

verdict: PASS

## Round 3 (2026-08-11 04:42 UTC+8)

reviewed_scope: f45e76886f3ed435

### 前轮 finding 复核

- t098_test_f003（minor）：处置为遗留，登记 `docs/pending/todo/p015_network_gate_static_test_robustness.md`（未开）。测试侧本无代码改动。

### 本轮新发现

无。代码侧 f003（XHR body_status 对齐）由 code reviewer 验证，本测试侧 scope 刷新。

### 结论

- AC-001/002/003 复验不变，全量 1193 通过。

verdict: PASS
