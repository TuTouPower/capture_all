# Task review t180（reviewer_focus: 测试）

- task：`t180_fix_store_contract_consistency`
- spec：`docs/tasks/t180_fix_store_contract_consistency/spec.md`
- diff_anchor：`b81d0ab2113563756b8edeca44eba1e8f0f05764`
- target：`git diff b81d0ab2113563756b8edeca44eba1e8f0f05764`
- round：1
- reviewed_at：2026-08-13 21:50 UTC+8

## Findings

### t180_test_f001 - AC-003「Agent source 可达」无行为级验证：lifecycle 记录不经过真实写→Agent 查询路径

- 严重度：minor
- 锚点：AC-003「`capture_lifecycle_events` 加入 CaptureSnapshot、export 事件合并与 Agent source」
- 位置：`tests/unit/store_contract_consistency.test.ts:109-120`（Agent 部分断言：`AGENT_DATA_SOURCES` 长度、`agent_data_queries.ts` 源码正则）；`tests/unit/agent_data_queries.test.ts:388-397`（`load_agent_capture_data` 空数据 toEqual）
- 问题：Agent source 路径的验证组合为「常量长度 + 源码文本正则 + 空数据字段」，三者均无法发现类别路由错误：`load_agent_capture_data` 测试把 `get_events_by_category` mock 成全返回 `[]`，`capture_lifecycle_events: []` 的 toEqual 在实现误查其他类别（如重复 `user_action`）时仍通过；`agent_query_pushdown.test.ts:179` 的 `count_reads = 8` 只证明 `sources.list` 对 8 个 store 各执行一次 count（含 lifecycle store），不覆盖 `get_record_type/summary/preview` 对 lifecycle 记录（CaptureEvent 形态）的路由与下推返回。失败场景：`get_record_type` 的 `capture_lifecycle_events` case 被删（回退 undefined）或 load 路径类别字符串写错，全部测试仍绿。
- 建议：新增行为测试——真实 fake-indexeddb 下 `write_events([lifecycle_event])` 后经 `load_agent_capture_data` / `list_entries_pushdown('capture_lifecycle_events')` 断言返回该记录（type/summary/preview 各断言一项），并补 `expect(get_events_by_category).toHaveBeenCalledWith('cap-1', 'capture_lifecycle', 0, 5000)`。

### t180_test_f002 - AC-003「UI 不展示」用源码文本扫描代替行为断言

- 严重度：minor
- 锚点：AC-003「UI 标签仍不展示 lifecycle」
- 位置：`tests/unit/store_contract_consistency.test.ts:106-108`
- 问题：断言读 `dashboard_shared.ts` 源码文本，检查 `Pick<CaptureSnapshot, ...>` 内容不含 `lifecycle_events`。有失效能力（实现把 lifecycle 加进 Pick 会红），但绑定源码格式：换行/引号样式变化即脆断；且 Pick 类型不含与运行时渲染不含是两层事实，文本测试只能证明前者。`merge_detail_events` 是纯函数，可直接行为断言。
- 建议：改为调用 `merge_detail_events`：构造含 `lifecycle_events: [event]` 的 snapshot，断言返回 events 不含该事件（或 `toHaveLength` 等于其余源事件数）。

### t180_test_f003 - AC-004 测试为源码正则 + 手动调用 handler，未验证真实 versionchange 触发路径

- 严重度：minor
- 锚点：AC-004「IndexedDB 长连接收到 versionchange 时关闭连接，不阻塞 schema bump」（spec 可测试性声明标注 `[deploy]`，认可需真实多上下文环境验证）
- 位置：`tests/unit/store_contract_consistency.test.ts:122-137`
- 问题：`db.onversionchange` 存在性 + 手动调用 handler 不抛异常，只证明「回调已注册、可直接调用」，不证明「浏览器触发 versionchange 时连接被关闭、下次 `open` 能完成升级」——后者正是 AC 的验收行为。AC-004 已 `[deploy]`，spec 不要求自动测试，本测试属辅助证据，不算覆盖缺口；但文本正则 `/db = null/`、`/db\?\.close\(\)/` 绑定实现文本，实现改为 `db = undefined` 或换写法即误红。
- 建议：作为辅助证据可保留；注释/命名中明示为「实现存在性哨兵」，不写入 handoff 的 AC-004 自动验证证据。

### t180_test_f004 - `load_agent_capture_data` 测试名与断言集未随 8 源契约同步

- 严重度：minor
- 锚点：AC-003（Agent source 8 源）；接口传播
- 位置：`tests/unit/agent_data_queries.test.ts:357`（测试名「loads all 7 data sources and wraps capture」）
- 问题：生产实现已 8 源，expected 对象已补 `capture_lifecycle_events: []`，但测试名仍写「7 data sources」，且 `toHaveBeenCalledWith` 断言覆盖 7 个类别唯独缺 `'capture_lifecycle'`（其余 7 类别均有）。名称陈旧 + 类别路由断言缺一条。
- 建议：改名「loads all 8 data sources...」，补 `expect(get_events_by_category).toHaveBeenCalledWith('cap-1', 'capture_lifecycle', 0, 5000)`。

