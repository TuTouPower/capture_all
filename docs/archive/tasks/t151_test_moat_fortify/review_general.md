# Task review t151（reviewer_focus: 通用）

- task：`t151_test_moat_fortify`
- spec：`docs/tasks/t151_test_moat_fortify/spec.md`
- diff_anchor：`1d66fe3be865d424166a1975eb805f3c4feeac40`
- target：`git diff 1d66fe3be865d424166a1975eb805f3c4feeac40`
- round：1
- reviewed_at：2026-08-13 01:30 UTC+8

## Findings

### t151_gen_f001 - AC-005「64MiB 预算路径」由既有 t140 覆盖而非新直接单测，AC 措辞与实现位置不符

- 严重度：minor
- 锚点：AC-005 条款「补直接单测（结构化错误码、分页、64MiB 预算路径）」
- 位置：`docs/tasks/t151_test_moat_fortify/task.md`（AC-005 条目）、`src/extension/background/agent_bridge_client.ts:323-333`、`tests/unit/t140_resource_budget.test.ts:93-138`
- 问题：AC-005 字面要求 dispatcher/queries「补直接单测」且括号内含 64MiB 预算路径。本次新增的 dispatcher/queries 直接单测覆盖了结构化错误码（SOURCE_NOT_FOUND / RECORD_NOT_FOUND / EXPORT_FAILED / INVALID_QUERY）与分页边界（offset 越界 / limit=0 / 跨页 5000 续取），但 64MiB 预算路径未在 dispatcher/queries 侧补直接单测，而是引用既有 `t140_resource_budget.test.ts`（bridge client `send_result` → `PAYLOAD_TOO_LARGE`）。查证预算强制逻辑位于 `agent_bridge_client.ts`（扩展结果体积边界），不在 dispatcher/queries 内——dispatcher 侧 `load_agent_capture_data` 无体积上限，追加直接单测只能在 mock 边界测不存在于该模块的逻辑，属冗余。实现选择合理，但 AC 把「64MiB 预算路径」列在 dispatcher/queries 直接单测下，与实现归属不符（spec 过时）。
- 建议：改 spec——将 AC-005 措辞改为「补 dispatcher/queries 直接单测（结构化错误码、分页边界）；64MiB 预算路径由既有 t140 bridge client 覆盖」，不要求新增冗余单测。不计 FAIL。

### t151_gen_f002 - XSS 测试本地参照 esc() 与生产 escape_html 语义重复，存在正向断言漂移风险

- 严重度：minor
- 锚点：AC-001（判别力不受影响，属维护性观察）
- 位置：`tests/unit/dashboard_detail_xss_escape.test.ts:30-33`（本地 `esc()`）、`src/shared/escape.ts:38-40`（`escape_html`）
- 问题：测试文件的 `esc()` 参照函数与 `escape_html` 逐字符同语义复制。判别力由 `.not.toContain(v)` 主断言保证（任一转义被移除即红），不受参照影响；但 `.toContain(esc(v))` 正向断言依赖本地参照。若日后 `escape_html` 转义集合变更（如新增 `/` 转义），本地参照未同步时，正向断言可能出现误报（输出实际安全仍红）。属 drift 维护成本，非覆盖缺口（安全方向判据独立成立）。
- 建议：正向形态断言直接 `import { escape_html }`（判别力不减，消除双份实现漂移）；或保留本地参照并注释「变更 escape_html 时须同步」。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（首轮）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - XSS 测试覆盖字段取决于 fixture 填充的字段（`render_net_inspector` 的 `cache_status` / `response_body_status` 未 esc，为 task.md 已记录的内部枚举已知缺口，AC 范围外，未强行断言）。
  - 被删 `popup_start_timing.test.ts` / `popup_immediate_refresh.test.ts` 经 base 版本复核：start_timing 第一例从未触发 start（`storage_set_mock` 调用数 0 恒真）、第二例源码字符串；immediate_refresh 两例直接模拟 mock 自身、一例源码字符串——确属 vacuous/表层，删除合理，语义已由 `popup_behavior_paths` 行为级覆盖。
  - `popup_behavior_paths.test.ts` 依赖真实 timer（`await_ticks`）；`start_timer` 的 setInterval 由各用例 DOMContentLoaded 重入时的 `stop_timer()` 与 stop 路径自动清理，未观察到跨用例干扰。
  - 四个新测试钩子 `_render_*_for_test` 与 base 中既有 `_render_dt_list_for_test`（`dashboard_detail.ts:772`）同模式——薄包装直调真实渲染函数，符合项目惯例。

### AC 复验方式

