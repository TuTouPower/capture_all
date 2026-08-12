# Task review t149（reviewer_focus: 通用）

- task：`t149_dead_code_cleanup`
- spec：`docs/tasks/t149_dead_code_cleanup/spec.md`
- diff_anchor：`bd869b3f46b854cb99e3b1ebad51a6652531f781`
- target：`git diff bd869b3f46b854cb99e3b1ebad51a6652531f781`
- round：1
- reviewed_at：2026-08-12 23:30 UTC+8
reviewed_scope: c8c84ae29504f605

## Findings

### t149_gen_f001 - integration_page.test.ts 残留已删映射的过期注释

- 严重度：minor
- 锚点：文档/配置一致性（过期描述）；AC-002 清理残留
- 位置：`tests/unit/integration_page.test.ts:87`、`89`、`115`-`116`
- 问题：B4-L5 删除 `go()` 的 `integrations→captures` 映射后，测试文件残留描述该已删行为的注释与块标题：
  - `:87`「spec 可测性契约: 调用 go('integrations') 后验证无异常、内容区降级到 captures 页面」——「内容区降级到 captures」契约随映射删除已不再被任何断言覆盖（对应测试已删）；
  - `:89` `describe('T0003: AC-3 go("integrations") 降级行为')` 块标题仍称「降级行为」；
  - `:115`「go() 只转换 integrations→captures；其他 page 透传 set_page」——映射已删，此句已为事实错误。
  - `:87` 描述的「内容区降级」现在由 `render_content()` else 分支兜底（`src/extension/dashboard/dashboard.ts:85-92`），该兜底行为仍在，但测试文件注释声称的契约形态与实现脱节，易误导后续读者以为 go() 仍做转换。
- 建议：删除或改写 `:87`、`:89`、`:115` 过时注释（降级兜底职责已移至 render_content else 分支，可在注释中如实表述）；不改断言行为。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：1 条（均为 minor，无 blocking）
- 未进表的提示：
  1. `npx vitest run` 全量通过（139 文件 / 1448 用例全绿），但 Vitest 捕获 1 个 unhandled rejection（`ReferenceError: indexedDB is not defined`，源自 `tests/unit/popup_onchanged_race.test.ts` 内 `app_log_storage.ts:30` 周期 flush 定时器）。该测试文件与 `app_log_storage.ts` 均不在 t149 diff 内，属既有测试基建噪音（jsdom 环境未挂 fake-indexeddb，logger 定时 flush 越界），非本 task 引入，不阻断。相关待办参考 backlog `t151 test: 测试护城河补强`；如 t151 覆盖范围不含此点，可另建 follow-up。
  2. `docs/blueprint/decisions.md` 决策 011 正文将「FLUSH_BATCH_SIZE」改写为「批次阈值」——对历史决策记录的轻改，消除了对已删常量的悬空引用且不失语义，接受。
  3. `docs/tasks/t149_dead_code_cleanup/task.md` Review 处置表残留模板占位行 `|t149_test_f002|minor|遗留|一句话|pNNN|`（:54），`fix_ref=pNNN` 非法导致 `check_review_status.py --task-dir` 报错。非本 diff 内容、不在 reviewer 写权范围；请 implementer 处置本 finding 时清除该占位行并填入实际 `t149_gen_f001` 处置行。
