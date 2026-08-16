# Task review t202（reviewer_focus: 测试）

- task：`t202_dashboard_bridge_status_snapshot`
- spec：`docs/tasks/t202_dashboard_bridge_status_snapshot/spec.md`
- diff_anchor：`d3b7ceb371440f3bc3996f2ec3eb24d2c1aabe30`
- target：`git diff d3b7ceb371440f3bc3996f2ec3eb24d2c1aabe30`
- round：1
- reviewed_at：2026-08-16 02:06 UTC+8

reviewed_scope: e8c9643fec847ab3

## Findings

### t202_test_f001 - AC-003 SW message handler 无行为级测试，spec 测试策略承诺未落实

- 严重度：important
- 锚点：AC-003「SW 暴露 bridge 连接状态查询 message（bridge client running/enrolled），dashboard 可经此获取连接态」；spec 可测试性声明「AC-003 可自动测试——SW message handler 返回 enrolled/running」；spec 测试策略「SW handler：复用现有 onMessage 测试模式，mock bridge client 状态」
- 位置：`src/extension/background/service_worker.ts:341-343`（被测 handler）；`tests/unit/sw_action_contract.test.ts:92-94`（静态 case 名 grep）；`tests/unit/agent_bridge_client.test.ts:165-173`（纯函数单测）
- 问题：本 diff 没有新增任何经真实 SW `onMessage` 发送 `get_bridge_status` 并断言响应 `data` 含 `running/enrolled` 的测试。现有覆盖是：(1) `sw_action_contract.test.ts`「every UI_ACTIONS action is handled by SW」只做 `readFileSync` + 正则提取 `case '...'` 字符串，证明的是 case 名 token 存在，不验证 case 返回什么；(2) `agent_bridge_client.test.ts` 新测试只测纯函数 `get_bridge_connection_state()`。dashboard 的 AC-002 测试（`settings_ui.test.ts:206-221`）mock 掉 `chrome.runtime.sendMessage`，从未触达真实 SW handler。因此 `case 'get_bridge_status' → wrap_result(get_bridge_connection_state())` 这一绑定与回包形状（`{ running, enrolled }`）无任何行为级验证：若该 case 被改成硬编码 `{ running:false, enrolled:false }` 或回包字段漂移，全部现有测试仍绿，dashboard 却显示错误连接态——正是 AC-003 声明的可测行为，也是 spec 测试策略明写要补的 onMessage 测试。附带：纯函数测试因 `beforeEach` 已设 session（`set_bridge_session_for_tests`）只覆盖 `enrolled=true`，`enrolled=false` 路径也无断言。
- 建议：在 `sw_action_contract.test.ts` 第二组（复用其 onMessage 发送模式）或 `service_worker` 相关测试中，mock bridge client 状态，`send_message({ action: 'get_bridge_status', payload: {} })`，断言 `resp.success === true` 且 `resp.data` 为 `{ running, enrolled }` 布尔对象；顺带补 `enrolled=false` 的纯函数断言。

### t202_test_f002 - SW 查询失败路径与 chrome 缺失 guard 未测（保持默认未连接无断言）

- 严重度：minor
- 锚点：AC-002 失败场景补充；非范围「不处理设置页打开期间 bridge 中途断开」
- 位置：`src/extension/dashboard/dashboard_settings.ts:238-241`（`.catch(() => {})` 与 `res.success ? data : null` 分支）
- 问题：生产代码对 SW 不可达（`sendMessage` reject）和 `res.success === false` 两条路径都落回默认「未连接」，但无测试断言该失败行为。AC-002 只测了「查询成功但 running=false」的离线分支，「SW 完全不可达时状态保持未连接」这一用户可观察失败路径空白。同理 `typeof chrome !== 'undefined'` guard 的 false 分支（非扩展环境不查不监听）未测。
- 建议：补一个用例，`runtime_send_message.mockRejectedValue(...)` 后 `wire_settings()`，断言 `#bridgeStatus` 仍为「未连接」。

### t202_test_f003 - AC-001 测试依赖 `on_changed_listener.mock.calls[0][0]` 首个监听器索引，耦合脆弱

- 严重度：minor
- 锚点：AC-001（storage.onChanged 触发快照更新的可自动测试部分）
- 位置：`tests/unit/settings_ui.test.ts:251`
- 问题：测试取 `mock.calls[0][0]` 假定 bridge listener 是首个（且唯一）注册的 onChanged 监听器。当前该假定成立（sidebar_resize/theme 不注册 onChanged），但任何未来模块先注册监听器即会抓错回调，测试静默失效或误报。测试未验证监听器对非 `local` area / 缺失 `user_config` 的 guard 行为（`dashboard_settings.ts:246`），这部分正确性同样无覆盖。
- 建议：注册后按可辨识特征取监听器（如 filter 含 `user_config` 判断的回调），或让 `wire_bridge_status` 暴露监听器句柄；如需，补 guard 分支断言。

## 结论

- 前轮 finding 复核（Round 1，无）：无
- 改测方向复核：本 diff 未修改任何既有测试的断言预期（仅扩展 mock 能力、追加新用例），无「迁就实现」的改测。
- 本轮新发现：3 条（1 important + 2 minor）
- 未进表的提示：
  - `wire_bridge_status` 注册的 storage.onChanged 监听器未在页面卸载时移除（spec 风险区回退项之一），当前靠「重渲染幂等」兜底；该点属 code review 职责，测试侧难以自动覆盖，建议由 code reviewer 评估。
  - 混合连接态（running/enrolled 一真一假 → 未连接）语义未测，属「可再加 case」范围，不入表。
