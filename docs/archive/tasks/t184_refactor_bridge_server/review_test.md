# Task review t184（reviewer_focus: 测试）

- task：`t184_refactor_bridge_server`
- spec：`docs/tasks/t184_refactor_bridge_server/spec.md`
- diff_anchor：`0375202077e2b59ad857ab5b287a8240ce5db84f`
- target：`git diff 0375202077e2b59ad857ab5b287a8240ce5db84f`
- round：1
- reviewed_at：2026-08-13 22:50 UTC+8

## Findings

### t184_test_f001 - 「remove_instance 为唯一删除路径」用例标题失实 + 结构断言弱

- 严重度：minor
- 锚点：AC-002（结构型 AC 的测试实现质量）
- 位置：`tests/unit/bridge_registry_refactor.test.ts:66-71`
- 问题：
  1. 测试标题括注「（sweep/replace/cancel_all 均复用）」与实现不符：`BridgeRegistry.cancel_all`（`src/bridge/registry.ts:227-234`）直接 `queues.clear()` / `instances.clear()` / `command_owners.clear()`，并不经 `remove_instance`（与旧 close 路径同语义，全量清空，非单实例删除路径）。标题会误导读者以为 cancel_all 也复用 remove_instance。
  2. `replace_instance_by_label[\s\S]*remove_instance\(id\)` 与 `sweep_expired[\s\S]*remove_instance\(id\)` 为贪婪跨段正则，只能证明「该函数名之后某处存在 `remove_instance(id)` 调用」，不能绑定调用关系。当前文件中两处匹配恰好落在真实调用点（registry.ts:93、125），断言此刻成立；但若未来任一后置无关函数（如 build_status）加入 `this.remove_instance(id)` 调用，两断言仍通过，无法继续证明「唯一删除路径」。
  3. 「唯一删除路径」的否定侧（registry 内无散落的 `instances.delete` 绕过 remove_instance）未断言。
- 建议：将 replace/sweep 的复用断言收窄到方法体区间（split 到下一方法声明），或直接断言方法体含 `this.remove_instance(id)`；标题去掉 cancel_all 或改为「sweep/replace 复用 remove_instance」。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（首轮）
- 改测方向复核：`tests/unit/mcp_schema_boundaries.test.ts:90-99` 的修改为跟随迁移的合法路径更新——resolve_target 随 BridgeRegistry 移至 `src/bridge/registry.ts`（独立函数 → 类方法），断言本体（`TARGET_REQUIRED` 存在、`TARGET_AMBIGUOUS` 位于 `matches.length > 1` 之后）逐字未变，仅更新读取路径与 split 锚点（`function resolve_target` → `resolve_target(payload`）。非「迁就实现」改测。无其他既有测试被修改或删除（diff 中仅此一处）。
- 本轮新发现：1 条（t184_test_f001，minor）
- 未进表的提示：
  - cancel_spy（test.ts:33-35）为 spy 而非 mock——wrap 原 `cancel_all` 后仍调用原实现，行为未被替换，不达危险模式；断言 `queues.has('inst_a')` 为假已证删除，spy 补充「删除时确实 cancel」证据，可改用 `vi.spyOn` 更规范（非必改）。
  - 新增测试主体为源码结构断言（readFileSync + regex），与 mcp_schema_boundaries 既有项目惯例一致；AC-003「server 层只做发送」仅断言 handler 块内无 `send_json(response`，handler 若改以 writeHead/end 直写不会被发现——行为等价由既有 server 级测试兜底，属合理取舍，非缺陷。
  - 实现观察（供 code reviewer 判定，非测试问题）：新路由分发对未匹配 `/pair*` 路径不再鉴权（旧：无 token 401 → 新：直接 404 BRIDGE_UNAVAILABLE）；`/health`、`/extension/discover` 带 query string 时旧代码落入鉴权（401/404）、新代码按 `split('?')[0]` 命中原路由（200）。均非真实 endpoint 语义变化，但与 AC-004 字面「认证语义不变」存在张力，建议 code reviewer 明确判定。
  - 实现命名 `replace_instance_by_label` 与 spec 契约区「replace_instance」略异（前者语义更精确，含 label + origin 校验），建议处置为改 spec 文字，不计 FAIL。
  - 可加 case（minor 级扩展建议）：`replace_instance_by_label` 的 `!new_label` 早退分支、`next_default_label` 返回 null 时传入 null label 的路径无 registry 级测试；heartbeat 侧 `hb_ext_id` 为 null 的顶替分支仅由 t137 AC-008b server 级覆盖。
