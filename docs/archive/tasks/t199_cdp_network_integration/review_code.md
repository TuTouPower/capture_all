# Task review t199（reviewer_focus: 代码）

- task：`t199_cdp_network_integration`
- spec：`docs/tasks/t199_cdp_network_integration/spec.md`
- diff_anchor：`a71525cb14ab623b07bb3da5e7720057e4c37bd8`
- target：`git diff a71525cb14ab623b07bb3da5e7720057e4c37bd8`
- round：1
- reviewed_at：2026-08-14 05:27 UTC+8

reviewed_scope: bf89180dc7a7fa38

## Findings

### t199_code_f001 - AC-001 括注「含 evicted 终态」与实现/测试可观察行为不一致（spec 措辞处置）

- 严重度：minor
- 锚点：AC-001（行为差异描述）——AC-001 要求「body_bytes 累加与超限淘汰闭环正确（含 evicted 终态）」，但本 task 新增用例未断言任何可观察的 evicted 终态；body 预算淘汰路径本身也不产生该状态。
- 位置：`tests/unit/cdp_body_budget_accounting.test.ts:299`（t199 AC-001 用例）；`src/bridge/cdp_handler.ts:142`（`enforce_body_budget` 对 victim 直接 `splice` 删除，无终态标记）
- 问题：t199 用例只验证了 r1/r2 被淘汰（`session.events` 仅剩 r3）、`body_bytes` 账本 200→0、幸存事件完整返回。而 AC-001 括注「含 evicted 终态」指代的 `response_body_status: 'evicted'` 状态只在事件数淘汰路径产生（`push_bounded`，`cdp_handler.ts:107-110`），body 预算淘汰路径中 victim 被整体 splice 删除，不存在可观察的 evicted 终态，本用例也无法断言它。该状态实际由同文件既有 AC-005/AC-005b 用例覆盖。
- 建议：处置为改 spec（不计 FAIL）：将 AC-001 括注改为描述可观察的淘汰结果（如「超限淘汰最旧带 body 事件、账本归零」），或注明 evicted 终态由既有 AC-005 系列覆盖。测试本身无需改动——核心闭环（回写累加、淘汰、账本归零、幸存事件返回）已被真实 MockWebSocket + getResponseBody 回写路径验证。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：1 条（t199_code_f001，minor）
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` = 1400 行（≥800 important 阈值；本 task 仅净增 2 行导出钩子，未继续堆大，属既有大文件；diff 未提供不可拆约束，仅提示）。
  - 复杂度：diff 未新增任何生产分支函数；测试函数无高圈复杂度，无 finding。
  - 范围外观察：新增测试文件未调用 `vi.resetModules()`（与 `storage_limit_restart.test.ts` 不同，但与 `ws_absolute_time_wiring.test.ts` 模式一致；当前 4 用例连跑通过，模块缓存行为无害——首测注册的 onMessage 监听闭包在调用时解析全局 chrome）。测试 payload 用 `as never` 绕过类型检查（`cdp_network_redaction_integration.test.ts:132,170,226,279`），为代码库既有模式，production 路径对 `undefined request_headers` 容错，不构成缺陷。建议归入 t200 测试隔离。
- 总体判断：实现为纯测试补全 + 2 行 `_for_test` 导出钩子，无生产行为变更、无范围外改动、无安全/性能/类型风险；4 条 AC 均被真实生产链路测试触达且全绿（204 文件 / 1921 用例无回归）。仅 1 条 minor（spec 措辞处置），可 PASS。
- 系统性 follow-up：t200「测试隔离与契约确认」（backlog）——SW 集成测试的模块缓存/`vi.resetModules` 隔离一致性可在该 task 收口。
- AC 复验方式：
  - AC-001：`re_verified` —— 重跑 `npx vitest run tests/unit/cdp_body_budget_accounting.test.ts`，t199 AC-001 用例通过；断言（events=['r3']、body_bytes=200→0、幸存事件完整返回）与 `cdp_handler.ts` 回写累加（:512）与 `enforce_body_budget` 淘汰（:125-147）行为逐点核对一致。
  - AC-002：`re_verified` —— 重跑 `cdp_network_redaction_integration.test.ts` 两用例通过；错误路径用例以 `vi.spyOn(check_storage_limit).mockRejectedValue` 触发 `handle_network_request` reject，断言 `limit_spy` 被调 + 日志含 'handle_cdp_body_event failed'，与 production `.catch`（`service_worker.ts:989-991`）对应；正常路径断言落库 `capture_method='extension_cdp'` 与 `build_cdp_only_request`（`network_correlator.ts:103-136`）一致。
  - AC-003：`re_verified` —— 重跑两用例通过；断言 request/response body 脱敏值与 `redact_body`/`redact_json` 敏感 key 逻辑（`body_redaction.ts:21-30,57-79`）一致；redact_data=false 对照用例通过。
  - AC-004：`re_verified` —— 全量 `npx vitest run`：204 文件 / 1921 用例全部通过，既有 CDP/网络测试无回归。
  - coverage = 4 / 4

verdict: PASS

## Round 2 (2026-08-14 05:32 UTC+8)

reviewed_scope: ec87337184e0e843

### 前轮 finding 复核

- t199_code_f001（minor，spec 措辞处置）：**已消除**。diff 证实 spec.md AC-001 括注改为「body 预算淘汰直接 splice 删除，无 evicted 终态；evicted 终态属事件数淘汰路径，由 t157 AC-005 覆盖」+ 上下文区新增来源说明行。措辞与实现逐点核对一致：
  - `src/bridge/cdp_handler.ts:142` `enforce_body_budget` 对 victim `splice(idx, 1)` 直接删除，无 evicted 终态标记；
  - `src/bridge/cdp_handler.ts:107-110` `push_bounded` 事件数淘汰 pending 时置 `response_body_status='evicted'` 进 evicted_events——evicted 终态确实只存在于事件数淘汰路径；
  - 归档 t157 spec AC-005（`docs/archive/tasks/t157_fix_cdp_body_budget_accounting/spec.md:40`）「事件数上限淘汰 pending 时，产生可观察终态事件」正是该覆盖；上下文区所引 AC-005b 为 t157 f005 回归测试名（`tests/unit/cdp_body_budget_accounting.test.ts:237`），t157 handoff.json 的 AC-005 evidence 引用，引用成立。
  - 处置符合共享规则「实现合理但与 spec 描述不符（spec 过时）→ 处置为改 spec，不计 FAIL」。契约区 drift（AC-001 措辞）系 review 流程确认的处置变更，行为要求（body_bytes 累加与超限淘汰闭环）未变，非未经确认的需求变更，不构成 blocking。

### 本轮新发现

- 0 条。自上一轮以来生产代码（service_worker.ts +2 行导出）与两个测试文件零变化（mtime 05:17-05:23，第 1 轮 review 于 05:27 完成），新 diff 仅 spec.md（AC-001 措辞 + 上下文区说明）与 task.md（处置表）——纯流程文件，无新代码面。

### 未进表的提示

- 文件过大：`src/extension/background/service_worker.ts` = 1400 行（≥800 important 阈值；本 task 净增 2 行导出，未继续堆大）——第 1 轮已提示，本轮无变化。
- 复杂度：diff 未新增任何生产分支函数。
- 范围外观察：新测试文件未调用 `vi.resetModules()`、payload 用 `as never`（第 1 轮已建议归入 t200 测试隔离），本轮无变化。

### AC 复验方式

- AC-001：`re_verified` —— 重跑 `npx vitest run tests/unit/cdp_body_budget_accounting.test.ts`：8 用例全绿（含 t199 AC-001 用例，断言 events=['r3']、body_bytes=200→0、幸存事件完整返回）；新 spec 措辞与 `cdp_handler.ts:142` splice 行为一致。
- AC-002：`re_verified` —— 重跑 `tests/unit/cdp_network_redaction_integration.test.ts`：4 用例全绿；.catch 位点用例以 `check_storage_limit` mockRejectedValue 触发 reject，断言 limit_spy 被调 + 日志含 'handle_cdp_body_event failed'，错误路径不抛未捕获异常。
- AC-003：`re_verified` —— 同上文件 redact 两用例通过，脱敏断言（[REDACTED]、敏感值不出现、非敏感键 alice 保留）与 `body_redaction.ts` 逻辑一致。
- AC-004：`re_verified` —— 全量 `npx vitest run`：204 文件 / 1921 用例全部通过，既有 CDP/网络测试无回归。
- coverage = 4 / 4

### 总体判断

spec 修改恰当（措辞与实现行为逐点一致，改 spec 不计 FAIL），前轮唯一 minor 已消除；生产代码与测试自第 1 轮零变化，全量回归 204/1921 全绿。无未解决 critical / important，PASS。

verdict: PASS
