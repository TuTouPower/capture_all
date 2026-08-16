# Task review t202（reviewer_focus: 代码）

- task：`t202_dashboard_bridge_status_snapshot`
- spec：`docs/tasks/t202_dashboard_bridge_status_snapshot/spec.md`
- diff_anchor：`d3b7ceb371440f3bc3996f2ec3eb24d2c1aabe30`
- target：`git diff d3b7ceb371440f3bc3996f2ec3eb24d2c1aabe30`
- round：1
- reviewed_at：2026-08-16 02:04 UTC+8

## Findings

### t202_code_f001 - storage.onChanged 监听器随每次设置页访问累积,无卸载清理

- 严重度：minor
- 锚点：spec「风险与回退」已点名该风险,回退方案含「监听器在页面卸载时移除」;行为缺陷描述见下
- 位置：`src/extension/dashboard/dashboard_settings.ts:245`（`chrome.storage?.onChanged?.addListener`）
- 问题：`wire_bridge_status` 每次调用都向 `chrome.storage.onChanged` 注册一个闭包监听器,而 `wire_settings` 由 `dashboard.ts:90`（`go()` → `render_shell()` → `render_content()`）在每个设置页导航进入时都执行一次。代码中无 `removeListener` 卸载路径。用户在会话内反复进出设置页,监听器数量按访问次数单调增长,每个监听器都持有对旧 `#content` 子树闭包（其中的 `label_input` 早已被 innerHTML 替换、脱离文档,写入 no-op）。当前因重渲染幂等（重复 `set_user_config` 同值、写 detached input）未产生可观测状态错误,属资源泄漏级缺陷;但 spec 风险节的回退措施「页面卸载时移除监听器」未落地。
- 建议：在 `wire_bridge_status` 内保存监听器引用并注册 `pagehide`/`visibilitychange`（或 `wire_settings` 重入时先 `removeListener` 上次注册的回调）清理;或改为一次性的模块级单例注册（首次进入设置页注册,后续进入复用）。

### t202_code_f002 - 「已连接」在 bridge 宕机期间持续显示,AC-002 用户可观察语义与 running/enrolled 信号存在 gap

- 严重度：minor
- 锚点：AC-002（bridge 离线时显示未连接）
- 位置：`src/extension/dashboard/dashboard_settings.ts:233-235`（`running && enrolled` 判已连接）;状态源 `src/extension/background/agent_bridge_client.ts:37/143-221`
- 问题：`enrolled` 与 `running` 在 bridge 宕机期间都不会复位——`poll_cycle` 心跳失败仅记日志并继续重试（agent_bridge_client.ts:197-214）,session 只有在 401 时才会清除（agent_bridge_client.ts:200-207, handle_401 清 `enrolled`）。因此「bridge 已宕机多时、设置页在此窗口打开」时快照显示 `{running:true, enrolled:true}` → 状态字段显示「已连接」,与 AC-002「离线时显示未连接」的字面语义不符。该 gap 源于 spec 自身对连接态的界定（AC-003 定义为 running/enrolled、非范围声明不做断开实时检测、风险节承认 enrolled 与真实连接的滞后）,实现忠实于 spec 已批准的状态语义,属 spec 层措辞/设计决策,非代码 bug。
- 建议：按「实现合理但与 spec 描述不符」处置——改 spec 或在结论中明确该语义;若产品期望宕机显示未连接,需引入独立于 enrolled 的连通性信号（超出本 task 定义的状态语义）,建议登记 follow-up。

### t202_code_f003 - bridge 状态契约类型未单一化:producer 返回匿名结构、dashboard 冗余强转

