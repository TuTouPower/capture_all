# Task review t140（reviewer_focus: 代码）

- task：`t140_agent_query_cursor_paging`
- spec：`docs/tasks/t140_agent_query_cursor_paging/spec.md`
- diff_anchor：`7daf059d0b98bd82ca5ff1dfe0a43a18d512303f`
- target：`git diff 7daf059d0b98bd82ca5ff1dfe0a43a18d512303f`
- round：1
- reviewed_at：2026-08-12 18:40 UTC+8

reviewed_scope: 09fa4f2a6c1f8ca1

## Findings

### t140_code_f001 - `Buffer` 在 Chrome MV3 service worker 运行时未定义，`send_result` 全部投递路径抛 ReferenceError

- 严重度：critical
- 锚点：AC-007（正常大小结果行为不变）、AC-008（既有 agent 查询/投递不回退）被破坏
- 位置：`src/extension/background/agent_bridge_client.ts:326`
- 问题：扩展后台是 Chrome MV3 module service worker（`src/extension/manifest.json` `"background": {"service_worker": "...", "type": "module"}`）。Chrome service worker 运行环境没有 Node 全局 `Buffer`。本行 `Buffer.byteLength(json, 'utf-8')` 是**无条件先求值**（在体积比较之前），每次 `send_result` 调用都会抛 `ReferenceError: Buffer is not defined`。证据：
  1. `src/extension/` 全目录仅此一行使用 `Buffer`；`src/extension/background/storage.ts:415-421` 的 `json_byte_length` 刻意用 `TextEncoder` 计字节并注释"替代 JSON.stringify().length 的字符数口径"，说明代码库约定扩展侧不用 Node 全局。
  2. `vite.config.ts` 无 `buffer` polyfill / `resolve.alias`；`@crxjs/vite-plugin` 不注入 Buffer；全仓无 `import { Buffer } from 'buffer'`。
  3. 单测环境 `vitest.config.ts` `environment: 'node'`，Node 有 `Buffer`，故单测掩盖此缺陷——正好对应 `tests/unit/t140_resource_budget.test.ts:47` 的源码字符串断言锁定 `Buffer.byteLength(json, 'utf-8')`，把缺陷当成验收证据。
  - 失败场景：agent bridge 启用后，任何命令结果（正常大小或超限）投递 `POST /extension/result` 前第一行抛错；`send_result_with_retry` 重试 3 次仍失败（ReferenceError 非 BridgeHttpError，不满足 4xx 快退），最终被 `poll_cycle` 吞为日志 → bridge 侧 `pending.result` 不 resolve → MCP 调用方全部 `COMMAND_TIMEOUT`。即 64MiB 预检（AC-005）在真实运行时**根本执行不到**，且既有正常投递（AC-007/008）整体失效。
- 建议：改用 `new TextEncoder().encode(json).length`（与 `storage.ts:json_byte_length` 一致），或显式 `import { Buffer } from 'buffer'` 并配置打包 polyfill（侵入更大，不推荐）。

### t140_code_f002 - CDP `body_bytes` 预算恒为 0 从不计实际响应体，AC-009 未实现

- 严重度：critical
- 锚点：AC-009（bridge CDP 会话 body 总字节有上限，超限按既定策略不无限累积）
- 位置：`src/bridge/cdp_handler.ts:66-82`（push_bounded）配合 `src/bridge/cdp_handler.ts:355-387`（getResponseBody 回写）
- 问题：真实调用路径里响应体是 push 之后才挂上去的，`body_bytes` 记账全程没有入口：
  1. 两处 `push_bounded` 调用点（`cdp_handler.ts:267-288`、`304-325`）构造的事件 `response_body: null`、`response_body_status: 'pending'`。push 时 `event_bytes = 0`，`body_bytes += 0`。
  2. 响应体在 `Network.getResponseBody` 的 CDP 返回里回写（`cdp_handler.ts:369-377`）`waiting_event.response_body = body`，直接改已入数组的事件对象，**不更新 `session.body_bytes`**。
  3. `git grep body_bytes` 确认仅 `push_bounded` 内增减（`:72-77`）与初始化（`:208`）。因此 `session.body_bytes` 恒为 0，`body_bytes > _max_session_body_bytes`（200MB）永不触发，仅事件数上限（5000）仍在起作用——最坏 5000×100MB=500GB 响应体累积场景（H-20 目标）原样保留。
  - 测试 `tests/unit/t140_resource_budget.test.ts:18-36` 直接以预填 `response_body` 的假事件调 `_push_bounded_for_test`，绕过真实回写路径，故测试通过但生产无效。
