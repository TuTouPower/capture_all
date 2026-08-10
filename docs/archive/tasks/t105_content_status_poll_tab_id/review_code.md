# Task review t105（reviewer_focus: 代码）

- task：`t105_content_status_poll_tab_id`
- spec：`docs/tasks/t105_content_status_poll_tab_id/spec.md`
- diff_anchor：`287a251b6f01ed4b03daf156740134b5c6a618f0`
- target：`git diff 287a251b6f01ed4b03daf156740134b5c6a618f0`
- round：1
- reviewed_at：2026-08-11 06:47 UTC+8

## Findings

无（clean review）。

## 结论

- 本轮新发现：0
- 未进表的提示：
  - 文件过大（降级规则，仅提示）：`src/extension/background/service_worker.ts` 1136 行，超过实现源码 800 行 important 阈值，且本 task 净增约 5 行。未引发可观测缺陷，故不按缺陷出 finding。
  - 测试层观察（转 test reviewer，不进 finding 表）：`status_poll_sender_tab.test.ts` 的 AC-002 用例仅断言 `get_status` 响应 `resp.tab_id === 42`，与 AC-001 用例断言同一行为，未触达 content 侧事件 `tab_id` 链路（content_script on_active → capture 模块 → event）。代码审阅按代码追溯确认 AC-002 由 content_script.ts:74 `tab_id = resp.tab_id` 传递满足，但该 AC 的自动测试覆盖偏弱。
  - 范围外观察：`get_status` 响应中顶层 `tab_id` 与 `current_capture.tab_id` 在 content 场景下不一致（前者为 sender tab，后者为采集启动时 active tab）。属本次改动设计使然；已核对所有消费方（content 用顶层 `tab_id`，popup `refresh_counts` 只读 `stats`/`current_capture.stats`，MCP bridge 走独立 `get_status()` 返回 `active_capture_id`），无消费方同时读两者产生歧义。

### AC 复验方式

- AC-001：`re_verified`。`service_worker.ts:219` `tab_id: sender?.tab?.id ?? current_capture?.tab_id ?? 0`，sender.tab.id 权威优先；单测 AC-001（sender.tab.id=5，current_capture 为 null）断言响应 5，测试真实调用 handle_message 逻辑，已运行通过。
- AC-002：`re_verified`。代码追溯：content_script.ts:70-77 `on_active` 置 `tab_id = resp.tab_id` 并传入所有 capture 模块，`send_capture_event`（content_script.ts:223-233）与各模块事件携带该 tab_id；`handle_event`（service_worker.ts:735）不覆盖事件 tab_id。事件链路 tab_id 等于 content 所在 tab id。自动测试侧仅间接（见上测试层观察）。

coverage = 2 / 2

- 总体判断：改动精准，仅 `get_status` 按 sender.tab.id 权威回填 tab_id，popup 无 sender.tab 时回退 `current_capture.tab_id` 保持原行为；多 tab 各得本 tab id，串台根因消除。无未解决 critical / important。
- 系统性 follow-up：无

reviewed_scope: 10ff13660211a382

verdict: PASS


## Round 2 (2026-08-11 06:52 UTC+8)

reviewed_scope: 2f76be26a892c6df

### 前轮 finding 复核

- 测试侧修复（AC-001b 真实场景 + AC-002 契约）由 test reviewer 验证；code 本无改动，scope 刷新对齐。

### 本轮新发现

无。

verdict: PASS
