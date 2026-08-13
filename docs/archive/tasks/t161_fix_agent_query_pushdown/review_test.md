# Task review t161（reviewer_focus: 测试）

- task：`t161_fix_agent_query_pushdown`
- spec：`docs/tasks/t161_fix_agent_query_pushdown/spec.md`
- diff_anchor：`c4d1a729f9b01032648372262b7ef976cf49039a`
- target：`git diff c4d1a729f9b01032648372262b7ef976cf49039a`
- round：1
- reviewed_at：2026-08-13 16:57 UTC+8

## Findings

### t161_test_f001 - AC-004 的 O(N) 读取量与「不读记录体」无实际断言（注释冒充断言）

- 严重度：important
- 锚点：AC-004（keyset 分页读取 N 条为 O(N)，不从头 skip offset）+ spec 测试策略「instrument cursor success/advance 次数，断言 O(N) 而非只断言不调用 getAll」
- 位置：`tests/unit/storage_keyset.test.ts:61-79`（AC-004a）、`118-127`（AC-004f）
- 问题：测试名与注释声明「advance 次数 = limit」「count/first-last 索引级（不读记录体）」，但断言只检查输出形状：`records.length`、`event_id` 序列、数值相等、set 不重不漏。全文件无任何 cursor advance / 读取量 instrumentation（已全库扫描 `tests/`，无 `IDBCursor.prototype.continue` 包装或事务 store 访问统计）。已实证：在 `.scratch/` 写 getAll 全量 + 内存过滤/排序/slice 的退化 keyset 实现（不满足 O(N)，读取每条记录体），逐字复跑 AC-004a 与 AC-004f 的全部断言，全数通过。即：实现若退化为全量加载再内存分页，本测试仍绿——正是 PERF-H001/H002 要防的回归。fake-indexeddb 下 instrumentation 完全可行（包装 `IDBCursor.prototype.continue` 计数、或包装 `IDBDatabase.prototype.transaction` 记录打开的 store / 是否读取 cursor.value）。
- 建议：AC-004a 增加每页 `continue` 调用次数断言（= limit，非全量）；AC-004f 断言 count/first-last 路径只走 `index.count` / 单条 `openCursor`（不读记录体），或至少断言未触发记录体读取。

### t161_test_f002 - AC-002/AC-003 契约断言不区分旧实现，引用不存在的「读取量证据」（假绿残留）

- 严重度：important
- 锚点：AC-002（limit=1 时读取量受 limit 约束，不先加载七源全量）、AC-003（sources.list 不读取 body/value）
- 位置：`tests/unit/agent_query_pushdown.test.ts:131-145`（AC-002）、`147-159`（AC-003）
- 问题：AC-002 断言 `records.length === 1`、`total === 50`——代入旧实现 `list_entries_from_capture_data(await load_agent_capture_data(...))` 全量加载后 filter/slice，同样返回 1 条与 total=50，断言照过；AC-003 断言 count/time_range 数值——旧实现全量读后同样得到相同数值。两条注释声称「读取量 O(limit) 由 storage_keyset.test.ts AC-004（cursor advance 次数 = limit）直接覆盖」「count/time_range 由索引 count 与 first/last cursor 计算」——但 storage_keyset.test.ts 并无真实 advance/读取量 instrumentation（见 f001），只有输出形状断言，证据不存在。即对 AC-002/AC-003 的区分性行为（读取量受限、不读 body）零验证，实现回退到全量加载测试仍绿。此项正是「已知说明」要求确认的假绿残留，确认存在。
- 建议：在 agent 层补真实读取量/访问断言（如包装 `db.transaction` 断言 limit=1 时事务只含对应 store、未读 body），或在 storage_keyset 落地 f001 的 instrumentation 后使引用成立；在断言落地前，注释不得声称已覆盖。

### t161_test_f003 - AC-001「不调用其他六个数据源」无断言

