# Task review t140（reviewer_focus: 测试）

- task：`t140_agent_query_cursor_paging`
- spec：`docs/tasks/t140_agent_query_cursor_paging/spec.md`
- diff_anchor：`7daf059d0b98bd82ca5ff1dfe0a43a18d512303f`
- target：`git diff 7daf059d0b98bd82ca5ff1dfe0a43a18d512303f`
- round：1
- reviewed_at：2026-08-12 18:54 UTC+8

## Findings

### t140_test_f001 - AC-005 测试为源码字符串断言，未验证任何运行行为（假绿）

- 严重度：critical
- 锚点：AC-005
- 位置：`tests/unit/t140_resource_budget.test.ts:43-53`
- 问题：AC-005 唯一测试读取 `src/extension/background/agent_bridge_client.ts` 源码文本，slice 出 `async function send_result` 与 `function is_active_lifecycle` 之间的代码块，断言其中包含三个子串（`MAX_EXTENSION_RESULT_BODY_BYTES`、`"code: 'PAYLOAD_TOO_LARGE'"`、`"new TextEncoder().encode(json).length"`）。断言对象是源码文本而非运行行为：不构造超大结果、不调用 `send_result`、不断言实际 POST 到 `/extension/result` 的 body 是 PAYLOAD_TOO_LARGE 错误、不断言超限 body 未被发送。具体假绿场景：若生产预检比较符反转（`>` 误写为 `<`），三处标记子串仍在，测试通过，但超大结果会原样发送（bridge 413 拒收、4xx 不重试、最终超时）。spec 可测试性声明明确「AC-005: 模拟超大结果断言 PAYLOAD_TOO_LARGE」，未交付。该路径**可行为化**：`tests/unit/agent_bridge_client.test.ts` 既有基建已拦截 `/extension/result` POST 并解析 body（见 `fetches command, dispatches, and posts result` 用例），可驱动 `capture.stop` 命令令 `stop_capture` 依赖返回含 >64MiB 大字符串的结果，断言 POST body 解析后 `error.code === 'PAYLOAD_TOO_LARGE'` 且不含大负载。
- 建议：删除源码字符串断言，改写为 `agent_bridge_client.test.ts` 内的行为用例（mock `stop_capture` 返回超大结果，断言 `/extension/result` 请求体为 PAYLOAD_TOO_LARGE 错误对象、command_id 保留、大负载未入 body）。需要时先补一个 `dispatch` 结果构造入口，不必 export `send_result`。

### t140_test_f002 - AC-001/002/004 cursor 分页无行为级测试

- 严重度：important
- 锚点：AC-001 / AC-002 / AC-004
- 位置：`src/extension/background/storage.ts:448-470`（`query_by_store` 由 getAll+slice 改为 cursor 分页），新增测试未触达
- 问题：`query_by_store` 是本 task 核心改动（H-6：分页 O(n²) → 按需读取），但行为层零覆盖。逐项核对既有测试：
  - `tests/unit/t140_resource_budget.test.ts` 只测 body 预算与 64MiB，未碰分页。
  - `tests/unit/storage_helpers.test.ts:107-185` 只查函数签名（`.length`）与 store 名常量，其注释自认「mock IDB 集成测试」未真正驱动 cursor，等价空断言。
  - `tests/unit/storage_limit_active_delete.test.ts` 用 `fake-indexeddb` + 真实 `init_db`/`get_events_by_category` 走新 cursor 路径，但写入仅几条事件、恒 `offset=0` 默认 limit，不覆盖 offset 跳过、limit 截断、边界页。
  - `tests/unit/agent_data_queries.test.ts` 整体 `vi.mock` storage 层，只断言 PAGE_SIZE 5000 循环把 offset/limit 传给 storage（覆盖的是调用方循环语义，非 cursor 实现）。
  - spec 可测试性声明的「新增分页边界用例」与「AC-004: mock 断言无 getAll 全量调用」均未交付；全仓无任何测试断言 `openCursor` 被调用 / `getAll` 不被调用。
- 建议：在 `storage_limit_active_delete.test.ts`（已有 fake-indexeddb + 真实查询基建）补行为用例：写入 N 条事件后，用 `(offset, limit)` 组合断言返回记录子集（含 offset>0、limit 截断、limit>N、offset≥N 空页）；AC-004 用 spy 断言 `index.openCursor` 被调用且 `getAll` 未调用。

### t140_test_f003 - CDP body 记账-淘汰集成路径无断言

