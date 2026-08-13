# Task review t195（reviewer_focus: 代码）

- task：`t195_content_guard_tests_fixes`
- spec：`docs/tasks/t195_content_guard_tests_fixes/spec.md`
- diff_anchor：`d27f39080c667c03a863c7886d83e8b4424d80e7`
- target：`git diff d27f39080c667c03a863c7886d83e8b4424d80e7`
- round：1
- reviewed_at：2026-08-14 04:10 UTC+8

## Findings

### t195_code_f001 - generation 守卫用例标题与断言不符 + 恒真辅助断言

- 严重度：minor
- 锚点：AC-004（generation 守卫行为级测试）；「行为缺陷」无——AC 整体覆盖由既有 `capture_state.test.ts` 满足，本条为测试质量问题
- 位置：`tests/unit/content_guard_tests.test.ts:78-84`
- 问题：用例标题声称「start 后 gen 激活、stop 后失活（is_active_generation 行为）」，但断言仅验证 import 即必然成立的 `typeof is_active_generation === 'function'`（恒真辅助断言）+ idle 初始态下 `is_active_generation(gen) === false`。激活路径（capturing/starting 阶段激活）从未被本用例驱动；注释「捕获状态机测试钩子不在此模块」不成立——`begin_start`/`commit` 是 `capture_state.ts` 公开导出（`capture_state.test.ts:40-45` 即用其驱动激活），本用例完全可补 `begin_start(...).commit()` 后断言激活、`begin_stop().commit()` 后断言失活。现状：阅读者会误以为「start 后激活」已被验证。
- 建议：删除 `typeof` 恒真断言；标题如实改为「idle 阶段当前 gen 不激活」，或改用 `begin_start`/`commit`/`begin_stop` 直接驱动状态机补激活/失活断言（与 `capture_state.test.ts` 同构）。

### t195_code_f002 - clipboardData 不可读时去重退化为双报（B3-L7 场景部分回归）

- 严重度：minor
- 锚点：AC-002 相邻的既有去重语义（B3-L7：同一操作不双报）；「行为缺陷」：copy 事件 clipboardData 不可读时同操作双报
- 位置：`src/extension/content/clipboard_capture.ts:87-91`（`read_clipboard_text`）、`:105-107`（去重条件）
- 问题：`read_clipboard_text` 在 clipboardData 缺失/`getData` 抛错/空串时返回 `null`；去重条件 `prev.content === content` 下，`null` 与补丁路径非空文本永不相等。B3-L7 原始场景（页面 copy handler 内调 `navigator.clipboard.writeText`，copy 事件 + writeText 补丁各发一条）中，若该页面 copy 事件 clipboardData 不可读（部分页面/`execCommand('copy')` 触发路径、部分浏览器实现），copy 事件 content=`null`、writeText content=`'text'` → 内容不匹配 → 双报，B3-L7 防护失效。测试 `clipboard_capture.test.ts:113-121` 通过显式注入 clipboardData 规避了该退化路径，未覆盖。
- 建议：这是 spec 已批准内容匹配方案的固有边界（读不到内容即无法判定「同内容」），但应在注释记录该退化场景；如可接受，补一条「事件路径内容不可读时退化为双报」的已知边界说明，避免后续误判为回归。

### t195_code_f003 - readText 补丁「先读后 emit」改变失败路径行为语义

- 严重度：minor
- 锚点：spec 非范围「不改变采集数据格式与既有行为语义（去重窗口语义除外）」
- 位置：`src/extension/content/clipboard_capture.ts:48-51`
- 问题：原实现 `emit_clipboard(...)` 先于 `original_read_text()` 调用，读取抛错（如权限拒绝）时仍会发出 `clipboard_read` 事件；新实现 `await` 成功后（或失败前）才 emit，读取抛错路径不再产生事件。采集事件在失败路径上减少一条，属超出「去重窗口语义除外」的行为语义变化（writeText 路径顺序未变，仅 read 变）。这是 AC-002 内容匹配的必要代价（须先取内容才能比较），但未在注释/迁移说明中记录。
- 建议：在 `readText` 补丁处注释记录「读取失败不记事件」的行为差异（或确认属预期后同步 spec 说明），避免后续任务误以为事件丢失是 bug。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：3 条（均 minor）
- 未进表的提示：
  - 文件过大：无命中。`storage_capture.ts` 202 行、`clipboard_capture.ts` 111 行、`service_worker.ts` 未在 diff 中触及超阈值（本 task 对 service_worker 仅 13 行改动）。
  - 复杂度：无命中。`emit_clipboard` 与 `notify_tabs_in_parallel` 分支数远低于阈值。
  - 范围外观察：`notify_tabs_in_parallel` 内部再次执行 `https?://` 过滤，与调用方 `start_capture_inner_impl` 的 `capturable_tabs` 预过滤双重冗余（幂等，非缺陷）；`service_worker.ts:754` debug 日志对每次通知 `capturable_tabs.find(...)`，全量通知为 O(N²)，tab 数小可忽略。
  - 全量跑（AC-005 复验）中观察到 1 例 flaky：`tests/unit/logger.test.ts:313` `elapsed < 5*50+200` 时间边界断言（MessageLogTransport 重试耗时），与 t195 改动无涉（logger 未被触碰），环境负载相关；干净重跑两次全绿 199 文件 / 1896 测试。
- 总体判断：核心改动（storage 模板迁移、clipboard 内容去重、onMessage 纯函数、notify 抽取）实现正确、行为等价核对通过、测试全绿；3 条 minor 均非阻断，建议 implementer 写入 task.md 处置表。
- 系统性 follow-up：无

### AC 复验方式

