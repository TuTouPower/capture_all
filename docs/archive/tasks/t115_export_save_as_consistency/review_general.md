# Task review t115（reviewer_focus: 通用）

- task：`t115_export_save_as_consistency`
- spec：`docs/tasks/t115_export_save_as_consistency/spec.md`
- diff_anchor：`472509b68683056df8da1bf80d4a2ec09ff19f8d`
- target：`git diff 472509b68683056df8da1bf80d4a2ec09ff19f8d`
- round：1
- reviewed_at：2026-08-11 13:18 UTC+8
reviewed_scope: 660e1f3ae2242e94

## Findings

### t115_gen_f001 - AC-004 的 Dashboard capture 导出测试未交付（flush 顺序 / save_as 接线 / abort 均缺）

- 严重度：important
- 锚点：AC-004；spec 范围「补 Dashboard archive/非 archive 导出的 flush、顺序与 save_as 接线测试（合并 p021）」；上下文区测试策略「Dashboard archive/非 archive 补 flush 先于导出与 flush 失败 abort」
- 位置：`tests/unit/t115_export_save_as_consistency.test.ts`（新增测试仅 helper 判别矩阵 + AC-001/AC-002 接线，无 Dashboard capture 用例）
- 问题：spec 将补 Dashboard capture 导出测试列为范围与测试策略，但 diff 新增测试未含任何 Dashboard capture 用例：
  1. archive 路径（`src/extension/dashboard/dashboard_shared.ts:237-268` `export_capture('archive')`）的「flush 先于读取」「flush 失败 abort」无测试：`dashboard_export_flush_saveas.test.ts`（T107 遗留）仅测 SW `export_json` 一个 format 的 flush 顺序，flush_all 全部 `mockResolvedValue`，从未走 reject 分支；
  2. 非 archive 路径（`dashboard_shared.ts:270-282`）与 archive 路径调用点（`:267`、`:282`）的 save_as 实参接线无断言（AC-001/AC-002 有正则接线，AC-004 无）；
  3. flush 失败中止链路（SW `service_worker.ts:196-200` catch → `sendResponse({success:false})` → 调用方 `if (!r?.success) return`）无测试锚定。
  实现行为本身在 T107（commit 3a0c79e）已存在且正确（archive `dashboard_shared.ts:242-244` flush 先于 `read_capture_snapshot`、失败 `alert+return`；非 archive 经 SW `service_worker.ts:234-245` 各 export_* 先 `await flush_all()`；save_as 均传 `get_user_config().export_save_as`），本次 diff 也未改 `dashboard_shared.ts`，故非实现缺口，而是 spec 明确要求的测试交付缺口（上下文区「有意不测：无」）。
- 建议：在 `t115_export_save_as_consistency.test.ts` 补三组用例：a) mock `chrome.runtime.sendMessage` 走 `export_capture(id,'archive')`，断言 flush 消息先于数据读取、`flush` 返回非 success 时 alert 且不调 `download_blob`；b) archive 与非 archive 路径 `download_blob` 第 4 实参接线断言（正则或 mock）；c) SW 侧 export_* 的 `flush_all` reject → 返回 `success:false` → 调用方中止下载。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：1 条（t115_gen_f001，important）
- 未进表的提示：
  - AC-001/AC-002 接线测试为源码字符串正则而非行为测试，与测试策略「做行为测试」措辞有出入；但断言目标（配置值传播）以正则锚定第 4 实参可达，且沿用 `popup_export.test.ts` P0.35/P0.40 既有惯例；helper 矩阵测试独立覆盖 helper 侧消费，组合无假绿路径，不单独出 finding。
  - helper 矩阵未列 `save_as=true + 无目录 + picker 不可用` 与 `undefined + 有目录` 两格，但 `export_utils.test.ts` 既有用例（P0.61 自动决定、T107 显式优先）覆盖同代码路径，覆盖等价。
  - `dashboard_shared.ts` 本次零改动（AC-004 实现早已存在）——若本 task 预期改实现需重新核对 spec 范围措辞；当前按「补测试」范围评审。