## 结论

- 前轮 finding 复核：Round 1，无
- 改测方向复核：无迁就实现。全部 7 处既有测试改动均为接口传播：`CaptureSnapshot.lifecycle_events` 必填字段（export_busy_guard ×3、dashboard snapshot fixture）、`AgentCaptureData` 8 源 fixture（agent_data_queries ×3、t136、t152 ×2）、`count_reads` 7→8（agent_query_pushdown——`ALL_SOURCES` 8 源各一次 `count()`，回归 7 源会红，断言预期随契约合法更新）。
- 本轮新发现：4 条（均 minor）
- 未进表的提示：
  - export 合并仅对 `export_json` 行为断言，jsonl/html 同构合并代码与 dashboard archive zip 合并（`dashboard_shared.ts:382`）未逐格式断言；同构路径，可选扩展。
  - 生产注释 `src/extension/background/agent_data_queries.ts:332,368` 仍写「七源/7 sources」，属 code reviewer 范围。
- 总体判断：新增测试覆盖 AC-001（14 store 数量）、AC-002（export 合并）、AC-003（快照/常量/映射），AC-004 按 `[deploy]` 处置；4 条 minor 不阻断。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——重跑 `npx vitest run tests/unit/store_contract_consistency.test.ts` 通过；断言 `objectStoreNames` 含 14 个 store（4 legacy + captures/app_logs/lifecycle + 7 事件源）且 `AGENT_DATA_SOURCES.length === 8`，与 `docs/blueprint/domain.md`「10 当前 + 4 legacy = 14」一致；对 `storage.ts` `onupgradeneeded` 逐 store 数数复核 = 14。
- AC-002：`re_verified`——`export_json` 行为测试（mock 仅限数据读取边界与 user_config，合并/排序走真实 exporter）断言 `data.events` 含 `capture_started`，重跑通过。
- AC-003：`re_verified`（部分）——`read_capture_snapshot` 返回 `lifecycle_events` + `toHaveBeenCalledWith('c1','capture_lifecycle',0,5000)` 行为断言重跑通过；「UI 不展示」为源码文本断言（弱，见 f002）、Agent source 为常量/文本/空字段断言（弱，见 f001）。
- AC-004：`trust_prior`——`[deploy]` 需真实多上下文浏览器环境；自动测试仅源码正则 + handler 手动调用，未验证真实事件触发，依赖实施侧 `[deploy]` 人工验证安排。

coverage = 3 / 4

reviewed_scope: e98af2fa7950c3c3

verdict: PASS

## Round 2 (2026-08-13 22:00 UTC+8)

### 前轮 finding 复核（以 diff 与代码为准）

- t180_test_f001（已消除）：`tests/unit/store_contract_consistency.test.ts:104-118` 新增真实行为链路——`write_events([lifecycle_event])` 真实写入 fake-indexeddb，恢复 `get_events_by_category` 真实实现后经 `load_agent_capture_data` 断言 `capture_lifecycle_events` 含 `lc1`，并经 `list_sources_pushdown` 断言 lifecycle 源 count=1。写→读闭环、类别路由、sources.list 汇总均被真实路径覆盖，重跑通过。
- t180_test_f002（修不彻底，换形式弱化 → 见 f005）：新增的「行为链路：merge_detail_events 不含 lifecycle」测试输入 7 源全空数组，`merge_detail_events` 为纯函数（`dashboard_shared.ts:241-245` 仅拼接输入），输出必然 `[]`，断言 `events.some(...)` 必然为 false——任何实现变化（包括把 lifecycle 并入 merge）下都不会红，属恒真断言，未提供 AC-003「UI 不展示」的行为级失效能力。
- t180_test_f003（已消除）：`tests/unit/store_contract_consistency.test.ts:147-160` 新增真实 versionchange 路径——以 `DB_VERSION + 100` 打开第二连接，`onblocked`/超时 2s 守卫判定旧连接未关闭，断言新连接 onsuccess 成功。fake-indexeddb 下真实事件派发验证 handler 关闭连接，重跑通过。
- t180_test_f004（已消除）：`tests/unit/agent_data_queries.test.ts:357` 测试名改为「loads all 8 data sources and wraps capture」，并补 `expect(get_events_by_category).toHaveBeenCalledWith('cap-1', 'capture_lifecycle', 0, 5000)`（`agent_data_queries.test.ts:408-409`）。

### 新 finding

### t180_test_f005 - AC-003「UI 不展示」行为证据为恒真断言（merge_detail_events 输入全空）

