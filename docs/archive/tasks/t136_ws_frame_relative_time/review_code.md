# Task review t136（reviewer_focus: 代码）

- task：`t136_ws_frame_relative_time`
- spec：`docs/tasks/t136_ws_frame_relative_time/spec.md`
- diff_anchor：`730b003a26736c230e597554054dff582ba13eb2`
- target：`git diff 730b003a26736c230e597554054dff582ba13eb2`
- round：1
- reviewed_at：2026-08-12 15:44 UTC+8

## Findings

### t136_code_f001 - `_ws_frame_relative_time_for_test` 复制算术但生产路径未调用，AC-001 行为断言测的是断开的副本

- 严重度：important
- 锚点：AC-001（ws_frame 事件 relative_time_ms 为合理非负相对时间）；「测了假行为致 AC 看似覆盖但实际未验证」危险模式
- 位置：`src/extension/background/network_capture.ts:297-299`（helper）；`:348`（生产内联）；`tests/unit/t136_ws_frame_relative_time.test.ts:7-20`（断言目标）
- 问题：新增导出的 `_ws_frame_relative_time_for_test(now, start) { return now - start; }` 只有测试引用，`send_ws_frame` 生产路径（`:348`）仍内联 `Date.now() - start_time`，**从未调用该 helper**。这偏离本仓 `_X_for_test = X` 复用真实符号的既有约定（如 `_base64_decoded_size_for_test = base64_decoded_size`、`_try_resolve_deferred_for_test = try_resolve_deferred`、`_pending_requests_for_test = pending_requests`）。后果：
  1. 生产源码多出一个无生产调用者的测试专用函数（死代码/职责越界），`now - start` 与生产公式成为两份独立副本；
  2. AC-001/AC-001b 的「行为」断言只打到这份副本；真实路径的 `relative_time_ms` 输出仅靠 AC-002 的**源码字符串断言**（`t136_ws_frame_relative_time.test.ts:22-32` 读 `.ts` 文件匹配 `'Date.now() - start_time'` 与不匹配 `/params\?\.timestamp/`）兜底，属脆弱锚点；
  3. 既有行为测试 `tests/unit/websocket_capture.test.ts:96` 携带 CDP `timestamp: 1000`（正是旧 bug 触发场景）驱动真实 `send_ws_frame` 路径，却不断言 `relative_time_ms`，故修复的产出行为在真实路径上**无任何行为级校验**。
  - 分叉场景：`send_ws_frame` 公式若后续演化（改单位、加 `Math.max(0,…)`、重引 timestamp 路径）而源码串仍含 `Date.now() - start_time`，helper 测试照常通过，AC-001 行为静默回归而不报警。
- 建议：二选一——（a）生产改为调用 helper：`relative_time_ms: _ws_frame_relative_time_for_test(Date.now(), start_time)`，使 hook 即真实路径，落入 `_X_for_test` 复用约定；或（b）在 `websocket_capture.test.ts` 的行为测试中直接断言 `frames[i].event.relative_time_ms` 落在 `Date.now() - start_time` 合理区间，并移除源码字符串测试。

## 结论

- 前轮 finding 复核：Round 1 无前轮。
- 本轮新发现：1 条。
- 未进表的提示：
  - 文件过大：`src/extension/background/network_capture.ts` 物理行数 1219（`wc -l`），达重要阈值 800 且本 task 净增 +8 行（+10/-2）。按降级规则仅列此处；该文件基线已 1211 行，本 task 仅 +8，属历史累积，未因此产生可观测缺陷。
  - 复杂度：本 task 未给任何函数新增分支/嵌套；`send_ws_frame` 结构未变，`_ws_frame_relative_time_for_test` CC=1，无复杂度 finding。
  - 范围外观察：H6 注释块在 `:295-296` 与 `:342-343` 重复两处，纯注释冗余，不构成 finding。
  - 测试覆盖提示（test reviewer 范围）：spec 可测试性声明称 AC-003「边界用例」，但新增测试文件 `t136_ws_frame_relative_time.test.ts` 未含 AC-003 用例；AC-003 实现层由既有查询代码天然满足（见 AC 复验）。
  - 范围检查：diff 仅触 `network_capture.ts` 与 `task.md`（front matter 为调度期字段，属流程内），无不相关改动、无范围外功能。