- AC 复验方式：
  - AC-001 `re_verified`：`popup.ts:296` 第 4 实参 `user_config.export_save_as`（`popup.ts:24/475` 模块级配置已加载，`types.ts:680` 字段存在）；`t115` 测试正则匹配该调用。
  - AC-002 `re_verified`：`dashboard_settings.ts:245` 第 4 实参 `get_user_config().export_save_as`；`t115` 测试正则匹配。
  - AC-003 `re_verified`：`export_utils.ts:76` 条件 `!has_dir && picker 可用 && save_as !== false` 与 6 格矩阵测试逐格核对一致；重跑 4 个相关测试文件 37 用例全绿。
  - AC-004 `re_verified`（实现）：`dashboard_shared.ts:242-244/267/282` + `service_worker.ts:234-245/196-200` 代码直接查证；测试覆盖缺口见 f001。
  - coverage = 4 / 4（AC-004 的测试部分未 re_verified，见 f001）
- 总体判断：AC-001/002/003 实现与测试一致、旧 P0.61 断言删除合规（基线绿、改动后必红、替代测试存在、注释说明充分）；AC-004 实现达标但 spec 明确要求的测试未交付，AC 缺测试为 blocking。
- 系统性 follow-up：无（`task.py list` 无等价导出测试缺口 task；T107 已 done）

verdict: FAIL

## Round 2 (2026-08-11 13:28 UTC+8)

- round：2
- reviewed_at：2026-08-11 13:28 UTC+8
- target：`git diff 472509b68683056df8da1bf80d4a2ec09ff19f8d`（工作区，HEAD=diff_anchor）
reviewed_scope: f7038f34707e5636

复核方式：`git diff 472509b68683056df8da1bf80d4a2ec09ff19f8d` 全量；node 模拟 test 1/2/3 正则与索引断言；`npx vitest run tests/unit/t115_export_save_as_consistency.test.ts` 11/11 绿；读 `dashboard_shared.ts:237-284`、`service_worker.ts:195-198/234-248`、`dashboard_export_flush_saveas.test.ts` 全文；grep 全仓测试确认无 SW flush reject 覆盖。

## Findings

### t115_gen_f002 - AC-004 非 archive 路径的 flush 失败中止链（含 flush 先于导出顺序）仍无测试锚定

- 严重度：important
- 锚点：AC-004「flush 失败时中止导出」；spec 范围「补 Dashboard archive/非 archive 导出的 flush、顺序与 save_as 接线测试」；测试策略「Dashboard archive/非 archive 补 flush 先于导出与 flush 失败 abort」；Round 1 f001 子项 (3) 与建议 (c)「SW 侧 export_* 的 flush_all reject → 返回 success:false → 调用方中止下载」
- 位置：`tests/unit/t115_export_save_as_consistency.test.ts`（AC-004 describe 仅锚定 archive 路径，`tests/unit/dashboard_export_flush_saveas.test.ts:91-96` 无 reject 路径）
- 问题：本轮新增 3 用例全部只覆盖 archive 路径，非 archive 的 AC-004 两个要素仍无测试锚定：
  1. flush 先于导出顺序：非 archive 的 flush 在 SW（`service_worker.ts:235/238/241/244` 各 export_* 先 `await flush_all()` 再取数），`export_capture` 非 archive 分支（`dashboard_shared.ts:270-282`）只 `sendMessage` 转发，无直接顺序可比；现有 T107 测试仅断言 `flush_all` 与 `export_json` 都被调用（`dashboard_export_flush_saveas.test.ts:94-95`），未断言顺序，若改为「先取数后 flush」该测试仍绿。
  2. flush 失败中止链：非 archive 的 flush 失败表现为 SW `handle_message` 抛错 → `service_worker.ts:196-198` `.catch` → `sendResponse({success:false})` → 调用方 `dashboard_shared.ts:272` `if (!r?.success) { alert('导出失败'); return; }` 不触发 `download_blob`。全仓测试无任何用例使 `flush_all` reject（T107 的 `flush_all` 恒 `mockResolvedValue(undefined)`）；grep `success: false` 命中文件均为无关功能（agent_command_dispatcher / body_capture / cleanup_start_mutex / live_data_queries / popup_start_timing）。
  本轮新增的 abort 锚定（test 2）正则 `if \(!flush_res\?\.\s*success\) \{ alert('导出失败：无法落盘缓冲数据'); return; \}` 精确匹配 `dashboard_shared.ts:243`，但那是 archive 分支的 `flush` 消息响应检查（消息文案 '导出失败：无法落盘缓冲数据'），与非 archive 的 `r?.success` 检查（文案 '导出失败'）不是同一路径。f001 只修了一半。
