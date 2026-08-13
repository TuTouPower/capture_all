# Task review t195（reviewer_focus: 测试）

- task：`t195_content_guard_tests_fixes`
- spec：`docs/tasks/t195_content_guard_tests_fixes/spec.md`
- diff_anchor：`d27f39080c667c03a863c7886d83e8b4424d80e7`
- target：`git diff d27f39080c667c03a863c7886d83e8b4424d80e7`
- round：1
- reviewed_at：2026-08-14 04:10 UTC+8

## Findings

### t195_test_f001 - generation 守卫测试为存在性断言 + 名实不符（恒真断言）

- 严重度：important
- 锚点：AC-004（start 并行通知与 generation 守卫行为级测试通过）
- 位置：`tests/unit/content_guard_tests.test.ts:73-80`（it「generation 守卫：start 后 gen 激活、stop 后失活（is_active_generation 行为）」）
- 问题：该用例含两条断言，均未验证 generation 守卫行为：
  1. `expect(typeof is_active_generation).toBe('function')` 为纯存在性断言（函数 import 成功即恒真），命中危险模式「恒真断言/存在性断言当 AC 证据」。
  2. `expect(is_active_generation(gen)).toBe(false)` 只在模块初始 idle 态下断言「当前 gen 不激活」。测试名与注释声称「start 后 gen 激活、stop 后失活」「capturing 阶段当前 gen 激活」，但断言验证的却是 idle 否定路径，且 idle 下任何 gen（含 current）都返回 false——若实现回归为 `is_active_generation` 恒返回 false，此用例仍绿。该用例无法辨别守卫激活/失效语义，`is_active_generation` 行为证据实际由既有 `tests/unit/capture_state.test.ts`（begin_start 后 true、过期 generation false、rollback/stop 路径）承载，本用例是冗余 + 假证据。
- 建议：删除该 it（守卫行为已由 `capture_state.test.ts` 覆盖）；或改为真实行为断言——`begin_start` 后 `is_active_generation(gen)` 为 true、`commit` 后仍 true、`rollback`/`begin_stop` 后为 false，删除 `typeof` 存在性断言。

### t195_test_f002 - B3-M8 既有断言替换后未锚定 sendResponse（契约意图弱化）

- 严重度：minor
- 锚点：AC-003（content onMessage 未知 action 分支行为级测试——返回 unknown_action 错误且通道正常 resolve）
- 位置：`tests/unit/content_script_uses_poll.test.ts:59-68`（it「B3-M8: 未知 action 显式 sendResponse 错误响应（通道不挂起）」）
- 问题：原断言 `/sendResponse\(\{\s*success:\s*false,\s*error:\s*'unknown_action'\s*\}\)/` 锚定「sendResponse 内联错误对象」，替换为 `/unknown_action_response\(\)/` 后只保证源码出现该函数调用，不再锚定 sendResponse——若未来实现改为不 sendResponse（仅 log 或调用后丢弃），此断言仍过，与其 it 标题「通道不挂起」不符。sendResponse 接线语义由 `content_guard_tests.test.ts:44-46` 的 `sendResponse\(unknown_action_response\(\)\)` 断言补回，故不阻断。
- 建议：将该断言收紧为 `/sendResponse\(\s*unknown_action_response\(\)\s*\)/`，恢复契约测试自身意图。

### t195_test_f003 - AC-002 read 路径内容去重无行为测试

- 严重度：minor
- 锚点：AC-002（clipboard 同 action 两次独立操作均产生事件；同内容重复仍去重）
- 位置：`tests/unit/clipboard_capture.test.ts:112-137`（B3-L7 + p043 + 同内容去重三个用例，均只覆盖 write 路径）
- 问题：内容匹配去重仅测了 write 路径（copy 事件 + writeText、两次 writeText）。read 路径（paste 事件 + `navigator.clipboard.readText`）同走 `emit_clipboard` 内容去重逻辑，且 readText 补丁改为「await original 取内容后再 emit」（与 writeText「先 emit 再写」顺序不同），但「不同内容两次 readText 均上报」「paste 事件 + 同内容 readText 去重」均无测试；既有 readText 拦截用例（line 88-96）只断言单次上报。read 路径与 write 路径共用同一去重实现，风险低。
- 建议：补 read 路径两用例（不同内容双报、同内容去重），或注明 read/write 共用逻辑可合并覆盖。

### t195_test_f004 - AC-001 还原守卫断言正则在旧内联形态上不匹配（防回归保险丝失效）