- 严重度：minor
- 锚点：契约·类型——强转透传掩盖类型漂移
- 位置：`src/extension/background/agent_bridge_client.ts:94`（返回内联 `{ running: boolean; enrolled: boolean }`）、`src/shared/message_contract.ts:71`（`BridgeConnectionState` 已定义但 producer 未引用）、`src/extension/dashboard/dashboard_settings.ts:240`（`res.data as { running: boolean; enrolled: boolean }`）
- 问题：契约侧 `BridgeConnectionState` 与 producer 返回类型、dashboard 消费侧强转三者形状相同但互不引用。`UiDataMap.get_bridge_status` 已给 `res.data` 定型,`as { running, enrolled }` 属冗余强转,且会掩盖契约形状漂移——未来给 `BridgeConnectionState` 增字段（如 `last_heartbeat_at`）时,producer 匿名类型与 dashboard 强转均不会编译报错,SW→dashboard 链路静默漏字段。当前无实际缺陷,属弱契约链接。
- 建议：`get_bridge_connection_state()` 返回类型改为 `import type { BridgeConnectionState } from '../../shared/message_contract'`;dashboard 去掉 `as` 强转,`res.success ? res.data ?? null : null` 借 `UiDataMap` 类型即可。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（本轮为 Round 1）。
- 本轮新发现：3 条（均 minor,无 critical/important）。
- 未进表的提示：
  - 文件过大（结论段列示,均未引发可观测缺陷）:
    - `src/extension/background/service_worker.ts` 1404 行（≥800 important 阈值,本 task 净增 3 行,主体为历史遗留）
    - `src/extension/background/agent_bridge_client.ts` 476 行（≥400 minor 阈值,净增 5 行）
    - `tests/unit/agent_bridge_client.test.ts` 1089 行（≥600 minor 阈值,净增 11 行）
  - 圈复杂度：`wire_bridge_status` 等新增函数 CC 均 <10,无提示项。
  - 范围外观察（仅供 test reviewer / implementer 参考,不构成本报告 finding）:
    - AC-002 离线用例的断言 `toContain('未连接')` 与渲染默认值相同,即使 get_bridge_status 链路整体失效该用例仍通过——在线用例（默认「未连接」→「已连接」）才真正验证动态切换;建议 test reviewer 关注。
    - `is_bridge_client_running()` 在 diff 之外已无生产调用方（仅测试引用）,系 pre-existing 死代码,非本 task 引入,未出 finding。
- AC 复验方式：
  - AC-001：`re_verified`——`tests/unit/settings_ui.test.ts` t202 AC-001 用例直接调用 onChanged 监听器传 `user_config.newValue` 并断言 `browser_label` 输入框即时更新,验证快照更新→输入框回填链路;但「真实浏览器 SW 回填不重载页面」E2E 行为标 `[deploy]`,属 `trust_prior`,依赖实施侧部署验证证据。
  - AC-002：`re_verified`——代码路径（dashboard_settings.ts:233-235）与在线/离线两用例（settings_ui.test.ts）均复核,断言「已连接/未连接」随连接态变化。
  - AC-003：`re_verified`——SW handler `case 'get_bridge_status'` 返回 `get_bridge_connection_state()`（service_worker.ts:341-343）、`agent_bridge_client.test.ts` 断言函数反映 running/enrolled、`sw_action_contract.test.ts` 门禁覆盖新增 action。
  - `coverage = 2 / 3`（AC-001 的 [deploy] 面 trust_prior;AC-002、AC-003 全复验）
  - trust_prior 占比 33%（>30%）,建议合并前人工抽查 trust_prior 项（AC-001 真实浏览器回填即时更新）。
- 总体判断：AC-001/002/003 均有实现与测试,未发现未解决 critical/important;3 条 minor 建议处置。实现忠实于 spec 批准的状态语义（running/enrolled）,AC-002 的字面 gap 属 spec 决策,不阻断。
- 系统性 follow-up：无（f002 如需改状态语义,建议标题「bridge 连接态引入独立连通性信号」,slug 建议 `bridge_connectivity_signal`,阻断性：非阻断）。

reviewed_scope: e8c9643fec847ab3

verdict: PASS

## Round 2 (2026-08-16 02:12 UTC+8)

- round：2
- reviewed_at：2026-08-16 02:12 UTC+8
- target：`git diff d3b7ceb371440f3bc3996f2ec3eb24d2c1aabe30`（工作区未提交状态,HEAD 仍为 d3b7ceb）

## Findings

本轮 0 条新 finding。

## 结论

