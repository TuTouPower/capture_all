# Task review t196（reviewer_focus: 测试）

- task：`t196_bridge_auth_logs_pairing`
- spec：`docs/tasks/t196_bridge_auth_logs_pairing/spec.md`
- diff_anchor：`67fa474fbd8ef0f89066cf4d3da5a760693dcac1`
- target：`git diff 67fa474fbd8ef0f89066cf4d3da5a760693dcac1`
- round：1
- reviewed_at：2026-08-14 04:25 UTC+8

## Findings

### t196_test_f001 - AC-004 文档内容断言耦合 decisions.md 具体标题文本与日期

- 严重度：minor
- 锚点：AC-004（决策记录）· 测试健壮性
- 位置：`tests/unit/bridge_auth_logs_pairing.test.ts:193-194`
- 问题：AC-004 测试把断言钉死在 ADR-026 的**确切标题**（`## 026 pairing 窗口过期不自动续期（2026-08-14）`）与短语（`保持不自动续期（安全默认`）。一旦 decisions.md 的 ADR 编号因前插条目重排、措辞微调或日期变更，测试即红，尽管「决策已记录」这一 AC 语义完全未变。属测试与文档格式耦合的维护成本，非行为缺口——当前内容与测试逐字吻合，本轮已验证（重读 `docs/blueprint/decisions.md` ADR-026 实文）。
- 建议：断言弱化为稳定语义锚（如仅匹配决策标题主体 `pairing 窗口过期不自动续期` 与「不自动续期」决策句），避免把序号/日期当契约；或在测试注释中注明「若 ADR 重编号需同步」以降低意外破坏。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1，无。
- 改测方向复核：无（diff 未改动任何既有测试，仅新增 `tests/unit/bridge_auth_logs_pairing.test.ts`）。
- 本轮新发现：1 条（minor，非阻断）。
- 未进表的提示：
  - AC-001 `expect(typeof hit.command_id).toBe('string')`（`:104`）可交叉断言 `hit.command_id === data.command_id`（COMMAND_TIMEOUT 响应体携带同一 command_id，`command_queue.ts:36`），现有断言已证字段存在与类型，属可加强、非缺口。
  - AC-002 仅覆盖 `event_count_cap` 分支；`cdp_event_evicted` 另有 `body_budget_cap` reason 分支（`src/bridge/cdp_handler.ts:145`），可加 case（扩展级，非 AC 缺口——AC-002 只要求该日志行存在）。
  - AC-003 未在 pairing 路径单独断言「错误 instance_token 被拒」；wrong-token 拒绝已由既有测试覆盖（`tests/unit/agent_bridge_server.test.ts:1186`），且两路径共用 `resolve_extension_auth`（`server.ts:614-641`），不重复出 finding。
  - `MockWebSocket.instance` 静态字段与 cdp_handler 模块级 `sessions` map 不跨测试清理（`:29,52`）：与既有 cdp 测试同模式（`bridge_cdp_events.test.ts`、`cdp_ws_close_terminal.test.ts` 均同样保留 session），vitest 文件级隔离 + 会话 key 唯一，无可观测影响。
  - AC-001 依赖真实 50ms 计时器（`:71`）：spec 风险区已声明「日志路径测试依赖计时脆弱」，测试采用「缩短超时窗口」回退；超时从 enqueue 起算（`command_queue.ts:32`），与 enroll/heartbeat 网络往返无关，判定稳定，不重复出 finding。
  - `AC-001` 测试体首行 `vi.useRealTimers()` 覆盖 `beforeEach` 的 fake timers，后续 `start_server` 及超时均用真实计时，行为一致，无掩蔽。