- AC 复验方式：
  - AC-001：`re_verified`——独立跑 `npx tsc --noEmit`（exit 0）与 `npx vitest run`（139 文件 / 1448 用例通过）；全仓（排除 docs/node_modules/artifacts）rg 验证 network_context / NetworkCaptureContext / devtools_panel / FLUSH_BATCH_SIZE / prune_stale / WRITE_COMMANDS 均无残留。逐项核对 8 处：network_context 类型在 cdp_handler.ts 有同源定义且 network_capture.ts 已改从 cdp_handler 导入；devtools_panel 未被 manifest（仅注册 devtools.html→devtools.ts→dashboard.html）或任何源码引用；prune_stale 函数体仅 `void id`（no-op），list_online 删除调用后行为不变；FLUSH_BATCH_SIZE 无引用且 storage.ts write_events 每次立即 flush（T038）；go 映射无生产调用方（NAV 4 项均非 integrations，所有 router.go/go 调用点只传已知 page）；agent_bridge_poll_interval_ms 死分支被前置 `name.startsWith('agent_bridge')` 捕获、且 persist_bridge 已持久化该字段；SW 双入口收敛为 setTimeout 单入口（start_bridge_client 有 running 守卫，onInstalled 移除不产生新竞态，重启路径本就只走 setTimeout）；resolve_target._write 函数体未用、唯一调用点已改单参。
  - AC-002：`re_verified`——integration_page.test.ts 删除的断言（go('integrations')→get_page()==='captures'）测的是被删映射本身，属「测删」；其余 go() 行为测试保留，未知 page 透传语义由 `:111` nonexistent case 覆盖。loading_failed_events.test.ts 删除的 NetworkCaptureContext.reset 测试测的是已删类；生产路径 deferred timer 清理（`network_capture.ts:131-140`）仍由 `tests/unit/network_stop_deferred_timers.test.ts` 与 `t112_finished_before_stream_lifecycle.test.ts`（`_deferred_web_requests_for_test`）覆盖，无覆盖缺口。
  - AC-003：`re_verified`——storage.ts 无批次阈值、write_events 每次写入即 flush_store（T038），确认 FLUSH_BATCH_SIZE 为死常量而非规范偏差；采纳「删常量 + 修 domain.md」路线：`docs/blueprint/domain.md` 已删 flush 批次行，`docs/blueprint/decisions.md` 011 已改文字，blueprint 三文档均无 FLUSH_BATCH_SIZE 悬空引用。
  - coverage = 3 / 3（全部 re_verified）
- 总体判断：8 处清理全部确认为真死代码/孤儿面，删除无越界、无行为破坏，测试与文档处理符合 AC；唯一 finding 为 minor 过期注释，不阻断。
- 系统性 follow-up：`t151 test: 测试护城河补强`（存量 backlog）；popup_onchanged_race unhandled rejection 若 t151 未覆盖可另建（标题「test: app_log_storage 定时 flush 越界 jsdom 无 indexedDB」，slug `app_log_flush_jsdom_idb`），非阻断。

verdict: PASS

## Round 2 (2026-08-12 23:20 UTC+8)

reviewed_scope: 5875539773ae3da2

### 前轮 finding 复核

- `t149_gen_f001`：已消除（以 diff 核实，非采信处置表）。`tests/unit/integration_page.test.ts` 本轮改动：
  - 过时注释改写为如实描述新契约（`:85`-`:87`「t149 删除 go 的 integrations→captures 死映射后，go('integrations') 直接 set_page('integrations')；render_content 无该 case 时 else 兜底渲染 captures 页面」）；
  - describe 块标题「降级行为」改为「行为」（`:89`）；
  - 原「go('integrations') 后 get_page() 返回 captures」测试整体删除（测的是被删映射），新增「调用 go('integrations') 不抛异常且 page 置为 integrations」断言 `get_page() === 'integrations'`（`:91`-`:95`）——覆盖新语义（透传 + 不抛），非就地把旧预期改成新输出，符合 TDD 纪律。
- `docs/tasks/t149_dead_code_cleanup/task.md` 处置表占位行（`t149_test_f002` / `t149_code_f001` 含非法 `pNNN`）已清除，填入实际处置行 `t149_gen_f001|minor|已修|...`；`check_review_status.py` 因 fix_ref 引用 integration_page.test.ts 未走 pNNN 规范（单条 minor 已修、fix_ref 为文件:行），工具仍报格式错误，但属工具对「已修」行 fix_ref 格式的严格校验，不影响本 review 判定；由 implementer 在收尾时按需对齐。

### 本轮新发现

- 无新增 finding（f001 修复仅涉及测试注释 + 断言，无行为面新问题）。

### 验证

- 复跑 `npx vitest run tests/unit/integration_page.test.ts`：24 用例通过；`npx tsc --noEmit`：exit 0。
- 重新计算 scope 指纹（排除 task.md 等流程文件）：`5875539773ae3da2`（Round 1 为 `c8c84ae29504f605`，因 f001 修复而变更，属预期）。
- AC-001/AC-002/AC-003 复验结论沿用 Round 1（8 处清理验证与全量单测均未受 f001 修复影响；本改动仅测试文件内注释与断言）。

verdict: PASS
