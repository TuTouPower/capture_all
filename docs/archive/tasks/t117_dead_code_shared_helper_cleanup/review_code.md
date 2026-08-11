# Task review t117（reviewer_focus: 代码）

- task：`t117_dead_code_shared_helper_cleanup`
- spec：`docs/tasks/t117_dead_code_shared_helper_cleanup/spec.md`
- diff_anchor：`28ae56f5ae23947db17962add84e81145c2c6269`
- target：`git diff 28ae56f5ae23947db17962add84e81145c2c6269`
- round：1
- reviewed_at：2026-08-11 16:10 UTC+8

## Findings

### t117_code_f001 - `cdp_primary_emitted` fixture 残留未删净，AC-001 grep 验证不通过

- 严重度：important
- 锚点：AC-001（全仓无 `cdp_primary_emitted` 引用残留，production、context、测试 fixture 均删除；可测试性声明以「grep 无残留」为验证方式）
- 位置：`tests/unit/cdp_state_cleanup.test.ts:47`（及 `:46` 的 `@ts-expect-error`、`:93-95` 断言）
- 问题：AC-001 要求全仓无引用残留且「测试 fixture 均删除」，可测试性声明明确以 grep 为验收手段。实施删除了 production（`network_capture.ts` 模块级 Set、`network_context.ts` context 字段）与两个 CDP fixture（`cdp_request_key_session_isolation.test.ts` / `cdp_response_body_config.test.ts` 的 `make_state`），但漏删第三个 CDP 测试 fixture：`cdp_state_cleanup.test.ts:47` 的 `make_state` 仍含 `cdp_primary_emitted: undefined` 占位属性（带 `@ts-expect-error - 已删除字段，验证不存在`），`:93-95` 断言 `expect((state as any).cdp_primary_emitted).toBeUndefined()` 仍引用该标识符。`grep -r cdp_primary_emitted tests/` 仍命中 2 处，与 AC-001「grep 无残留」的验收方式直接冲突。
  - 附带问题：`:47` 显式写 `undefined` 使 `:95` 断言恒真（无论字段是否存在于类型，都通过），无法真正验证「字段已从 CdpHandlerState 删除」——占位删除后该断言才具备实际验证语义。
- 建议：删除 `tests/unit/cdp_state_cleanup.test.ts:46-47`（`@ts-expect-error` 与其上的 `cdp_primary_emitted: undefined` 占位）。`:93-95` 的守护断言可保留——删占位后 `(state as any).cdp_primary_emitted` 访问不存在属性仍返回 undefined，断言继续通过且语义变真；若实施方认定该守护断言属 t023 验证机制、不算「残留」，可在 spec 上下文区澄清 grep 验证范围，但推荐直接删占位（2 行、零风险）。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：1 条。
- 未进表的提示：
  - 文件过大：无。改动文件均小（新增 `content_nonce.ts` 12 行），无超阈值。
  - 复杂度：无。`content_nonce.ts` 单函数近似 CC 3，无分支堆积。
  - 范围外观察：`webrequest_handler.ts:234` / `network_capture.ts:969` 的 `crypto.randomUUID()` 与 `shared/event_utils.ts:16` 的 `evt_` id 生成是 request_id / event_id，语义不同于 nonce，不在本 task 范围；`dashboard_detail.ts` 无其他内联实体转义残留。均非缺陷。
- AC 复验方式：
  - AC-001：`re_verified`。全仓 grep `cdp_primary_emitted`（排除 docs/archive、docs/reviews 历史）production/context 零匹配；两个 CDP fixture 已删；但 `tests/unit/cdp_state_cleanup.test.ts` 仍 2 处命中（见 f001）。全仓 `vitest run` 128 文件 1354 tests 全绿。
  - AC-002：`re_verified`。`generate_nonce` 唯一实现在 `src/extension/content/content_nonce.ts:3`，network_hook/storage_capture/websocket_capture 三通道均 `import { generate_nonce } from './content_nonce'` 且调用点语义不变（`_nonce_override ?? generate_nonce()`）；实现与旧三份 verbatim 一致（`crypto.randomUUID` + Math.random fallback）。nonce 相关测试（content_postmessage_nonce 10、dom_network_hook_event_id 2、storage_capture 5、websocket_capture 12+8+4）全绿。
  - AC-003：`re_verified`。`esc` = `escape_html`（`src/shared/escape.ts:13`）转义 `& < > " '` 五字符，`dashboard_detail.ts:128` value 改用 `esc(...)`；新增测试 `detail_search_preserve_input.test.ts` AC-003 case 断言 `>`/`'` 向量与 esc 输出一致；`tsc --noEmit` exit 0。
  - coverage = 3 / 3
