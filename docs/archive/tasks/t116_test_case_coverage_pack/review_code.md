# Task review t116（reviewer_focus: 代码）

- task：`t116_test_case_coverage_pack`
- spec：`docs/tasks/t116_test_case_coverage_pack/spec.md`
- diff_anchor：`b6c03aac4cd6cadcc91a6eaed739147f8941961e`
- target：`git diff b6c03aac4cd6cadcc91a6eaed739147f8941961e`
- round：1
- reviewed_at：2026-08-11 15:21 UTC+8

## Findings

### t116_code_f001 - handle_network_request 测试钩子导出未遵循 `_for_test` 命名约定

- 严重度：minor
- 锚点：spec 上下文区「测试策略」：「AC-013 若需导出 handle_network_request，导出须带 `_for_test` 命名约定」
- 位置：`src/extension/background/service_worker.ts:882`
- 问题：AC-014 为 ws absolute_time 接线断言导出 `handle_network_request`（spec 契约区 AC-014 允许「导出后断言」），但为裸 `export`，未带 `_for_test` 后缀。上下文区该约束的条件「若需导出 handle_network_request」在本 task 已触发（AC-014 场景确实导出），命名约束应适用；同 task 的测试钩子 `src/extension/dashboard/dashboard_detail.ts:728` `_render_dt_list_for_test` 遵循了 `_for_test` 惯例，两处钩子命名不一致。功能正确（`ws_absolute_time_wiring.test.ts` 两用例全绿），无行为缺陷，仅测试钩子在生产 API 面的可识别性不一致。
- 建议：改 `export function handle_network_request_for_test(...)`（同步改 `tests/unit/ws_absolute_time_wiring.test.ts` 的 import），与 `_render_dt_list_for_test` 一致；或维持裸 export 并评估修订上下文区约定。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：1 条（minor）。
- 未进表的提示：
  - 文件过大：无。diff 触及文件均未达阈值（最大新增 `tests/unit/ws_absolute_time_wiring.test.ts` 189 行 < 测试 600 阈值）。
  - 复杂度：无新增高复杂度函数/分支。
  - 范围外观察：无。生产代码改动仅 2 处测试钩子导出（`service_worker.ts:882`、`dashboard_detail.ts:728`），符合 spec 非范围「`src/` 仅允许必要的测试钩子导出」；其余改动全部落在 `tests/unit/`。
- 总体判断：14 条 AC 全部落地且断言与生产实现一致、真实有效；仅 1 条命名惯例 minor，无未解决 critical / important。
- 系统性 follow-up：无。

### AC 复验披露

全部 14 条 AC 均 `re_verified`，证据如下：

