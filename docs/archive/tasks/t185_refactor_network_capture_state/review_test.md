# Task review t185（reviewer_focus: 测试）

- task：`t185_refactor_network_capture_state`
- spec：`docs/tasks/t185_refactor_network_capture_state/spec.md`
- diff_anchor：`6fcebbb93176964ef79f2df6a14de88b3f492aac`
- target：`git diff 6fcebbb93176964ef79f2df6a14de88b3f492aac`
- round：1
- reviewed_at：2026-08-13 23:13 UTC+8

## Findings

### t185_test_f001 - 表测试部分「清空」断言作用在从未写入的状态上，恒真不携带清理证据

- 严重度：minor
- 锚点：AC-004（表测试逐项断言终态 state 清空的验证强度略低于行注释表述；不构成 AC 缺口）
- 位置：`tests/unit/network_capture_terminal_cleanup.test.ts:94-96`（test 1）、`:109`（test 2）、`:146`（test 5）
- 问题：以下「清空」断言对应的状态在该 terminal path 上从未写入，断言恒真，无法验证任何清理逻辑：
  - test 1（`capture_response_body=false`）：`cdp_body_results` 与 `streaming_requests` 全程未写入（body=false 时 `responseReceived` 不加入 streaming，body 结果只经 `finalize_request` 参数传递从不入 map），`expect(has).toBe(false)` 恒真。
  - test 2（SSE streaming）：`cdp_body_results` 从未写入（streaming 分支的 body_result 直接传 `finalize_request`），`:109` 恒真。
  - test 5（loadingFailed）：`finished_before_stream` 从未加入（本路径无 loadingFinished 前置），`:146` 恒真。
  - 行内真正携带清理证据的断言是 test 1/2 的 `cdp_request_meta` 与 `finished_before_stream`（先加后删，可失败）以及 test 5 的 body 保留语义（`:147-148`，先写后查）。行注释「meta/body/streaming/finished 全清空」的表语义略高于实际验证强度。
- 建议：非阻断。可保留（断言作为表后置不变量约束，能防未来回归在已清空路径残留状态）；若追求断言强度，可将行注释措辞调整为「相关 state 无残留」，明确哪些项是「先写后删」的清理验证、哪些是「从未写入」的不变量检查。

## 结论

- 改测方向复核：无（diff 未修改任何既有测试，仅新增 `network_capture_terminal_cleanup.test.ts`）。
- 本轮新发现：1 条（minor）。
- 未进表的提示：
  - AC-002 / AC-003 为结构 AC（ctx 访问、finalize/cleanup 收敛），黑盒行为上不可区分——`NetworkCaptureContext` 持有模块级同一 Map/Set 引用，直接写模块级 map 与经 ctx 写行为完全一致，任何自动测试都无法区分两者；AC-003 收敛结果（各终态 state 清空）由表测试验证，AC-002 依赖 code review + 行为回归。spec 可测试性声明「全部 AC 可自动测试」对这两个结构 AC 略乐观，但不构成实施缺口。
  - loadingFinished 无 meta（deferred/orphan fallback）分支未入表：行为未变（diff 原样保留 `try_resolve_deferred` / `schedule_orphan_check`），该路径语义是「保留 state 供 deferred/orphan 消费」而非「清空」，且既有 `network_stop_deferred_timers.test.ts` / `body_capture_terminal_fallback.test.ts` 覆盖该域。可选扩展。
  - test 4 的 catch 分支错误串 `No resource` 被归类为资源已释放 → `status='not_enabled'`（非 `cdp_failed`）；catch 内 finalize 清理已验证，但 catch 路径下 `cdp_failed` 的 emit 语义未被断言（test 5 的 loadingFailed 已断言 `cdp_failed` 状态保留）。可选扩展。
- 总体判断：AC-001~004 均有自动测试支撑且全绿，危险模式扫描无命中，唯一 minor 不阻断。

### AC 复验方式