- 建议：补非 archive 用例：a) SW 侧 mock `flush_all` reject → 断言 export_json/jsonl/html/har 消息响应 `{success:false}`（复用 `dashboard_export_flush_saveas.test.ts` 的 SW 加载结构即可）；b) 调用方侧 mock `sendMessage` 返回 `{success:false}` 走 `export_capture(id,'json')`，断言 alert 且 `download_blob` 未被调用；c) 可选：断言 `flush_all` 调用在 `export_json` 取数之前（mock 顺序断言）。

## 结论

- 前轮 finding 复核（Round 2）：
  - t115_gen_f001 修不彻底。逐子项：a) archive「flush 先于读取」已修——test 1 提取正则经 node 验证精确捕获 `export_capture` 完整函数体（`dashboard_shared.ts:237-284`，`\n}` 只匹配顶格 `}` 即函数收尾花括号，内部缩进闭合不触发截断），flush_idx(242) < read_idx(244) 为真实源码顺序比对，无假绿；b) archive「flush 失败 abort」已修——test 2 正则与 `dashboard_shared.ts:243` 逐字符吻合且文案唯一；c) 「两处 download_blob 传 export_save_as」已修——test 3 正则匹配恰 2 处（`:267`/`:282`），`>=2` 断言删除任一处即红；d) 非 archive flush 顺序与失败中止链仍未锚定（见 f002）。
- 本轮新发现：1 条（t115_gen_f002，important）
- 未进表的提示：
  - test 1 提取正则依赖「函数体内无顶格 `}`」这一隐式前提，当前代码满足；若未来重构在函数体内引入列 0 闭合（如 IIFE）会误截导致假红，非假绿，仅健壮性提示。
  - `read` 辅助函数在 AC-001/002 与 AC-004 两个 describe 内重复定义，测试结构小瑕疵。
- AC 复验方式：
  - AC-001 `re_verified`：正则接线测试通过（`popup.ts:296` 第 4 实参 `user_config.export_save_as`）。
  - AC-002 `re_verified`：正则接线测试通过（`dashboard_settings.ts:245`）。
  - AC-003 `re_verified`：6 格矩阵测试通过（node 环境无 picker 的兜底格独立验证 downloads 调用）。
  - AC-004 `re_verified`（archive 部分）：test 1-3 断言经 node 逐字模拟验证准确、11/11 测试绿；非 archive 部分未 re_verified，缺测试见 f002。
  - coverage = 4 / 4（AC-004 非 archive 部分未 re_verified，见 f002）
- 总体判断：f001 的 archive 路径 3 用例已交付且断言锚定准确无假绿；但 AC-004 非 archive 的 flush 顺序与失败中止链仍无测试，f001 修不彻底，AC 缺测试仍 blocking。
- 系统性 follow-up：无（无等价导出测试缺口 task）

verdict: FAIL

## Round 3 (2026-08-11 13:33 UTC+8)

- round：3
- reviewed_at：2026-08-11 13:33 UTC+8
- target：`git diff 472509b68683056df8da1bf80d4a2ec09ff19f8d`（工作区，HEAD=diff_anchor）
reviewed_scope: c4193fe88631fe5b

