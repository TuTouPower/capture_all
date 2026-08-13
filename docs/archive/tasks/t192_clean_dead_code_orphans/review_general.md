# Task review t192（reviewer_focus: 通用）

- task：`t192_clean_dead_code_orphans`
- spec：`docs/tasks/t192_clean_dead_code_orphans/spec.md`
- diff_anchor：`48e9398f30300afd5b1ad350e7f3a2d03d57dc16`
- target：`git diff 48e9398f30300afd5b1ad350e7f3a2d03d57dc16`
- round：1
- reviewed_at：2026-08-14 01:30 UTC+8

## Findings

### t192_gen_f001 - 九个已删事件在 6 个既有测试文件中残留引用，AC-003 删除不彻底

- 严重度：important
- 锚点：AC-003「九个无生产者事件契约的去留明确（删除或补生产者），Dashboard/测试无可达性矛盾分支」；spec 范围「删除确无消费者的死导出、dead store/字段、孤儿实现（**有测试引用者先迁测试再删**）」
- 位置：
  - `tests/unit/t152_event_kind_alignment.test.ts:29-39`（`SAMPLE_TYPES: EventType[]` 含全部 9 个已删事件）
  - `tests/unit/dashboard_detail_xss_escape.test.ts:44-52`（`nav_event` fixture 用 `type: 'page_navigation'`）
  - `tests/unit/p036_user_action_filter.test.ts:53-64`（`category_for_event_type('dom_mutation')` 与 whitelist 断言）
  - `tests/unit/p043_flush_before_read.test.ts:34-38`（`category_for_event_type('dom_mutation')`）
  - `tests/unit/live_data_queries.test.ts:74`（mock fixture `type: 'page_navigation'`）
  - `tests/unit/agent_data_queries.test.ts:279`（fixture `type: 'page_navigation'`）
- 问题：九个事件类型从 `EventType` 联合与 `event_category.ts` 分类集合删除，但 6 个既有测试文件仍引用这些已删契约，未随删除迁移：
  - `t152_event_kind_alignment.test.ts:25-40` 的 `SAMPLE_TYPES` 是显式 `EventType[]` 数组，含 `page_navigation` / `unhandled_rejection` / `resource_error` / `network_failed` / `dom_mutation` / `capture_config_changed` / `permission_missing` / `debugger_attach_status` / `body_capture_status_changed` 全部 9 个。这些成员在类型层面已非法（`'page_navigation'` 不再是合法 `EventType`），仅因 tsconfig `exclude: ["tests"]` + vitest 走 esbuild 无类型检查而未报编译错误，测试靠 `category_for_event_type` 的兜底 `return 'dom_data'`（`src/shared/event_category.ts:17`）自洽通过——固化「已删事件仍映射到 dom_data 类别」的假象。
  - `p036_user_action_filter.test.ts:53-64` 与 `p043_flush_before_read.test.ts:34-38` 断言 `category_for_event_type('dom_mutation')` 的分类——测的是已删契约（dom_mutation 已不存在，断言恒真但无意义），且注释仍称「dom_mutation is categorized as dom_data」。
  - `dashboard_detail_xss_escape.test.ts` 的 `nav_event` 构造 `page_navigation` 事件（`data: {from, to}`），但 `dashboard_format.ts` 的 `event_title/event_detail` 已无 `page_navigation` case，走 `default` 分支（`dashboard_format.ts:130-135` 返回 `e.type`）；断言 `html.toContain(esc(v))` 仍通过，实际由 `source: v` 列转义支撑，原「导航事件 data 字段转义」路径已不可达——fixture 与断言意图漂移。
  - `live_data_queries.test.ts:74` / `agent_data_queries.test.ts:279` 的 mock fixture 仍用 `page_navigation` 作 navigation 代表类型。
  - 新增 `tests/unit/dead_code_cleanup.test.ts` 的 AC-003 断言只覆盖了 `shared/types.ts` / `dashboard_format.ts` / `dashboard_detail.ts` / `event_category.ts` 与 3 个 fixture 文件（detail_render_consistency / detail_search_preserve_input / pipeline_consistency），未覆盖上述 6 个文件，产生绿灯盲区。
- 建议：迁移或删除这 6 个文件中的已删事件引用：t152 的 `SAMPLE_TYPES` 移除 9 个已删成员（用保留事件保持全类别样本覆盖）；p036/p043 删除 dom_mutation 相关断言（其意图已由「已删契约」取代）；xss 测试 `nav_event` 改用 `route_change`（保留 `data.to` 字段）维持「导航类事件 data 转义」覆盖；live_data_queries / agent_data_queries fixture 改用 `route_change`。同步在 dead_code_cleanup.test.ts 补全仓 grep（对 9 个已删事件名）或扩展断言文件清单。

### t192_gen_f002 - dead_code_cleanup.test.ts 的 AC-002 断言未覆盖 extension_version 顶层字段

