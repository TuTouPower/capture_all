# Task review t179（reviewer_focus: 代码）

- task：`t179_fix_mcp_schema_boundaries`
- spec：`docs/tasks/t179_fix_mcp_schema_boundaries/spec.md`
- diff_anchor：`88f0dddd53a62b19a147956a2cdf12180408960e`
- target：`git diff 88f0dddd53a62b19a147956a2cdf12180408960e`
- round：1
- reviewed_at：2026-08-13 21:22 UTC+8
- reviewed_scope: e906f05782fa940c

## Findings

### t179_code_f001 - AGENT_DATA_SOURCES 与 STORE_NAMES 同文件双字面量重复，防漂移目标只实现一半

- 严重度：minor
- 锚点：spec 上下文区「依赖与约束」——枚举由共享常量派生避免漂移
- 位置：`src/shared/constants.ts:79-87`（vs `src/shared/constants.ts:12-18`）
- 问题：`AGENT_DATA_SOURCES` 的 7 个字符串值与同文件 `STORE_NAMES` 的 7 个 agent 数据源值（`USER_ACTION_EVENTS`~`COOKIE_CHANGES`）逐字重复。MCP Zod schema 与 `agent_data_queries.ts` 已统一从 `AGENT_DATA_SOURCES` 派生，但底层真实边界（IndexedDB store 名，`storage.ts:73-113` 按 `STORE_NAMES` 建库）与公开枚举仍是两处独立字面量。漂移场景：新增采集源只加 `STORE_NAMES` 而不加 `AGENT_DATA_SOURCES` 时，`SOURCE_STORE: Record<AgentDataSource, string>`（`agent_data_queries.ts:329`）不会报编译错（Record 只约束键全集的方向相反），MCP 层对该新源静默不可查——正是 spec「避免漂移」要防的缺口。
- 建议：`AGENT_DATA_SOURCES` 改为引用 `STORE_NAMES` 构造（如 `[STORE_NAMES.USER_ACTION_EVENTS, STORE_NAMES.NAVIGATION_EVENTS, ...] as const`），使 7 个字符串只出现一次；或反向让 store 名从 `AGENT_DATA_SOURCES` 派生。当前值两两一致，无行为缺陷。

### t179_code_f002 - AC-003 实现一致性测试用源码文本匹配，切片到文件尾 + 硬编码变量名，易误报

- 严重度：minor
- 锚点：无 AC 违反；测试代码质量（spec「测试策略」批准静态一致性检查方式，但具体实现脆弱）
- 位置：`tests/unit/mcp_schema_boundaries.test.ts:90-96`
- 问题：`src.split('function resolve_target')[1]` 将 `server.ts` 从函数声明处切片到文件尾（包含函数外全部后续代码）。两处断言脆弱：1) `indexOf("code: 'TARGET_AMBIGUOUS'") > indexOf('matches.length > 1')` —— 若日后在 `resolve_target` 之后的文件任意位置新增一处 `code: 'TARGET_AMBIGUOUS'` 字面量（如新错误路径），首现位置提前、断言假性失败；2) `/code: 'TARGET_REQUIRED',\s*message: hint/` 硬编码局部变量名 `hint`，仅改名为 `message`/`hint_msg` 即误报。均为与语义无关的文本细节击穿，阻塞无关改动。
- 建议：把切片收窄到函数体（如按 `{` `}` 配平截断到 `resolve_target` 闭合），或将排序断言改为定位到 `matches.length > 1` 所在 if 块内、再断言该块内出现 AMBIGUOUS（`fn.slice(fn.indexOf('matches.length > 1'), fn.indexOf('matches.length > 1') + 400)` 内断言）；`message: hint` 改断言 `message:` 即可。当前断言内容真实、能守住实现语义，仅脆弱度问题。

## 结论

- 前轮 finding 复核：首轮，无。
- 本轮新发现：2 条（均为 minor）。
- 未进表的提示：
  - 文件过大：无。本 diff 触及文件均低于阈值（`schemas.ts` 167 行、`constants.ts` 89 行、`agent_data_queries.ts` 455 行但本 task 净减 14 行、新测试 98 行、`mcp_schema.test.ts` 326 行）。
  - 复杂度：无新增高复杂度函数（`resolve_target` 为既有实现，本 diff 未改动 `src/bridge/server.ts`）。
  - 范围外观察：a) 大写 format（如 `'JSON'`）此前 MCP 透传后实际也会在扩展层 `agent_command_dispatcher.ts:163-173` 命中 default 抛 `INVALID_QUERY`（switch 大小写敏感），非「原先能成功」；本次改为 Zod 层提前拒绝属 AC-001 预期收紧，不计 finding。b) `mcp_schema.test.ts:217-221` 硬编码 4 个 format 与 `EXPORT_FORMATS` 重复（测试侧 DRY nit，边界测试已用常量遍历，不计 finding）。
  - 旧测试处理合规：`export_capture: allows any format string (passthrough)` 整体删除并留注释说明理由（`mcp_schema.test.ts:223-224`），符合 TDD 约定。