- 建议：在 getResponseBody 回写响应体处同步更新 `session.body_bytes` 并按预算淘汰最旧（复用同一 while 收敛逻辑），或把响应体填充收敛进 `push_bounded` 使记账与淘汰共走一条路径。

### t140_code_f003 - `send_result` 超限分支整段重复 fetch 投递逻辑

- 严重度：minor
- 锚点：代码质量（DRY）
- 位置：`src/extension/background/agent_bridge_client.ts:334-345` 与 `:347-357`
- 问题：超限改写分支与正常路径各写一遍相同的 `fetch(${url}/extension/result)` + header 构造 + `if (!response.ok) throw`（约 12 行 verbatim 重复）。两处 header/错误处理一致，暂无行为分叉，但同一投递语义维护两份，后续改 header 或错误处理易漏一处。
- 建议：抽 `post_result(url, token, body)` 私有函数，超限分支与正常分支共用；超限分支只负责构造 `oversized` 结果后调用之。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（本轮为 Round 1）
- 本轮新发现：3 条（f001 critical / f002 critical / f003 minor）
- 未进表的提示：
  - **文件过大**（已达阈值 400 且本 task 净增行数，按降级规则只在此列出）：`src/bridge/cdp_handler.ts` 462 行、`src/extension/background/storage.ts` 532 行、`src/extension/background/agent_bridge_client.ts` 410 行。均未达 800 的重要阈值，且膨胀非本 task 引入（本 task 各净增 20-30 行），未见因膨胀引发的可观测缺陷，不进 finding 表。
  - **复杂度**：无函数 CC ≥ 10（push_bounded 手算约 9，send_result/query_by_store 均 <5），不进表。
  - **范围外观察**：
    1. `tests/unit/t140_resource_budget.test.ts` 为**未跟踪文件**（git status `??`），不在 diff_anchor 覆盖内，实施收尾需 `git add` 提交；该测试 AC-005 用源码字符串断言（`readFileSync` + `toContain`），AC-009 用绕过真实调用路径的假事件，属测试层 anti-pattern，交 test reviewer。
    2. AC-006 大结果文件回退：`server.ts:527-542` 对 `FULL_DATA_COMMANDS` 在结果 >1MiB 时写文件。该回退只对 ≤64MiB 结果可达（>64MiB 本就被 `server.ts:475-478` 的 64MiB read 上限 413），t140 扩展侧预检与 bridge 侧上限同常量同语义，未引入新回归。
    3. cursor 分页聚合时间复杂度：`fetch_all`（`agent_data_queries.ts:55-68`）每页仍从头走 cursor，聚合为 O(n²/PAGE_SIZE)（10 万事件约 100 万次 cursor 前进）。内存层面已消除每页整载（AC-001/004 满足），但时间非线性仍存；IDB 无原生 skip，keyset 分页可降到 O(n)，作为后续可选优化，不构成 AC 违反。
    4. `push_bounded` 的 `events.length > 1` 守卫使单条超预算 body 不被淘汰（body_bytes 可短暂超预算），但生产单条 body ≤ MAX_BODY_CAPTURE_BYTES(100MB) < 预算(200MB)，不可达，属防御性正确。