- AC-001：`re_verified`。重跑全部 20 个引用 `network_capture` 的既有测试文件（21 文件共 275 tests）+ 新增文件（5 tests）全绿；diff 未触碰任何既有测试。
- AC-002：`re_verified`（结构 AC，以代码审查 + 行为回归佐证）。审查 `handle_cdp_event`（`src/extension/background/network_capture.ts:412-443`）确认仅经 `ctx` 读写状态、无散落模块级 Map/Set 直接访问；结构声明本身无法黑盒区分（见未进表提示）。
- AC-003：`re_verified`。审查 `finalize_request` / `cleanup_streaming_state`（`network_capture.ts:448-462`）为 emit + 清理唯一 API，各 loadingFinished 分支统一调用；终态清空结果由表测试 5 行验证。
- AC-004：`re_verified`。5 行表测试逐一对照实现 terminal path：body=false（`network_capture.ts:649-662`）、SSE streaming（`:665-694`）、getResponseBody then（`:702-742`）、catch（`:743-768`）、loadingFailed（`:772-782`），断言与实现删除/保留语义一致，全部通过。

coverage = 4 / 4（re_verified）

reviewed_scope: c20cdcc3adfe183a

verdict: PASS

## Round 2 (2026-08-13 23:17 UTC+8)

### 前轮 finding 复核

- **t185_test_f001（已消除）**：以 `git diff 6fcebbb93176964ef79f2df6a14de88b3f492aac` 为准，处置为「为各用例注入本路径不真实产生的 state 建立判别力」，逐行核实：
  - test 1（body=false）：`tests/unit/network_capture_terminal_cleanup.test.ts:92-94` 注入 `cdp_body_results` / `streaming_requests` / `finished_before_stream` 后触发 `loadingFinished`；`cleanup_streaming_state` 删 streaming+finished、`finalize_request` 删 meta+body+finished（`network_capture.ts:650-662`），四个断言（`:97-100`）全部变为先写后删的真实清理验证。
  - test 2（SSE）：`:110` 注入 `cdp_body_results`；streaming 由 `responseReceived` 真实加入（`:108` 正向断言），finished 由 `loadingFinished` 顶部真实加入；`finalize_request` 删 body/meta/finished（`:690`），四断言（`:112-115`）均非恒真。
  - test 5（loadingFailed）：`:152` 注入 `finished_before_stream`，由 `loadingFailed` 分支真实删除（`network_capture.ts:778`），`:154` 非恒真；body 保留语义断言（`:155-156`）不受影响。
  - 未引入弱化断言（全部保持精确 `toBe(true/false)` / `toBe('cdp_failed')`），无 `.skip`/`.only`，注入走真实模块级 map（测试导出引用），属 state 播种非 mock 生产逻辑，不触发任何危险模式。
- **复验命令**：`npx vitest run tests/unit/network_capture_terminal_cleanup.test.ts` → 5 passed；`npx tsc --noEmit` → exit 0。
- **新问题**：无。

### 改测方向复核

无（diff 未修改任何既有测试文件；仅新增文件内用例调整，且为增强断言判别力，非迁就实现）。

### 本轮新发现

0 条。

### 未进表的提示

无新增；Round 1 未进表提示（no-meta deferred/orphan 分支、catch 路径 `cdp_failed` emit 语义、AC-002/003 结构不可黑盒区分）仍成立，均不阻断。

### AC 复验方式（Round 2）

- AC-004：`re_verified`。表测试 5 行仍逐一对照实现 terminal path，注入后断言全部携带真实清理证据，重跑 5/5 绿。
- AC-001：`re_verified`。生产实现 diff 与 Round 1 一致（仅测试文件改动），既有接线测试结果沿用 Round 1 全绿记录。
- AC-002 / AC-003：同 Round 1（结构 AC，代码审查 + 行为回归佐证）。

coverage = 4 / 4（re_verified）

reviewed_scope: 0237d02ffddd4ecc

verdict: PASS