- 严重度：minor
- 锚点：AC-001（storage_capture 注入脚本经共享模板生成，不再内联还原守卫）
- 位置：`tests/unit/content_guard_tests.test.ts:20`（`expect(build).not.toMatch(/window\.__capture_all_storage_installed__ \{\s*\n\s*var prev_hook/)`）
- 问题：该 not.toMatch 意在防「build_page_script 内重回手写还原守卫」，但旧内联形态是 `if (window.__capture_all_storage_installed__) {`（`installed__` 后为 `) {`），正则要求 `installed__ {`（空格+花括号），对旧形态不匹配。已用旧版源码验证：`git show d27f390:src/extension/content/storage_capture.ts` 上该 notMatch 为 true（不失败），即未来若回归为旧内联形态，此断言无法察觉。AC-001 整体回归防御仍由同用例的 `page_script_reinstall_guard\('storage'` / `page_script_preamble\('storage', secret\)` 正向断言与 notMatch1（`${SYNC_HMAC_JS}`，旧形态上能正确失败）承担，故不阻断；但本断言声称的「不再内联手写还原守卫」实际失效。
- 建议：修正正则匹配旧形态（如 `installed__\)\s*\{` 或 `installed__[\s\S]{0,40}\{`），或删除该冗余断言并加注释说明由正向模板断言承担。

## 结论

- 前轮 finding 复核：无（Round 1）。
- 改测方向复核：无「迁就实现」的改测。逐处核实：
  - `content_script_uses_poll.test.ts:67` 与 `service_worker_t155_guards.test.ts:19` 断言替换：AC-003/AC-004 结构变更（响应抽纯函数、Promise.all 抽 notify_tabs_in_parallel）驱动的断言迁移，原断言针对的源码字面已不存在，替换为结构调用断言，行为语义由 `content_guard_tests.test.ts` 新行为测试承载（unknown_action 响应行为 + 接线断言、notify_tabs_in_parallel 过滤/跳过/结果行为）——合法迁移，非实现驱动测试。
  - `clipboard_capture.test.ts` B3-L7 用例更新（`emit_doc('copy', 'hello')` 补 clipboardData）：AC-002 语义变更（去重叠加内容匹配）下旧场景「copy 无内容 + writeText 有内容」按新语义属「不同内容→双报」，原断言场景失效；更新为内容一致的同一操作场景符合新语义的应有预期，合法。
- 本轮新发现：4 条（f001 important，f002/f003/f004 minor）。
- 未进表的提示：
  - AC-003 通道 resolve 语义（无 return true 挂起）无行为级测试，仅源码接线断言（`sendResponse(unknown_action_response())`）——content onMessage 顶层 chrome.runtime 不可在 node 单测实例化，与可测试性声明「纯函数可 import 行为测试」一致，不另出 finding。
  - AC-001 注入行为部分由既有 `tests/unit/storage_capture.test.ts` p031 用例（eval `build_page_script` 重注入持新 SECRET、旧签名失效）承接，迁移后该测试仍全绿，注入行为未丢。
  - `notify_tabs_in_parallel` 用例验证全量通知 + 结果收集 + http 过滤 + 无 id 跳过，但「并行」并发性本身无断言（Promise.all 并发由实现源码保证）；可加并发计数 case（send 内记录活跃并发数 > 1）。
  - read_clipboard_text 边界：空文本与无 clipboardData 均归 null，同窗口内 copy(空选择) + writeText('') 会被误去重；属极低概率 edge，可加 case 或注释说明。