复核方式：`git diff 472509b68683056df8da1bf80d4a2ec09ff19f8d` 全量（实现侧 `dashboard_shared.ts` / `service_worker.ts` 本轮仍零改动，新增仅测试）；读 `dashboard_shared.ts:237-284`、`service_worker.ts:195-201/234-248` 逐行对照 3 个新用例；grep 确认 `sendResponse({ success: false, error:` 全 SW 唯一于 `service_worker.ts:198`、`handle_message(message, sender).then(sendResponse).catch` 唯一于 `:196` 且相邻；`npx vitest run tests/unit/t115_export_save_as_consistency.test.ts tests/unit/popup_export.test.ts` 22/22 绿；node 模拟变异验证 3 组断言区分度（均红）。

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核（Round 3）：
  - t115_gen_f001：Round 2 已判「修不彻底」并转 f002，本轮以 f002 复核覆盖，不再重复。
  - t115_gen_f002 已修。逐子项核对：
    1. 调用方 r?.success 检查中止——新增用例「非 archive 路径导出前检查 r.success，失败中止」：函数体切片（`/export async function export_capture\([\s\S]*?\n}/`，node 验证捕获 `dashboard_shared.ts:237-284` 完整函数体，内部无顶格 `}` 不误截）内 `indexOf('if (!r?.success) { alert(\'导出失败\'); return; }')`（:272，archive 分支文案为「导出失败：无法落盘缓冲数据」，字符串唯一）> `indexOf('const r = await chrome.runtime.sendMessage({ action, capture_id: id })')`（:271），顺序比对为真实源码索引；前置 `toMatch` 与 `indexOf` 字符串逐字符一致，`indexOf` 失败不会落空（-1 恒小于另一索引则红）。变异「删除 r.success 检查」→ 断言红。
    2. SW export_json/jsonl/html/har flush 先于导出——新增用例 4 个 case 循环：`case '{action}':` 定位精确（`export_jsonl` 子串不误配 `export_json`，node 验证 idx 10044/10205/10350/10492 均指向各自 case 行）；`slice(idx, idx+200)` 窗口内 `flush_idx < ret_idx`（`await flush_all()` 在 `return { success: true` 之前），node 验证 4 组均真（32<82 / 33<64 / 32<63 / 31<62）。变异「export_json 删 flush 行」→ 断言红（窗口内首个 flush 移入后续 case，ri<fi）。
    3. flush_all 失败经 handle_message catch 返回 success:false——两个正则分别命中 `:196`（`then(sendResponse).catch`）与 `:198`（`sendResponse({ success: false, error:`），grep 确认二者全 SW 各唯一且 `:198` 位于 catch 回调体内；结合 2) 的 `await flush_all()` 无 try/catch 包覆，reject 经 promise 链传播至 `.catch` 的结构成立。变异「去掉 catch 内 sendResponse」→ 正则 2 红。
  - 三项建议（f002 建议 a/b/c）以源码结构锚定交付，与 T107 `dashboard_export_flush_saveas.test.ts`、`popup_export.test.ts` 既有正则惯例一致；断言目标为真实可观察结构、非恒真、变异敏感，AC-004 非 archive 的「flush 先于导出」「失败中止」两要素现均有测试锚定。
- 本轮新发现：0 条
- 未进表的提示：
  - test 6（catch 链）两正则独立匹配、未在单一切片内联合验证「catch 回调体 = sendResponse(success:false) 所在上下文」；当前源码两处唯一且相邻、`sendResponse({success:false,error:` 全 SW 无第二处，证据链真实无假绿，仅未来重构（如将失败响应移入 handle_message 内）时的弱锚定提示，可考虑单正则捕获 catch 回调体。
  - 新增 describe 内 `read` helper 与既有 describe 重复定义（第 3 处），测试结构小瑕疵，无行为影响。
  - test 5 切片窗口跨后续 case：当前 4 个 export case 均自带 flush 且位于各自 return 前，断言锚定自身 case 顺序；极端重构（某 case 无 flush 且其 return 前无任何 flush）仍红，无假绿面。
- AC 复验方式：
  - AC-001 `re_verified`：`popup.ts:296` 第 4 实参 `user_config.export_save_as`，正则接线测试绿。
  - AC-002 `re_verified`：`dashboard_settings.ts:245` 第 4 实参 `get_user_config().export_save_as`，正则接线测试绿。
  - AC-003 `re_verified`：6 格矩阵测试绿（含 picker 不可用兜底格）。
  - AC-004 `re_verified`：archive 顺序/abort/save_as 接线（test 1-3）+ 非 archive 调用方中止（test 4）+ SW 4 case flush 顺序（test 5）+ catch 链 success:false（test 6），逐条经源码行号对照与变异验证，22/22 测试绿。
  - coverage = 4 / 4
- 总体判断：f002 三项建议全部交付且断言锚定准确（切片索引、正则均经源码对照与变异验证无假绿），未发现新问题；AC-001~004 覆盖闭合，无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS
