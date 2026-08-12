# Task review t154（reviewer_focus: 通用）

- task：`t154_dashboard_misc_fixes`
- spec：`docs/tasks/t154_dashboard_misc_fixes/spec.md`
- diff_anchor：`37cd9f11dd9cbcfcb786d07c3f5fab3693fb6391`
- target：`git diff 37cd9f11dd9cbcfcb786d07c3f5fab3693fb6391`
- round：1
- reviewed_at：2026-08-13 14:10 UTC+8

## Findings

### t154_gen_f001 - AC-003 第三用例名不副实，实际测的是 no-op 分支

- 严重度：minor
- 锚点：测试判别力——AC-003 记忆的「保存当前采集」路径未被该用例真实触达
- 位置：`tests/unit/t154_dashboard_misc.test.ts:176-183`
- 问题：用例名「open_detail 打开新 capture 前先保存当前采集状态」，但测试体里 `get_detail_capture()` 为 null（从未打开过 detail），`save_dt_memory` 走 `if (!id) return` no-op，断言 `get_dt_memory('capB')` 为 undefined 只验证了 no-op 分支，并未走「保存当前采集 → 打开新采集」两步路径。真正的 save+restore 已由第 2 个用例（直接调 `save_dt_memory('capA')` 后 `open_detail('capA')`）覆盖，故 AC-003 功能整体可证，此用例属命名与断言错位，非恒真断言。
- 建议：改为真实两步：先 `await open_detail('capA')` 并切视图，再 `await open_detail('capB')`，断言 `get_dt_memory('capA')` 保存了切到的 tab/view；或删除该用例并在注释中说明 save 对 null 是 no-op。

### t154_gen_f002 - dashboard_detail 两处 resize 新增 pointercancel/mouseleave 清理无测试覆盖

- 严重度：minor
- 锚点：覆盖可更广（AC-007 测试只覆盖 sidebar_resize 通用组件）
- 位置：`src/extension/dashboard/dashboard_detail.ts:518-568`（wire_rail_resize）、`570-615`（wire_network_resize）
- 问题：AC-007 的新增测试（`tests/unit/sidebar_resize.test.ts:175-213`）只覆盖 `sidebar_resize.ts`。dashboard_detail 的 `wire_rail_resize`/`wire_network_resize` 是独立实现（非复用 sidebar_resize）的同类逻辑，本次同样新增了 pointercancel/mouseleave 监听与清理，但无直接测试。经代码复核，两处 on_up 清理结构正确（移除 mousemove/mouseup/pointercancel/mouseleave），与 sidebar_resize 一致，实现无缺陷，仅测试未触达该路径。
- 建议：为 wire_rail_resize/wire_network_resize 各补一个 pointercancel/mouseleave 清理用例；或抽取共享 resize handler 使测试覆盖复用。

### t154_gen_f003 - batchDel 中途失败时已删成功的选中项残留 selected

- 严重度：minor
- 锚点：行为缺陷（边缘）——批量删除中断后选中计数残留、可能重复删除
- 位置：`src/extension/dashboard/dashboard_captures.ts:175-187`
- 问题：批量删除逐条执行，仅全部成功才 `selected.clear()`。若第 k 条为活跃采集被 SW 拒（T110 guard 返回 success:false），前 k-1 条已删成功但仍在 selected 中，UI 选中计数残留；用户再次点批量删除会对已删 ID 重复发 `delete_capture`（SW 对不存在 ID 幂等返回 success）。无崩溃、无数据损坏，仅状态残留，且 AC-002「失败保留剩余选中」语义部分达成（保留的是未删的剩余，但已删项也一并残留）。
- 建议：逐条成功后即时 `selected.delete(id)`，失败时保留其余；与行内 `del_capture` 的「成功才移除」语义对齐。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：3 条（全部 minor）
- 未进表的提示：
  - `dashboard_detail.ts:501-505` `[data-open-url]` click handler 直接引用 `chrome.tabs.create`，无 `is_extension` 保护，非扩展上下文点开会 ReferenceError。此为本 task 改动前既有行为（改动前同样 `chrome.tabs.create({url:u})`），非 AC-004 引入，范围外，仅提示。
  - `dashboard_shared.ts` `_dt_memory` Map 会话内不清理，dashboard 会话内采集数量有限，无实际影响。
  - `popup.ts:345` AC-012 redact_data 为 AND 语义后，设置页关闭脱敏时 popup 的 mask 卡仍显示 on（toggles.mask=true）但实际 start 配置 redact_data=false，UI 显示与实际行为轻微不一致。属语义设计（设置页为权威底线），非缺陷。
  - `popup.ts:402` AC-013 错误兜底文案 `'Stop failed'` 为硬编码英文，i18n 无对应键，仅兜底路径，可接受。