- AC-001（NaN/Infinity/250）：重跑 `user_config_persistence.test.ts` 10 用例全绿；对照 `src/shared/user_config.ts:414-418` 校验为 `Number.isInteger` + `>= MIN_POLL_INTERVAL_MS`，NaN/Infinity 非整数走默认值、250 保留，断言与实现一致。
- AC-002（`logs.length === 0`）：`service_worker_exception_sink.test.ts` AC-002 用例绿；对照 `stop_capture` 与异常 sink 写路径，exception 只进 ERROR_EVENTS 不进 console store。
- AC-003（不访问 `errors[0].type`）：断言收敛到 `error_name`，`src/shared/types.ts:410` 声明 `error_name: string | null`，为已声明字段。
- AC-004（beforeEach reset）：`service_worker_exception_sink.test.ts:81-83` 已加 `mock_chrome_debugger.reset()`；reset 仅清监听/调用记录（`tests/support/__mocks__/chrome_debugger.ts:103`），不破坏 install 内方法定义。
- AC-005（重入变体）：`body_capture_external_poll_stop.test.ts` 新用例绿；对照 `body_capture_coordinator.ts` poll 闭包（`poll_stopped` 拦截 in-flight 返回、`finally` 内不再调度），断言「旧闭包 resolve 不写 + 新 poll 单路（共 2 次调用）」与实现一致，时序经 fake timers 精确驱动。
- AC-006（har/17 字符/大写）：`agent_bridge_server.test.ts` AC-002b/c/d 绿；对照 `src/bridge/server.ts` `resolve_auto_output_path` 白名单 `/^[a-zA-Z0-9]{1,16}$/` + `toLowerCase()` 回退 `json`，三个断言均与实现一致，走完整 HTTP 命令链路。
- AC-007（真实 randomUUID 两次不同）：`content_postmessage_nonce.test.ts` 用例绿；jsdom 环境实测 `crypto.randomUUID` 可用（node v24 + jsdom，实测返回 UUID 格式），`generate_nonce` 走 UUID 路径，两次 start 捕获 2 个注入脚本 nonce 不同且旧 nonce 失效、新 nonce 接受。
- AC-008（update_page_nonce 写路径）：`eval` 注入脚本后 `window.__capture_all_network_nonce__` 断言绿；对照 `network_hook.ts:288-298` 注入无 guard 脚本，写路径真实触达。
- AC-009（nonce 非空正向断言）：AC-002httpb 用例绿；`crypto={}` stub 下走 `Math.random` fallback，断言 fallback nonce 非空且带其事件被接受入库。
- AC-010（start_network_hook 恰好一次）：`network_hook_config_gate.test.ts` AC-004 静态断言绿；`content_script.ts` 中 `start_network_hook(` 仅第 124 行调用处匹配（第 9 行 import 无左括号），`split(function start_capture)[1]` 段内恰 1 次。
- AC-011（cleanup↔start 串行）：`cleanup_start_mutex.test.ts` AC-003 绿；`run_exclusive` 串行下 cleanup 挂起 storage.get → start 排队 → resolve 后空存储路径不写键（`service_worker.ts:175-180` 的 set 在 legacy_active 分支内），start 写入的 active 键保留、无 null 键。模块加载期 `setTimeout(cleanup,0)` 的 auto cleanup 在 start 完成后以 phase=capturing 早退，不干扰断言。
- AC-012（详情搜索过滤）：`detail_search_preserve_input.test.ts` AC-002 绿；`dashboard_detail.ts` `filtered_events` 对 dtSearch 值做 `(event_title+event_detail+type).includes(q)` 过滤，计数文案 `（${num(list.length)} 个事件）`，断言「含匹配、不含不匹配、计数 1」与实现一致。
- AC-013（三分句）：`storage_limit_active_delete.test.ts` 三处分句断言绿；delete 被拒后 `get_capture` 从真实 fake-indexeddb 读到记录；`cleanup_stale` 调 `update_capture` 带 `ended_at: new Date().toISOString()`（非空）；`stop_capture('storage_limit')` 写 `capture_stopped` 事件且 `data.reason === 'storage_limit'`（`service_worker.ts:694`）。
- AC-014（ws absolute_time 接线）：`ws_absolute_time_wiring.test.ts` 两用例绿；对照 `service_worker.ts:908-911` 守卫：`start_time_ms>0` 保留不接线（`absolute_time` undefined），无正 `start_time_ms` 时 `absolute_time = started_at + relative_time_ms`，断言与实现逐分支一致。

coverage = 14 / 14

reviewed_scope: 950bfebe1d8cf9bc

verdict: PASS

## Round 2 (2026-08-11 15:27 UTC+8)

### 前轮 finding 复核

- t116_code_f001（handle_network_request 导出未按 `_for_test` 命名约定）：**已消除**。以 diff 为准：`src/extension/background/service_worker.ts:882` 现为 `export { handle_network_request as _handle_network_request_for_test };`（带 p025 / AC-014 / 命名约定注释），裸导出已不存在；`tests/unit/ws_absolute_time_wiring.test.ts:112,159` 两处 import 均改引 `_handle_network_request_for_test`，全仓测试无残留裸名引用。命名与同 task 钩子 `_render_dt_list_for_test`（`dashboard_detail.ts:728`）一致，满足上下文区「AC-013 若需导出 handle_network_request，导出须带 `_for_test` 命名约定」。别名导出置于函数声明前，ESM 声明提升合法，tsc exit 0 证实无类型问题；别名指向同一函数引用，运行时行为零变化。

## 本轮新发现

- 0 条。修复为纯命名变更（导出别名 + 测试 import 改名），未引入新分支、状态或依赖。

## 验证

- `npx vitest run tests/unit/ws_absolute_time_wiring.test.ts`：2/2 绿（AC-014 断言路径未受改名影响）。
- `npx tsc --noEmit`：exit 0。
- 全量 `npx vitest run tests/unit`：128 文件 / 1353 用例全绿，无回归。

## 结论

