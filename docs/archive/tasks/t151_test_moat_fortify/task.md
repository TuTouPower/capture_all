---
tid: "t151"
slug: "test_moat_fortify"
title: "test: 测试护城河补强（行为覆盖/去自证自）"
status: "done"
branch: "t151_test_moat_fortify"
worktree: ""
review_level: "single"
diff_anchor: "1d66fe3be865d424166a1975eb805f3c4feeac40"
depends_on: ""
conflicts_with: ""
note: "intensive-review 聚合：B4-M9 XSS 转义无测试、B4-M10 自证自、B4-M11 源码字符串、B5-M3 popup 表层、B3 表层断言、B2 dispatcher/queries 无单测"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- **AC-001 XSS 转义参数化**：`dashboard_detail.ts` 新增 4 个渲染测试钩子（`_render_net_inspector_for_test` / `_render_con_table_for_test` / `_render_simple_events_for_test` / `_render_dt_inspector_for_test`，与既有 `_render_dt_list_for_test` 同模式）。新建 `dashboard_detail_xss_escape.test.ts`，5 个渲染函数 × 3 个向量（`<img onerror>` / `</script>` / 引号）参数化断言「原始向量不出现 + esc 形态出现」。目标字段（事件标题/详情/来源/url/method/headers/body/status_text/level/message）均已转义，首跑即绿（无生产 bug 需修）；render_net_inspector 的 `cache_status` / `response_body_status` 为未转义内部枚举（L1 已知 + 同型缺口），不在本 task 范围，报告记录不强行改。
- **AC-002 真实渲染**：`detail_render_consistency.test.ts` 删除自证自的 `tab_expectations` 数组，改为 jsdom 调 `render_detail` 断言 7 类指标标签出现且计数与 stats 一致，调 `_render_dt_list_for_test` 断言 7 类事件行标签覆盖。
- **AC-003 源码字符串改行为**：`detail_layout_source.test.ts` 4 例源码 `toContain` 改行为（调 `render_dt_rail` / `render_detail` 断言 rail 手柄在 rail 内、network-body 布局、选中行 data-sel、检查器可关闭）；CSS 类名锚点保留为「结构契约」。`settings_ui.test.ts` BUG-008 两例源码正则改行为（`render_settings` 断言 `#logSize` 为 readonly input；调 `wire_settings` + mock `get_app_log_size` 断言 `logSize.value === '5.0 MB'` 非 textContent），删除无用 `readFileSync/resolve/src`。B3 表层断言：`network_hook_config_gate.test.ts` 标注「结构契约」+ 交叉引用 `network_hook_gate_behavior.test.ts`。
- **AC-004 popup 行为级**：新建 `popup_behavior_paths.test.ts`（真实 import popup.ts + mock chrome/DOM，参考 popup_onchanged_race），6 例：start→采集中、stop→saved、onChanged 外部同步、导出失败、start 失败不写 is_capturing、采集中打开即轮询 get_status。删除被 B5-M3 点名的 vacuous 文件 `popup_start_timing.test.ts` / `popup_immediate_refresh.test.ts`（其语义均已行为覆盖：失败路径、成功写 is_capturing+capture_toggles、即时轮询+计数刷新）。
- **AC-005 dispatcher/queries 直接单测**：`agent_command_dispatcher.test.ts` +6（SOURCE_NOT_FOUND / RECORD_NOT_FOUND / EXPORT_FAILED 结构化错误映射；config 非法值；limit 负数/超上限 INVALID_QUERY）。`agent_data_queries.test.ts` +3（fetch_all 跨页聚合 offset 续取、list_entries 切片边界 offset 越界/limit=0、无效 source→SOURCE_NOT_FOUND）+ timeline offset 切片。64MiB 预算路径由既有 `t140_resource_budget.test.ts` AC-005（bridge client send_result → PAYLOAD_TOO_LARGE）覆盖，验证绿。
- **AC-006 全量**：`npm test` 142 files / 1487 tests 全绿；`npx tsc --noEmit` 干净。
- **生产问题记录**：未发现导致现有行为错误的 bug。仅两处已知纵深缺口不修（见 AC-001 条目）：render_net_inspector `cache_status`（review L1）与 `response_body_status` 未 esc，均为内部枚举串、当前数据流不可控为 XSS。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-13 01:20 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|------|------|------|------|------|
|t151_gen_f001|minor|已修|spec 过时：64MiB 预算路径由 t140（agent_bridge_client PAYLOAD_TOO_LARGE）覆盖，非 dispatcher/queries；spec 可测试性声明修正|spec.md 可测试性声明|
|t151_gen_f002|minor|已修|XSS 测试 esc 参照与 escape_html 语义重复，改 import escape_html 作参照（同步转义集变更）|dashboard_detail_xss_escape.test.ts|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001-006 测试护城河补强；见 handoff.json ac_evidence

### Reviewer verdict

`single`：

- Round 1 general：PASS（2 minor 已修）
- Round 2 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 测试护城河 6 项补强：dashboard XSS 转义参数化测试、detail_render_consistency 真删自证自改真实渲染、detail_layout_source/settings_ui 源码断言改行为、popup 行为级测试（删 2 vacuous 文件）、dispatcher/queries 直接单测（+10 用例）。
