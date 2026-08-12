# Task review t150（reviewer_focus: 测试）

- task：`t150_error_handling_observability`
- spec：`docs/tasks/t150_error_handling_observability/spec.md`
- diff_anchor：`bdb141906330a49382009295f03497551bf379d2`
- target：`git diff bdb141906330a49382009295f03497551bf379d2`
- round：1
- reviewed_at：2026-08-13 00:17 UTC+8

reviewed_scope: c8a26e6436212c82

## Findings

### t150_test_f001 - AC-007（未处理 rejection 补 .catch）整条 AC 无任何测试覆盖

- 严重度：important
- 锚点：AC-007
- 位置：`src/extension/background/app_log_storage.ts:31-35`；`src/extension/background/service_worker.ts:877-882`（B2-M3）；`src/extension/background/service_worker.ts:1024-1031`（B2-M4）
- 问题：契约区 AC-007「未处理 rejection 位点补 .catch/日志」。本 diff 三处防御性改动全部无测试：
  - `schedule_flush` 的 fire-and-forget `this.flush().catch()`（app_log_storage.ts:32）；
  - `handle_cdp_body_event` 的 `handle_network_request(request).catch()`（service_worker.ts:879-882）；
  - `tabs.onActivated` 的 `chrome.tabs.get` try/catch（service_worker.ts:1024-1031）。
  
  可测试性声明「其余: 按既有模块测试补对应断言」——AC-007 属「其余」，但 `app_log_storage.test.ts` 与 service_worker 相关测试均未增补任何断言；且 `app_log_storage.test.ts` 测的是自建 `Minimal IndexedDBLogTransport replica` 而非生产类，`schedule_flush` 的 .catch 路径在本项目任何测试中都不会被触达。项目已有「without unhandled rejection」测试先例（`tests/unit/service_worker_stale_cleanup.test.ts:84/123`），说明该 AC 可自动测试。当前 .catch 若被未来重构静默移除，无任何测试可拦截，AC-007 行为完全不可验证。
- 建议：按既有模式补测试——app_log_storage 侧注册 `process.on('unhandledRejection')` 并让 `flush()` reject（spy 或 mock `get_db`），触发 `write()` → 定时器后断言无未处理 rejection；service_worker 侧分别触发 `handle_cdp_body_event`（令 `handle_network_request` reject）与 `tabs.onActivated`（令 `tabs.get` reject）断言被捕获、不泄漏。

### t150_test_f002 - AC-008 结构化日志仅测 auth_failed，超时/淘汰路径无测试

- 严重度：minor
- 锚点：AC-008（认证失败/超时/淘汰）
- 位置：`tests/unit/agent_bridge_server.test.ts:2013-2029`
- 问题：AC-008 列三类关键路径，新增用例只覆盖「认证失败」中的 mcp 路径一条（invalid token → auth_failed JSON 行）。生产侧已实现的 `command_timeout`（`src/bridge/server.ts:516-524`）与 `cdp_event_evicted`（`src/bridge/cdp_handler.ts:74/88`）两条结构化日志路径完全无测试。同 AC 的扩展用例，不阻断。
- 建议：补两用例——不 resolve 命令使 server 超时产出 COMMAND_TIMEOUT，断言 `console.warn` 出现 `event=command_timeout`；向 cdp session 推超限事件触发淘汰，断言 `event=cdp_event_evicted`。

### t150_test_f003 - keepalive 用例依赖模块级注册状态跨用例留存

- 严重度：minor
- 锚点：AC-005 测试可信（异步时序/隔离）
- 位置：`tests/unit/keepalive.test.ts:35-49`
- 问题：`beforeEach` 不重置模块级 `listener_registered` 与 `on_alarm_listener`。用例 2/3 的 `setup_keepalive_listener()` 因用例 1 已置位 flag 变成 no-op，实际触发的是用例 1 遗留的 handler。当前文件内顺序下通过，但若未来在 `beforeEach` 加 `on_alarm_listener = null` 之类的「合理清理」，用例 2/3 将因 flag 已置位且 listener 为空而报错，破坏方式隐蔽。另：20ms `setTimeout` 依赖真实时间，但 `flush_all_mock` 在 handler 内为同步调用，断言本身不依赖该等待（仅 settle 用），风险低。
- 建议：`beforeEach` 重置 `on_alarm_listener`（与 keepalive 模块的注册 flag ），让每个用例自建监听；等待改为对 handler 返回的 promise 直接 await 更稳。

