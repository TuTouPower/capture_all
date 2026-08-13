# Task review t158（reviewer_focus: 代码）

- task：`t158_fix_cdp_ws_close_terminal`
- spec：`docs/tasks/t158_fix_cdp_ws_close_terminal/spec.md`
- diff_anchor：`4b5716a652ffcaee6a00a94fcceea5db909b4750`
- target：`git diff 4b5716a652ffcaee6a00a94fcceea5db909b4750`
- round：1
- reviewed_at：2026-08-13 14:40 UTC+8

## Findings

### t158_code_f001 - terminal session 在 bridge 侧永久驻留，coordinator 无销毁路径（内存泄漏）

- 严重度：important
- 锚点：AC-005（「不阻塞进程退出或污染下一次实例」的清理完整性）；行为缺陷 + 资源泄漏——Chrome 关闭/调试端口重启（本 task 目标场景）每次都会在 bridge 进程内留下一个不可回收的 terminal session，单 session 最多驻留 200MB body 预算 + 5000 条事件。
- 位置：`src/extension/background/body_capture_coordinator.ts:261-278`（terminal 分支未调 `stop_external_cdp`）；`src/bridge/cdp_handler.ts:181-184`（terminate_session 清掉 idle_timer）
- 问题：`terminate_session` 清除 idle_timer 后，terminal session 对 5 分钟 idle TTL 免疫；`sessions` map 中条目只能由 `handle_cdp_stop` 销毁。coordinator 的 terminal 分支只置 `poll_stopped = true` + 状态 `failed`，从不调 `stop_external_cdp`；重入路径 `start_body_capture`（tab 切换/URL 变更重试，`service_worker.ts:1118/1235`）也只调 `stop_poll` 不调 bridge stop。唯一清理路径是显式停采集（`stop_capture_inner` → `stop_body_capture_with_cleanup`）。后果：一次长采集内 Chrome 多次关闭 → N 个 terminal session 在 bridge 内存累积（各 ≤200MB + 5000 事件，`MAX_SESSION_BODY_BYTES` 为会话级预算），bridge 为长驻本地进程，泄漏时长 = terminal 至采集结束，可跨小时。t158 修复前该场景由 idle TTL 5 分钟内回收，本次改动引入无上限累积。
- 建议：coordinator terminal 分支写完最后一批事件后 best-effort `await stop_external_cdp(bridge_config, session_key)`（`bridge_config` 在 `poll_once` 闭包内可见，`stop_external_cdp` 内部吞错、幂等）；或 bridge 侧为 terminal session 加短 TTL 兜底销毁。410 事件已消费后销毁与「410 可观察」契约不冲突（d007 保留 404=未知 session 语义）。

### t158_code_f002 - 轮询失败 warn 节流被 coordinator 路径绕过，t150-f002 修复回归

- 严重度：minor
- 锚点：非 terminal 错误「既有行为不回归」；回归 t150-f002 已修缺陷（`docs/archive/tasks/t150_error_handling_observability/review_code.md:22-28` 原判 minor：500ms 轮询失败 warn 刷屏）
- 位置：`src/extension/background/body_capture_coordinator.ts:280`（`logger.warn('External CDP poll failed')`）；触发自 `external_cdp_bridge_client.ts:191`（失败一律 throw）
- 问题：t158 前 client 吞错返空数组，coordinator catch 实为死代码；t158 后 client 每次失败 throw → coordinator catch 每 500ms 记一条 warn。client 内部 10s 节流（`last_poll_fail_warn_ts`）只作用于 client 自身 warn，coordinator 的 warn 每条全量落 IndexedDB app_logs，bridge 离线/404 时回到 2 条/s 刷屏——与 t150-f002 修复前同量级。
- 建议：coordinator catch 对非 terminal 失败复用同款节流（模块级时间戳或复用 client 已节流语义），或非 terminal 失败降 `logger.debug`。

### t158_code_f003 - terminal 清空 evicted_events，已终态待返回事件在 410 前不可观察，注释与行为不符

- 严重度：minor
- 锚点：AC-002 终态可观察语义（t157 evicted 队列「不静默消失」意图）；410 分支注释「已带全部事件」与实现不符
- 位置：`src/bridge/cdp_handler.ts:174-175`（`session.evicted_events = []`）；`src/bridge/cdp_handler.ts:528-543`（410 仅返回 `session.events`）
- 问题：t157 建 evicted 队列保证「pending 淘汰事件不静默消失、可观察」。terminal 时清空队列：若 terminal 先于 client 排空 evicted 队列，这些请求元数据（含 `response_body_status:'evicted'` 终态）永久不可观察；410 body 实际不含 evicted_events，注释「410 已带全部事件」不准确。实际触发仅 events 达 5000 上限且 evicted 未排空时，且事件无 body，属边界场景。
- 建议：410 分支返回前将 `evicted_events` 并入 events 列表；或改注释为「410 带 session.events 全部事件（evicted 队列清空丢弃）」。

## 结论

- 前轮 finding 复核（Round 1 首轮，无）：无
- 本轮新发现：3 条（1 important + 2 minor）
- 未进表的提示：
  - 文件过大：`src/bridge/cdp_handler.ts` 610 行 ≥ 400 阈值且本 task 净增约 62 行（94 insertions − 32 deletions 中该文件占大部分），无硬约束；不构成可观测缺陷，按降级规则仅列出。
  - 复杂度：`poll_once`（coordinator）手算 CC ≈ 9、`terminate_session` CC ≈ 4，均 < 10，不进表。
  - 观察（非 finding）：`ws.onerror` 安装空实现，依赖 WHATWG「error 必随 close」约定；若某运行时 error 后无 close，session 将挂到 idle TTL 销毁 → 404 → `cdp_poll_failed` 无限 best-effort 重试（状态停留 active），即本 task 欲修的静默失败仅在该异常路径残留。另：client 层「网络错误上抛」无直接单测（仅 coordinator AC-004b 覆盖泛化错误传播），属 test reviewer 职责，仅提示。