- 总体判断：AC-001~005 均有直接、可观察的真实断言（HTTP 行为 / 生产日志路径 / 文档记录）；无未解决 critical / important；1 条 minor 建议处置，不阻断。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified`。重跑 `npx vitest run tests/unit/bridge_auth_logs_pairing.test.ts` 4/4 绿；真实 HTTP server + 真实 50ms 超时（`command_queue.ts:32-43` COMMAND_TIMEOUT → `server.ts:361-367` `bridge_warn('command_timeout')`），断言 `hit.level/type/timeout_ms` 与 `typeof command_id === 'string'`，未 mock 被测逻辑（仅 spy `console.warn` 捕获输出）；超时日志先于响应返回，断言时序确定。
- AC-002：`re_verified`。同跑 4/4 绿；`_set_max_session_events_for_test(2)` + 注入 3 组 CDP 事件，核对 `src/bridge/cdp_handler.ts:101-120` `push_bounded` 淘汰分支（第 3 次 push 超限 shift 最旧 pending 事件 → `event_count_cap` 日志），断言 `hit.reason === 'event_count_cap'`；CDP `/json/list` fetch 与 WebSocket 为系统边界 mock，事件处理走真实 `onmessage` 生产逻辑。
- AC-003：`re_verified`。同跑 4/4 绿；真实 HTTP 链路 `/pair/open`（MCP token）→ enroll（无 MCP token，pairing code + `chrome-extension://` origin，匹配 `server.ts:569-577` `[a-p]{32}` 校验）→ 返回 `instance_token` → heartbeat 经 `resolve_extension_auth` instance token 路径（`server.ts:614-641` timingSafeEqual 哈希比较）返回 200；对照既有测试确认此前 heartbeat 均走 MCP-enroll 路径（`agent_bridge_server.test.ts:1066` 等），pairing 颁发 token 路径为本 task 新增独立断言。
- AC-004：`re_verified`。重读 `docs/blueprint/decisions.md` ADR-026 实文，与测试正则（`:193-194`）逐字吻合；决策内容（保持不自动续期、`/pair/open` 手动续窗）与 `server.ts` pairing 实现（`is_enroll_allowed` 过期拒绝、`build_pairing_status` 过期 code null）核对一致。
- AC-005：`re_verified`。重跑全量 `npx vitest run tests/unit`：200 文件、1901 测试全通过；diff 无任何 `src/` 改动（仅新增测试 + decisions.md + task.md），无回归面。

coverage = 5 / 5

reviewed_scope: 1a6637ef348711a1

verdict: PASS

## Round 2 复核（2026-08-14 04:27 UTC+8）

- 前轮 finding 复核：
  - **t196_test_f001（minor，AC-004 断言耦合 decisions.md 标题/日期）— 已修**。以 diff 为准核实：`tests/unit/bridge_auth_logs_pairing.test.ts:194` 断言已从 `/## 026 pairing 窗口过期不自动续期（2026-08-14）/` 放宽为 `/## 026 pairing 窗口过期不自动续期/`，日期耦合消除；`:195` 语义短语断言（`保持不自动续期（安全默认`）保留，非弱化为恒真/存在性断言。重跑 `npx vitest run tests/unit/bridge_auth_logs_pairing.test.ts`：4/4 全绿；`npx tsc --noEmit`：exit 0，无类型错误。
  - 遗留说明：正则仍含 ADR 序号 `026`。decisions.md 的 ADR 为 append-only 顺序编号，前插重排场景实际不发生；f001 核心（日期/措辞耦合）已消除，残余序号耦合可接受，不另行出 finding。
- 改测方向复核：无。本轮改动仅放宽 f001 所指断言文本（移除日期），属 finding 处置而非「迁就实现」改测；TDD 语义未变。
- 本轮新发现：0 条。全文件重扫危险模式（恒真断言 / 弱化断言 / 注释断言 / `.skip` / `.only` / `@ts-ignore` / 条件跳过 / 阈值掩盖）无新增命中。
- 未进表的提示：无。
- 总体判断：f001 已按建议方向处置，测试 4/4 绿、tsc 干净；无未解决 critical / important → PASS。
- 系统性 follow-up：无。

### AC 复验方式（Round 2）

- AC-004（本轮改动项）：`re_verified`。重读 `:193-195`：新正则与 `docs/blueprint/decisions.md` ADR-026 实文标题 `## 026 pairing 窗口过期不自动续期（2026-08-14）` 前缀匹配成立；断言仍验证「决策已记录」这一 AC 语义。
- AC-001/002/003/005：Round 1 已 `re_verified`。本轮 diff 仅动 AC-004 一行正则（`tests/unit/bridge_auth_logs_pairing.test.ts:194`），其余 3 用例与 AC-005 覆盖面不受影响；本文件 4/4 绿 + tsc 干净，无回归信号。

coverage = 5 / 5

reviewed_scope: fd5b4b111c83a1d7

verdict: PASS