### t150_test_f004 - AC-003 实际「挂起→中止」行为未直接测试

- 严重度：minor
- 锚点：AC-003 可测试性声明「mock fetch 挂起」
- 位置：`tests/unit/agent_mcp_client.test.ts:103-133`
- 问题：`AbortSignal.timeout` spy 用例判别了超时参数与值（去掉超时即红），TimeoutError 用例判别了错误包装——两点均真实触达生产 `fetch_with_timeout`。但可测试性声明承诺的「mock fetch 挂起」未落地：无用例验证「fetch 一直不 resolve 时被 signal 中止」。实际中止依赖标准库 AbortSignal 行为，属可接受代理，不阻断。
- 建议：可选补 fake timers + 挂起 fetch 验证 abort 触发；非阻断。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无。
- 改测方向复核：无「迁就实现」的改测。所有既有测试修改均为新增用例或补 `afterEach` 清理（`vi.unstubAllGlobals()`/`vi.restoreAllMocks()`），未改动任何既有断言语义；新增断言均为结构化错误码 + 不泄漏内部串的正向/负向断言，判别力成立。
- 本轮新发现：4 条（1 important + 3 minor）。
- 未进表的提示：
  - AC-002 部分脱敏位点无测试：service_worker 侧 `INTERNAL_ERROR` / `START_FAILED` / `CREATE_CAPTURE_FAILED` / `EXPORT_FAILED`（`service_worker.ts` B2-M15）与 `body_capture_coordinator` 的 permission/attach message 均未测；属同一 AC 的扩展用例，与 dispatcher/console/exception 三模块已测行为同构，不阻断。
  - `external_cdp_bridge_client.test.ts:307` 直接对 `globalThis.fetch` 赋值且未恢复，`vi.stubGlobal` + afterEach 恢复更规范；当前为文件末用例，无实测影响。
  - `app_log_storage.test.ts` 用自建 replica 而非生产类，属既有测试基础设施缺口，非本 diff 引入；相关 follow-up 建议见下。
- 总体判断：AC-007 为契约区验收标准且整条无测试覆盖，属 blocking 覆盖缺口；未解决前本 task 该 AC 不可验证 → FAIL。
- AC 复验方式：
  - `AC-001` re_verified：external_cdp detect 失败 warn 用例触达生产 catch（`MOCK_CONFIG.cdp_ports=[9222]` 单端口，断言 `level=warn` + `details.port`）；content 注入失败用例触达生产 `report_injection_failure`（断言 `capture_error`/`recoverable=false`）与 `inject_script_element` 两分支（error 事件、appendChild 抛错）。
  - `AC-002` re_verified：dispatcher 用例触达生产 `to_agent_error` 兜底分支，断言 `STORAGE_READ_FAILED` + `Unexpected error executing command` 且不含内部串；console/exception 用例触达 `Runtime.enable` 抛错 → catch，断言 `CDP_ATTACH_FAILED` 且不含 `/usr/lib/chrome`。
  - `AC-003` re_verified：`AbortSignal.timeout` spy 断言 10000/10000/305000/125000ms 参数；TimeoutError 用例断言 `Bridge request timed out after 10000ms` 包装，均触达生产 `fetch_with_timeout`。
  - `AC-004` re_verified：logger 用例经真实 `Logger.write` → `sanitize_value` catch 分支，断言 getter 抛错与 Proxy 抛 trap 均返回 `[Unserializable]` 且不抛，seen 集无跨调用污染。
  - `AC-005` re_verified：keepalive 用例触发生产 `keepalive_handler` → `keepalive_do_work` → `flush_all`（storage 边界 mock），断言被调用 + 无关 alarm 不触发。
  - `AC-006` re_verified：`MessageLogTransport.flush` 真实生产类，断言连续写入时 send ≤5 轮 + 耗时 <450ms + 空 buffer 不发送；判别力成立（去掉轮次上限即超时/越界红）。
  - `AC-007` trust_prior：无自动测试可复验，reviewer 仅确认生产三处 .catch/try-catch 存在（依赖生产代码审查，非行为验证）；此即 f001 缺口。
  - `AC-008` re_verified：auth_failed（mcp 路径）用例触达生产 `bridge_warn` → `console.warn` JSON 行，断言 `event=level=path`；超时/淘汰路径未复验（f002）。
  - coverage = 7 / 8。
- 系统性 follow-up：建议 follow-up 标题「补 AC-007 未处理 rejection 测试 + app_log_storage 生产类直测」，slug 建议 `t151_test_moat`（已有 backlog t151「测试护城河补强」承接同批 intensive-review 测试补强项；AC-007 属本 task 自身验收，应先在本 task 内补，残余公共缺口并入 t151）。