- 总体判断：实现主体正确（死 Set 三处 + 两个 fixture 已删、nonce 三通道收敛 verbatim、detail 转义统一 esc），全仓测试与类型检查全绿；唯一 blocker 是 AC-001 的第三个测试 fixture 残留漏删，grep 验收不通过。
- 系统性 follow-up：无。

verdict: FAIL

reviewed_scope: a378b274bf3f091a

## Round 2 (2026-08-11 16:20 UTC+8)

- round：2（追加，不覆盖 Round 1）
- target：`git diff 28ae56f5ae23947db17962add84e81145c2c6269`（相对工作区，HEAD 即 anchor，diff 即本轮全部改动）

## Findings

本轮 0 条新 finding。

## 结论

- 前轮 finding 复核：
  - `t117_code_f001`（important）— **已消除**。diff 确认 `tests/unit/cdp_state_cleanup.test.ts` 删除 `:46-47` 两行（`@ts-expect-error - 已删除字段，验证不存在` 与 `cdp_primary_emitted: undefined` 占位）；负向断言保留（现 `:91-94`：`it('cdp_primary_emitted 字段已从 CdpHandlerState 删除')` + `expect((state as any).cdp_primary_emitted).toBeUndefined()`）。`make_state`（现 `:43-55`）已无该属性，断言访问不存在属性返回 undefined，语义变真（由「fixture 显式写 undefined 导致恒真」变为「字段不存在导致的真实守护」）。grep 复核：`src/` 全目录零命中；`tests/` 仅剩上述负向断言 2 处（t023 验证机制，非 fixture 残留，符合 AC-001「production、context、测试 fixture 均删除」）；`docs/` 下命中均为历史文档与 task 自身记录。
- 本轮新发现：0 条。
- 未进表的提示：
  - 文件过大：无。diff 净删 15 行、新增 `content_nonce.ts` 12 行，无文件超阈值。
  - 复杂度：无。共享 helper 自旧三份 verbatim 平移，未新增分支。
  - 范围外观察：`cdp_handler.ts:425` / `network_capture.ts:647` 的 `logger.debug` 字符串由 `'cdp_primary_emitted'` 改名 `'cdp_primary_event_emitted'`——调试日志文本变化，无测试断言该字符串，不影响采集行为与事件数据，符合非范围约束（Round 1 test reviewer 已确认同点）。
- AC 复验方式：
  - AC-001：`re_verified`。grep 全仓（排除 docs 历史文本）`src/` 零命中、`tests/` 仅剩负向守护断言；`network_capture.ts` 模块级 Set 与 3 处 `.add()`、`network_context.ts` 字段与 `clear()`、三个 CDP 测试 fixture（`cdp_request_key_session_isolation.test.ts` / `cdp_response_body_config.test.ts` / `cdp_state_cleanup.test.ts`）全部删除。全仓 `vitest run` 128 文件 1354 tests 全绿（本轮重跑）。
  - AC-002：`re_verified`。`generate_nonce` 唯一实现在 `src/extension/content/content_nonce.ts:3`；三通道（`network_hook.ts:10`、`storage_capture.ts:4`、`websocket_capture.ts:4`）均 `import { generate_nonce } from './content_nonce'`，调用点 `_nonce_override ?? generate_nonce()`（`:316` / `:102` / `:160`）语义不变；共享实现与旧三份 verbatim 一致（`crypto.randomUUID` + Math.random fallback）；`_set_nonce_for_test` 导出保留且测试仍引用（无 dead code 引入）。nonce 相关测试全绿。
  - AC-003：`re_verified`。`esc` = `escape_html`（`src/shared/escape.ts:13`）转义 `& < > " '` 五字符（`'`→`&#39;`）；`dashboard_detail.ts:128` value 由内联 replace 链改 `esc(...)`（esc 早已在 `:3` import）；新增测试 `detail_search_preserve_input.test.ts` AC-003 case 断言 `value="a&gt;b&#39;c"` 与 esc 输出一致，两个 `not.toContain` 负向断言为有效断言（若退回旧内联链则 `toContain` 失败），非恒真。相关 4 文件 13 tests 全绿。
  - coverage = 3 / 3
- 总体判断：f001 修复彻底（占位删、断言保留且语义变真、grep 与全量测试均复验通过），本轮无新增 blocking 或 minor finding，AC-001/002/003 全部复验通过。
- 系统性 follow-up：无。

verdict: PASS

reviewed_scope: 4d04575aa0cfda5b