- 严重度：important
- 锚点：AC-003「UI 标签仍不展示 lifecycle」；危险模式扫描——恒真断言（最低 important，禁止 minor）
- 位置：`tests/unit/store_contract_consistency.test.ts:120-132`（测试「行为链路：merge_detail_events 不含 lifecycle」）
- 问题：`merge_detail_events` 是纯函数（`dashboard_shared.ts:241-245` 仅拼接 7 个输入数组），测试传入的 7 源全为 `[]`，输出必为 `[]`，`events.some(e => e.category === 'capture_lifecycle')` 必然为 false。断言在任何实现变化下都成立——即使实现把 `lifecycle_events` 并入 merge 输出，该测试仍绿。测试注释自称「即使含 lifecycle 的事件也不进入 UI 合并（Pick 显式排除）」，但输入根本未携带任何 lifecycle 事件，该声明未被验证。作为 f002 的行为级修复，它以「看起来像行为断言」的形式复现了恒真断言，AC-003 UI 部分仍无具备失效能力的行为测试（原 Pick 文本扫描测试仍保留，可红但绑定源码格式）。
- 建议：向 `merge_detail_events` 传入带 `lifecycle_events: [lifecycle_event]` 的完整 snapshot（`as never` 越界键，运行时 JS 允许），断言返回 events 不含 `event_id === 'lc1'`；若实现并入 lifecycle 则红，测试具备真实失效能力。

### 结论

- 前轮 finding 复核：f001 已消除；f002 修不彻底（换形式弱化，升级为 f005）；f003 已消除；f004 已消除
- 改测方向复核：本轮无「迁就实现」的改测；新增测试均为真实行为路径（写→读闭环、versionchange 事件派发），仅 f005 为恒真断言新增
- 本轮新发现：1 条（t180_test_f005，important）
- 未进表的提示：`src/extension/popup/popup.ts:285` archive 导出新增 lifecycle 事件合并（与 dashboard 侧一致），无直接行为测试（popup UI 接线层）；jsonl/html/archive zip 合并仍仅 json 路径有行为断言——同构代码，可选扩展
- 总体判断：4 项处置中 3 项已消除，f002 的替换测试构成恒真断言（important 未解决），AC-003「UI 不展示」缺有效行为证据
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001：`re_verified`——重跑 `npx vitest run tests/unit/store_contract_consistency.test.ts tests/unit/agent_data_queries.test.ts` 全绿；store 数 14、`AGENT_DATA_SOURCES` 8 源断言不变；`docs/blueprint/architecture.md`/`domain.md` 已同步「14 stores / 8 源」文档。
- AC-002：`re_verified`——`export_json` 含 `capture_started` 断言重跑通过。
- AC-003：`re_verified`（部分）——快照行为断言、Agent 行为链路（f001）重跑通过；「UI 不展示」仍无有效行为断言（f005 未解决）。
- AC-004：`trust_prior`——`[deploy]`；真实 versionchange 路径测试已补（fake-indexeddb 事件派发），真实多上下文行为仍依赖人工验证。

coverage = 3 / 4

reviewed_scope: 165bcb2ef4ce14b2

verdict: FAIL

## Round 3 (2026-08-13 22:10 UTC+8)

### 前轮 finding 复核（以 diff 与代码为准）

- t180_test_f005（已消除）：`tests/unit/store_contract_consistency.test.ts:120-136` 重构——传入含普通事件 `u1` 与 `lifecycle_events: [lifecycle_event]`（`as never` 越界键）的完整 snapshot，三重断言：
  1. `events.some(e => e.event_id === 'u1')` 为 true（正对照，证明 merge 以真实数据执行、非空断言）；
  2. `category === 'capture_lifecycle'` 为 false（类别级否定）；
  3. `event_id === 'lc1'` 为 false（**判别断言**——若实现把 lifecycle_events 并入 merge 输出，`lc1` 出现在结果中即转红）。
  恒真性已消除：输出非空（u1 断言保证）、lifecycle 排除有真实失效能力。重跑 11 用例全绿。

### 结论

- 前轮 finding 复核：f005 已消除；f001~f004 维持 Round 2 已消除结论
- 改测方向复核：无迁就实现的改测；本轮修复为测试本身补强判别力，断言预期与实现行为一致
- 本轮新发现：0 条
- 未进表的提示：无新增（popup archive 合并无直接行为测试已在前轮提示，不重复计）
- 总体判断：全部 finding（f001~f005）已消除；新增测试覆盖 AC-001/002/003 行为路径，AC-004 按 `[deploy]` 处置且有 fake-indexeddb 真实事件路径辅助验证
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-001：`re_verified`——`init_db` 后 objectStoreNames=14、`AGENT_DATA_SOURCES`=8 断言重跑通过；文档（architecture/domain.md）已同步 14 stores / 8 源。
- AC-002：`re_verified`——`export_json` 含 `capture_started` 断言重跑通过。
- AC-003：`re_verified`——快照行为断言、Agent 行为链路（f001）、merge_detail_events 排除断言（f005 修复，具失效能力）重跑通过。
- AC-004：`trust_prior`——`[deploy]` 真实多上下文行为依赖人工验证；fake-indexeddb 真实 versionchange 事件路径测试为辅助证据。

coverage = 3 / 4

reviewed_scope: fe759501af06e384

verdict: PASS