verdict: FAIL

## Round 2 (2026-08-13 00:35 UTC+8)

reviewed_scope: b3226dbd84bab50a

### 前轮 finding 复核

- t150_test_f001 (important, AC-007 无测试)：修不彻底。新增 `tests/unit/t150_ac007.test.ts` 仅覆盖 `app_log_storage.ts:31-35` schedule_flush .catch 一处；原 finding 列出的另两处 service_worker 位点仍无测试：`handle_cdp_body_event` .catch（B2-M3，`service_worker.ts:877-882`）与 `tabs.onActivated` 中 `chrome.tabs.get` try/catch（B2-M4，`service_worker.ts:1024-1031`）。两处均可测（service_worker_stale_cleanup.test.ts 已有 onActivated 监听器捕获模式；handle_cdp_body_event 可经 `set_cdp_body_event_handler` 触发）。→ 仍 important。
- t150_test_f002 (minor, AC-008 超时/淘汰路径无测试)：遗留 → p036 已登记且内容匹配（`docs/pending/todo/p036_bridge_log_paths_test.md` 述 command_timeout/cdp_event_evicted 两路径缺测试）。处置合规，minor 非阻断。
- t150_test_f003 (minor, keepalive 隔离)：遗留，rationale「重置会破坏幂等」成立（keepalive 模块 `listener_registered` flag 使 setup 幂等，重置 on_alarm_listener 后 setup no-op）。但 fix_ref 填文件路径 `tests/unit/keepalive.test.ts`，status=遗留 要求 pNNN 或 follow-up tid，`check_review_status.py` 因此报错。登记格式问题见未进表提示。
- t150_test_f004 (minor, AC-003 挂起用例未落地)：已修，rationale「AbortSignal.timeout spy + TimeoutError 包装已充分判别」。f004 为 minor 且原建议即「登记说明」，处置可接受。

### 改测方向复核

本轮唯一新增测试文件 `t150_ac007.test.ts` 为纯新增（mock get_db 边界，非 mock 被测逻辑），未改动既有测试；无「迁就实现」的改测。

### 本轮新发现

#### t150_test_f005 - t150_ac007.test.ts 以恒真断言收尾，判别依赖框架隐式行为

- 严重度：important
- 锚点：AC-007 + 危险模式「恒真断言」
- 位置：`tests/unit/t150_ac007.test.ts:36`
- 问题：测试唯一显式断言为 `expect(true).toBe(true)`（恒真断言，危险模式扫描明文命中）。注释声称判别机制是「若 .catch 缺失，flush reject 成为 unhandled rejection（vitest 报错）」——即依赖 vitest 对 unhandled rejection 的隐式失败归因，而非任何显式断言。三处判别弱点：(1) 若 vitest 配置 `dangerouslyIgnoreUnhandledErrors: true` 或框架不将 setTimeout 回调内的 rejection 归因到本测试，测试静默恒绿；(2) 无正向断言证明 flush 路径被执行（未断言 `get_db_mock` 被调用）；若 schedule_flush 定时器逻辑回归（从未调度），测试仍绿；(3) 时序脆弱——`await setTimeout(150)` 与生产 100ms 定时器竞态，慢 CI 下定时器可能未触发即断言，判别力丢失。
- 建议：显式注册 `process.on('unhandledRejection')` 监听器断言未被调用（try/finally 移除），并断言 `get_db_mock` 被调用（正向证明 flush 已执行）；删除 `expect(true).toBe(true)`。例如：
  ```ts
  const unhandled: unknown[] = [];
  const handler = (r: unknown) => { unhandled.push(r); };
  process.on('unhandledRejection', handler);
  try { transport.write(entry); await new Promise(r => setTimeout(r, 150)); expect(unhandled).toEqual([]); }
  finally { process.removeListener('unhandledRejection', handler); }
  expect(get_db_mock).toHaveBeenCalled();
  ```

### 本轮 AC 复验披露

