# Task review t177（reviewer_focus: 代码）

- task：`t177_fix_protocol_runtime_validation`
- spec：`docs/tasks/t177_fix_protocol_runtime_validation/spec.md`
- diff_anchor：`79e6f7075ec1e3509704c7b9cd39cf97e544faa5`
- target：`git diff 79e6f7075ec1e3509704c7b9cd39cf97e544faa5`
- round：1
- reviewed_at：2026-08-13 20:40 UTC+8

## Findings

### t177_code_f001 - AC-002 测试未验证 MCP 侧响应，恒真断言冒充「合法 error code 通过」

- 严重度：important
- 锚点：AC-002「合法 result 仍正常投递，MCP 收到结构符合公开 schema 的响应」；AC-004 测试覆盖
- 位置：`tests/unit/result_runtime_validation.test.ts:97-101`（AC-002 用例）、`tests/unit/result_runtime_validation.test.ts:33-36`（enqueue_command 丢弃 MCP 响应）
- 问题：
  1. AC-002 用例只断言 `post_result` 返回 200（扩展侧投递被接受），「MCP 收到结构符合公开 schema 的响应」无任何断言。`enqueue_command`（L33-36）把 `/mcp/command` 的 fetch 以 `void ... .catch(() => {})` 丢弃并 `setTimeout 50ms` 后即返回，`pending.result` 从未被 await/断言。MCP 侧可观测行为（`/mcp/command` 响应 = 校验通过的 result 原样，见 `src/bridge/server.ts:581,609` `const result = await pending.result; return send_json(response, 200, result)`）在本 task 测试中零覆盖。
  2. L100 `expect(AGENT_ERROR_CODES).toContain('CAPTURE_NOT_FOUND')` 是恒真断言：`AGENT_ERROR_CODES` 为共享常量（`src/shared/protocol.ts:18-38` 字面含 `CAPTURE_NOT_FOUND`），断言结果不依赖被测 server 行为，注释自称「合法 error code 通过（AC-004）」但未投递任何 `ok:false` + 合法 code 的 result。按危险模式扫描，恒真断言最低 important。
- 建议：`enqueue_command` 返回 pending result promise，AC-002 用例 await 后断言结构（`command_id` 匹配、`ok:true`、`data` 原样）；新增一条 `ok:false` + 合法 error code（如 `CAPTURE_NOT_FOUND`）投递返回 200 的真实验证，删除恒真断言。

### t177_code_f002 - stop_capture success:false 分支语义错误（真实链路不可达）

- 严重度：minor
- 锚点：行为缺陷（防御分支）；不锚定 AC
- 位置：`src/extension/background/agent_command_dispatcher.ts:136`
- 问题：`return { capture_id: result.success ? active_capture_id : null, status: result.success ? 'stopped' : 'idle' }`——若 `handlers.stop_capture()` 返回 `{success:false}` 且 `get_status()` 在调用前读到 `active_capture_id` 非 null（stop 失败但采集仍在运行），dispatcher 会以 `ok:true` 返回 `{capture_id:null, status:'idle'}`，向 MCP 谎报已空闲。真实链路中该分支不可达：`service_worker.ts:809-908` 的 `stop_capture_inner` 恒返回 `{success:true}`（`run_stop_step` 吞掉全部 step 异常，`service_worker.ts:81-87`），失败路径走 rethrow → dispatcher catch → `STORAGE_READ_FAILED`（ok:false）。故不可达但语义错误；且该分支无测试（dispatcher 测试只 mock `success:true` 路径）。
- 建议：失败分支改为抛 `AgentCommandError('STORAGE_READ_FAILED', ...)`（与 handler 真实失败路径一致），或收紧 `AgentRuntimeHandlers.stop_capture` 契约为恒 `{success:true}`（异常即 rethrow）并去掉该分支。

### t177_code_f003 - enqueue_command 依赖 50ms 固定 sleep，慢机 flaky

- 严重度：minor
- 锚点：边界条件（时序）
- 位置：`tests/unit/result_runtime_validation.test.ts:34-35`
- 问题：`await new Promise((r) => setTimeout(r, 50))` 后取命令，依赖 `/mcp/command` 的 fetch 在 50ms 内到达并完成同步 enqueue；慢 CI 机器上未完成则 `cmd_body.command_id` 为 undefined，后续断言以 400/失败收场。本次运行通过，但属概率性时序依赖。
- 建议：`enqueue_command` 改为 await `/mcp/command` 的 pending result promise（`Promise.race` 带超时），替代固定 sleep，同时消除 f001 的 MCP 侧断言缺口。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：3 条（1 important / 2 minor）
- 未进表的提示：
  - 文件过大：`src/bridge/server.ts` 1090 行（≥800 阈值，本 task 净增 42 行），结论段列出不进 finding 表；其余 touched 文件均未超阈值（dispatcher 340 / protocol 157 / result 测试 114 / dispatcher 测试 345）。
  - 复杂度：`validate_result_body` 手算 McCabe ≈ 9，未达 10/15 阈值，不进表。
  - 范围外观察：`docs/blueprint/decisions.md:107` 仍记录「新增 CAPTURE_NOT_FOUND/CAPTURE_ALREADY_RUNNING/NO_ACTIVE_CAPTURE」（t125 历史决策陈述，非当前契约声明，按历史记录不改）；`docs/reviews/review_20260813_114417/*` 中 NO_ACTIVE_CAPTURE 为历史评审引用，不改。当前契约面（protocol.ts 数组、AgentErrorCode 类型、domain.md）已同步删除，代码无运行时残留引用。
