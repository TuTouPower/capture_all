# Task review t179（reviewer_focus: 测试）

- task：`t179_fix_mcp_schema_boundaries`
- spec：`docs/tasks/t179_fix_mcp_schema_boundaries/spec.md`
- diff_anchor：`88f0dddd53a62b19a147956a2cdf12180408960e`
- target：`git diff 88f0dddd53a62b19a147956a2cdf12180408960e`
- round：1
- reviewed_at：2026-08-13 21:20 UTC+8

## Findings

### t179_test_f001 - AC-003 实现侧断言为源码文本正则/子串顺序，分支语义未真验证，重构敏感

- 严重度：minor
- 锚点：AC-003（文档与协议同步）；spec 可测试性声明已批准「文档/协议一致性静态检查」为该 AC 的测试方式
- 位置：`tests/unit/mcp_schema_boundaries.test.ts:87-97`（`实现 resolve_target` 用例）
- 问题：测试 `readFileSync('src/bridge/server.ts')` 后对源码文本做断言：
  - `/code: 'TARGET_REQUIRED',\s*message: hint/` 只证明该字面量出现在 `resolve_target` 文本内，未证明它位于「多实例未指定 target」的兜底分支——若该 return 被误移入单实例分支，测试仍绿；
  - `fn.indexOf("code: 'TARGET_AMBIGUOUS'") > fn.indexOf('matches.length > 1')` 用子串顺序代理「AMBIGUOUS 仅 label 多匹配分支返回」，若注释/字符串提前出现 `matches.length > 1` 可假真，若错误码抽出为类型别名或模板串则脆断。
  - 当前实现经人工核验（`server.ts:120-169`）与断言一致，无行为缺陷；这是静态检查方法固有局限，故不阻断。
- 建议：将 `resolve_target` 导出并做可执行行为级断言（构造多实例、label 多匹配输入直接验证返回码），或在测试注释中明示静态检查局限。文档侧断言（`deployment.md`/`decisions.md`/`domain.md` 正则）同样对措辞敏感，属同类局限，一并提示。

### t179_test_f002 - AC-002 合法枚举遍历与 schema 同源，未锚定 Bridge/dispatcher 实际接受集合

- 严重度：minor
- 锚点：AC-002；spec 上下文区「风险与回退」要求枚举以 Bridge/dispatcher 实际接受集合为唯一来源
- 位置：`tests/unit/mcp_schema_boundaries.test.ts:44-64`（`list_records: 全部 7 个合法 source 通过`、`export_capture: 全部 4 个合法 format 通过`）
- 问题：测试用 `AGENT_DATA_SOURCES`/`EXPORT_FORMATS` 常量遍历，schema 又由同一常量经 `z.enum()` 派生——两者同源，验证的是「zod enum 构造正确接受全部声明值」的内部一致性；若常量集合本身与 Bridge/dispatcher 真实接受集合不符（误拒/误放），测试仍全绿。枚举与真实消费点的一致性仅靠本次实现重构（`agent_data_queries.ts` 改用常量、dispatcher export case 与常量一致，已人工核验）保证，无测试钉住。
- 建议：可选加一条静态一致性测试（如断言 dispatcher export case 集合或存储 source 读取点与共享常量一致），作为常量与真实接受点的锚。属覆盖扩展，不阻断。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1，无前轮。
- 改测方向复核：无「迁就实现」改测。
  - `mcp_schema.test.ts` 中 `'network'`→`'network_requests'`、`'console'`→`'console_events'`：旧值是假枚举，在新契约（AC-001 枚举边界）下本应被 Zod 拒绝；改为真实枚举值使测试原语义（合法值通过）成立，属修正 fixture 匹配 spec 定义的新契约，非实现驱动测试。
  - 删除 `export_capture: allows any format string (passthrough)`：passthrough 语义被 AC-001 明确废除（spec 驱动），删除处留注释说明理由，新文件 `export_capture: 非法 format 拒绝（不再透传）`（`format: 'csv'`）补回新语义，符合「整体删除并说明理由 + 新增覆盖新语义测试」的合法路径。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - `get_timeline` 的 `sources: []` 空数组边界未测（zod 对空数组通过，无元素校验），可选扩展。
  - `tests/unit/mcp_schema_boundaries.test.ts:28` 的 `'network' + 'x'` 可直写 `'networkx'`（等价，风格）。
  - `export_session` 非法 format 未直接测，但其与 `export_capture` 共享同一 `export_capture_schema`（`schemas.ts:166`），等价覆盖，不必补。
  - `get_record` 合法 source 仅测单一值（`mcp_schema.test.ts:164`），与 `list_records` 共享同一 `source_schema`，穷举等价，不必补。