- 严重度：minor
- 锚点：AC-009（覆盖可更广，非阻断）
- 位置：`src/bridge/cdp_handler.ts:386-387`（getResponseBody 回写时 `body_bytes += Math.min(bytes.length, session.max_body_bytes)` + `enforce_body_budget(session)`）、`:70`（`push_bounded` 事件淘汰扣减 body_bytes）
- 问题：t140 测试直接调用 `_enforce_body_budget_for_test` 并手工维护 `body_bytes`，触达的是 `enforce_body_budget` 单函数，未覆盖生产记账链路（写入累加口径 `Math.min(bytes.length, max_body_bytes)`、事件数淘汰对 body_bytes 的扣减）。若记账与淘汰减量口径不一致，AC-009「不无限累积」全链路会静默失衡，现有测试发现不了。既有 `cdp_response_body_config.test.ts` 经 network_capture 真实驱动 body 回写，但只断言 `getResponseBody` 被调用，不查预算行为。
- 建议：可经 network_capture 路径（`mock_chrome_debugger.set_command_response` 注入大 body + `_set_max_session_body_bytes_for_test` 设小预算）断言超限后 poll 出的 events 被淘汰、预算内全保留。

## 结论

- 前轮 finding 复核（Round 1 无）：无
- 改测方向复核：无。diff 未修改任何既有测试文件（`git status` 仅 4 个 src 文件 + task.md 改动 + 新增 t140 测试），不存在「把旧测试预期改成新实现输出」的迁就实现式改测。
- 本轮新发现：3 条（f001 critical、f002 important、f003 minor）
- 未进表的提示：
  - 代码层观察（属 code reviewer 职责，仅提示）：`push_bounded` 由 `splice(0, length-max)` 一次清到上限改为 `shift()` 一次只移 1 条。生产逐条 push 场景等价，但若 `_set_max_session_events_for_test` 下调上限后批量累积，单次调用仅移 1 条、剩余超额残留下次再移。既有 `cdp_session_idle_bounds.test.ts` 未覆盖该差异。
  - 64MiB 阈值常量 `MAX_EXTENSION_RESULT_BODY_BYTES` 与 bridge server 端 413 上限的一致性未在测试中核对（跨服务契约，schemas 层面）。
- AC 复验披露：
  - AC-001：未覆盖（f002，无行为测试）
  - AC-002：未覆盖（f002，无分页边界测试）
  - AC-003：re_verified（`storage_limit_active_delete.test.ts` 真实 fake-indexeddb 经新 cursor 路径断言记录返回；仅小数据量 offset=0 基础检索，非边界页）
  - AC-004：未覆盖（f002，无「无 getAll 全量」断言）
  - AC-005：未行为化（f001，仅源码字符串断言）
  - AC-006：trust_prior（「既有测试保持通过」，reviewer 未运行测试，依赖实施侧运行证据）
  - AC-007：trust_prior（同上）
  - AC-008：trust_prior（同上）
  - AC-009：re_verified（t140 测试直接调用生产 `enforce_body_budget`，超预算淘汰/最新保留断言行为真实）
  - AC-010：re_verified（t140 测试预算内全保留断言行为真实）
  - AC-011：trust_prior（既有 cdp 测试未改动，依赖实施侧运行证据）
  - coverage = 3 / 11
  - trust_prior 占比 4/11（36%）> 30%，建议合并前人工抽查 trust_prior 项（AC-006/007/008/011 既有测试是否仍通过）。
- 总体判断：AC-005 唯一证据为源码字符串断言（假绿）、cursor 分页核心改动零行为覆盖，两处 blocking finding 未解决，FAIL。
- 系统性 follow-up：无

reviewed_scope: 09fa4f2a6c1f8ca1

verdict: FAIL

## Round 2 (2026-08-12 19:05 UTC+8)

- reviewed_at：2026-08-12 19:05 UTC+8
- 复核 diff：`git diff 7daf059d0b98bd82ca5ff1dfe0a43a18d512303f`（当前工作区，含新增 `tests/unit/t140_resource_budget.test.ts` 重写）

### 前轮 finding 复核

- **t140_test_f001 (critical) 已消除**：`tests/unit/t140_resource_budget.test.ts:93-141` AC-005 已改为行为测试。mock `dispatch_agent_command` 返回 `>64MiB` 结果，经 `start_bridge_client` 真实轮询链路（heartbeat → fetch_command → dispatch → send_result）投递，fetch spy 捕获实际 POST `/extension/result` body，断言 `parsed.ok===false`、`parsed.error.code==='PAYLOAD_TOO_LARGE'`、`command_id==='cmd_big'`。若预检比较符反转导致超大 body 原样发送，`parsed.ok` 会是 `true`，断言失败——正是 f001 指出的假绿场景。mock 边界正确：仅 mock 网络（fetch）与命令 handler（dispatch，系统边界），未 mock `send_result` 被测逻辑。源码字符串断言已删除。
- **t140_test_f002 (important) 已消除**：AC-002 行为测试（`:165-197`）用 fake-indexeddb 真实写入 12 条事件，`get_events_by_category` 三页 `(0,5)/(5,5)/(10,5)` 断言 `5/5/2`、合并去重 12 条不丢不重，触达 `query_by_store` cursor 生产路径。AC-004（`:199-214`）真实查询返回 1 条 + 源码断言 `index.openCursor` 存在、`index.getAll(` 不存在——与 spec 可测试性声明「AC-004: mock 断言无 getAll 全量调用」口径一致，且已有行为测试兜底，不再单靠源码字符串。
- **t140_test_f003 (minor) 仍存在（未修）**：body 预算测试（`:49-71`）与 Round 1 完全相同——仍手工维护 `body_bytes`、直接调 `_enforce_body_budget_for_test`。生产记账两行未触达：getResponseBody 回写累加 `session.body_bytes += Math.min(bytes.length, session.max_body_bytes)`（`cdp_handler.ts:386`）与事件数淘汰对 body_bytes 的扣减（`cdp_handler.ts:70` push_bounded）。implementer 声称「覆盖生产记账」与代码不符；实际只覆盖了 `enforce_body_budget` 生产函数自身的减量分支。minor，不阻断 PASS。

