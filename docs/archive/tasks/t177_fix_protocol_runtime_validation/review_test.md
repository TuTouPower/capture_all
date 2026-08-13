# Task review t177（reviewer_focus: 测试）

- task：`t177_fix_protocol_runtime_validation`
- spec：`docs/tasks/t177_fix_protocol_runtime_validation/spec.md`
- diff_anchor：`79e6f7075ec1e3509704c7b9cd39cf97e544faa5`
- target：`git diff 79e6f7075ec1e3509704c7b9cd39cf97e544faa5`
- round：1
- reviewed_at：2026-08-13 20:45 UTC+8

## Findings

### t177_test_f001 - dispatcher stop 幂等测试代入旧实现不红，AC-003 行为面无判别力

- 严重度：important
- 锚点：AC-003（空闲态 stop 返回成功 + `capture_id: null`；`NO_ACTIVE_CAPTURE` 契约删除）
- 位置：`tests/unit/agent_command_dispatcher.test.ts:132-143`
- 问题：新测试 mock `stop_capture` 返回 `{ success: true }` + `get_status` 空闲。代入旧实现（`79e6f...`：`if (!result.success) throw NO_ACTIVE_CAPTURE; return { capture_id: active_capture_id, status: 'stopped' }`），`success:true` 不触发 throw 分支，返回 `{ capture_id: null, status: 'stopped' }`——断言 `{ ok: true, data: { capture_id: null, status: 'stopped' } }` **在旧实现下同样通过**。本次 dispatcher 改动的唯一行为差异在 `success:false` 分支（旧：dispatch 返回 `ok:false`/`NO_ACTIVE_CAPTURE`；新：`ok:true` + `{ capture_id: null, status: 'idle' }`），该分支无测试。原 `NO_ACTIVE_CAPTURE` 断言删除后，未补等价新语义用例，AC-003 的「`NO_ACTIVE_CAPTURE` 移除」处于行为层无测试证明状态——若只删协议错误码而保留 dispatcher throw，全部测试仍绿。
- 建议：补 `success:false` 用例，如 mock `stop_capture` 返回 `{ success: false }` + `get_status` 空闲，断言 `{ ok: true, data: { capture_id: null, status: 'idle' } }`。代入旧实现该用例红（旧实现 dispatch 返回 `ok:false` + `NO_ACTIVE_CAPTURE`）。

### t177_test_f002 - `expect(AGENT_ERROR_CODES).toContain(...)` 验证常量而非行为，注释误导

- 严重度：minor
- 锚点：无违反 AC（AC-004 四项畸形场景已由 AC-001a-d 覆盖）
- 位置：`tests/unit/result_runtime_validation.test.ts:107-109`
- 问题：`expect(AGENT_ERROR_CODES).toContain('CAPTURE_NOT_FOUND')` 只验证常量包含某个值（定义事实，删 code 才会红），未发请求验证「合法 error code 的 result 被接受」。注释 `// 合法 error code 通过（AC-004）` 误导——AC-004 列举的是畸形场景（畸形 ok、未知 error code、缺失 error、owner 合法但 body 非法），无「合法 error code 通过」要求，该断言不构成任何 AC 证据。
- 建议：删除该断言；若确需覆盖合法 error code 通过，发真实请求（如 `ok:false` + `error: { code: 'CAPTURE_NOT_FOUND' }`）按投递语义断言状态码。

### t177_test_f003 - `enqueue_command` 固定 50ms sleep 时序脆弱，慢环境潜在 flake