- 总体判断：新增测试可信（行为级 registry 用例 + 源码结构断言双路覆盖 AC-002/003，且逐一核对断言与真实源码匹配，非恒真）；AC-001/004 由未改动的既有 server 级测试 gate，全部通过；唯一 minor 不阻断。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——重跑 `npx vitest run tests/unit`：189 文件 / 1804 用例全通过，含 agent_bridge_server.test.ts（87 用例）与 t137_bridge_security.test.ts；diff 未触碰这两文件，断言原样。
- AC-002：`re_verified`——`bridge_registry_refactor.test.ts` 7 用例通过；行为级用例（replace 顶替删实例 + queue cancel + owner 清理、origin 不匹配不顶替）直接触达 `BridgeRegistry` 生产实现；源码断言经人工核对：server.ts 中 `registry.replace_instance_by_label(` 恰 2 处（enroll/heartbeat），`command_owners.delete(cmd_id)` 重复清理模式已不在 handler；registry.ts 中 sweep/replace 真实调用 `this.remove_instance(id)`；t137 AC-008/AC-008b 行为 gate 通过。
- AC-003：`re_verified`——结构断言与 server.ts 实际一致：4 个 `async function handle_*_route` 存在、`RouteResult` 含 status/body、handler 块无 `send_json(response`、server 块含 `send_json(response, result.status, result.body)`；`/pair` HTML 走 contentType 分支行为由既有 agent_bridge_server 测试 gate。
- AC-004：`re_verified`——行为等价以既有 server 级端到端单测为 gate，全部通过；分发逻辑逐一比对（extension/mcp/cdp/health/discover/enroll 路径等价），仅未匹配 `/pair*` 与 health/discover 带 query 的鉴权细节存在差异（见未进表提示，非真实 endpoint），已移交 code reviewer 判定。

coverage = 4 / 4

reviewed_scope: 3837b29bdbb72e04

verdict: PASS

## Round 2 (2026-08-13 22:58 UTC+8)

### 前轮 finding 复核

- t184_test_f001（minor）：**修不彻底**。已消除部分：
  1. 标题修正 ✓——「remove_instance 为 sweep/replace 的唯一删除路径（cancel_all 直接清空不经过）」与实现一致（registry.ts:227-234 `cancel_all` 直接 clear，不经 remove_instance）。
  2. replace 作用域断言 ✓——后边界锚点 `'\n    next_default_label'`（registry.ts:129）有效，replace_body 限定到方法体，断言 `this.remove_instance(id)`（125 行真实调用）。
  3. cancel_all 否定断言 ✓——`cancel_all(): void` 锚点唯一（227 行），其后无 remove_instance，`not.toMatch(/remove_instance/)` 有效。
  仍存在部分：sweep 作用域断言后边界锚点 `'\n    get_or_create_queue'` 在 registry.ts 中唯一出现于 79 行（get_or_create_queue 声明），位于 sweep_expired（90 行）之前，split 失配 → sweep_body 退化为「sweep_expired 声明之后全部源码」；断言通过仅因 replace 体内（125 行）存在同款调用，无法证明 sweep_expired 体内调用。f001 第二点指出的「跨段匹配无法绑定调用关系」对 sweep 分支未真正修复。见新 finding t184_test_f002。