- 总体判断：AC-001~005 均有有效测试承载且重跑全绿（相关 11 个测试文件共 82 用例通过），覆盖成立；但新增 generation 守卫用例含恒真存在性断言与名实不符断言，命中危险模式须处置，故 FAIL。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified`——逐条模拟执行 content_guard_tests 源码断言（模板调用、无 `${SYNC_HMAC_JS}` 内联、import 接线均命中），且用旧版源码验证回归辨别力（notMatch1/r1 能抓住旧内联，notMatch2 失效见 f004）；重跑 `storage_capture.test.ts`（含 p031 eval 注入行为用例）10 用例全绿。
- AC-002：`re_verified`——重跑 `clipboard_capture.test.ts` 10 用例全绿；p043「不同内容两次 writeText 双报」在纯时间窗回退实现下会失败（真实辨别力）、同内容去重/B3-L7 同内容去重断言有效。
- AC-003：`re_verified`——`unknown_action_response()` 行为断言重跑全绿；content_script 接线断言（sendResponse + import）模拟验证命中；通道 resolve 语义为源码接线层面（见未进表提示）。
- AC-004：`re_verified`——`notify_tabs_in_parallel` 行为测试与 service_worker 接线断言重跑全绿；generation 守卫激活/失效行为由既有 `capture_state.test.ts` 5 用例重跑全绿承载（本文件新增守卫用例本身存在 f001 问题）。
- AC-005：`re_verified`——重跑 content_guard_tests / clipboard_capture / content_script_uses_poll / service_worker_t155_guards / capture_state / storage_capture / content_page_script / websocket_capture_injected_script / network_hook_body_cap / network_hook_gate_behavior / content_postmessage_nonce 共 11 文件 82 用例，全部通过。

coverage = 5 / 5

reviewed_scope: b46a5d854bac7bf0

verdict: FAIL

## Round 2 (2026-08-14 04:15 UTC+8)

### 前轮 finding 复核

- **f001（important）— 已消除**：content_guard_tests.test.ts 恒真守卫用例已删除（原 73-80 行 it 移除，代以注释指向 capture_state.test.ts）；capture_state.test.ts 新增真实行为用例「新 start 递增 generation 后旧 gen 失活」——`first.commit()` 后 `is_active_generation(first.generation)` 为 true、二次 `begin_start` 后旧 gen 为 false 且新 gen 为 true（starting 阶段激活），断言为真实激活/失效语义，非换形式弱化；末尾 `second.rollback()` 清理状态，无跨用例污染（beforeEach 亦重置）。
- **f002（minor）— 已消除**：`content_script_uses_poll.test.ts:67` 断言收紧为 `/sendResponse\(unknown_action_response\(\)\)/`，锚定 sendResponse 接线，恢复 BUG-004 契约测试意图。
- **f003（minor）— 已消除（处置充分）**：`clipboard_capture.test.ts` 新增 read 路径用例「paste 事件同内容 + readText 不双报」——paste 事件（execCommand path）内容 'pasted' + `readText` 内容 'pasted' 窗口内去重为 1 次且保留先到者 execCommand，验证 read 路径内容去重行为；read 路径「不同内容双报」属扩展 case，不阻断。
- **f004（minor）— 已消除**：`content_guard_tests.test.ts:20` 保险丝断言改为 `/var SIGNAL = '\$\{SIGNAL\}'/`。已独立验证辨别力：新代码 build 段该 notMatch 通过（true），旧版 `d27f390:src/extension/content/storage_capture.ts` build 段该 notMatch 失败（false）——能真实抓住「回归内联 SIGNAL 字面」形态，非空转断言。

### 本轮新发现

- **t195_test_f005 - 删除守卫用例后残留未使用 import（清理项）**
  - 严重度：minor
  - 锚点：无 AC 违反；f001 处置引入的清理残留
  - 位置：`tests/unit/content_guard_tests.test.ts:10`
  - 问题：f001 处置删除该文件中唯一使用 `is_active_generation` 的用例后，`import { is_active_generation } from '../../src/extension/background/capture_state'` 仍残留，为未使用 import（死代码）。`npx tsc --noEmit` 退出码 0（项目未开 noUnusedLocals）故不阻塞编译；若未来启用严格 lint 会报错。另：`tests/unit/capture_state.test.ts` 文件末尾丢失换行符（`\ No newline at end of file`），同属清理项。
  - 建议：从 import 列表移除 `is_active_generation`；capture_state.test.ts 末尾补换行。

### 结论

- 改测方向复核：无新「迁就实现」改测；f001 新增用例为真实行为断言，f002 为收紧，f003 为新增行为用例，f004 为有效保险丝替换（旧内联形态上能失败）。
- 本轮新发现：1 条（f005 minor）。
- 验证执行：`npx vitest run tests/unit/content_guard_tests.test.ts tests/unit/capture_state.test.ts tests/unit/clipboard_capture.test.ts tests/unit/content_script_uses_poll.test.ts` — 4 文件 29 用例全绿；全量 `npm test` — 199 文件 1897 用例全绿，退出码 0；`npx tsc --noEmit` — 退出码 0。
- 总体判断：f001~f004 均真实修复（以 diff 与独立验证为准），无未解决 blocking；仅存 f005 minor 清理项，PASS。
- 系统性 follow-up：无。

reviewed_scope: b80caf0c7f290aba

verdict: PASS

## Round 3 (2026-08-14 04:16 UTC+8)

### 前轮 finding 复核

- **f005（minor）— 已消除**：`content_guard_tests.test.ts:10` 的 `import { is_active_generation } from '../../src/extension/background/capture_state'` 已删除（grep 确认该文件无 `is_active_generation` 残留，import 列表仅剩实际使用的 unknown_action_response / notify_tabs_in_parallel）；`capture_state.test.ts` 文件末尾补换行（`});\n`，字节级确认）。

### 结论

- 改测方向复核：无新「迁就实现」改测。
- 本轮新发现：0 条。
- 验证执行：`npx vitest run tests/unit/content_guard_tests.test.ts tests/unit/capture_state.test.ts` — 2 文件 13 用例全绿；`npx tsc --noEmit` — 退出码 0。
- 总体判断：f001~f005 全部真实修复，无未解决 blocking 与 minor，PASS。
- 系统性 follow-up：无。

reviewed_scope: c0203f7174c8e691

verdict: PASS