- 严重度：minor
- 锚点：无违反 AC
- 位置：`tests/unit/result_runtime_validation.test.ts:47-60`
- 问题：`/mcp/command` 以 `void fetch(...)` 丢弃响应 + 固定 `sleep(50)` 等待入队，再取 `/extension/command`。`take_next()` 非阻塞（无命令返回 null），极端慢环境下命令未入队时 `cmd_body.command_id` 为 undefined，后续 `post_result` 因校验失败返回 400 而误报（测试红，非静默掩盖，但属时序敏感）。另：该 `void fetch` 丢弃了 `/mcp/command` 响应，AC-002 的「MCP 收到响应」只能以 result 200 间接佐证。
- 建议：直接 `await` `/mcp/command` 响应（其 pending result 恰是 AC-002 投递断言目标），或轮询 `/extension/command` 直到非空，替代固定 sleep。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：round 1，无。
- 改测方向复核：唯一改既有测试处为 `agent_command_dispatcher.test.ts` 的 stop 用例——场景从 `success:false → NO_ACTIVE_CAPTURE` 重写为 `success:true + 空闲 → 成功`。方向由 spec AC-003 语义变更驱动，新断言与生产实现输出一致，非「迁就实现」；但旧 `success:false` 场景删除后未在行为层补回等价新语义用例，见 f001。
- 本轮新发现：3 条（1 important + 2 minor）
- AC 复验方式：
  - AC-001：`re_verified`。真实 server + HTTP 实测通过（31/31 绿）；四个畸形子 case 的 `result_invalid` warn 日志逐条命中（`ok must be a boolean` / `unknown error code` / `ok:true must not carry error` / `ok:false must carry an error object`）。pending 未丢判别为强判别：`queue.resolve` 对未知 command_id 抛错（`command_queue.ts:56-61`）且 resolve 后 owner 被删（`server.ts:552`），若畸形 result 被误投递，二次合法 result 必 400 而红，判别无假阳性。
  - AC-002：`re_verified`。200 与 `queue.resolve` 同路径（`server.ts:545-553`，中间无分支可跳过），200 蕴含 pending.result 已 resolve、MCP 收到合法 body；结构符合公开 schema 由 post body（`ok:true` + `data`）保证。
  - AC-003：部分 `re_verified`。协议层：`protocol.ts` diff 确认 `NO_ACTIVE_CAPTURE` 从 `AgentErrorCode` 与 `AGENT_ERROR_CODES` 移除；文档层：`docs/blueprint/domain.md:147` 同步删除。行为层：dispatcher 移除 throw 的判别力有缺口（f001），未完全复验。
  - AC-004：`re_verified`。畸形 ok / 未知 error code / 缺失 error / owner 合法但 body 非法四项分别由 AC-001a/b/d/c 覆盖且实测通过。
  - coverage = 4 / 4
- 未进表的提示：AC-002 若直接 `await` `/mcp/command` 响应可断言 MCP 收到的结构（当前 200 为间接充分证据）；`beforeEach` 置空 `server` 冗余（`start_server` 会重赋值），无害。测试用真实 server + HTTP + 真实 queue，无 mock 被测逻辑，可信度高。
- 总体判断：AC-001/002/004 覆盖闭合、判别强、真实集成触达生产逻辑；AC-003 dispatcher 行为面测试对本次改动无判别力（代入旧实现不红），需补 `success:false` 用例后重审。
- 系统性 follow-up：无

reviewed_scope: d0a865d039fcc0e3

verdict: FAIL

## Round 2 (2026-08-13 20:50 UTC+8)

### 前轮 finding 复核（以最新 diff 为准）

- **f001（important）**：已消除。新增用例 `agent_command_dispatcher.test.ts:145-156`「stop 失败（success:false）同样成功返回 capture_id null」——mock `stop_capture: ({ success: false })` + 空闲，断言 `{ ok: true, data: { capture_id: null, status: 'idle' } }`。代入旧实现（`79e6f...`：`if (!result.success) throw NO_ACTIVE_CAPTURE`）dispatch 返回 `ok:false` + `NO_ACTIVE_CAPTURE`，断言 `ok:true` 红，判别力恢复；新实现 `success:false → { capture_id: null, status: 'idle' }` 匹配。AC-003 行为面（`NO_ACTIVE_CAPTURE` 不再映射）有测试锁定。
- **f002（minor）**：已消除。恒真断言改 AC-002b 行为验证（`result_runtime_validation.test.ts:117-124`）：真实请求 `ok:false` + `error: { code: 'CAPTURE_NOT_FOUND', message: 'missing' }` → 断言 200（合法 code 通过校验并投递）。残留 `expect(AGENT_ERROR_CODES).toContain('CAPTURE_NOT_FOUND')` 已非 AC 证据，注释明确为行为前置。
- **f003（minor）**：已消除。`enqueue_command`（`result_runtime_validation.test.ts:48-68`）改为轮询：20 轮 × 25ms，probe `/extension/command` 取到 string `command_id` 才返回，超时显式 throw。已核实 `/extension/command` 无命令时返回 200+null body（`server.ts:505`，非 204），probe 不会消费队列、取到即取走，语义正确；fetch 失败 catch 后重试，不静默。

### 本轮新发现

- 0 条（33/33 测试绿；AC-001a-d 畸形 + 二次投递强判别未变；AC-002a/b 覆盖合法投递与合法 error code；AC-003 行为面判别力恢复；协议/文档删除 round 1 已核）

### 未进表的提示

- 无新。AC-002 若 `await` `/mcp/command` 响应可直接断言 MCP 收到的结构（当前 200 为同路径间接证据，round 1 已注明）。

### 结论

- 改测方向复核：本轮新增用例为 AC-003 新语义的行为验证，非「迁就实现」。
- 总体判断：前轮 3 条 finding 全部消除且未引入新问题，AC-001~004 覆盖闭合。
- 系统性 follow-up：无

reviewed_scope: b080d570b036d5b5

verdict: PASS
