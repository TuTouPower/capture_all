# Task review t094（reviewer_focus: 测试）

- task：`t094_network_capture_session_key`
- spec：`docs/tasks/t094_network_capture_session_key/spec.md`
- diff_anchor：`e34b074aca5823e4b0079666ea26f0a71ebfc142`
- target：`git diff e34b074aca5823e4b0079666ea26f0a71ebfc142`
- round：1
- reviewed_at：2026-08-11 02:44 UTC+8

## Findings

### t094_test_f001 - AC-002 流式命令断言空循环恒真，streamResourceContent 被移除时测试仍 PASS

- 严重度：important
- 锚点：AC-002
- 位置：`tests/unit/network_capture_session_key.test.ts:181-183`
- 问题：`for (const call of stream_calls) { expect(call.sessionId).toBe(SESSION_A); }` 结构上等价于「条件跳过断言」——当 `stream_calls` 为空时循环体不执行，无证据仍 PASS。`stream_calls` 唯一来源是 `is_streaming_response`（仅 `text/event-stream`）触发的 `streamResourceContent` 发送路径；本 task 内只有该测试发出 `text/event-stream`，全套件无其他用例触达此路径。若生产回归删除/失触发 `streamResourceContent` 的 `sendCommand`（SSE body 采集静默失效），`stream_calls` 为空：循环恒真通过；`body_calls` 仍含 `req_plain` 的 `getResponseBody`，其 event 使 187 行 `events.length >= 1` 通过；AC-002 该子句将无任何断言失败。属危险模式「条件跳过弱化断言」命中（掩盖失败），不得标 minor。
- 建议：循环前加存在性断言，如 `expect(stream_calls.length).toBeGreaterThanOrEqual(1)` 与 `expect(body_calls.length).toBeGreaterThanOrEqual(1)`；`getResponseBody` 路径可依赖 187 行事件守卫（移除该命令会使事件数为 0），但流式路径无等价守卫，必须显式断言命令被发出。

### t094_test_f002 - AC-003 body 采集断言过弱

- 严重度：minor
- 锚点：AC-003
- 位置：`tests/unit/network_capture_session_key.test.ts:208`
- 问题：`expect(root_events[0].data.response_body_status).toBeDefined()` 仅验证存在某个状态；mock 未配置 `Network.getResponseBody` 响应（返回 undefined），status 恒为 `cdp_failed`，未验证 body 字节内容。「根 session 完成 body 采集」的证据偏弱。
- 建议：`mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: '<html>…', base64Encoded: false })` 后断言 `response_body_bytes` / `response_body` 实际内容。既有 `tests/unit/network_cdp.test.ts:231-278` 已用 `set_command_response` 覆盖根路径真实 body（全绿），故本项非阻断。

## 结论

- 前轮 finding 复核：本轮 Round 1，无
- 改测方向复核：无「迁就实现」改测。`network_cdp.test.ts:225-226` 键断言 `req_test_1` → `root:req_test_1` 系本 task 契约变更（内部键改 session 复合键、根 session 前缀 `root:`）的正确预期更新，断言强度未降（`.has()` 真值 + url/method 相等不变），用例发出的是无 sessionId 根事件，`root:req_test_1` 与当前实现一致，合法。
- 本轮新发现：2 条
- 未进表的提示：
  - 测试直接调用 `register_session(SESSION_A/B)` 而非按 spec 上下文区「注入 attachedToTarget」驱动注册；注册机制为既有生产导出、AC 验证的是复合键隔离而非注册链路，功能等价，不构成覆盖缺口。
  - AC-001 用例仅覆盖「同 requestId 不同 session」；若实现退化为 `sessionId` 单键（同 session 多请求互覆）不会被捕获，但该场景非本 task AC 范围、且现有键实现为复合键，不做 blocking。
  - 20ms `setTimeout` 等待依赖 mock 立即 resolve 的微任务链，无实质 race。
