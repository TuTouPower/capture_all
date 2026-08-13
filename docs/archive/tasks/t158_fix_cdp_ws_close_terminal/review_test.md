# Task review t158（reviewer_focus: 测试）

- task：`t158_fix_cdp_ws_close_terminal`
- spec：`docs/tasks/t158_fix_cdp_ws_close_terminal/spec.md`
- diff_anchor：`4b5716a652ffcaee6a00a94fcceea5db909b4750`
- target：`git diff 4b5716a652ffcaee6a00a94fcceea5db909b4750`
- round：1
- reviewed_at：2026-08-13 14:36 UTC+8

## Findings

### t158_test_f001 - 网络错误上抛分支无测试：删除旧测试「on network error returns []」后无等价替代，回归为静默降空数组不会红

- 严重度：important
- 锚点：危险模式「删测试」——旧测试覆盖的语义（网络错误不静默降级）变更后未在任何层补回；t158 范围「client 不再统一降为空数组」的完整性
- 位置：`tests/unit/external_cdp_bridge_client.test.ts:227-230`（删除处）；`tests/unit/cdp_client_terminal_error.test.ts` 全文（无 fetch reject case）；`src/extension/background/external_cdp_bridge_client.ts:180-192`（catch 分支）
- 问题：旧测试「returns empty array on network error」（fetch reject → `[]`）随语义变更被删除，删除处注释称「覆盖见 tests/unit/cdp_client_terminal_error.test.ts 与 coordinator terminal 测试」，但两处均不覆盖网络错误分支：`cdp_client_terminal_error.test.ts` 只有 410（`res.status` 分支）、404（`!res.ok` 分支）、200 三个 case，无 fetch reject；`body_capture_terminal_fallback.test.ts` AC-004b 的 `mockRejectedValueOnce(new Error('bridge_unavailable'))` 是在 poll 函数层直接 reject，不经过 client 的 `fetch` → `catch` → 节流 warn → `throw err` 路径。生产注释（`external_cdp_bridge_client.ts:191`）明确将网络错误上抛声明为 t158 行为变更（「非 2xx 与网络错误不再静默降空数组」），且网络错误（Chrome 关闭/端口重启）正是本 task 动机场景的典型路径。该分支含节流状态 `last_poll_fail_warn_ts`，若 `catch` 回归吞错返回 `[]` 或节流逻辑错乱，无任何测试变红。
- 建议：在 `cdp_client_terminal_error.test.ts` 补一个 fetch reject case，断言 `poll_external_cdp_events` rejects（非空数组返回），并可选断言 10s 节流后 warn 行为；或明确在删除处结论中说明网络错误分支由何测试兜底。

### t158_test_f002 - 鉴权失败/其他非 2xx 状态码无 case（范围句「404/410/鉴权失败」中 401 分支未测）

- 严重度：minor
- 锚点：范围句「扩展 client 对 404/410/鉴权失败不再统一降为空数组」；AC-003 文本仅列 404/410，未列 401
- 位置：`tests/unit/cdp_client_terminal_error.test.ts:43-51`（仅 404 case）
- 问题：生产 `!res.ok` 分支对 401/500 同样抛 `cdp_poll_failed:<status>`，测试仅用 404 覆盖该分支。鉴权失败（范围句明确点名）无直接 case。按 AC-003 严格文本（404/410）已覆盖，不阻断。
- 建议：补一个 401 case 断言 `cdp_poll_failed:401`，成本低。

### t158_test_f003 - AC-005「不污染下一次实例」未直接验证；`close()` 被调用缺后置断言