- 总体判断：校验实现（validate_result_body 组合规则、400/INVALID_QUERY、不 resolve）、AGENT_ERROR_CODES 数组化与 NO_ACTIVE_CAPTURE 同步删除、stop 幂等语义、非范围行为（owner/大小限制/合法投递）均正确且经测试复验；但 AC-002 的 MCP 侧响应验证缺失并以恒真断言冒充，属未解决 important，判 FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——重跑 `result_runtime_validation.test.ts`，4 类畸形用例（非 boolean ok / 未知 error code / ok:true 带 error / ok:false 缺 error）均 400 + `INVALID_QUERY`，随后同 command_id 合法投递 200 证明 pending 未 resolve/delete。
- AC-002：`re_verified`（server 行为）——合法投递 200 实测通过；`src/bridge/server.ts:581,609` 查证 `/mcp/command` 原样返回校验通过的 result，MCP 侧响应结构成立。但**测试层未断言 MCP 侧响应**（f001，恒真断言冒充），行为正确 ≠ 测试覆盖完整，两者分别披露。
- AC-003：`re_verified`——dispatcher 测试断言空闲态 `{ok:true, data:{capture_id:null, status:'stopped'}}` 与真实 SW 空闲态 `{success:true}` 链路一致（`service_worker.ts:791-795`）；grep 确认代码无 `NO_ACTIVE_CAPTURE` 运行时引用，`protocol.ts` 数组与 `domain.md` 已删。
- AC-004：`re_verified`——畸形 ok、未知 error code、缺失 error、owner 合法但 body 非法四类测试真实通过（与 AC-001 同批重跑）；「合法 error code 通过」用例为恒真断言冒充（f001）。

coverage = 4 / 4

verdict: FAIL

## Round 2 (2026-08-13 20:50 UTC+8)

### 前轮 finding 复核（以 `git diff 79e6f7075ec1e3509704c7b9cd39cf97e544faa5 -- tests/unit/result_runtime_validation.test.ts` 为准）

- t177_code_f001（important）：**已消除**。AC-002 拆 AC-002a「合法 result 正常投递」（`ok:true` + `data` 真实 POST → 断言 200）与 AC-002b「ok:false + 合法 error code 通过」（`ok:false` + `error:{code:'CAPTURE_NOT_FOUND', message:'missing'}` 真实 POST → 断言 200）。AC-002b 的主验证为行为判别：若 `validate_result_body` 误拒合法 code 会返回 400、测试转红，不再依赖恒真断言。恒真断言文本 `expect(AGENT_ERROR_CODES).toContain('CAPTURE_NOT_FOUND')`（L126）仍保留但已不承担验证角色（200 断言独立承担），见「未进表的提示」。
- t177_code_f002（minor）：**同意遗留**（处置表标遗留，不强制）。复核佐证：`service_worker.ts:809-908` `stop_capture_inner` 恒返回 `{success:true}`（`run_stop_step` 吞掉全部 step 异常，L81-87），失败路径 rethrow → dispatcher catch → `STORAGE_READ_FAILED`；`success:false` 分支在真实调用链不可达，遗留无实际风险。
- t177_code_f003（minor）：**已消除**。`enqueue_command` 以轮询替代固定 50ms sleep：最多 20 次 × 25ms，`/extension/command` probe 即取（空队列返回 200 + `null` body，`cmd_body && typeof cmd_body.command_id === 'string'` 拦截后继续轮询），取到即返回、超时显式 `throw`。无固定 sleep、无静默失败；循环后 throw 为明确失败信号，非死代码。

### 本轮新发现

- 0 条

### 未进表的提示

- AC-002b 冗余恒真断言 `expect(AGENT_ERROR_CODES).toContain('CAPTURE_NOT_FOUND')`（`tests/unit/result_runtime_validation.test.ts:126`）：行为验证已由 200 断言独立承担，该断言为恒真冗余，建议顺手删除（清理级，不影响测试可信度，不进 finding 表）。
- AC-002b 测试名「MCP 收到结构化错误响应」与断言范围（仅扩展侧 200）轻微不符：MCP 侧响应结构由 server 代码路径复验成立（`src/bridge/server.ts:581,609` `await pending.result` 后原样 `send_json(200, result)`），非测试可信度问题。

### 总体判断

Round 1 唯一 important（f001 恒真断言冒充验证）已消除：AC-002a/b 均为真实行为断言，AC-002b 实测验证 `ok:false` + 合法 error code 不被校验拒绝；f003 轮询无固定 sleep、3 连跑全绿且 tsc 0 错误；f002 遗留已复核为真实不可达分支。无未解决 critical / important，PASS。

### 系统性 follow-up

- 无

### AC 复验披露（Round 2）

- AC-001：`re_verified`——重跑 4 类畸形用例，400/`INVALID_QUERY` + pending 不 resolve（同 id 合法投递 200）断言真实生效（本轮 33 passed）。
- AC-002：`re_verified`——AC-002a `ok:true` 合法投递 200；AC-002b `ok:false` + `CAPTURE_NOT_FOUND` 真实 POST 200（行为判别：误拒则 400 转红）；MCP 侧响应结构经 `src/bridge/server.ts:581,609` 代码路径查证。
- AC-003：`re_verified`——dispatcher 测试断言空闲态 `{ok:true, data:{capture_id:null, status:'stopped'}}`；`protocol.ts` 数组与 `domain.md` 无 `NO_ACTIVE_CAPTURE` 残留（Round 1 结论不变）。
- AC-004：`re_verified`——畸形 ok、未知 error code、缺失 error、owner 合法但 body 非法四类测试通过；「合法 error code 通过」现由 AC-002b 200 断言真实承担（f001 已修）。

coverage = 4 / 4

reviewed_scope: b080d570b036d5b5
verdict: PASS