- 总体判断：AC-002、AC-001 的可自动测试部分覆盖到位且断言用户可观察文本/值；存在 1 条未解决 important（AC-003 SW handler 行为级测试缺失，spec 测试策略明示未落实），须处置后方可通过。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：部分 `re_verified` —— reviewer 独立重跑 `settings_ui.test.ts`（49 passed），核对 AC-001 用例（`settings_ui.test.ts:237-256`）经真实 listener 回调断言 `label_input.value === '1 号'`（快照更新被传递性验证）。「真实浏览器中不重载页面即更新」为 `[deploy]`，`trust_prior`，依赖实施侧部署验证。
- AC-002：`re_verified` —— 重跑测试 + 核对断言（`settings_ui.test.ts:206-235`）确证状态文本随 mock 连接态在真实 `wire_bridge_status → send_ui_message` 路径下变化。
- AC-003：`re_verified`（代码审读）—— 直接读 `service_worker.ts:341-343` 确认 handler 绑定 `wrap_result(get_bridge_connection_state())`；`get_bridge_connection_state` 纯函数单测存在且绿。但「SW message handler 返回 enrolled/running」的行为级测试缺失，见 t202_test_f001。

coverage = 2 / 3（AC-001 可自动测试部分已复验，`[deploy]` 端到端子项 trust_prior）

verdict: FAIL

## Round 2 (2026-08-16 02:13 UTC+8)

reviewed_scope: 10498a7e4abcdd39

前轮 finding 复核（以 `git diff d3b7ceb371440f3bc3996f2ec3eb24d2c1aabe30` 与代码为准，未采信自述；重跑三测试文件 `service_worker_bridge_status.test.ts` / `settings_ui.test.ts` / `agent_bridge_client.test.ts` 共 52 passed）：

- t202_test_f001（important）→ **已消除**，残余 minor。新增 `tests/unit/service_worker_bridge_status.test.ts`：完整 stub `self`/`chrome`，动态 `import()` 真实 `service_worker.ts`，经真实 `chrome.runtime.onMessage` 监听器 `send_message({ action: 'get_bridge_status' })`，断言 `resp.success === true` 且 `resp.data` toEqual `{ running: false, enrolled: false }`（真实 bridge client 默认态）。handler 绑定、回包形状、`wrap_result` 均获行为级验证；正路径（running=true/enrolled=true）由 `agent_bridge_client.test.ts:165-173` 纯函数测试断言。残余 minor：SW handler 经 onMessage 的「running=true」正路径未触达——若该 case 被硬编码 `{running:false, enrolled:false}`，SW 测试仍绿；但正路径在纯函数层与 dashboard AC-002（`settings_ui.test.ts` mock sendMessage 返回 running=true 断言「已连接」）分别覆盖，属「可再加一个 case」，不阻断。
- t202_test_f002（minor）→ **已消除**。`settings_ui.test.ts` 新增「AC-002: 查询失败(sendMessage reject)时保持未连接」：`runtime_send_message.mockRejectedValue(...)` → `wire_settings()` → 断言 `#bridgeStatus` 仍为「未连接」。默认渲染即「未连接」（`dashboard_settings.ts:105`），reject 走 `.catch(() => {})` 保留默认；`get_app_log_size` 的 reject 由 `update_size` try/catch 兜住（`dashboard_settings.ts:269`），无 unhandled rejection 干扰。
- t202_test_f003（minor）→ **修不彻底**。`mock.calls[0][0]` 改为 `mock.calls.find((call) => typeof call[0] === 'function')?.[0]`（AC-001 用例）。因 `addListener` 恒以函数为首参，`find` 与 `[0]` 实际等价，未按建议（filter 含 `user_config` 判断的回调 / 暴露监听器句柄）辨识 bridge 监听器；未来模块先注册 onChanged 监听器仍会抓错回调。仍为 minor，不阻断。

改测方向复核：无「迁就实现」的改测——本轮仅重构 chrome stub 为 `vi.hoisted` + 追加用例，既有测试断言预期零改动；新用例断言均为用户可观察文本/值（「已连接」/「未连接」/label_input.value），无恒真、无弱化、无 `.skip`、无 mock 被测逻辑。

本轮新发现：0 条 blocking（危险模式扫描未命中；SW 测试经真实 onMessage + 真实 agent_bridge_client，非 mock 自己的类）。

未进表的提示：
- AC-001 用例以 `({ user_config: { newValue } }, 'local')` 直接调用监听器，未覆盖 `area !== 'local'` 与缺 `user_config` 的 guard 分支（`dashboard_settings.ts:246-247`），属「可再加 case」。
- `service_worker_bridge_status.test.ts` 未断言 `res.success === false`（handler 返回非成功）路径，可选扩展。

总体判断：Round 1 唯一 important（f001）已消除——AC-003 SW handler 现经真实 onMessage 行为级验证，绑定与回包形状有断言；AC-002 在线/离线/查询失败三态均有可观察文本断言；AC-001 可自动测试部分经真实 listener 验证。仅存 2 条 minor 残余，无未解决 blocker，本轮 PASS。

系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001（可自动测试部分）：`re_verified` —— 重跑 `settings_ui.test.ts`，新增用例经真实 onChanged listener 回调断言 `label_input.value === '1 号'`（快照更新 + 输入框即时刷新）。「不重载页面即更新」`[deploy]` 子项 `trust_prior`，依赖实施侧部署验证。
- AC-002：`re_verified` —— 重跑 `settings_ui.test.ts`，在线/离线/查询失败三态断言真实渲染文本（已连接/未连接）。
- AC-003：`re_verified` —— 重跑 `service_worker_bridge_status.test.ts`，经真实 SW onMessage 断言 `get_bridge_status` 响应 `{ running, enrolled }` 形状与真实状态绑定。

coverage = 3 / 3（AC-001 可自动测试部分已复验，`[deploy]` 端到端子项 trust_prior）

verdict: PASS