- 严重度：minor
- 锚点：AC-005 文本含「不阻塞进程退出或污染下一次实例」；当前测试只覆盖「清理 + 幂等」半面
- 位置：`tests/unit/cdp_ws_close_terminal.test.ts:122-138`（AC-005）
- 问题：AC-005 测试用 `_get_session_for_test` 断言 `terminal_reason`/`cdp_ws` null/`idle_timer` null/映射 size 0 与二次 close 幂等，但未验证「下一次实例」：未做 terminal 后重新 `handle_cdp_start` 并断言新 session 干净、poll 不受旧 terminal 影响。另 AC-001 有 `expect(socket.close).not.toHaveBeenCalled()` 前置断言（合理），但未补 onclose 后 `socket.close` 已被调用的后置断言。清理断言本身为直接证据，不阻断。
- 建议：AC-005 补二次 start 后新 session `terminal_reason === null` 且能正常 200 poll 的 case；AC-001 补 `expect(socket.close).toHaveBeenCalled()`。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（round 1）
- 改测方向复核：无「迁就实现」的改测。`external_cdp_bridge_client.test.ts` 删除的两处旧测试断言旧语义（非 ok/网络错误 → 空数组），与新实现冲突，保留必红，删除合法且删除处有理由说明（AC-003 语义整体变更）；未发现把旧预期改成新输出的操作。唯一缺口是网络错误分支无等价替代（见 f001）。
- 本轮新发现：3 条（f001 important、f002 minor、f003 minor）
- 未进表的提示：
  - AC-002 断言依赖「410 返回 events 数组」，对 `body.events.length` 与逐条 `cdp_failed` 精确断言，非存在性检查，无恒真风险。
  - `cdp_client_terminal_error.test.ts` AC-003a 的 try/catch 二次调用：首次 `rejects.toThrow(CdpSessionTerminalError)` 已保证抛错，catch 必然进入，非条件跳过弱化。
  - `cdp_ws_close_terminal.test.ts` 用 `vi.stubGlobal('WebSocket', MockWebSocket)` 驱动生产 `new WebSocket(...)`，fetch mock 在系统边界，属 MockWebSocket 生产路径（符合测试策略），mock 边界干净。
- 总体判断：AC-001~005 全部有测试且触达生产路径（MockWebSocket / mock fetch / mock client 均只 mock 系统边界，被测函数真实执行），断言强度充分（410 + `error.code` + reason、pending → `cdp_failed` 可观察、poll 停止 + failed 状态、WS/timer/映射清理 + 幂等、非 terminal 重试回归）；代入旧实现（post-open 无 onclose 安装、client `if (!res.ok) return []`、coordinator 无 terminal 分支）逐条确认会红。遗留 1 条 important（网络错误上抛分支无测试保护），故 FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 重跑 `npx vitest run tests/unit/cdp_ws_close_terminal.test.ts` 通过；断言 `res.status === 410`、`body.error.code === 'cdp_session_terminal'`、`reason === 'ws_closed'`；旧实现无 `terminal_reason` 标记（`git show 4b5716a:src/bridge/cdp_handler.ts` 仅建连期 onclose 置 `connect_error`），代入必红。
- AC-002：`re_verified` — 重跑通过；断言 410 后 `events.length === 2` 且逐条 `response_body_status === 'cdp_failed'`；旧实现 200 分支不返回 pending 事件，代入必红。
- AC-003：`re_verified` — 重跑 `cdp_client_terminal_error.test.ts` 通过；410 抛 `CdpSessionTerminalError`（code/reason/events 精确断言）、404 抛 `cdp_poll_failed`、200 正常路径回归；旧 client `if (!res.ok) return []`，代入必红。
- AC-004：`re_verified` — 重跑 `body_capture_terminal_fallback.test.ts` 通过；terminal 后 poll 调用数不增、状态 `failed`、最后一批终态事件写入 1 次；AC-004b 非 terminal 错误维持 2 次 poll 且 `active`；旧 coordinator 无 `cdp_session_terminal` 分类（`git diff` 显示 +25 行），代入必红。
- AC-005：`re_verified` — 重跑通过；断言 `cdp_ws`/`idle_timer` null、映射清空、二次 close 幂等；「不污染下一次实例」方面未直接验证（见 f003 minor）。