### Findings

### t184_test_f002 - sweep 作用域断言后边界锚点失配（f001 修不彻底残留）

- 严重度：minor
- 锚点：AC-002 测试实现质量（f001 处置复核）
- 位置：`tests/unit/bridge_registry_refactor.test.ts:74-77`
- 问题：`sweep_body` 的 split 后边界 `'\n    get_or_create_queue'` 目标方法声明在 registry.ts:79，位于 `sweep_expired`（90 行）之前，split 找不到锚点不分裂 → sweep_body 退化为「sweep_expired 声明之后全部源码」；`expect(sweep_body).toMatch(/this\.remove_instance\(id\)/)` 当前通过仅因 replace 体内（125 行）存在同款调用，无法证明 sweep_expired 体内调用。若未来 sweep_expired 删除 remove_instance 调用而 replace 保留，断言仍通过——与 f001 第二点同类脆弱性在 sweep 分支残留。
- 建议：后边界锚点改为 `'\n    remove_instance'`（registry.ts:99 声明，位于 sweep 之后），将 sweep_body 限定到 91-98 行方法体；或与 replace 分支同模式 split 到下一方法声明。

## 结论

- 前轮 finding 复核（Round 2）：t184_test_f001 标题、replace 作用域断言、cancel_all 否定断言已消除；sweep 作用域断言修不彻底（残留记为 t184_test_f002）。
- 改测方向复核：本轮无迁就实现的改测（仅 f001 相关断言收紧）。
- 本轮新发现：1 条（t184_test_f002，minor）
- 未进表的提示：无
- 总体判断：处置方向正确，无 blocking 残留；`npx vitest run tests/unit/bridge_registry_refactor.test.ts` 7 用例全绿，`npx tsc --noEmit` exit 0。f002 为 minor 级断言健壮性残留，按 verdict 判定规则（仅未解决 critical/important 时 FAIL）给出 PASS；f002 仍需 implementer 写入 task.md 处置表。
- 系统性 follow-up：无

### AC 复验方式（Round 2 增量）

- AC-002（f001 处置后）：`re_verified`——重跑新测试文件 7 用例全绿；人工核对四个 split 锚点在 registry.ts 上的匹配（replace 后边界 129 行有效；sweep 后边界失配，见 f002）。

coverage = 4 / 4

reviewed_scope: 59f0864650ccd3ba

verdict: PASS

## Round 3 (2026-08-13 23:00 UTC+8)

### 前轮 finding 复核

- t184_test_f002（minor）：**已修复**。sweep 后边界锚点改为 `'\n    remove_instance'`（registry.ts:99 声明，位于 sweep_expired 90 行之后），node 临时核对 split 结果：sweep_body 精确限定到 91-98 行方法体（含 93 行真实调用 `this.remove_instance(id)`），replace_body 限定到方法体（含 125 行调用）——作用域限定真实生效，f001 残留的「跨段匹配无法绑定调用关系」脆弱性消除。

## 结论

- 前轮 finding 复核（Round 3）：t184_test_f002 已消除；t184_test_f001 全部处置（标题、replace/sweep 作用域断言、cancel_all 否定断言）均已到位，无残留。
- 改测方向复核：本轮无迁就实现的改测（仅收紧 f002 锚点）。
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：`npx vitest run tests/unit/bridge_registry_refactor.test.ts` 7 用例全绿，`npx tsc --noEmit` exit 0；split 锚点逐一人工核对绑定真实调用点；无未解决 critical/important，无 minor 残留。
- 系统性 follow-up：无

### AC 复验方式（Round 3 增量）

- AC-002（f002 处置后）：`re_verified`——重跑 7 用例全绿；node 临时打印 split 结果确认 sweep_body/replace_body 均限定到方法体作用域，断言绑定 93/125 行真实调用。

coverage = 4 / 4

reviewed_scope: bede19493194f36d

verdict: PASS