- AC-001：`re_verified` — 独立重跑 `dashboard_detail_xss_escape.test.ts`（5 函数 × 3 向量，15 断言全绿）；读 `dashboard_detail.ts` 渲染函数确认各目标字段均经 `esc()`。判别力：`.not.toContain(v)`（移除转义即红）+ `.toContain(esc(v))`（字段须被渲染，非恒真）。
- AC-002：`re_verified` — `detail_render_consistency.test.ts` 已删 `tab_expectations` 自证自数组，改 jsdom 调真实 `render_detail` / `_render_dt_list_for_test`，断言 7 类 `.dt-metric` 计数与 stats 一致、`.ev-type` 七类行标签覆盖；重跑全绿。
- AC-003：`re_verified` — `detail_layout_source` 4 例改行为（rail 手柄在 rail 内、dt-network-body 布局、选中行 data-sel + 检查器联动、检查器可关闭），`settings_ui` BUG-008 2 例改行为（logSize readonly input、wire 后 `.value==='5.0 MB'` 且 textContent 不含）；`network_hook_config_gate` 标注「结构契约」且交叉引用文件存在并真实覆盖所引行为（hook 未 start 不转发 / start 转发 / body 开关 / URL 脱敏）；重跑全绿。
- AC-004：`re_verified` — `popup_behavior_paths.test.ts` 真实 import popup.ts + 真实 click 触发 + 真实 render 状态断言（is-rec class / startBtn↔stopBtn↔exportBtn / storage 写入含 `_popup_self_write` / 外部 onChanged 同步 / 导出失败 alert 无下载 / start 失败不写 is_capturing / 打开即轮询 get_status 计数 '9'）；重跑全绿。
- AC-005：`re_verified` — `agent_command_dispatcher.test.ts` +6 例走真实 `dispatch_agent_command` 校验与 `to_agent_error` 映射（structured codes 经 `is_agent_error_code` 透传、config 非法值、负/超上限 limit）；`agent_data_queries.test.ts` +3 例走真实 `list_entries_from_capture_data` / `get_timeline_from_capture_data` / `load_agent_capture_data` 分页续取（offset 越界空、limit=0 空、切片、跨页 5000+1 不丢不重、无效 source）；64MiB 预算路径经既有 t140（`PAYLOAD_TOO_LARGE`）复核覆盖；重跑全绿。
- AC-006：`re_verified` — 独立重跑 `npm test`：142 files / 1487 tests 全绿（与 task.md 声称一致）；`npx tsc --noEmit` exit 0。

coverage = 6 / 6

- 系统性 follow-up：无（建议改 spec 的措辞澄清随 f001 处置表落地即可，不新建 task）

verdict: PASS

reviewed_scope: 7901451d128ccea4

## Round 2 (2026-08-13 01:30 UTC+8)

### 前轮 finding 复核（以 diff/代码核实，不采信自述）

- **t151_gen_f001（spec 过时）已消除**：`git diff 1d66fe3b -- docs/tasks/t151_test_moat_fortify/spec.md` 确认 AC-005 已改写为「agent_command_dispatcher/agent_data_queries 补直接单测（结构化错误码、分页；64MiB 预算路径由 t140 agent_bridge_client PAYLOAD_TOO_LARGE 测试覆盖，非本 task 范围）」。措辞与实现归属一致，AC 与产出对齐。
- **t151_gen_f002（esc 参照漂移风险）已消除**：`tests/unit/dashboard_detail_xss_escape.test.ts:9` 现为 `import { escape_html as esc } from '../../src/shared/escape'`，本地重复的 `function esc()` 参照已删除。正向形态断言 `.toContain(esc(v))` 与生产转义同源，漂移风险移除；判别力未减——`.not.toContain(v)` 主断言独立于 esc 参照，且正向断言仍能判别「渲染是否使用了共享 escape_html 形态」（若改用其他转义函数则形态不符而红）。重跑 `dashboard_detail_xss_escape.test.ts`：5/5 绿。

### 本轮新发现

0 条（本轮 diff 仅 spec.md AC-005 措辞澄清 + XSS 测试 esc 参照换生产 import，两处均无新风险）。

- 未进表的提示：无

### AC 复验补充（本轮变更涉及项）

- AC-001：`re_verified` — 复核 XSS 测试当前版本（生产 escape_html 同源 + 15 断言），独立重跑 5/5 绿。
- AC-005：`re_verified` — 复核 spec.md AC-005 措辞与实现归属一致（64MiB 由 t140 bridge client 覆盖，非本 task 范围）。

coverage = 6 / 6（AC-002/003/004/006 本轮未变，沿用 Round 1 复验结论）

- 系统性 follow-up：无

verdict: PASS

reviewed_scope: b5e221693a4a94e6