- 总体判断：三条 AC 全部实现并有独立测试覆盖，改动范围严格贴合 spec（src 仅 3 文件 + 测试 + 3 份契约文档），无越界行为；仅 2 条 minor 维护性建议，无未解决 blocker。
- 系统性 follow-up：无。

### AC 复验方式

- **AC-001**（非法 source/sources/format 在 Zod 层拒绝，不进入 Bridge）：`re_verified`。① `mcp_schema_boundaries.test.ts` 5 条 parse_fail 用例（非法 source / 数组含非法 / 全非法 / 非法 format）实际运行通过；② 全枚举覆盖核对：`source_schema`/`format_schema`（`schemas.ts:15-16`）已应用到 `list_records`/`get_record`/`get_timeline.sources`/`export_capture.format`，`export_session` 为 `export_capture` 别名共享 schema（`schemas.ts:149-167`），无遗漏的公开 source/sources/format 入口；③ SDK 行为核实：`@modelcontextprotocol/sdk@1.29.0` `dist/esm/server/mcp.js:430` `safeParseAsync(argsObj, request.params.arguments)` 在 handler 调用前校验参数，失败返回错误、不调 handler，即不触 Bridge。
- **AC-002**（合法枚举值正常通过并执行）：`re_verified`。边界测试遍历 `AGENT_DATA_SOURCES` 全 7 值（`mcp_schema_boundaries.test.ts:45-49`）与 `EXPORT_FORMATS` 全 4 值（`60-64`）parse 通过；7 值与扩展层实际 store（`storage.ts:73-113`）与 `capture_data_reader.ts` 读取源逐一相符，无误拒。全量单测 `npx vitest run tests/unit`：184 文件 / 1762 tests 全过；`npx tsc --noEmit` 干净。
- **AC-003**（多实例未指定目标错误码文档与实现一致）：`re_verified`。① 读实现 `server.ts:120-169`：无 target 多实例 → `TARGET_REQUIRED`（163-168），显式 `target_label` 多匹配 → `TARGET_AMBIGUOUS`（146-148），单实例默认路由（152-154），零实例 `EXTENSION_OFFLINE`（122-124）；② 行为测试 `agent_bridge_server.test.ts:940-963`（HTTP 400 + `TARGET_REQUIRED`）随全量单测通过；③ 文档同步核对：`deployment.md:79`、`decisions.md:71`、`domain.md:152` 三处表述与实现一致，`protocol.ts:33,35` 错误码表同时收录两个码；docs 其余活跃文件无残留旧表述（仅 `docs/reviews/` 历史评审快照含旧文本，属归档材料不要求同步）。

coverage = 3 / 3

verdict: PASS

## Round 2 复核 (2026-08-13 21:25 UTC+8)

- reviewed_scope: 01a269c86d4ba554

### 前轮 finding 复核

- **t179_code_f001（minor）——已消除**。`src/shared/constants.ts:77-88` 的 `AGENT_DATA_SOURCES` 改为 `[STORE_NAMES.USER_ACTION_EVENTS, ..., STORE_NAMES.COOKIE_CHANGES] as const` 构造，7 个数据源字符串值不再双份列举，`STORE_NAMES` 成为单一事实来源。值类型不受影响（`STORE_NAMES` 为 `as const`，元素仍是字面量联合，`z.enum(AGENT_DATA_SOURCES)` 与 `typeof AGENT_DATA_SOURCES[number]` 原样可用）。`npx tsc --noEmit` 干净；相关测试全过。
- **t179_code_f002（minor）——处置充分，一处措辞与实际不完全一致，如实记录**。`tests/unit/mcp_schema_boundaries.test.ts:94` 已去掉 `/message: hint/` 变量名硬编码，改为 `/code: 'TARGET_REQUIRED'/`。但处置说明所称「去掉顺序假设」与实际代码不符：`indexOf("code: 'TARGET_AMBIGUOUS'") > indexOf('matches.length > 1')` 排序断言仍在（当前首现位置 147 > 146，真实锚定 AMBIGUOUS 仅出现在 label 多匹配分支之后，断言有效）。残留脆弱场景（`resolve_target` 之后在 server.ts 任意位置新增 `code: 'TARGET_AMBIGUOUS'` 字面量导致首现提前）仍在，但：行为级覆盖已由既有 `agent_bridge_server.test.ts::multi-instance: write without target returns TARGET_REQUIRED`（本次随 3 文件 145 tests 复验通过）承担，源码文本断言退为冗余双保险，误报不掩盖真缺陷；且该残留不扩大语义风险。判定不阻塞，不再追新 finding。
- **处置期新增测试**：`mcp_schema_boundaries.test.ts:98-106` 新增「dispatcher 实际接受的导出 format 与 EXPORT_FORMATS 常量一致」——增强 AC-001/002 防漂移覆盖，断言「包含」无顺序假设，方式可接受。归组在 AC-003 describe 内属分组瑕疵，低于 finding 门槛。

### 复验命令

- `npx tsc --noEmit`：exit 0。
- `npx vitest run tests/unit/mcp_schema_boundaries.test.ts tests/unit/mcp_schema.test.ts tests/unit/agent_bridge_server.test.ts`：3 文件 / 145 tests 全过（含 AC-003 行为测试）。

### 本轮新发现

0 条。

verdict: PASS