- `AC-001` re_verified：同 Round 1（external_cdp detect warn + content 注入两分支）。
- `AC-002` re_verified：同 Round 1（dispatcher/console/exception 三模块脱敏断言）。
- `AC-003` re_verified：同 Round 1（AbortSignal.timeout spy + TimeoutError 包装）。
- `AC-004` re_verified：同 Round 1（sanitize_value catch 分支）。
- `AC-005` re_verified：同 Round 1（keepalive_do_work → flush_all）。
- `AC-006` re_verified：同 Round 1（flush 轮次上限判别）。
- `AC-007` trust_prior→re_verified（app_log_storage 一处）：t150_ac007.test.ts 真实触达生产 schedule_flush→flush→.catch 路径（mock get_db 边界），但判别依赖隐式 unhandled rejection（见 f005），且 service_worker 两处位点仍未复验（f001 残余）。其余两处 trust_prior。
- `AC-008` re_verified：同 Round 1（auth_failed 路径）；超时/淘汰路径登记 p036。
- coverage = 7 / 8。

### 结论

- 前轮 finding 复核：f001 修不彻底（仍存在）；f002 合规；f003 遗留但 fix_ref 格式非法；f004 已修。
- 改测方向复核：无「迁就实现」的改测。
- 本轮新发现：1 条（important）。
- 未进表的提示：
  - f003 处置表 fix_ref 格式非法：status=遗留 的 fix_ref 须为 pNNN 或 follow-up tid，当前填 `tests/unit/keepalive.test.ts`，导致 `check_review_status.py` 直接报错退出。需补登记 pNNN 或改 fix_ref。
  - 沿用 Round 1 未进表项（service_worker AC-002 脱敏位点、external_cdp fetch 全局赋值、app_log_storage replica 缺口）仍成立。
- 总体判断：AC-007 覆盖缺口仍有 2/3 位点无测试（f001 残余），且新增测试含恒真断言（f005）；未解决 blocker 前 FAIL。
- 系统性 follow-up：同 Round 1（并入 t151 测试护城河）；f003 若需闭环可单开 pNNN。

verdict: FAIL

## Round 3 (2026-08-13 00:45 UTC+8)

reviewed_scope: b3226dbd84bab50a

### 前轮 finding 复核

- t150_test_f001 (important, AC-007 无测试)：修不彻底。原 finding 列三处位点，现状：
  - `app_log_storage.ts` schedule_flush .catch：**已真修**。`t150_ac007.test.ts:47-63` 显式注册 `process.on('unhandledRejection')` 监听 + 断言 `get_db_mock` 被调（正向证明 flush 路径执行）+ 断言 `unhandled` 为空。判别力成立：去掉 .catch 后 flush reject 成为 unhandled rejection，`expect(unhandled).toEqual([])` 变红。
  - `service_worker.ts` tabs.get try/catch（B2-M4）：**测试空转（新发现 f006）**，见下。
  - `service_worker.ts` handle_cdp_body_event .catch（B2-M3）：**仍无测试**。t150_ac007.test.ts 与全部既有测试均未触达该路径。
  → 仍 important。
- t150_test_f002 (minor, AC-008 超时/淘汰路径)：遗留，fix_ref 改 p036，p036 内容匹配，合规。
- t150_test_f003 (minor, keepalive 隔离)：遗留，fix_ref 改 p037，p037 已建（`p037_keepalive_test_isolation.md`），合规。Round 2 提示的 fix_ref 格式非法已消除。
- t150_test_f004 (minor, AC-003 挂起用例)：已修，Round 2 已认定可接受，无变化。
- t150_test_f005 (important, 恒真断言)：已真修。`t150_ac007.test.ts:36` 的 `expect(true).toBe(true)` 已删除，替换为 `expect(get_db_mock).toHaveBeenCalled()` + `expect(unhandled).toEqual([])`（:60-62）。

### 改测方向复核

本轮对 `t150_ac007.test.ts` 为纯新增/重写，无改动既有测试；无「迁就实现」的改测。

### 本轮新发现

#### t150_test_f006 - B2-M4 tabs.get 测试空转：handler 在 `if (!is_capturing) return` 提前返回，从未触达 try/catch

- 严重度：important
- 锚点：AC-007 + 危险模式「条件跳过弱化断言（前置不满足时无证据仍 PASS）」
- 位置：`tests/unit/t150_ac007.test.ts:98-119`
- 问题：`is_capturing` 为模块级 `let is_capturing = false`（service_worker.ts:89），onActivated handler 首行 `if (!is_capturing) return;`（:1016）。测试用 `vi.resetModules()` 重新 import service_worker 后，`chrome.storage.local.get` mock 返回 `{}`，`cleanup_stale_capture_state` 读到无 legacy active 状态，`is_capturing` 保持 false。因此 `on_activated_cb({tabId:42, windowId:1})` 在首行即 return，`chrome.tabs.get` 从未被调用，`tabs_get_mock.mockRejectedValue` 从未生效，`logger.warn('Tab get failed...')` 未执行。断言 `resolves.toBeUndefined()` 恒真通过——即使删掉 B2-M4 try/catch 测试仍绿。测试未验证任何 AC-007 行为。
- 建议：测试需先进入 capturing 状态使 handler 越过 `if (!is_capturing)`（如经 start_capture 流程或导出测试钩子置 `is_capturing=true`），并正向断言 `tabs_get_mock` 被调用 + `logger.warn` 被调用；否则删除该用例并明确 B2-M4 位点由 B2-M3 同类方式补测。