coverage = 5 / 5

reviewed_scope: cb5ae9a91ef1550b

verdict: FAIL

## Round 2 (2026-08-13 14:38 UTC+8)

### 前轮 finding 复核（以当前 diff 为准）

- **t158_test_f001（important）— 已消除**：新增 `AC-003d`（`tests/unit/cdp_client_terminal_error.test.ts:63-67`），`fetch` mockRejectedValue(ECONNRESET) → `rejects.toThrow('ECONNRESET')`，真触达 client 生产 catch 分支（节流 warn + `throw err` 原样上抛，`external_cdp_bridge_client.ts:180-192`），非 mock 层替代。重跑绿。
- **t158_test_f002（minor）— 已消除**：新增 `AC-003c`（`cdp_client_terminal_error.test.ts:53-61`），401 → `rejects.toThrow('cdp_poll_failed:401')`，匹配生产 `throw new Error(\`cdp_poll_failed:${res.status}\`)`。重跑绿。
- **t158_test_f003（minor）— 已消除，修复强于建议**：`cdp_ws_close_terminal.test.ts:131` 补 `expect(socket.close).toHaveBeenCalled()` 后置断言；且原「不污染下一次实例」建议被更强方案替代——生产 `terminate_session` 现设 terminal TTL（`idle_timer = setTimeout(destroy_session, CDP_SESSION_IDLE_TTL_MS)`），测试 line 137-141 `advanceTimersByTimeAsync(5min)` 后 `_get_session_for_test` 为 null、poll 404，直接验证驻留泄漏被回收（覆盖 AC-005「不阻塞进程退出」实质）。生产实现与断言一致，非假行为。

### 本轮新发现

- 0 条。

### 改测方向复核

无「迁就实现」的改测。三处新增均为独立新 case，断言与生产路径逐一对应（410/404/401/网络错误/close 调用/TTL 回收），无把旧预期改成新输出的操作。

### 未进表的提示

- 410 分支现合并返回 `[...events, ...evicted_events]`（terminal + evicted 并存的直接 case 无测试）；该合并为防终态事件静默消失的增强，AC-002 核心（pending → cdp_failed 可观察）已覆盖，低风险。
- `last_poll_fail_warn_ts`（client/coordinator 模块级）在测试间不重置：`AC-003b` 与 `AC-003d` 同文件内两次 warn 间隔 < 10s，后一次被节流抑制——不影响当前断言（rejects 不依赖 warn），但未来若新增断言 warn 日志需注意。

### 总体判断

Round 1 三条 finding（1 important + 2 minor）全部修复到位且断言强度充分，附加的 coordinator `stop_external_cdp` 断言（`body_capture_terminal_fallback.test.ts:96`，生产 terminal 分支 best-effort 主动释放）真实触达。重跑四个文件 28/28 绿；AC-001~005 覆盖闭合（AC-003 现覆盖 410/404/401/网络错误/200 五路径）；代入旧实现逐条仍红。无未解决 blocker。

### AC 复验方式

- AC-001 / AC-002 / AC-005：`re_verified` — 重跑 `cdp_ws_close_terminal.test.ts` 4 项绿；AC-005 的 TTL 回收断言经生产 `terminate_session` 实现核对（`git diff` 确认 TTL timer + `destroy_session`）非假行为。
- AC-003：`re_verified` — 重跑 `cdp_client_terminal_error.test.ts` 5 项绿（新增 401/网络错误 case）。
- AC-004：`re_verified` — 重跑 `body_capture_terminal_fallback.test.ts` 2 项绿；`stop_external_cdp` 断言对应生产 terminal 分支 `await stop_external_cdp(bridge_config, session_key)`（`git diff` 确认）。

coverage = 5 / 5

reviewed_scope: 9d5cb634c835d2d3

verdict: PASS