- 严重度：minor
- 锚点：AC-002「deprecated `AgentStatus` 顶层字段不再在每次响应中生产（或移除），测试不反向固化该字段」
- 位置：`tests/unit/dead_code_cleanup.test.ts:36-42`
- 问题：AC-002 涉及三个顶层字段 `extension_online` / `extension_version` / `active_capture_id`，但静态断言只检查了 `extension_online:`、`active_capture_id:` 与 `@deprecated`（`dead_code_cleanup.test.ts:40-41`），未断言 `extension_version:` 不在 `AgentStatus` 块；registry `build_status` 断言（`dead_code_cleanup.test.ts:47-49`）同样只查 `extension_online` 与 `const primary`。当前实现实际已删除该字段（grep 全仓确认 `src/shared/protocol.ts` 的 `AgentStatus` 顶层无 `extension_version`，仅 `AgentExtensionStatus` 项内保留——符合设计），故属测试覆盖不全而非实现缺陷。
- 建议：在 AC-002 断言中补 `expect(status_block).not.toMatch(/extension_version:/)`，防止未来回归在测试层漏网。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：2 条（f001 important、f002 minor）
- 未进表的提示：
  - `docs/archive/` 下历史文档（data_model.md / extension_capture.md / omni_powers 等）仍描述已删事件——归档历史，不算残留，未计 finding。
  - dashboard 的 `dom` quick filter（`src/extension/dashboard/dashboard_detail.ts:133`）与 `dashboard_format.ts:89` 的 `dom_data` case 保留——`category_for_event_type` 兜底仍返回 `dom_data`，非不可达分支，符合「Dashboard 无可达性矛盾分支」，未计 finding。
  - e2e 测试断言替换（`extension_online` → `online_count`）语义等价，经代码审查确认；未实际运行 Playwright（环境所限），详见 AC 复验披露。
- 总体判断：AC-001/002/004 实现正确、删除彻底、测试迁移到位；AC-003 生产代码侧干净，但测试侧残留 6 处已删契约引用，属删除不彻底，需修复后进入下一轮。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified` —— 独立 grep `bridge_error` / `write_error_events` / `ExtensionBridgeConfig` / `RedactionStatus` / `CaptureEventUnion`（`src/` + `tests/`，排除测试自身）零命中；`tsc --noEmit` 通过；全量单测 196 文件 / 1873 用例全绿。
- AC-002：`re_verified` —— 读 `protocol.ts` `AgentStatus` 定义与 `registry.ts` `build_status` 实现，顶层三字段与 `primary` 派生均已删除；`AgentExtensionStatus` 项内字段保留符合 spec 设计；grep `extension_online` 在 `src/` 零命中（含测试迁移，`agent_bridge_server.test.ts:703-704` 改用 `online_count`/`extensions`）。
- AC-003：`re_verified`（结论为违反）—— `src/` 下 9 个事件零残留（types/event_category/dashboard/storage 均干净），但测试侧 6 文件残留引用，见 f001。
- AC-004：`re_verified` —— `docs/blueprint/domain.md` 记录 4 个 alias 保留决策、v2.0 移除窗口、`TOOL_COMMANDS` / `MCP_TOOL_SCHEMAS` 移除点，与 `src/mcp/tools.ts:14-24` 及 `src/mcp/schemas.ts:148-166` 实际 alias 注册一致；alias 工具语义未变。
- e2e 断言迁移（`e2e-mcp.spec.ts:148` / `e2e-mcp-full.spec.ts:117`）：`trust_prior` —— 依赖实现侧已产出的 Playwright 证据；本 reviewer 仅代码审查确认替换等价（`online_count > 0` ≡ 原 `extension_online === true`）。

coverage = 4 / 4

reviewed_scope: 466c2780505a5d16

verdict: FAIL

## Round 2 复核

### 前轮 finding 复核

- **t192_gen_f001（important，已消除）**：以 diff 与代码核实——
  - `tests/unit/agent_data_queries.test.ts:279`、`tests/unit/dashboard_detail_xss_escape.test.ts:46`、`tests/unit/live_data_queries.test.ts:74` 三处 fixture `page_navigation` → `route_change`；`route_change` 仍属 navigation 类别（`event_category.ts` NAVIGATION_TYPES 保留），xss 测试现走 `event_title/event_detail` 的 `route_change` case（`dashboard_format.ts`），导航类事件 data 转义断言重新触达真实分支。
  - `tests/unit/p036_user_action_filter.test.ts` 与 `tests/unit/p043_flush_before_read.test.ts` 的 `dom_mutation` 断言用例整体删除（各 1 个用例，全量测试计数 1873→1871 对应）。
  - `tests/unit/t152_event_kind_alignment.test.ts:25-38` `SAMPLE_TYPES` 移除全部 9 个已删事件，保留其余真实类型；该测试不再对已删契约固化分类。
  - `tests/unit/dead_code_cleanup.test.ts` 新增「全仓（src + tests）无 9 个已删事件残留」用例（行内 grep `\b…\b` 9 事件名，排除本文件与 `//` 注释行）。独立复扫 `grep -rn … src/ tests/`：仅命中 `src/extension/background/storage.ts:322` 的注释行（`// B2-L7/t192: … 原 dom_mutation 事件已随 DD-007 删除`），代码残留为零。
- **t192_gen_f002（minor，已消除）**：`dead_code_cleanup.test.ts:41` 补 `expect(status_block).not.toMatch(/extension_version:/)`，AC-002 三字段断言齐全。

### 本轮新发现

0 条。未发现处置过程引入的新问题（p036 删除用例后文件内 import 无残留未用——全量 tsc + vitest 通过佐证；t152 删样本后仍保留各类别代表类型，覆盖不缩水）。

### 验证记录

- `npx vitest run tests/unit/dead_code_cleanup.test.ts`：16 tests passed，exit 0
- `npm test`：196 files / 1871 tests passed，exit 0
- `npx tsc --noEmit`：exit 0，0 输出

### AC 复验披露（Round 2）

- AC-001 / AC-002 / AC-003 / AC-004：`re_verified` —— 处置后的 diff 逐文件核对 + 全仓 grep 复扫 + tsc/vitest 重跑；f001 阻断点已消除。
- e2e 断言迁移：`trust_prior`（同 Round 1，依赖实施侧 Playwright 证据）。

coverage = 4 / 4

reviewed_scope: e760828e6b20a5b5

verdict: PASS