- 总体判断：生产实现正确（AC-001/002/003 行为均达标），但测试钩子与生产路径断开，AC-001 行为断言未锚定真实逻辑，存在 1 条未解决 important，故 FAIL。

### AC 复验方式

- AC-001：`re_verified` —— `send_ws_frame:348` 为 `Date.now() - start_time`；`start_time` 由 `service_worker.ts:407,459`（`now = Date.now()`）注入，为 epoch 毫秒基准；与同采集其它事件一致（`build_network_event:938` 用 webRequest epoch `timeStamp`、`build_cdp_primary_network_event:993` 用 `meta.timestamp = Date.now()`、ws 连接与 frame error 事件均 `Date.now() - start_time`）。注意：真实路径相对时间行为在测试中未被断言（即 f001）。
- AC-002：`re_verified` —— 两条旧路径（含/缺 CDP timestamp）合为单一 `Date.now() - start_time` 路径，两种输入均产出正确相对时间；`params?.response` 仍用于 payload，`send_ws_frame` 块内不再引用 `params.timestamp`；测试经源码字符串断言锚定该块。
- AC-003：`re_verified` —— `agent_data_queries.ts:136-206` 的 `get_timeline_from_capture_data`/`is_in_time_range`/`sort_records` 全部基于 `get_record_sort_key` 数值比较，负数排序/过滤/越界均无崩溃路径；本修复杜绝新负数产生，历史脏数据（若有）被数值化忽略。

coverage = 3 / 3

- 系统性 follow-up：无

reviewed_scope: 1c59829e91b6fe6c

verdict: FAIL

## Round 2 (2026-08-12 16:05 UTC+8)

### 前轮 finding 复核

- **t136_code_f001（important）—— 已消除**。以当前 diff 与代码核实（非采信处置表）：
  - `src/extension/background/network_capture.ts:297-300`：新增内部函数 `ws_frame_relative_time(now, start)`，`export const _ws_frame_relative_time_for_test = ws_frame_relative_time` 直接复用真实符号，落入本仓 `_X_for_test = X` 既有约定（同 `_base64_decoded_size_for_test`、`_try_resolve_deferred_for_test`），不再是平行副本。
  - `network_capture.ts:348`：生产 `send_ws_frame` 现调用 `ws_frame_relative_time(Date.now(), start_time)`，测试钩子即生产真实路径，AC-001/AC-001b 行为断言（`t136_ws_frame_relative_time.test.ts:8-21`）现打到真实生产函数。
  - `t136_ws_frame_relative_time.test.ts:23-33`（AC-002）：源码断言改为「生产 send_ws_frame 块含 `ws_frame_relative_time(Date.now(), start_time)` 调用 + 不匹配 `/params\?\.timestamp/`」，锚点从公式副本升级为 helper 调用存在性，行为层与生产路径闭环。
  - 分叉场景（helper 与生产公式各自演化）已消除：两处现为同一符号。

### 本轮新发现

- 无。修复未引入新分支、新死代码、新命名或控制流问题；`ws_frame_relative_time` CC=1，`send_ws_frame` 结构未变。

## Round 2 结论

- 前轮 finding 复核：t136_code_f001 已消除（以 diff 与源码核实，非采信处置表）。
- 本轮新发现：0 条。
- 未进表的提示：无新增。Round 1 结论段已列的文件过大（`network_capture.ts` 1219 行，本 task 净增 +9）与注释冗余（H6 注释 295-296 与 343 两处）仍按降级规则不进 finding 表。
- 总体判断：实现正确，测试钩子复用真实符号，无未解决 critical / important，仅有历史累积的文件膨胀提示。
- 系统性 follow-up：无。

reviewed_scope: 0081e42ffa788686

verdict: PASS