- AC-001 `re_verified`：逐行比对 anchor 版内联脚本与模板组合产物——还原守卫 6 条语句、`__capture_all_storage_installed__` 置位、SIGNAL='__capture_all_storage__'、SECRET 插值、SYNC_HMAC_JS 同源常量均等价（仅缩进差异，无语义影响）；`storage_capture.test.ts`（10 测试，未改动）迁移后仍全绿，证明注入行为未变；`content_guard_tests.test.ts` 源码同构断言与源码一致。
- AC-002 `re_verified`：核对去重条件 `now - prev.ts < DEDUP_WINDOW_MS && prev.content === content` 与 3 条行为测试（同内容去重 1 次、不同内容 2 次、重复同内容 1 次）断言逻辑与实现一致；`ClipboardEventData` 类型仅 `{method, action}`，content 未进事件数据，数据格式未变。
- AC-003 `re_verified`：`unknown_action_response()` 返回值 `{success:false, error:'unknown_action'}` 与 `content_script.ts` else 分支接线核对一致，行为等价；`content_script_uses_poll.test.ts` 断言由字面匹配改为函数调用匹配 + 新纯函数返回值断言，二者合起来等价，非弱化。
- AC-004 `re_verified`：`notify_tabs_in_parallel` 行为测试（http 过滤、无 id 跳过、全部通知）为真实调用断言；与 service_worker 原内联实现逐行比对（双过滤幂等、undefined 跳过、返回 boolean[]）行为等价；generation 守卫激活/过期语义由既有 `capture_state.test.ts:40-75` 覆盖（begin_start 递增+commit 激活、过期 gen 失活），本 task 用例仅补充 idle 断言（见 f001）。
- AC-005 `re_verified`：相关 7 文件 47 测试全绿；全量 `vitest run` 两次 199 文件 / 1896 测试全绿（一次运行含 1 例与 t195 无关的 logger 时间边界 flaky，见未进表提示）。

coverage = 5 / 5

verdict: PASS
reviewed_scope: b46a5d854bac7bf0

## Round 2 复核（2026-08-14 04:13 UTC+8）

- 前轮 finding 复核（以 diff 为准，不采信处置表自述）：
  - **t195_code_f001**：已消除。`content_guard_tests.test.ts` 原用例（typeof 恒真断言 + idle 非激活）整体删除，`get_state` import 同步移除；`capture_state.test.ts` 新增「新 start 递增 generation 后旧 gen 失活」用例（`begin_start`+`commit` 驱动激活断言、二次 start 后旧 gen 失活/新 gen 激活、`rollback` 收尾），守卫核心语义（await 后旧 gen 拒绝）被真实驱动验证。复核通过。
  - **t195_code_f002**：已消除。`read_clipboard_text` 上方注释记录 clipboardData 不可读退化边界（null 与补丁路径非空文本永不匹配 → B3-L7 双报退化；取舍：双报无害、丢事件有损）。复核通过。
  - **t195_code_f003**：已消除。readText 补丁处注释记录「先读后 emit——读取抛错不再发 clipboard_read 事件，内容去重需真实内容，此代价必要」。复核通过。
- 处置引入的新问题扫描：`capture_state.test.ts` 新用例末尾 `second.rollback()` 正确回置状态，不影响同文件其它用例（位于文件末尾执行）；文件尾缺失换行（`\ No newline at end of file`），纯格式、非缺陷。`content_guard_tests.test.ts` AC-001 断言新增 `not.toMatch(/var SIGNAL = '\$\{SIGNAL\}'/)` 与模板展开后源码一致，防回退有效。无新问题。
- 本轮新发现：0 条
- 复验命令（全部通过）：
  - `npx vitest run tests/unit/content_guard_tests.test.ts tests/unit/capture_state.test.ts tests/unit/clipboard_capture.test.ts` → 3 文件 24 测试全绿
  - `npm test`（全量）→ exit 0，199 文件 / 1897 测试全绿（较 round 1 增 1 条 = capture_state 新用例）
  - `npx tsc --noEmit` → exit 0，无输出
- 总体判断：3 条 minor 全部按建议处置且复核通过，无未解决 blocking，无处置引入的新问题。

verdict: PASS
reviewed_scope: b80caf0c7f290aba

## Round 3 复核（2026-08-14 04:15 UTC+8）

- 业务代码侧无变化确认：`find src -newermt "2026-08-14 04:13:00"` 无命中；`git diff <anchor> -- src/` 的 blob hash 与 Round 2 完全一致（service_worker.ts `4510f4d`、clipboard_capture.ts `a3b3dfb`、content_script.ts `7811df9`、storage_capture.ts `5d1a39c`；notify_tabs.ts / content_message.ts 为 untracked 新文件，mtime 亦无变化）。
- 测试侧改动核对（Round 2 后仅此两文件，mtime 04:13:17）：
  - `content_guard_tests.test.ts`：残留 `is_active_generation` / `capture_state` import 已删除，全文件无残留引用（仅 77 行注释指向 capture_state.test.ts 承载 generation 守卫行为测试）。
  - `capture_state.test.ts`：文件尾补换行（diff 无 `\ No newline` 标记），用例内容与 Round 2 一致。
- f001~f003 维持已消除：本轮改动仅为测试文件清理，未触及 f001~f003 处置后的实现/断言，前轮复核结论不受影响。
- 复验命令（全部通过）：
  - `npx vitest run tests/unit/content_guard_tests.test.ts tests/unit/capture_state.test.ts tests/unit/clipboard_capture.test.ts` → 3 文件 24 测试全绿
  - `npx vitest run`（全量）→ exit 0，199 文件 / 1897 测试全绿
- 本轮新发现：0 条
- 总体判断：业务侧零改动、测试清理干净、全量绿，f001~f003 处置维持有效，无未解决 blocking。

verdict: PASS
reviewed_scope: c0203f7174c8e691