- 严重度：important
- 锚点：AC-001（`data.get` 只访问对应 store 与对应记录，不调用其他六个数据源的读取）+ spec 测试策略「点查断言不触及其他 store」
- 位置：`tests/unit/agent_query_pushdown.test.ts:117-129`
- 问题：测试断言返回记录内容（`toMatchObject({ event_id: 'evt_0002' })`）、缺失 → RECORD_NOT_FOUND、跨 capture → RECORD_NOT_FOUND。这些均不区分实现是否读取其他六源——旧实现 `get_entry_from_capture_data(await load_agent_capture_data(...))` 全量读七源后 find，对同一输入返回相同结果与错误，断言照过。AC-001 的核心条款「只访问对应 store、不调用其他六个数据源」无任何断言。跨 capture 归属校验（`record_belongs_to_capture`）确被真实触达（真实逻辑验证有效），但 store 隔离条款未测。
- 建议：补事务级断言——包装 `db.transaction` 记录点查事务打开的 store 集合，断言只含对应 store 且只读。

## 结论

- 前轮 finding 复核：首轮，无
- 改测方向复核：无「迁就实现」的改测。`agent_command_dispatcher.test.ts` 的 mock 目标从 `list_entries_from_capture_data`/`get_entry_from_capture_data` 改为 `list_entries_pushdown`/`get_entry_pushdown` 是生产 dispatcher 真实改走下推路径的同步，错误码断言（SOURCE_NOT_FOUND/RECORD_NOT_FOUND）原样保留未弱化；`agent_data_queries.test.ts` 的 mock 改 `importOriginal` 保留真实现，mock 边界更合理。两者均为合法改测。
- 本轮新发现：3 条
- 未进表的提示：
  - AC-002 未覆盖 `offset>0` + `limit=1`、`limit=0` 组合（`list_entries_pushdown` 对 limit=0 仍取 `take=max(1,offset)`，读 1 条后 slice 为空——行为正确，属「可再加 case」级）。
  - AC-005a/b/c 对拍测试为真实行为验证（fake-indexeddb 真库 + 真 pushdown vs 真纯函数路径），断言 record_id/time/total/index 全等，AC-005 等价性证据充分。
  - `tests/unit/t140_resource_budget.test.ts` 用「读源码断言含 openCursor」的文本断言是既有先例（t140），本次未沿用该手法，但可作修复方向参考。
- 总体判断：AC-002/003/004 的性能区分性行为（读取量受限、不读 body、O(N) 游标）全部未受断言约束，测试名与注释对此作了未实证的覆盖声明，且对拍实验证实 getAll 退化实现可全绿——task 核心目标无测试门禁；3 条 important 未解决。
- 系统性 follow-up：无（读取量 instrumentation 缺口为本 task 范围内问题，无需跨 task 登记）

### AC 复验披露

- AC-001：`re_verified`（重跑测试全绿 + 读生产代码确认主键点查与归属校验路径真实执行；「不触其他六源」条款缺测，见 f003）
- AC-002：`re_verified`（重跑测试全绿；静态代入旧实现确认契约断言不区分新旧，见 f002）
- AC-003：`re_verified`（重跑测试全绿；同上，见 f002）
- AC-004：`re_verified`（重跑测试全绿；`.scratch/` 退化实现逐字复跑 AC-004a/004f 断言全过，证实 O(N) 与索引级断言缺失，见 f001；实验文件已清理）
- AC-005：`re_verified`（重跑对拍测试，断言与纯函数路径完全一致）

coverage = 5 / 5

reviewed_scope: 5a8fecfbcf893e6c

verdict: FAIL

## Round 2 (2026-08-13 17:13 UTC+8)

### 前轮 finding 复核（以 git diff 与代码/测试为准）