- 总体判断：13 项 AC 实现全部正确，与 SW 侧 T110 guard / get_status 契约 / load_user_config sanitize / escape 语义吻合，新增测试为行为级断言且判别力良好，无未解决 critical / important。仅 3 条 minor。
- 系统性 follow-up：无

### AC 复验方式

| AC | 类别 | 证据 |
|----|------|------|
| AC-001 | re_verified | 代码 `dashboard_captures.ts:71,78` 删除 `.replace(/"/g,'&quot;')` 仅留 `esc()` 单转义（escape_html `"`→`&quot;`）；测试断言 `value="a&quot;b"` 且不含 `&amp;quot;` |
| AC-002 | re_verified | `del_capture`/`batchDel` 检查 `resp.success`；SW `handle_delete_capture`（service_worker.ts:308-315）T110 guard 返 success:false；行内 capturing 按钮 disabled；三用例行为级断言 |
| AC-003 | re_verified | `save_dt_memory`/`get_dt_memory` 会话 Map + `open_detail` 先存后恢复；测试覆盖默认/恢复/no-op |
| AC-004 | re_verified | `dashboard_detail.ts:504` `/^https?:\/\//i` 校验；测试 https 打开、javascript: 拒绝 |
| AC-005 | re_verified | `load_captures` `Array.isArray(resp?.data)`；测试非数组降级 []、数组透传 |
| AC-006 | re_verified | `_user_config` 缺省 `DEFAULT_USER_CONFIG`；测试未调 set_user_config 渲染不抛 TypeError |
| AC-007 | re_verified | sidebar_resize + dashboard_detail 三处补 pointercancel/mouseleave 监听与清理；sidebar_resize 测试断言清理后 mousemove 不再更新 |
| AC-008 | re_verified | `capture_dur` `Math.max(0, …)`；测试负值→00:00:00、正时长 |
| AC-009 | re_verified | status `Number()<400` + `esc(String())`；cache_status `esc()`；测试向量被转义 |
| AC-010 | re_verified | `refresh_counts` 依 `status.data.is_capturing===false` 降级（SW get_status 契约必返该字段）；测试降级 saved/保持采集中 |
| AC-011 | re_verified | `load_state` 读回 `capture_toggles` Object.assign；测试 storage 恢复后卡片 off 且 start 配置反映 |
| AC-012 | re_verified | 缺省引 `DEFAULT_CONFIG`；`user_config.redact_data && toggles.mask!==false`（load_user_config sanitize 保证 redact_data 恒 boolean）；测试 3 用例覆盖 AND 语义与缺省值 |
| AC-013 | re_verified | `stop_capture` 失败 alert + return 不转完成态；测试失败保持 is-rec、成功仍转 saved |

coverage = 13 / 13

reviewed_scope: ff21a56cfab03c44

verdict: PASS

## Round 2 (2026-08-13 14:30 UTC+8)

### 前轮 finding 复核

- **t154_gen_f001（minor，已修）**：diff 复核 `tests/unit/t154_dashboard_misc.test.ts:176`。用例已改名为「AC-003b: 无当前 detail 时 open_detail 的 save 是 no-op，不写坏记忆（t154-f001 改名）」，注释同步改为描述实际行为（get_detail_capture null 时 save 不产生记忆），断言不变。命名与行为相符，名不副实问题消除。**确认已修。**
- **t154_gen_f002（minor，遗留→p041）**：已登记 `docs/pending/todo/p041_detail_resize_cleanup_test.md`（内容准确：dashboard_detail 两处 resize 清理无直接测试，代码复核正确）。属补测试建议，不阻断。**同意遗留登记。**
- **t154_gen_f003（minor，遗留→p040）**：已登记 `docs/pending/todo/p040_batch_delete_selected_residue.md`（内容准确：batchDel 中途失败选中残留，SW 幂等无数据损坏）。属边缘状态残留，不阻断。**同意遗留登记。**

### 本轮新发现

0 条（f001 修复仅改名+注释，未触碰行为逻辑，未引入新问题）

### 指纹说明

按 `check_review_status.py` 同口径复算当前 diff 指纹（`git diff --binary 37cd9f11dd9cbcfcb786d07c3f5fab3693fb6391` 排除 pending/findings/archive/task.md/review_*/handoff 后 sha1 前 16 位）= `ff21a56cfab03c44`。f001 修改的测试文件为 untracked，不进 git diff 口径；tracked 源码/测试自 Round 1 无变化，故指纹值未变。`check_review_status.py --task-dir docs/tasks/t154_dashboard_misc_fixes` 实测 `review_scope=ok`、`overall=PASS`。

### 总体判断

前轮 3 条 minor 已全部闭环（1 已修、2 遗留登记 pending），无未解决 critical / important，verdict 维持 PASS。

reviewed_scope: ff21a56cfab03c44

verdict: PASS