- 前轮 finding 复核：t116_code_f001 已消除（见上，以 diff 与复跑为准，不采信处置表自述）。
- 本轮新发现：0 条。
- 未进表的提示：无。service_worker.ts 本轮变更仅 +2 行（注释 + 别名导出），未达任何文件阈值；无新增复杂度分支；无范围外改动。
- 总体判断：f001 修复完整且未引入新问题，无未解决 critical / important，PASS。

### AC 复验披露（Round 2）

- 本轮 diff 变更仅触及 AC-014 相关导出改名与 import 更新：AC-014 两用例独立重跑全绿（re_verified）；全量单测 1353 用例回归绿。
- AC-001 ~ AC-013 本轮 diff 无触及，复验结论沿用 Round 1（全部 re_verified，证据见 Round 1 节）。

coverage = 14 / 14

reviewed_scope: 4fa041b3599aaea5

verdict: PASS

## Round 3 (2026-08-11 15:41 UTC+8)

reviewed_scope: d9d84e070ee3ed92

### 收尾文档核对（终审）

Round 2 后实现侧仅新增 skill 收尾文档，无代码/测试改动。以 diff 与文件内容为准逐项核对：

- `docs/specs/test_case_coverage_pack.md`（新增）：14 条 AC（AC-001..AC-014）与 spec 契约区逐字一致，可测试性声明「全部 AC 可自动测试」与契约区一致；「测试钩子约定」`_for_test` 与上下文区「测试策略」一致。AC-014 落档表述给出具体守卫条件（`start_time_ms > 0` 时不被 started_at+relative 覆盖），与实现 `service_worker.ts:908-910` 及 `ws_absolute_time_wiring.test.ts` 断言语义一致，无新语义漂移。
- `docs/specs_index.md` 登记行 `| test_case_coverage_pack | t116 | 2026-08-11 |`：插入位置与相邻行格式、日期排序一致，在表即生效。
- `task.md`：处置表 Round 1 记录 code+test 双路 f001（同一 finding）status=已修、fix_ref 指向 `service_worker.ts:882`，与 round 1/2 报告一致；Round 1/2 verdict 记录、验收「全部满足」、结果摘要与事实相符。
- `docs/findings/d003_vitest_test_isolated_state.md`：来源 t116，结论/证据/影响/现状齐备，符合 findings 格式（指纹排除项，不计入本报告范围）。

### 代码/测试零改动验证（不采信 implementer 自述）

- 指纹反推：用 `check_review_status.current_scope_fingerprint` 同口径复算，当前指纹 `d9d84e070ee3ed92` 与本次 prompt 注入值一致；在排除项中追加 `:(exclude)docs/specs_index.md` 后重算得 `4fa041b3599aaea5`，恰等于 Round 2 报告指纹——严格证明 Round 2 之后已跟踪文件的唯一改动就是 specs_index 收尾登记行，代码/测试零改动。
- diff 全量核对：14 个已跟踪改动文件与 Round 1/2 报告描述逐一吻合（`service_worker.ts` 别名导出 +2 行、`dashboard_detail.ts` `_render_dt_list_for_test` 钩子、11 个测试文件、`ws_absolute_time_wiring.test.ts` 189 行），无 Round 2 后新增代码改动。
- 独立复验：全量 `npx vitest run tests/unit` 128 文件 / 1353 用例全绿；`npx tsc --noEmit` exit 0。

### 前轮 finding 复核

- t116_code_f001：Round 2 已判定消除，本轮代码零改动（指纹证明），维持消除结论。

### 本轮新发现

- 0 条。

### AC 复验披露（Round 3）

- AC-001 ~ AC-014：本轮 diff 无任何代码/测试改动（指纹反推 + diff 核对），复验结论沿 Round 2（全部 `re_verified`，证据见 Round 1/2 节）；本轮另以全量 vitest 1353 用例 + tsc 独立复验零回归。
- 收尾文档（specs 落档 + specs_index 登记）经上述逐项核对与 spec/实现一致。

coverage = 14 / 14

### 结论

- 前轮 finding 复核：t116_code_f001 维持已消除（Round 2 后零改动）。
- 本轮新发现：0 条。
- 未进表的提示：无。收尾仅文档变更，不触及文件过大/复杂度/范围外项。
- 总体判断：收尾文档与 spec/实现一致，Round 2 后代码/测试零改动获指纹与复跑双重确认，无未解决 critical / important，PASS。

verdict: PASS
