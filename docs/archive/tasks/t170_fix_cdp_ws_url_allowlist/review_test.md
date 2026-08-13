# Task review t170（reviewer_focus: 测试）

- task：`t170_fix_cdp_ws_url_allowlist`
- spec：`docs/tasks/t170_fix_cdp_ws_url_allowlist/spec.md`
- diff_anchor：`053eb1d8a9f9755b2f1fef827c3857ca2c9e4cf3`
- target：`git diff 053eb1d8a9f9755b2f1fef827c3857ca2c9e4cf3`
- round：1
- reviewed_at：2026-08-13 18:45 UTC+8

## Findings

### t170_test_f001 - AC-001 构造 URL 断言对旧实现不红，无法验证「构造而非信任 authority」

- 严重度：important
- 锚点：AC-001 / AC-001b 放行路径——本 task 独有行为「用 target ID 自行构造 loopback URL、不信任 discovery authority」（spec 范围第 3 条）无任何判别性断言；本 task 审阅重点即「放行路径断言构造 URL 而非 discovery URL」
- 位置：`tests/unit/cdp_ws_url_allowlist.test.ts:69`（AC-001 URL 断言）；`:72-83`（AC-001b，仅断 `instances.length`）
- 问题：AC-001 的 fixture `webSocketDebuggerUrl` 为 `ws://127.0.0.1:9222/devtools/page/target-1`，与 `safe_cdp_ws_url` 的构造结果逐字相同（`ws://127.0.0.1:{port}/devtools/page/{id}`，`encodeURIComponent('target-1')` 不变）。旧实现直接 `new WebSocket(target.webSocketDebuggerUrl)`（diff 前 `cdp_handler.ts` 原行）得到同一 URL，断言 `expect(MockWebSocket.instances[0].url).toBe('ws://127.0.0.1:9222/devtools/page/target-1')` 照样绿；旧实现下 status 200 / ok true / instances.length 1 也全部绿。测试注释声称「不信任 discovery authority：用 target ID 自行构造」，但该断言无判别力：实现退化为「校验后直接用 discovery URL」（spec 范围明令避免的信任 authority 模式）时，全套测试仍绿。AC-001b 的 `localhost` fixture 是唯一能判别的地方（构造结果应为 `ws://127.0.0.1:9222/...`），但该测试未断言 URL。经验证：代入旧实现，AC-001、AC-001b 均绿（其余 5 条负向经 400 断言为红，见结论 AC 复验）。
- 建议：AC-001 fixture 改用与标准构造形式不同的 discovery 路径，例如 `ws://127.0.0.1:9222/json/other`（allowlist 不校验 path，仍走放行），再断言构造后的 `ws://127.0.0.1:9222/devtools/page/target-1`——旧实现/信任模式立即红；或在 AC-001b 补断言 `ws://127.0.0.1:9222/devtools/page/target-1`（localhost 归一化）。改动量一行，判别性即成立。

### t170_test_f002 - fragment 拒绝分支无测试

- 严重度：minor
- 锚点：spec 范围「拒绝 credentials、fragment、异常路径、wss: 与远端 host」——fragment 在范围内但无对应负向用例（AC-003/004 枚举项不含 fragment，不阻断）
- 位置：`tests/unit/cdp_ws_url_allowlist.test.ts:99-136`（AC-003 负向组）；生产分支 `src/bridge/cdp_handler.ts:641`（`if (u.hash) return null`）
- 问题：实现含 fragment 拒绝（`u.hash` 检查），测试只覆盖远端 host / 不同端口 / wss / userinfo / 畸形 URL / 空 id，fragment 分支无用例。
- 建议：加一条 `ws://127.0.0.1:9222/devtools/page/x#frag` → 400 + 0 实例。

## 结论

- 前轮 finding 复核：Round 1 无前轮
- 改测方向复核：无——diff 仅新增 `tests/unit/cdp_ws_url_allowlist.test.ts`，未改动任何既有测试，无「迁就实现」改测
- 本轮新发现：2 条（1 important + 1 minor）
- 未进表的提示：
  - `call_start`（`:34-36`）用固定 3 次 `await Promise.resolve()` 冲刷微任务链，依赖 fetch→json→`new WebSocket` 的调用深度；生产代码若在 `new WebSocket` 前增加 await，测试会挂起超时失败（非静默过）。当前 10/10 轮稳定通过，仅作脆弱性提示。
  - 放行用例在模块级 `sessions` map 残留 session（含 fake-timer idle_timer），`afterEach` 已 `clearAllTimers`，文件内无跨用例断言依赖，无实际影响。
  - 端口缺省 URL（`ws://127.0.0.1/...` 无显式端口）虽过 allowlist 端口检查（`u.port === ''`），但连接 URL 恒由构造带请求端口，无安全影响，可不测。