- **AC 复验方式**：
  - AC-001 re_verified：`storage.ts:454-468` query_by_store 改用 `index.openCursor`，查询路径不再 getAll 全量（grep 确认 storage.ts 无 getAll）。
  - AC-002 re_verified：cursor skip/limit 语义逐一核对——offset=0/limit=0 立即空返、offset 超总数走到 cursor null、limit 超剩余全取、index 前进顺序与 getAll 一致；`fetch_all` PAGE_SIZE=5000 循环兼容（`out.length >= limit` 收敛）。
  - AC-003 re_verified：openCursor 与 getAll 同按 (capture_id 索引 key, 主键) 升序，返回记录集一致。
  - AC-004 re_verified：查询调用链无 getAll 全量（仅 openCursor），无整载路径。
  - AC-005 re_verified：实现存在（改写 PAYLOAD_TOO_LARGE），但 f001 致其生产不可达 → AC 未满足。
  - AC-006 re_verified：≤64MiB 大结果文件回退路径仍可达（server.ts:527-542）；>64MiB 本被 413，无回归。
  - AC-007 re_verified：正常大小投递被 f001 破坏 → AC 未满足。
  - AC-008 re_verified：既有投递路径被 f001 破坏 → AC 未满足。
  - AC-009 re_verified：body_bytes 恒 0，预算不触发（f002）→ AC 未满足。
  - AC-010 re_verified：预算阈值内不淘汰逻辑正确（仅在超限时进 while），正常流量保留完整。
  - AC-011 re_verified：事件数淘汰 while 收敛到 `_max_session_events`，与旧 splice 语义一致，`cdp_session_idle_bounds.test.ts` 断言 `> 0` 仍成立。
  - coverage = 11 / 11
- 总体判断：两处 critical 未解决——扩展侧 Buffer 缺陷使整个 agent 结果投递在真实 MV3 运行时失效，bridge 侧 body 字节预算为 no-op 未实现 AC-009。
- 系统性 follow-up：无（本 task 范围内）

verdict: FAIL

## Round 2 (2026-08-12 18:55 UTC+8)

reviewed_scope: d4426010597afff0

### 前轮 finding 复核（以当前 diff 与代码为准）

|finding|Round 1 severity|复核结论|证据|
|------|------|------|------|
|t140_code_f001|critical|已消除|`agent_bridge_client.ts:327` 改 `new TextEncoder().encode(json).length`；`git grep Buffer src/extension/` 已无 Node Buffer 依赖（`stream_buffer.ts` 是业务命名非 Node 全局）。MV3 SW 运行时可用。|
|t140_code_f002|critical|已消除|`cdp_handler.ts:386-387` 在 getResponseBody 真实回写后 `session.body_bytes += ...; enforce_body_budget(session)`；`body_bytes` 于 `handle_cdp_start` 初始化 0（当前 `:213`）。记账落在 body 实际入事件处，真实路径生效。|
|t140_code_f003|minor|已消除|`send_result` 重构为单一 fetch，超限/正常统一走 `payload` 变量与同一投递路径。|

### 本轮新发现

### t140_code_f004 - too_large body 记账口径不一致：增量按截断前全长、淘汰减量按截断后存储长，body_bytes 永久泄漏

- 严重度：minor（**已修，本小节复核确认消除**）
- 锚点：AC-009 预算生效但记账口径偏保守；无直接 AC 违反
- 位置：`src/bridge/cdp_handler.ts:386`（增量）+ `:71` `:84`（减量）
- 问题：增量 `session.body_bytes += bytes.length` 用**截断前完整 body 字节长**；淘汰减量（push_bounded `:71`、enforce_body_budget `:84`）用 `Buffer.byteLength(removed.response_body)`，即**截断后存储长**。单条 body 超 `max_body_bytes`（too_large、截断存储）时两者不等：该事件写入时多计 (full − stored)，被淘汰时只回减 stored，差值永久残留在 `body_bytes`。场景：budget 200MB、max_body_bytes 100MB，一条 150MB body（截断存 100MB）写入 → body_bytes +150MB；随后一条 60MB 正常 body 写入 → 总 210MB > 200MB → 淘汰 150MB 事件回减 100MB → body_bytes 仍 110MB，但实际保留仅 60MB。泄漏 50MB，且 60MB 事件被过度逐出。方向保守（只会多逐出、不会无界累积），AC-009 受限增长约束仍成立；AC-010 常规流量（body ≤ max_body_bytes、无截断）增量=减量，不受影响。
- 修复核实：`cdp_handler.ts:386` 现为 `session.body_bytes += Math.min(bytes.length, session.max_body_bytes);`，增量按截断后实际存储长记账，与淘汰减量口径一致；too_large 截断场景泄漏消除。
- 建议（原）：增量改 `session.body_bytes += Math.min(bytes.length, session.max_body_bytes)`（= 实际保留长），与减量同口径；或把 too_large 完整长度随事件留存供减量对齐。

