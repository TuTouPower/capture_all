# Task review t185（reviewer_focus: 代码）

- task：`t185_refactor_network_capture_state`
- spec：`docs/tasks/t185_refactor_network_capture_state/spec.md`
- diff_anchor：`6fcebbb93176964ef79f2df6a14de88b3f492aac`
- target：`git diff 6fcebbb93176964ef79f2df6a14de88b3f492aac`
- round：1
- reviewed_at：2026-08-13 23:13 UTC+8

## Findings

### t185_code_f001 - finalize_request 收敛吞掉 `cdp_primary_event_emitted` debug 日志

- 严重度：minor
- 锚点：行为缺陷 + diff 证据（spec 非范围「不改变 CDP 事件处理的行为语义」）
- 位置：`src/extension/background/network_capture.ts:448-456`（finalize_request）；原代码 6fcebbb `handle_cdp_event` getResponseBody then 分支
- 问题：重构前 getResponseBody 成功且 meta 存在时，emit 后记录 `logger.debug('cdp_primary_event_emitted', { url, method, body_status, body_len })`（6fcebbb 原第 ~660 行，diff 中整段删除）；收敛进 `finalize_request` 后该日志消失，其余调用方（loadingFinished 非 streaming 分支、catch 失败分支）重构前本无此日志，行为与重构前不再一致。日志为 debug 级（生产不输出），不影响采集结果与用户可见行为，故非 blocking。
- 建议：`finalize_request` 内补回 `logger.debug('cdp_primary_event_emitted', { url: meta.url?.slice(0, 120), method: meta.method, body_status: body_result.status, body_len: body_result.body?.length ?? 0 })`，或按调用方区分。

### t185_code_f002 - AC-003 收敛不彻底：loadingFinished 分支仍残留手工重复删 finished_before_stream

- 严重度：minor
- 锚点：AC-003「各 terminal path 不再手工删除多个集合」
- 位置：`src/extension/background/network_capture.ts:650-661`（capture_response_body=false 分支）、`665-694`（streaming 分支）、`459-462`（cleanup_streaming_state）
- 问题：capture_response_body=false 分支对 `finished_before_stream` 连续三处删除——650 行 `cleanup_streaming_state`（已删 streaming+finished）、660 行 `finalize_request` 内部（再删）、661 行显式 `ctx.finished_before_stream.delete(req_key)`（纯冗余，前两处均无条件删过）。streaming 分支 692 行 `ctx.finished_before_stream.delete(req_key)` 与 `finalize_request`（690 行）重复，仅 meta 不存在时 692 行有必要。`cleanup_streaming_state` 注释称「loadingFinished 非 streaming 分支共用」，实际仅 650 行一处调用点，注释与使用不符。`Map.delete` 幂等，无行为缺陷，但「不再手工删除多个集合」的收敛目标残留冗余手工清理。
- 建议：capture_response_body=false 分支删除 661 行；streaming 分支保留 692 行但可移入统一 cleanup；修正 `cleanup_streaming_state` 注释。

### t185_code_f003 - NetworkCaptureContext 含未使用冗余字段

- 严重度：minor
- 锚点：死代码（未使用的 context 字段）
- 位置：`src/extension/background/network_capture.ts:71-88`（interface）、`90-109`（build_capture_context）
- 问题：`is_capturing`、`pending_requests`、`deferred_web_requests`、`orphan_timers` 四个字段在 `handle_target_event` / `handle_http_event` / `handle_websocket_event` 中均无任何读取（已 grep 确认），`build_capture_context` 仍打包进 ctx。接口承诺全部状态经 ctx 访问，实际这四字段只占位，易误导后续维护者。
- 建议：从 interface 与 `build_capture_context` 移除，或确认为后续 deferred/orphan 收敛预留时加注释说明。

## 结论

- 前轮 finding 复核（Round 1）：无
- 本轮新发现：3 条（全部 minor）
- 未进表的提示：
  - 文件过大：`src/extension/background/network_capture.ts` 物理行数 1333（`wc -l`），超 important 阈值 800；本 task 净增约 177 行（diff +277/−100），未提供不可拆硬约束。单文件聚合 webRequest handlers、CDP handlers、deferred/orphan、event builder 多职责，建议后续拆分。
  - 复杂度：`handle_http_event`（network_capture.ts:503-783）手算圈复杂度约 26，新建函数一上来超 15 阈值；但分支为原 `handle_cdp_event` 搬移（未新增分支），拆分后单函数与总复杂度均下降，且未产出可观测缺陷，按规则不进 finding 表。`handle_target_event` / `handle_websocket_event` / `handle_cdp_event` 分发层约 3-10，合理。
  - 边界观察（stream_buffer 快照）：`responseReceived` 的 `Network.streamResourceContent` then 回调由 `stream_buffer_instance?.append`（模块级实时值）改为 `ctx.stream_buffer_instance?.append`（network_capture.ts:618，事件时快照）。stop→restart 竞态下，重构前写新实例（脏数据入新 capture），重构后写旧实例（孤儿数据、无消费者、随 ctx 引用 GC）。无可观测差异，且重构后行为更符 T103「迟到回调不得写新 capture」意图；仅记录。
  - AC-002 边界：`send_ws_frame` / `send_ws_connection_event` / `try_resolve_deferred` / `schedule_orphan_check` 等既有 helper 仍直接读写模块级 Map/Set（不在本 diff 内；spec 非范围不改已拆模块对外接口）。AC-002 字面（`handle_cdp_event` 不再直接读写）已满足：重构后 `handle_cdp_event` 仅 `build_capture_context` + 分发，三个 family 函数均经 ctx 访问。deferred/orphan 路径经 `finalize_request` 注释明确「由调用方另行处理」，属 spec 范围内决定。
  - 行为等价核对结论：除 f001（debug 日志丢失）与上述 stream_buffer 快照边界外，逐分支对照 6fcebbb 原文，Target family（含 detachedFromTarget 的 unregister_session）、requestWillBeSent（含 redirect 前一跳 emit）、responseReceived、dataReceived、loadingFinished 三分支、loadingFailed、WebSocket 全家族均行为等价；新增 `return` 与 ctx 标量快照均为同步路径等效值。