- 前轮 finding 复核（以 diff 与代码为准,不采信处置表自称）：
  - **f001（onChanged 监听器累积）→ 处置「遗留」记 p054：确认**。代码未变,`src/extension/dashboard/dashboard_settings.ts:245` 仍 `chrome.storage?.onChanged?.addListener` 每次 wire 注册、无 removeListener。主仓 `/home/karon/karson_ubuntu/capture_all/docs/pending/todo/p054_dashboard_settings_onchanged_listener_leak.md` 已建,内容准确（现象/根因/来源 t202_code_f001/测试缺口/线索均齐,「已扫同类」待核实已标注）。minor 级缺陷按遗留转 pending 成立,不阻断。
  - **f002（running&&enrolled 判连接 gap）→ 处置「已修」改 spec 上下文区：确认**。`docs/tasks/t202_dashboard_bridge_status_snapshot/spec.md` 非范围区新增「状态界定说明」一行（running && enrolled 页面加载快照、宕机窗口仍显示已连接属 spec 批准）。AC-001/002/003 正文未改,验收标准未弱化,属推荐路径「实现合理但与 spec 描述不符→改 spec」,不计 FAIL。本 prompt 注入契约区已含该行,drift 为经确认的 spec 澄清。
  - **f003（as 强转）→ 处置「已修」去掉 dashboard_settings 冗余 as：确认（部分修复）**。`dashboard_settings.ts:240` 现为 `update_status(res.success ? (res.data ?? null) : null)`,冗余 `as { running; enrolled }` 已去除;`send_ui_message('get_bridge_status')` 返回类型经 `UiDataMap.get_bridge_status: BridgeConnectionState` 已定型,`res.data` 类型安全流向消费侧。`npx tsc --noEmit`（strict）EXIT=0,`settings_ui.test.ts`/`agent_bridge_client.test.ts`/`service_worker_bridge_status.test.ts` 52 用例全过。**修不彻底点**：finding 建议的另一半（producer `get_bridge_connection_state()` 返回类型改引 `BridgeConnectionState`）未应用,`agent_bridge_client.ts:94` 仍返回内联匿名结构,SW→dashboard 契约链仍非单一来源;消费侧已定型、无可观测缺陷,维持 minor 残余,不升不新记。
- 本轮新发现：0 条。三处置均无代码改动（f003 唯一代码改动经验证无类型/行为回归）。
- 未进表的提示：
  - 文件过大 / 圈复杂度：同 Round 1 结论,本轮修复未引入净增,无新项。
  - 范围外观察：无新。f003 的 producer 类型单一化残余已在复核内说明,不另记。
- AC 复验方式：
  - AC-001：`re_verified`——重跑 `settings_ui.test.ts` 通过,AC-001 用例直接触发 onChanged 监听器断言 browser_label 输入框即时更新;「真实浏览器 SW 回填不重载页面」E2E 面标 `[deploy]`,属 `trust_prior`,依赖实施侧部署验证证据。
  - AC-002：`re_verified`——重跑 `settings_ui.test.ts` 在线/离线/查询失败三用例,断言「已连接/未连接」随连接态变化。
  - AC-003：`re_verified`——重跑 `agent_bridge_client.test.ts` + `service_worker_bridge_status.test.ts` 通过,SW handler `get_bridge_status` 返回 `get_bridge_connection_state()`（service_worker.ts:341-343）,测试断言 running/enrolled 反映。
  - `coverage = 2 / 3`（AC-001 的 [deploy] 面 trust_prior;AC-002、AC-003 全复验）
  - trust_prior 占比 33%（>30%）,建议合并前人工抽查 trust_prior 项（AC-001 真实浏览器回填即时更新）。
- 总体判断：Round 1 三 finding 处置全部核实（f001 遗留入 p054、f002 改 spec 澄清、f003 去 as 已修且经验证无回归）,本轮修复未引入新问题;无未解决 critical/important,无新 blocker。
- 系统性 follow-up：无（f003 producer 类型单一化可并入既有建议:bridge 连接态契约单一来源,slug `bridge_connectivity_signal`,非阻断）。

reviewed_scope: 10498a7e4abcdd39

verdict: PASS