- 总体判断：allowlist 拒绝语义（远端 host / 端口 / wss / userinfo / 畸形 / 空 id）测试扎实且代入旧实现全红，生产逻辑真实可达、mock 仅在系统边界；但安全修复独有行为「用 target ID 构造 URL 而非信任 discovery」无判别性断言，AC-001 的构造 URL 断言因 fixture 与构造结果逐字相同而对旧实现不红，属未解决 important，须修后重审。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——运行测试 7/7 通过（连跑 10 轮无 flaky）；核代码 `safe_cdp_ws_url` 放行（`src/bridge/cdp_handler.ts:631-645`）与 `new WebSocket(ws_url)`（`:330`）；同时验证构造断言对旧实现不红（fixture 与构造结果逐字相同，见 f001）。
- AC-002：`re_verified`——测试断言 400 + `cdp_invalid_ws_url` + 0 实例；核代码 host 检查（`:637`）；旧实现该路径返回 200 → 红。
- AC-003：`re_verified`——三条测试（不同端口 / wss / userinfo）均 400 + 0 实例；核代码 port（`:639`）、scheme（`:635`）、userinfo（`:640`）检查；旧实现 200 → 红。
- AC-004：`re_verified`——畸形 URL 走 `new URL` throw → catch → null（`:642-644`），空 id 走 `:632`，均 400；旧实现均 200 → 红。AC-004 枚举的负向（远端 / 端口 / userinfo / 非 ws scheme）已由 AC-002/003 用例覆盖。

coverage = 4 / 4

reviewed_scope: 52d8cf3500c3dc8d

verdict: FAIL

## Round 2 (2026-08-13 18:50 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- `t170_test_f001`（important）——**已消除**。AC-001b 修复（`tests/unit/cdp_ws_url_allowlist.test.ts:72-85`）：fixture 改非标准路径 `ws://localhost:9222/custom/path/ignored`，新增断言 `expect(...url).toBe('ws://127.0.0.1:9222/devtools/page/target-1')`（`:84`）。代入旧实现（信任 discovery）得 `ws://localhost:9222/custom/path/ignored`，断言红；host 归一化 + 路径构造双重差异，判别力恢复。AC-001 原 fixture 保留，其 URL 断言仍无判别力，但 AC-001 行为（WS 建立）已由 200/1 实例断言覆盖，且判别性断言已由 AC-001b 承担，不再出 finding。
- `t170_test_f002`（minor）——**已消除**。AC-003d 新增（`:141-152`）：`ws://127.0.0.1:9222/devtools/page/target-1#section` → 400 + 0 实例，覆盖生产分支 `if (u.hash) return null`。

### 改测方向复核

- 无「迁就实现」改测。AC-001b 断言为增强（补 URL 判别断言），方向与 TDD 一致。
- 注意：生产代码端口检查较 Round 1 严格化（`cdp_handler.ts` 现为 `if (u.port === '' || Number(u.port) !== port) return null;`，空端口也拒绝），对应新增 AC-003e（`:154-165`，`ws://127.0.0.1/...` 无端口 → 400）。该行为与 spec 范围「端口必须等于请求的 port」（空端口隐含 ws 默认 80 ≠ 请求 port）一致，未违反任何 AC；AC-003e 代入 Round 1 宽松实现（空端口放行）会红，判别力成立。此变更属 code reviewer 范畴，此处仅确认测试与实现一致。

### 本轮新发现

- 0 条。

### 未进表的提示

- 无新增（Round 1 的 `call_start` 微任务冲刷脆弱性提示仍适用，当前 5 轮连跑稳定）。

### 总体判断

f001/f002 修复到位、判别力恢复，无未解决 critical / important；9 测试全绿（多轮稳定）。

### AC 复验方式（Round 2 增量）

- AC-001b（判别性断言）：`re_verified`——fixture 与断言目标逐字比对（`ws://localhost:9222/custom/path/ignored` ≠ `ws://127.0.0.1:9222/devtools/page/target-1`），旧实现红、新实现绿，测试运行通过。
- AC-003d/e：`re_verified`——代码分支（`:hash` / 空端口检查）与测试 400 断言核对一致，测试运行通过。
- AC-001~004：Round 1 已 re_verified，本轮 9 测试全绿无回归。

coverage = 4 / 4

reviewed_scope: ebc58439e7b907ad

verdict: PASS