#### t150_test_f007 - `sw_load_user_config` 死接线：vi.mock 返回第一个 hoisted `load_user_config`，`sw_load_user_config` 从未生效

- 严重度：minor
- 锚点：测试可信（mock 边界 / 死代码）
- 位置：`tests/unit/t150_ac007.test.ts:67,103`
- 问题：`vi.mock('../../src/shared/user_config', () => ({ load_user_config }))`（:13）引用第一个 hoisted `load_user_config`（:6），而第二 describe 的 `sw_load_user_config`（:67）与 `sw_load_user_config.mockResolvedValue(...)`（:103）从未被任何 `vi.mock` 引用，纯死接线。当前用例因 f006 空转未走 load_user_config 路径所以不炸；若后续修复 f006 使 handler 真正执行并进入调 `load_user_config()` 的分支（service_worker.ts:104/112），该 mock 不会提供实现（依赖跨 describe 的残留实现），将隐性失败。正确做法是 service_worker describe 独立 `vi.mock('../../src/shared/user_config', () => ({ load_user_config: sw_load_user_config }))`。
- 建议：删除 `sw_load_user_config` 死接线，或显式将第二 describe 的 user_config mock 指到 `sw_load_user_config`。

### 本轮 AC 复验披露

- `AC-001` re_verified：同前轮。
- `AC-002` re_verified：同前轮。
- `AC-003` re_verified：同前轮。
- `AC-004` re_verified：同前轮。
- `AC-005` re_verified：同前轮。
- `AC-006` re_verified：同前轮。
- `AC-007`：app_log_storage 位点 re_verified（显式 unhandledRejection 监听 + 正向断言，判别力成立）；B2-M4 位点测试空转（f006），实际未复验；B2-M3 位点仍 trust_prior（无测试）。
- `AC-008` re_verified：同前轮（auth_failed）；超时/淘汰路径 p036。
- coverage = 7 / 8。

### 结论

- 前轮 finding 复核：f001 修不彻底（app_log_storage 真修；B2-M4 空转 f006；B2-M3 仍无测试）；f002/f003 fix_ref 已合规（p036/p037）；f004 已修；f005 已真修。
- 改测方向复核：无「迁就实现」的改测。
- 本轮新发现：2 条（f006 important + f007 minor）。
- 未进表的提示：
  - 沿用前轮（service_worker AC-002 脱敏位点、external_cdp fetch 全局赋值、app_log_storage replica 缺口）。
  - 处置表 f001 已标「已修」，但按 diff 实际为「部分修复」；建议处置表改状态前先补齐 B2-M4/B2-M3 两处。
- 总体判断：AC-007 仍有 2/3 位点未真实验证（B2-M4 空转、B2-M3 无测试），未解决 blocker 前 FAIL。
- 系统性 follow-up：同前轮（并入 t151 测试护城河）。

verdict: FAIL

## Round 4 (2026-08-13 00:52 UTC+8)

reviewed_scope: b3226dbd84bab50a

### 前轮 finding 复核