- 总体判断：AC-001/AC-003 真实触达生产路径、断言可判别裸键回归；AC-002 流式命令断言存在空循环恒真结构，掩盖 streamResourceContent 命令被移除的回归，需补存在性断言后方可信。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：re_verified — 重跑 `npx vitest run tests/unit/network_capture_session_key.test.ts` 通过；读断言，`urls` 双元素 + 双事件使裸键回归必失败（键碰撞时 meta 仅剩 1 条、事件仅 1 条）。
- AC-002：re_verified — 读断言 + 追踪生产 `network_capture.ts:506-507/570-571` 目标构造（`...(session_id ? { sessionId: session_id } : {})`）；流式命令存在性缺失见 f001。
- AC-003：re_verified — 重跑通过；读断言，root 事件 `request_id` 保留原始 requestId（符合「对外输出不变」）；body 内容断言弱见 f002。
- coverage = 3/3

reviewed_scope: e5741eda376b0ff6

verdict: FAIL

## Round 2 (2026-08-11 02:50 UTC+8)

### 前轮 finding 复核

- **t094_test_f001（important）— 已消除**。AC-002 用例在循环前加存在性守卫 `expect(stream_calls.length).toBeGreaterThanOrEqual(1)` 与 `expect(body_calls.length).toBeGreaterThanOrEqual(1)`（`tests/unit/network_capture_session_key.test.ts:182-183`）。生产回归移除/失触发 `Network.streamResourceContent` 时 `stream_calls` 为空 → 守卫失败，不再静默 PASS。守卫非 AC 唯一证据，后随逐条 `expect(call.sessionId).toBe(SESSION_A)` 精确断言（185-190 行），未弱化成另一种形式。重跑该文件 3/3 通过。
- **t094_test_f002（minor）— 已消除**。AC-003 用例现配置 `mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: '<html>root-body</html>', base64Encoded: false })`（196-199 行），并断言 `response_body` 含 `'root-body'`、`response_body_status` 为 `'captured'`（216-217 行）。mock → 生产 → 输出事件真实 body 往返，证据强度达标。

### 改测方向复核

diff 内唯一既有测试改动仍为 `tests/unit/network_cdp.test.ts:225-226` 键断言 `req_test_1` → `root:req_test_1`（本 task 契约变更：内部键改 session 复合键、根 session 前缀 `root:`，与生产 `cdp_request_key` 一致）。断言强度未降（`.has()` 真值 + url/method 相等不变），属正确预期更新，非「迁就实现」。无新改测。

### 本轮新发现

0 条（无 blocking / minor finding）。

### 未进表提示

- AC-001 用例 104 行 `const t = Date.now()` 未使用，死代码，可删。
- AC-001「body 互不覆盖」子句未用不同 body 内容实测：mock 默认 `getResponseBody` 返回 undefined，两个 session 事件 body 均 cdp_failed/null，body 键误串回归不会被捕获。但元数据隔离与双事件写入（复合键改造主要回归向量）已实测，且 mock 不支持按 requestId 差异化 body；属「可再加 case」，不阻断。
- AC-003 未显式断言根命令 target 无 `sessionId` 键；行为面（body 采集完成）已覆盖，内部 target 形状非 AC 要求，不阻断。

### 总体判断

Round 1 两个 finding（f001 important、f002 minor）均按建议修复并复验通过；全量单测 107 文件 / 1168 用例无回归；无新增 blocking。当前无未解决 critical / important。

### AC 复验方式

- AC-001：re_verified — 重跑 `npx vitest run tests/unit/network_capture_session_key.test.ts` 3/3 通过；`urls` 双元素 toEqual + 双事件写入使裸 requestId 键回归必失败（键碰撞时 meta/事件仅余 1 条）。
- AC-002：re_verified — 重跑通过；存在性守卫 + 逐条 `call.sessionId === SESSION_A`；对照生产 `network_capture.ts:507/571` target 构造 `...(session_id ? { sessionId: session_id } : {})`。
- AC-003：re_verified — 重跑通过；`response_body` 含 'root-body' 且 `response_body_status === 'captured'`，root 事件 `request_id` 保留原始 requestId（对外输出不变）。
- coverage = 3/3

reviewed_scope: 5393042f23c2ae52

verdict: PASS
