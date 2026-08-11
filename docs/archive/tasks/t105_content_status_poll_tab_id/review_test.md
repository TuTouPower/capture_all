# Task review t105（reviewer_focus: 测试）

- task：`t105_content_status_poll_tab_id`
- spec：`docs/tasks/t105_content_status_poll_tab_id/spec.md`
- diff_anchor：`287a251b6f01ed4b03daf156740134b5c6a618f0`
- target：`git diff 287a251b6f01ed4b03daf156740134b5c6a618f0`
- round：1
- reviewed_at：2026-08-11 06:55 UTC+8
reviewed_scope: 10ff13660211a382

## Findings

### t105_test_f001 - AC-001 关键场景未复现：采集进行中且 tab 不同时未覆盖，反向优先级变体同绿

- 严重度：important
- 锚点：AC-001（get_status 返回的 tab_id 与 content 所在 tab 不同时，仍为本 tab）
- 位置：`tests/unit/status_poll_sender_tab.test.ts:84-98`（两 test）
- 问题：两测试均在「未启动采集」状态下运行（`current_capture = null`，`resp.is_capturing` 恒 false）。断言 `resp.tab_id === 5 / 42` 只验证 sender.tab.id 优先于 `?? 0` 回退值，未覆盖串台 bug 的真实场景——采集进行中 `current_capture.tab_id`（启动时 active tab）与 sender.tab.id 不同。该场景下，若实现被误改成旧优先级 `tab_id: current_capture?.tab_id ?? sender?.tab?.id ?? 0`，两个测试仍全绿（current_capture 为 null 时短路到 sender.tab.id）。即测试无法区分正确实现与保留 bug 的反向优先级变体，对 AC-001 的「不同时」判定场景呈假绿。真实 content 侧 `poll_capture_status.check_once` 仅在 `resp.is_capturing` 为真时调用 `on_active`，本测试的响应（is_capturing=false）在真实链路中根本不会触发启动，未触达该路径。
- 建议：补一个「先 start_capture（使 current_capture.tab_id = 非零 A），再以 sender.tab.id = B（≠A）发 get_status，断言 resp.tab_id === B」的用例；或至少通过 `chrome.storage.local` / `create_capture` 预置 current_capture 使两值不同。

### t105_test_f002 - AC-002 无有效覆盖：测试名声称「事件 tab_id」但从未产生/断言事件

- 严重度：important
- 锚点：AC-002（由此产生的 capture 事件 tab_id 等于 content 所在 tab id）
- 位置：`tests/unit/status_poll_sender_tab.test.ts:92-98`（test 名「AC-002: content 启动采集后事件 tab_id 等于 sender tab id」）
- 问题：该 test 只 `send_message('get_status', {tab:{id:42}})` 并断言 `resp.tab_id === 42`，未 start_capture、未 write_events、未断言任何 capture 事件的 `tab_id`。断言对象与 AC-001 测试完全相同（仅常量 5→42），是同路径重复，不构成 AC-002 的事件级覆盖。AC-002 的可观察面——capture 事件携带的 tab_id 等于 content 所在 tab——没有任何测试触达（content 侧 `on_active` 取 `resp.tab_id` 后传入各 capture 模块的事件链也未验证）。AC-002 在测试侧「看似覆盖、实际未验证」。
- 建议：要么新增事件级断言（mock `write_events` 后 start_capture 并校验事件 tab_id 来自 sender.tab.id），要么将本 test 降为消息契约覆盖并更正测试名，避免声称覆盖 AC-002。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：无（无对既有测试的修改；全部为新增）
- 本轮新发现：2 条
- 未进表的提示：
  - `tests/unit/status_poll_sender_tab.test.ts:87` 注释「current active tab 假设为 0（未采集）」表述不准——测试中 current_capture 为 null，`current_capture?.tab_id ?? 0` 回退为 0，并非「active tab 为 0」；且 mock 的 `tabs.query` 返回 id=5，与注释矛盾。属注释误导，minor。
  - 两 test 逻辑完全相同，仅 tab id 常量不同，可参数化合并；不构成阻断。
  - 正向确认：测试真实触达生产逻辑（import 真实 `service_worker`，经注册的 `onMessage` 回调 → `handle_message` → `get_status` 分支），非 import 内部函数凑数；断言用强等值 `toBe`；未发现 `.skip/.only`、恒真断言、`@ts-ignore` 等危险模式；mock 仅限 app_log_storage / keepalive 系统边界，未 mock 被测逻辑本身。
- 总体判断：测试能真实触达生产 get_status 且断言强，但两 AC 的核心场景均未有效覆盖——AC-001 未复现「采集进行中且 tab 不同」的串台场景（反向优先级变体假绿），AC-002 的事件 tab_id 完全未验证。2 条 important 未解决，FAIL。

### AC 复验方式