- 总体判断：AC-001/002/003 均有测试且直接触达生产 schema 与文档/实现文本（无 mock、无恒真断言、无 skip），57/57 通过；仅 2 条 minor（静态断言脆弱性、同源验证局限），无未解决 critical/important。
- 系统性 follow-up：无

### AC 复验披露

- AC-001 `re_verified`：重跑 `npx vitest run tests/unit/mcp_schema.test.ts tests/unit/mcp_schema_boundaries.test.ts` 57/57 通过；逐条比对非法值断言（`boundaries.test.ts:23-41`）与 `schemas.ts` 的 `z.enum(AGENT_DATA_SOURCES)`/`z.enum(EXPORT_FORMATS)` 构造。
- AC-002 `re_verified`：同上；独立核验 `agent_command_dispatcher.ts:165-173` export case 集合（json/jsonl/html/har）与 `EXPORT_FORMATS` 一致、`agent_data_queries.ts:46` `ALL_SOURCES` 与 `AGENT_DATA_SOURCES` 一致。
- AC-003 `re_verified`：重跑通过；独立阅读 `server.ts:120-169`（`resolve_target`）及 `deployment.md`/`decisions.md`/`domain.md` 改动后文本，与断言正则逐条对照一致（含负向正则 `多实例未指定时返回 TARGET_AMBIGUOUS` 与新措辞不误伤）。
- coverage = 3 / 3

reviewed_scope: e906f05782fa940c

verdict: PASS

## Round 2 复核 (2026-08-13 21:25 UTC+8)

### 前轮 finding 复核

- **t179_test_f001：已消除（处置充分）**。`resolve_target` 源码断言简化为 `/code: 'TARGET_REQUIRED'/`，该连续子串同时存在于 `server.ts:120` 类型注解（`{ error: { code: 'TARGET_REQUIRED' | ... } }`），作为独立断言已退化为恒真存在性检查；但注释指向的行为级覆盖 `agent_bridge_server.test.ts:940`「multi-instance: write without target returns TARGET_REQUIRED」（既有、未改：注册 inst_a/inst_b 双实例后发无 target 命令，断言 HTTP 400 + `error.code === 'TARGET_REQUIRED'`，走真实 HTTP 边界触达 `resolve_target`）承担 AC-003 焦点语义的证据——覆盖未降低、失败未掩盖，弱化有正当理由（与 code f002 处置一致），不命中危险模式。残留：AMBIGUOUS 无独立行为测试、顺序断言仍为文本代理，见「未进表的提示」，非阻断。
- **t179_test_f002：已消除（处置充分）**。新增 `dispatcher 实际接受的导出 format 与 EXPORT_FORMATS 常量一致`（`mcp_schema_boundaries.test.ts:100-106`）：对 `EXPORT_FORMATS` 每个值断言 `case '<fmt>':` 出现在 `agent_command_dispatcher.ts` 的 `async function export_capture` switch 内；已逐条核验 dispatcher case json/jsonl/html/har 存在，锚定实现实际接受集合，方向正确（防 schema 放行实现不支持的 format，Zod 拒常量外值，反向不需测）。

### 本轮新发现

0 条。

### 未进表的提示

- AMBIGUOUS（显式 label 命中多个在线实例 → 400 TARGET_AMBIGUOUS）无行为级测试，实现侧仅顺序文本断言支撑；可选补 `agent_bridge_server.test.ts` 风格行为用例（同 label 双实例 → TARGET_AMBIGUOUS）。
- dispatcher case 断言与 resolve_target 断言同属静态文本检查，switch 改写为 map/表驱动分发时会脆断；属 f001 已提示的静态检查固有局限。

### 验证（Round 2）

- `npx vitest run tests/unit/mcp_schema_boundaries.test.ts`：13/13 通过。
- `npx tsc --noEmit`：exit 0。
- 改测方向复核：本轮无新增改测（`mcp_schema.test.ts` 与 Round 1 一致，未再变动）。

reviewed_scope: 01a269c86d4ba554

verdict: PASS