- **t161_test_f001（已消除）**：`_storage_stats_for_test.keyset_cursor_reads` 在 `query_by_store_keyset` 记录读取处自增（`src/extension/background/storage.ts:628`，读 `cursor.value` 时；边界取 key 分支不自增）。`storage_keyset.test.ts:84` 断言三页总读取 = 23。区分性核实：退化 offset-skip 实现读 10+20+23=53、退化 getAll+slice 读 0、退化全量 cursor 遍历读 23+23+23=69——三者均 ≠ 23 红。口径合理（计数点=记录体读取，与 AC-004「读取 N 条记录为 O(N)」语义一致）。已消除。
- **t161_test_f002（部分消除，AC-003 残留 → 见 f004）**：AC-002 部分修复到位——`agent_query_pushdown.test.ts:150` 断言 limit=1 → `keyset_cursor_reads=1`（区分旧实现全量加载=0、退化 getAll=0、退化 keyset 不透传 limit 读全量=50）；`:152-163` token 端到端三页 20+20+10 不重不漏、总读取=50（退化 offset-skip 读 20+40+50=110 红）。**AC-003 部分未修复**：测试体未变（仅数值断言），注释仍引用 storage_keyset AC-004f 作「索引级证据」，但 AC-004f（`storage_keyset.test.ts:124-133`）仍无任何 stats 断言；`count_reads` 钩子已就位（`storage.ts:650`）但全测试零断言使用。退化 getAll 实现给相同 count/time_range 数值，AC-003 测试仍绿。
- **t161_test_f003（已消除）**：`agent_query_pushdown.test.ts:125-126` 断言 `point_reads=1`、`keyset_cursor_reads=0`。区分性核实：point_reads 计数 `get_store_record_by_id` 调用（`storage.ts:687`），=1 排除「七源循环读」（≥2）与「全量加载后 find」（0）；keyset_cursor_reads=0 排除任何游标扫描路径。旧实现（全量读）必然红。已消除。

### 本轮新发现

### t161_test_f004 - AC-003「count/range 不读 body」仍无区分性断言（f002 残留）

- 严重度：important
- 锚点：AC-003（`sources.list` 获取 count/range 不读取 body/value 内容）
- 位置：`tests/unit/agent_query_pushdown.test.ts:166-178`（AC-003）、`tests/unit/storage_keyset.test.ts:124-133`（AC-004f）
- 问题：AC-003 测试仍只断言 count/time_range 数值，注释声称「实现级证据见 storage_keyset.test.ts AC-004f（count/first_last 索引级断言）」，但 AC-004f 亦无任何读取量断言；storage 层 `count_reads` 计数钩子已存在（`storage.ts:650`，`count_by_store_keyset` 每调用自增）却未被任何测试断言。退化实现（`list_sources_pushdown` 改 getAll 全量读后内存算 count/time_range）对同一 fixture 返回相同数值，AC-003/AC-004f 全绿——「获取 count/range 不读取 body」条款仍零验证。
- 建议：AC-003 在 `list_sources_pushdown` 后断言 `count_reads = 7`（7 源各 1 次索引 count，退化 getAll 实现为 0 红）；或 AC-004f 断言两次 count 调用 `count_reads = 2` 且 keyset_cursor_reads 仅含 types 扫描所需，替代不成立的注释引用。

### 结论

- 前轮 finding 复核：f001 已消除；f002 部分消除（AC-002 修复到位，AC-003 残留见 f004）；f003 已消除。
- 改测方向复核：无「迁就实现」的改测。统计钩子（`_storage_stats_for_test`）为生产代码内 `_for_test` 约定命名（先例 `set_capture_size_for_test`），整数自增零开销，`beforeEach` reset，无副作用污染。新增 AC-003b 为真实回归测试（`network_builder.ts:107-108` 确认 `relative_time → relative_time_ms` 派生，生产形态可查）。测试名/注释与断言已对齐（不再有未实证覆盖声明）。
- 本轮新发现：1 条（f004）
- 未进表的提示：无
- 总体判断：三个前轮 blocker 中两个已消除、一个（AC-002）已消除但其 AC-003 锚点残留；AC-003 的区分性断言仍缺失——f004 未解决，FAIL。
- 系统性 follow-up：无