- AC-001：`re_verified`——重跑 `npx vitest run tests/unit/status_poll_sender_tab.test.ts` 2 过；通读 `service_worker.ts:219` 实现 `sender?.tab?.id ?? current_capture?.tab_id ?? 0` 与测试断言，确认机制正确但关键场景未覆盖（见 f001）。
- AC-002：`re_verified`（验证「无覆盖」）——通读全部 diff 与 tests/unit 相关文件，无任何测试断言 capture 事件 tab_id（见 f002）。

coverage = 2 / 2（AC-002 为「验证缺覆盖」，非验证 AC 满足）
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-11 06:51 UTC+8)

- round：2
- reviewed_at：2026-08-11 06:51 UTC+8
reviewed_scope: 2f76be26a892c6df

### 前轮 finding 复核（以当前 diff 为准）

- **t105_test_f001（important）→ 已消除**：新增 `AC-001b` 测试（`tests/unit/status_poll_sender_tab.test.ts:92-105`）。真实 `start_capture`：`tabs.query` mock 返回 active tab id=7，`start` 成功后 `current_capture.tab_id=7` 且 `is_capturing=true`（有 `expect(start_res.success).toBe(true)` 前置守卫，start 失败不会静默放行）；再以 `sender.tab.id=5` 发 `get_status`，断言 `resp.tab_id === 5`。已用突变验证判别力：把 `service_worker.ts:219` 临时改回旧优先级 `current_capture?.tab_id ?? sender?.tab?.id ?? 0`，AC-001b 失败（`expected 7 to be 5`），AC-001/AC-002 仍绿；恢复后原实现通过。该测试对「采集进行中且 tab 不同」这一串台场景具真实判别力，假绿消除。
- **t105_test_f002（important）→ 已消除**：按 f002 建议的合法选项（b）降为消息契约测试并更正测试名（`AC-002: content 侧 on_active 使用 resp.tab_id（消息契约）`，`status_poll_sender_tab.test.ts:107-117`）。静态扫描 `content_script.ts` 中 `on_active` 块，断言含 `tab_id = resp.tab_id`。已核对：`content_script.ts` 仅 1 处 `on_active:`（:70），`:74` 为 `tab_id = resp.tab_id ?? 0;`，regex 命中。与 AC-001/AC-001b（SW 按 sender 权威返回）构成完整链路：SW 回 sender tab id → content 用 resp.tab_id 设本 tab id → 事件链携带。spec 范围区明确允许「单测或消息契约测」，该处置符合已批准策略。

### 改测方向复核

无。本 diff 仅新增 `tests/unit/status_poll_sender_tab.test.ts` 与 `service_worker.ts` 的 get_status 分支修复，未修改任何既有测试，不存在「迁就实现」改测。

### 本轮新发现

0 条。

### 复核验证（独立执行）

- `npx vitest run tests/unit/status_poll_sender_tab.test.ts`：3 过。
- 突变验证（改回旧优先级）：AC-001b 失败 `expected 7 to be 5`，AC-001/AC-002 通过 → 判别力成立；已还原，diff 与还原前一致。
- `npx vitest run`：117 文件 / 1222 测试全过。
- `npx tsc --noEmit`：EXIT=0。
- scope 指纹重算 `git diff 287a251b6f01ed4b03daf156740134b5c6a618f0`（排除 task.md / review_*.md / pending / findings / archive / spikes / .scratch / tasks_index.json）：`2f76be26a892c6df`，与 prompt 注入一致。

### 未进表的提示

- `status_poll_sender_tab.test.ts:87` AC-001 注释「current active tab 假设为 0（未采集）」仍不精确：0 来自 `current_capture?.tab_id ?? 0` 回退（current_capture 为 null），非「active tab 为 0」。Round 1 已注，minor，未变。
- AC-002 静态扫描对格式敏感（regex `/tab_id = resp\.tab_id/` 要求 `=` 两侧空格），格式化后可能误报；且仅验证 content 取 resp.tab_id，事件级 `tab_id` 落库链路依赖 content `start_capture` 将 tab_id 传入各 capture 模块，超出本任务消息契约范围——spec 范围区已批准「单测或消息契约测」，不阻断。
- AC-001b 用 `config: {}` 启动采集，未走 network/console/body 路径；不影响 tab_id 判别，够用。

### AC 复验方式

- AC-001：`re_verified`——AC-001 + AC-001b 两测试通过；突变（旧优先级）使 AC-001b 失败 `expected 7 to be 5`，证实 SW 按 `sender?.tab?.id` 权威（`service_worker.ts:219`）且测试对该场景有判别力。
- AC-002：`re_verified`（消息契约级）——静态扫描测试通过，`content_script.ts:74` `tab_id = resp.tab_id ?? 0;` 命中；事件级 tab_id 落库链路由消息契约 + AC-001b 组合覆盖，符合 spec 已批准测试策略。

coverage = 2 / 2
- 系统性 follow-up：无

### 总体判断

Round 1 两条 important 均已按建议消除：AC-001b 真实复现「采集进行中 tab 不同」且经突变验证具判别力；AC-002 降为消息契约测试并如实更名，符合 spec 允许的策略。无未解决 critical / important，仅有 minor 级提示。PASS。

verdict: PASS