- 总体判断：AC-001~005 实现齐备、测试全绿、分类错误语义与 spike 结论一致；但 terminal session 无销毁路径引入 bridge 侧内存泄漏（f001 important），修复前不可信。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：re_verified — 复跑 `cdp_ws_close_terminal.test.ts` AC-001：断言 410 + `error.code='cdp_session_terminal'` + reason `ws_closed`，通过。
- AC-002：re_verified — 复跑 AC-002：断言 2 条 pending 事件终态化为 `cdp_failed` 且随 410 返回，通过；`cdp_handler.ts:167-171` 静态核对终态化逻辑。
- AC-003：re_verified — 复跑 `cdp_client_terminal_error.test.ts`：410 抛 `CdpSessionTerminalError`（带 events/reason）、404 抛 `cdp_poll_failed`、200 不回归，通过；`external_cdp_bridge_client.ts:171-179` 静态核对。
- AC-004：re_verified — 复跑 `body_capture_terminal_fallback.test.ts`：terminal 后末批事件写入、状态 failed、不再调度 poll（AC-004b 验证非 terminal 维持重试），通过。
- AC-005：re_verified — 复跑 AC-005/005b：断言 `cdp_ws=null`、`idle_timer=null`、`body_seq_to_req_id` 清空、幂等、stop 后 404，通过；`terminate_session` 静态核对（清理项齐全，惟 f001 所述 bridge 侧驻留属边界缺陷）。
- 既有测试删除：re_verified — `external_cdp_bridge_client.test.ts` 删除的两条「降空数组」测试与新语义（抛分类错误）冲突，删除正确；替换覆盖在 `cdp_client_terminal_error.test.ts` 与 coordinator 测试。全量复跑：4 个 t158 测试文件 26 passed + 6 个 CDP 既有测试文件 42 passed + `npx tsc --noEmit` exit 0。

coverage = 5 / 5

reviewed_scope: cb5ae9a91ef1550b

verdict: FAIL

## Round 2 (2026-08-13 14:50 UTC+8)

### 前轮 finding 复核（以当前 diff 为准）

- **t158_code_f001（important）已修**。`src/bridge/cdp_handler.ts:172-181`：`terminate_session` 清原 idle timer 后设 terminal TTL（`CDP_SESSION_IDLE_TTL_MS` 5 分钟）→ 回调 `destroy_session` 自动回收，session 保留供 410 观察后自动销毁；幂等由 `if (session.terminal_reason) return` 保证，`destroy_session` 本身幂等（map 取不到即返），stop 提前销毁时 `clearTimeout` 清 TTL timer 无残留。`src/extension/background/body_capture_coordinator.ts:277-286`：terminal 分支写末批事件、置 poll_stopped、状态 failed 后 `stop_external_cdp` 主动释放（best-effort，`stop_external_cdp` 内部吞错 + 外层 try/catch 双保险；TTL 兜底）。410 观察窗口=terminal 至主动 stop 或 TTL 到期，与 d007「stop 销毁后 404」契约一致。测试：AC-005 断言 `socket.close` 已调 + TTL 5min 后 `_get_session_for_test` 为 null + 404；AC-004 断言 `stop_external_cdp` 以 `'sess-1'` 调用。复跑通过。
- **t158_code_f002（minor）已修**。`src/extension/background/body_capture_coordinator.ts:32-33,298-302`：非 terminal 失败 warn 加模块级 `last_poll_fail_warn_ts` 10s 节流，与 client 侧（`external_cdp_bridge_client.ts:61,186-190`）同口径；两路径各自节流合计 0.2 条/s，Round 1 的 2 条/s 刷屏回归消除。
- **t158_code_f003（minor）已修**。`src/bridge/cdp_handler.ts:531-535`：410 分支返回 `[...session.events, ...session.evicted_events].map(serialize_cdp_event)`，evicted 待返回事件并入、不再清空；注释同步改为「含 evicted 待返回，不静默消失」，与行为一致。

### 本轮新发现

0 条。

### 未进表的提示

- 复杂度：`poll_once`（body_capture_coordinator.ts:247）手算 CC ≈ 12（≥10），terminal 分支新增分支数，但分支为线性 if/else 无嵌套，未产生可观测缺陷，仅提示。
- 文件过大：`src/bridge/cdp_handler.ts` 约 615 行 ≥ 400 阈值且本 task 净增，与 Round 1 同，仅列出。
- 观察（非 finding）：coordinator terminal 分支 `await deps.get_bridge_config()` 重复获取配置（`poll_once` 闭包已有 `bridge_config`），冗余无害——配置中途变更时用新值 stop 反而更正确。

### AC 复验方式（本轮增量）

- 复跑 `npx vitest run tests/unit/cdp_ws_close_terminal.test.ts tests/unit/body_capture_terminal_fallback.test.ts tests/unit/cdp_client_terminal_error.test.ts tests/unit/external_cdp_bridge_client.test.ts` → 4 文件 28 passed（新增 AC-003c 401 / AC-003d 网络错误上抛 / AC-005 socket.close + TTL 回收 / coordinator stop_external_cdp 断言，均与实现语义一致）；复跑 CDP 既有 6 文件 42 passed 防回归；`npx tsc --noEmit` exit 0。
- AC-001~005 复验类别同 Round 1（re_verified），本次对 f001~f003 修复点以 diff + 新断言核实。coverage = 5 / 5。

reviewed_scope: 9d5cb634c835d2d3

verdict: PASS