### AC 复验披露（Round 2）

- AC-001：`re_verified`（`point_reads=1`/`keyset_cursor_reads=0` 断言已核实区分旧实现）
- AC-002：`re_verified`（`cursor_reads=1` + 端到端三页 `cursor_reads=50` 已核实；退化 offset-skip 红）
- AC-003：`re_verified`（数值断言重跑绿；「不读 body」条款仍无区分性断言，见 f004）
- AC-004：`re_verified`（`cursor_reads=23` 已核实；退化 offset-skip=53、getAll=0、全量遍历=69 均红）
- AC-005：`re_verified`（对拍测试重跑绿，等价性断言未变）

coverage = 5 / 5

reviewed_scope: 6a2cfc18f61818e3

verdict: FAIL

## Round 3 (2026-08-13 17:17 UTC+8)

### 前轮 finding 复核（以 git diff 与代码/测试为准）

- **t161_test_f001（已消除，维持）**：无新变化，`keyset_cursor_reads=23` 断言继续区分退化实现。
- **t161_test_f002（已消除，维持）**：AC-002 断言与端到端读取量已验证；AC-003 残留部分本轮修复（见 f004 复核）。
- **t161_test_f003（已消除，维持）**：`point_reads=1`/`keyset_cursor_reads=0` 无变化。
- **t161_test_f004（已消除）**：修复到位，两处断言均精确区分索引 count vs getAll 退化——
  - AC-003（`agent_query_pushdown.test.ts:179`）断言 `count_reads === 7`：生产 `list_sources_pushdown` 对 ALL_SOURCES 7 源各调 1 次 `count_by_store_keyset`（storage.ts:650 每调用自增），=7 成立；退化 getAll 实现 count_reads=0 红。
  - AC-004f（`storage_keyset.test.ts:134-135`）断言 `count_reads === 2` + `keyset_cursor_reads === 0`：两次 `count_by_store_keyset` 调用=2；`first_last_keys_by_store` 走 openCursor 取 key 不经 keyset 记录读取钩子=0。退化 getAll 实现 count_reads=0 红；退化 openCursor 全量扫（复用 keyset 路径）keyset_cursor_reads>0 红。
  - 无假绿：断言为精确数值，且与生产计数点一一对应。

### 本轮新发现

- 无。AC-003 内 `toBeGreaterThanOrEqual(1)` 冗余行随后有精确 `toBe(7)` 兜底，非弱化断言，不入表。

### 结论

- 前轮 finding 复核：f001 已消除；f002 已消除（AC-002 本轮前已修，AC-003 残留本轮已修）；f003 已消除；f004 已消除。
- 改测方向复核：无「迁就实现」的改测；本轮仅新增计数断言，未改既有断言预期。
- 本轮新发现：0 条
- 未进表的提示：AC-003 的 `toBeGreaterThanOrEqual(1)` 可删（冗余），纯风格。
- 总体判断：4 条前轮 finding 全部消除，无未解决 critical/important；AC-001~005 的区分性行为（点查单读、limit 约束读取量、count/range 索引级、keyset O(N)、对外等价）均有真实 instrumentation 断言支撑。
- 系统性 follow-up：无

### AC 复验披露（Round 3）

- AC-001：`re_verified`（`point_reads=1`/`keyset_cursor_reads=0`）
- AC-002：`re_verified`（`cursor_reads=1` + 端到端 `cursor_reads=50`）
- AC-003：`re_verified`（`count_reads=7` 精确断言，退化 getAll=0 红）
- AC-004：`re_verified`（`cursor_reads=23`；AC-004f `count_reads=2`/`keyset_cursor_reads=0`）
- AC-005：`re_verified`（对拍等价断言重跑绿）

coverage = 5 / 5

reviewed_scope: 7aac8b96abcc8c4f

verdict: PASS