### t140_code_f005 - 死导出 `_push_bounded_for_test`

- 严重度：minor（**已修，本小节复核确认消除**）
- 锚点：代码质量（死代码）
- 位置：`src/bridge/cdp_handler.ts`（原 `:65`）
- 问题：测试改写后仅 `_enforce_body_budget_for_test` 被 `t140_resource_budget.test.ts` 引用，`_push_bounded_for_test` 全仓无使用点（grep 仅定义处）。保留属未用导出。
- 修复核实：当前 diff 中 `_push_bounded_for_test` 导出已删除，仅保留 `_enforce_body_budget_for_test`（`:78`）；测试 `t140_resource_budget.test.ts` 仅引用后者，`push_bounded` 本体仍为生产调用（`:273` `:310`）。

### 复核更新（Round 2 收尾，2026-08-12 19:10 UTC+8）

- f004 / f005 均已按建议修复并复核：源码 diff 证实（`Math.min` 增量、死导出删除），相关测试与 tsc 重跑通过。
- f003 / p034 澄清：`p034`（`docs/pending/todo/p034_cdp_body_budget_integration_test.md`）对应 **t140_test_f003**（test reviewer 的遗留：body 预算生产记账链路集成测试未补，登记 pending）。code 轴 f003（send_result 重复 fetch）在 Round 1 处置表已标「已修」，当前代码确为单一 fetch 重构态，code 轴无遗留。
- 处置表现状（Round 1 + Round 2）：code 轴 f001/f002/f003/f004/f005 全部「已修」；test 轴由 test reviewer 报告（`review_test.md`，含 f001/f002 已修、f003 遗留登记 p034）。

### 复验命令

- `npx vitest run tests/unit/t140_resource_budget.test.ts tests/unit/cdp_session_idle_bounds.test.ts tests/unit/bridge_cdp_events.test.ts tests/unit/agent_bridge_client.test.ts tests/unit/agent_data_queries.test.ts` → 5 files / 47 tests passed
- `npx tsc --noEmit` → exit 0

### AC 复验披露

- AC-001 re_verified：cursor 分页逻辑本轮未再触及（Round 1 已核，无 getAll 全量）。
- AC-002 re_verified：同上。
- AC-003 re_verified：同上。
- AC-004 re_verified：同上。
- AC-005 re_verified：超限改写为 PAYLOAD_TOO_LARGE 且用 TextEncoder 估算，生产不可达问题（f001）已消除。证据：`agent_bridge_client.ts:326-335`。
- AC-006 re_verified：≤64MiB 文件回退路径仍可达（server.ts:527-542）。
- AC-007 re_verified：正常结果单 fetch 路径无 Buffer 依赖，MV3 SW 可用。
- AC-008 re_verified：投递路径修复，既有 agent 相关测试保持通过。
- AC-009 re_verified：enforce_body_budget 在真实 body 回写处调用（f002 修复），增量已按存储长记账（f004 修复），预算受限增长且口径一致。
- AC-010 re_verified：预算内精确记账、不淘汰。
- AC-011 re_verified：cdp_session_idle_bounds、bridge_cdp_events 等既有 cdp 测试通过。
- coverage = 11 / 11

### 未进表的提示

- 文件过大 / 复杂度：同 Round 1，各文件未再显著增长，无新增触发。
- T101 事件数淘汰由 splice 改单次 shift：生产 max 为常量且每次 push 后长度回落，收敛性成立；仅测试钩子把 max 降至当前长度以下时不收敛，属测试态场景、生产不可达，未出 finding。

### 总体判断

code 轴全部 finding 已处置并经复核：f001/f002/f003（Round 1）与 f004/f005（Round 2）均已修。test 轴由 test reviewer 负责（`review_test.md`：f001/f002 已修、f003 遗留登记 p034）。code 轴无未解决 critical/important，无遗留。

verdict: PASS