- AC 复验方式：
  - AC-001：`re_verified`——全量 `npx vitest run` 190 文件 1809 用例全绿；network_capture 相关 3 文件 101 用例全绿；另逐分支 diff 对照原文确认采集路径等价。
  - AC-002：`re_verified`——代码查证 `handle_cdp_event` 仅 `build_capture_context()` + 按 method family 分发，三个 family 函数状态均经 ctx。
  - AC-003：`re_verified`——`finalize_request` / `cleanup_streaming_state` 收敛全部 5 个 terminal 调用点（650/660/689/739/765）；残余冗余手工删见 f002（minor）。
  - AC-004：`re_verified`——5 用例逐条与实现路径核对：capture_response_body=false（cleanup_streaming_state+finalize 清 meta/body/streaming/finished）、SSE streaming（force_flush 后清 streaming/meta/body/finished）、getResponseBody 成功/失败（finalize 清 meta/body/finished）、loadingFailed（finished 清空、body_results 保留 fail_result 供 deferred/orphan）；断言为精确 `.toBe(false)`/`.toBe(true)`/`.toBe('cdp_failed')`，无恒真/弱化；测试全绿。
  - coverage = 4 / 4
- 总体判断：行为等价重构达成，4 条 AC 全部可独立复验通过；仅 3 条 minor（日志回归、收敛冗余清理、ctx 冗余字段），无未解决 critical / important。
- 系统性 follow-up：无

reviewed_scope: c20cdcc3adfe183a

verdict: PASS

## Round 2 复核 (2026-08-13 23:17 UTC+8)

### 前轮 finding 复核（以当前 `git diff 6fcebbb93176964ef79f2df6a14de88b3f492aac` 与代码为准）

- t185_code_f001：已消除。`logger.debug('cdp_primary_event_emitted', { url, method, body_status, body_len })` 移入 `finalize_request`（network_capture.ts:452-457），字段与重构前一致，覆盖全部 finalize 路径。附带影响确认：capture_response_body=false / streaming / getResponseBody catch 三个原无此日志的路径现多输出一条 debug 日志，debug 级、字段对该路径有效（如 status='not_enabled'），无用户可见影响，符合处置说明「统一输出」。
- t185_code_f002：已消除。capture_response_body=false 分支删除 661 行显式 `finished_before_stream.delete`，现仅 `cleanup_streaming_state` + `finalize_request`（network_capture.ts:649-662）；streaming 分支 meta 存在走 finalize、meta 不存在走 else 单删（network_capture.ts:666-694），不再与 finalize 重复；`cleanup_streaming_state` 注释修正为「loadingFinished 非 streaming 终态路径」（network_capture.ts:459）。行为核对：与 6fcebbb 原文等价（重构前无条件 finished.delete，现由 cleanup_streaming_state 无条件删 / streaming else 分支删，均覆盖）。
- t185_code_f003：已消除。`NetworkCaptureContext` 移除 `is_capturing`/`pending_requests`/`deferred_web_requests`/`orphan_timers` 四字段（network_capture.ts:71-85），`build_capture_context` 同步（network_capture.ts:88-101），并注释「其余模块级状态由对应 helper 直读」。残留引用检查：diff 与 grep 无上述字段的 `ctx.` 使用，`npx tsc --noEmit` exit 0。

### 本轮复核动作

- `npx tsc --noEmit`：exit 0，无类型错误。
- `npx vitest run tests/unit/network_capture_terminal_cleanup.test.ts tests/unit/network_capture.test.ts tests/unit/network_capture_session_key.test.ts`：3 文件 101 用例全绿（terminal_cleanup 5、network_capture 93、session_key 3）。
- 测试增强核对（相对 Round 1 的 150 行版本，现 158 行）：SSE streaming 用例注入 `_cdp_body_results_for_test`、loadingFailed 用例注入 `_finished_before_stream_for_test`，均注释「注入建立清空判别力」——避免原路径本来无该 key 的假绿，断言更严格，无恒真/弱化（精确 `.toBe(false)`/`.toBe(true)`/`.toBe('cdp_failed')`）。
- 处置过程未波及其他区域：ctx 保留字段（stream_buffer_instance/ws_connections/dbg_tab_id/current_tab_id 等）使用面与 Round 1 一致。

### 本轮新发现

- 0 条。

### 总体判断

三条 minor 全部按建议处置落实，tsc 与 network_capture 相关测试全绿，处置过程未引入新问题。

reviewed_scope: 0237d02ffddd4ecc

verdict: PASS