### 改测方向复核

无。diff 未修改任何既有测试文件，不存在「把旧测试预期改成新实现输出」的迁就实现式改测；新增测试均为正向覆盖。

### 本轮新发现

0 条 blocking。范围外观察见下节。

### 未进表的提示

- `tests/unit/t140_resource_budget.test.ts:78` 调 `set_bridge_session_for_tests({instance_id, instance_token})` 传对象，而签名是 `(token: string | null)`（`agent_bridge_client.ts:24`）。tsconfig exclude 了 `tests/`，tsc 不覆盖测试；运行时 `session_token` 被赋对象，仅用于 `Authorization` header 字符串插值，故测试成立。该模式继承自既有 `agent_bridge_client.test.ts:130`，非本 task 引入的回归；若后续要收紧可考虑签名放宽为 `{instance_id, instance_token} | null`。
- AC-005 测试构造 64MiB+1 字符串 + `JSON.stringify` + `TextEncoder`，峰值内存约 200MB，Node 测试进程可承受。
- f003 若采纳建议（经 network_capture 真实驱动 body 回写 + 小预算断言淘汰），需 `mock_chrome_debugger.set_command_response` 注入大 body，可作为后续覆盖扩展。

### AC 复验披露（Round 2）

- AC-001/002/004：re_verified——逐一核对 `t140_resource_budget.test.ts:165-214` 分页测试（fake-indexeddb 真实写入/查询、跨页不丢不重、无 getAll 源码断言）。
- AC-005：re_verified——核对 `:93-141` 行为测试驱动真实轮询链路并断言 POST body 为 PAYLOAD_TOO_LARGE。
- AC-003：re_verified——`storage_limit_active_delete.test.ts` 真实 fake-indexeddb 经新 cursor 路径断言基础检索（非边界页）。
- AC-009/010：re_verified——`:49-71` 触达生产 `enforce_body_budget` 超预算淘汰/预算内保留（未覆盖记账接线，见 f003）。
- AC-006/007/008/011：trust_prior——「既有测试保持通过」，reviewer 只读未运行测试，依赖实施侧「全量 passed」运行证据。
- coverage = 9 / 11
- trust_prior 占比 4/11（36%）> 30%，建议合并前人工抽查 trust_prior 项（AC-006/007/008/011 既有测试是否仍通过）。

### 总体判断

f001/f002 两个 blocking finding 均已用行为级测试真修（已逐一核对测试代码路径），f003 minor 仍在但不阻断；无未解决 critical/important，PASS。

### 系统性 follow-up

无

reviewed_scope: d4426010597afff0

verdict: PASS

### Round 2 补充复核 (2026-08-12 19:18 UTC+8)

implementer 后续处置核实：

- **指纹复核**：按 `check_review_status.py` 同口径重算当前 diff（`git diff --binary 7daf059d0b98bd82ca5ff1dfe0a43a18d512303f` + 同 exclude 列表）指纹为 `d4426010597afff0`，与本小节已写 `reviewed_scope` 一致，**无需变更**。src 4 文件 diff 与 Round 2 复核时相同（未变）；`git diff --stat` 的 insertions 差异全部落在 `task.md`（指纹排除项）。
- **处置表 f001 重复**：已清。`task.md:61` 仅存一条 `t140_test_f001|critical|已修`（描述为 64MiB 行为级），原 `:54` 误挂 f001 的 body 预算行已移除。`check_review_status.py` 不再报 finding_id 重复，输出 `overall=PASS, review_scope=ok, round=2`。
- **f003 判遗留登记 p034**：合规。`task.md:63` `t140_test_f003|minor|遗留|...登记 p034`，fix_ref 指向 `docs/pending/todo/p034_cdp_body_budget_integration_test.md`（存在，内容含来源、内容、处理=未开）。f003 为 minor，按提示词「critical/important 遗留仍阻断，minor 遗留不阻断」，遗留登记不阻断 PASS。
- **测试文件**：与 Round 2 复核时逐行一致（f001 行为测试 `:93-141`、f002 分页测试 `:165-197`、f003 单测 `:49-71`），无新增假绿/弱化/跳过。
- **结论**：verdict 保持 PASS。blocking finding（f001/f002）已行为级真修，f003 minor 遗留登记合规。