- t150_test_f001 (important, AC-007)：三处位点逐一核：
  - `app_log_storage.ts` schedule_flush .catch：真修，判别力成立（显式 unhandledRejection 监听 + `get_db_mock` 正向断言，删 .catch 即红）。
  - `service_worker.ts` tabs.get（B2-M4）：真修。现先经 `on_message_cb` 发 `start`（t150_ac007.test.ts:115）使 `is_capturing=true`（service_worker.ts:491），断言 `start_res.success===true` 作门控；`tabs_get_mock.mockRejectedValue` 在 start 之后设置（:119）；`on_activated_cb` 越过 `if (!is_capturing)` 守卫（:1016）后 `chrome.tabs.get` reject 被 try/catch 捕获。判别力：start 流程只用 `tabs.query` 不调 `tabs.get`（:444），故 `expect(tabs_get_mock).toHaveBeenCalled()`（:125）为 onActivated 触达 tabs.get 的正向证据；去 try/catch 则 handler promise reject，`await expect(...).resolves.toBeUndefined()`（:123）变红。start 成功性由 :116 自证（若 start 失败该行即红）。两 describe 隔离正确：create_capture/update_capture/write_events 走 storage.ts 内部真实 `get_db`（fake-indexeddb），app_log_storage 走被 mock 的 `get_db`（reject），互不干扰。
  - `service_worker.ts` handle_cdp_body_event（B2-M3）：仍无测试，登记 p038（`p038_cdp_body_event_catch_test.md`，需 CDP 事件流模拟，注明留待集成/网络事件测试补）。AC-007 不再「整条无测试」，且既有测试判别力真实；B2-M3 为同模式第三处位点，属「可再加 case」性质 → 按 minor 处置，p038 追踪合规。
  → f001 降级解除（原有 important 基于「整条 AC 无测试」，现已不成立）。
- t150_test_f002 (minor)：遗留 p036 合规，无变化。
- t150_test_f003 (minor)：遗留 p037 合规，无变化。
- t150_test_f004 (minor)：已修，无变化。
- t150_test_f005 (important, 恒真断言)：真修。`expect(true).toBe(true)` 已删，改显式 `process.on('unhandledRejection')` 监听 + `expect(get_db_mock).toHaveBeenCalled()` + `expect(unhandled).toEqual([])`（:60-62），判别力成立。
- t150_test_f006 (important, B2-M4 空转)：真修。见 f001-B2-M4 复核；start 门控 + tabs_get_mock 正向断言消除空转。
- t150_test_f007 (minor, sw_load_user_config 死接线)：功能上已修——beforeEach 改顶层 `load_user_config`（:105，被 :13 vi.mock 正确 mock），`on_message_cb` 捕获（:69/:83）。但 :67 `const sw_load_user_config = vi.hoisted(...)` 声明残留，全文无引用，纯死代码；当前无害，若后续扩用该 describe 的 user_config 分支需清理。

### 改测方向复核

本轮 t150_ac007.test.ts 为纯新增/重写，未改动既有测试；无「迁就实现」的改测。

### 本轮新发现

无 blocking 新发现。

### 本轮 AC 复验披露

- `AC-001` re_verified：同前轮。
- `AC-002` re_verified：同前轮。
- `AC-003` re_verified：同前轮。
- `AC-004` re_verified：同前轮。
- `AC-005` re_verified：同前轮。
- `AC-006` re_verified：同前轮。
- `AC-007` re_verified：app_log_storage schedule_flush 与 service_worker tabs.get 两处位点经显式监听 + 正向断言真复验（判别力已逐一核证）；handle_cdp_body_event 位点 trust_prior（登记 p038，留待集成测试）。
- `AC-008` re_verified：同前轮（auth_failed）；超时/淘汰路径 p036。
- coverage = 8 / 8（AC 级）；AC-007 位点级 2/3 真复验，B2-M3 经 p038 追踪。

### 结论

- 前轮 finding 复核：f001 降级解除（2/3 位点真修，B2-M3 残留 p038 minor）；f002/f003 合规；f004/f005/f006 已修；f007 功能已修、死声明残留（minor）。
- 改测方向复核：无「迁就实现」的改测。
- 本轮新发现：0 条 blocking；0 条新 finding。
- 未进表的提示：
  - **处置表 f001 重复**：`task.md` 处置表 Round 1 与 Round 2 段各有一行 `t150_test_f001`，导致 `check_review_status.py` 报「finding_id 重复：t150_test_f001」无法运行。需将 Round 1 的 f001 行删除或改状态后仅保留一行（更新 rationale 指向 p038）。
  - 处置表轮次标注错位：f005/f006/f007 修复记在「Round 2 (00:50)」段，但其对应 finding 出现在我的 Round 2/3 报告；不影响内容，仅标注顺序略乱。
  - `sw_load_user_config`（t150_ac007.test.ts:67）死声明残留，见 f007 复核。
  - 沿用前轮（service_worker AC-002 脱敏位点、external_cdp fetch 全局赋值、app_log_storage replica 缺口）。
- 总体判断：AC-007 三处位点两处真修且判别力成立，第三处经 p038 登记追踪；无未解决 critical/important，仅 minor（死声明、B2-M3 扩展、处置表格式）。PASS。
- 系统性 follow-up：同前轮（并入 t151 测试护城河；B2-M3 位点并入 p038）。

verdict: PASS
