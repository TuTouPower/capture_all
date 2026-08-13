# Task review t161（reviewer_focus: 代码）

- task：`t161_fix_agent_query_pushdown`
- spec：`docs/tasks/t161_fix_agent_query_pushdown/spec.md`
- diff_anchor：`c4d1a729f9b01032648372262b7ef976cf49039a`
- target：`git diff c4d1a729f9b01032648372262b7ef976cf49039a`
- round：1
- reviewed_at：2026-08-13 17:10 UTC+8
reviewed_scope: 5a8fecfbcf893e6c

## Findings

### t161_code_f001 - network_requests 记录无 relative_time_ms，被 capture_time 复合索引静默排除，下推查询全量丢数据

- 严重度：critical
- 锚点：AC-005（对外返回结果与修改前等价）；可观测行为缺陷——生产采集的 network 请求在 data.list/timeline.list/sources.list 中全部消失
- 位置：`src/extension/background/storage.ts:152`（索引字段）、`src/extension/background/service_worker.ts:1066-1076`、`src/shared/network_builder.ts:107`、`src/extension/background/agent_data_queries.ts:384-401`
- 问题：`capture_time` 复合索引为 `['capture_id', 'relative_time_ms', 'event_id']`，而 IndexedDB 复合索引要求三个字段全部存在才收录记录。network 请求数据（`NetworkRequestData`）的所有生产写入路径（`network_capture.ts:1002`、`network_hook.ts:478`、`body_capture_coordinator.ts:341`、`network_correlator.ts:74`）落库字段都是 `relative_time`（legacy 命名），`build_network_data` 只透传 `relative_time`（`network_builder.ts:107`），`handle_network_request` 只补 `capture_id`/`event_id`/`absolute_time`，从不写 `relative_time_ms`。因此 NETWORK_REQUESTS store 中所有 NetworkRequestData 形记录都不进 `capture_time` 索引（仅同 store 的 ws_frame/ws_message CaptureEvent 形记录因有 `relative_time_ms` 被索引）。后果：`list_entries_pushdown`（`agent_data_queries.ts:384`）、`count_by_store_keyset`、`first_last_keys_by_store` 对 network_requests source 恒返回空/0/null——`data.list`、`timeline.list`、`sources.list` 的 network 源全量丢失，且是静默错误（返回空结果而非报错）。纯函数路径（get_all_data/export）不受影响，新旧路径结果不一致，直接违反 AC-005。复验：在 `.scratch` 写探针按生产形态（无 `relative_time_ms`，带 `relative_time`）写入 3 条 network 记录后，`count_by_store_keyset`=0、keyset page_len=0、first/last=null；而同一记录经 `get_network_requests`（capture_id 索引）可读全 3 条（探针已删除）。
- 建议：三选一（需 implementer 定夺）：a) 写入端给 `NetworkRequestData` 补 `relative_time_ms`（与 CaptureEvent 对齐，但存量 v4 升级前数据仍缺，需迁移期数据回填）；b) network store 对 ws_frame 事件与请求数据分别建索引并在查询端按 `is_event_record` 分形查询合并；c) network source 保留全量路径并显式标注降级（spec 风险与回退允许）。同时把 `query_by_store_keyset`/`count_by_store_keyset` 对「索引不收录的记录」不可见这一不变量写进 decisions 或迁移校验。

### t161_code_f002 - AC-003/AC-005 测试 fixture 与生产写入形态不符，network 源回归无测试红灯

- 严重度：critical
- 锚点：AC-003、AC-005 的测试「测了假行为致 AC 看似覆盖但实际未验证」；测试层对 f001 的绿灯掩盖
- 位置：`tests/unit/agent_query_pushdown.test.ts:99`（`make_request` 带 `relative_time_ms: i`）、`:155-156`（net_source count=1）、`:206-219`（timeline 对拍）
- 问题：`make_request` fixture 给 `NetworkRequestData` 附加了 `relative_time_ms` 字段——生产写入端从不产生该字段（见 f001 证据链）。该 fixture 是测试中 network 记录能被 `capture_time` 索引收录、AC-003 断言 `net_source.count===1` 与 AC-005c timeline 对拍 `pushdown.total===pure.total` 能够通过的唯一原因。若 fixture 按真实落库形态（`relative_time`）构造，AC-003 与 AC-005c 立即变红，f001 的回归即可被测试暴露。当前测试对生产数据形态给出了虚假绿灯。
- 建议：`make_request` 改为生产形态（去掉 `relative_time_ms`，加 `relative_time`），修复 f001 后该测试应转绿；并在测试注释中标注 fixture 形态来源（`service_worker.ts:1066-1076` / `network_builder.ts:107`），防止再次漂移。

### t161_code_f004 - next_token 无命令层入参消费，offset 续页仍 O(N²/PAGE)，AC-004 续页承诺命令层不可达

- 严重度：minor
- 锚点：AC-004（提供 continuation token，下一页从 last key 继续，不从头 skip offset）——存储层满足，命令层只交付一半
- 位置：`src/extension/background/agent_command_dispatcher.ts:57-66`（data.list 无 after/token 入参）、`src/shared/protocol.ts:74-80`（`AgentQueryRange` 无 token 字段）、`src/extension/background/agent_data_queries.ts:397-400`（next_token 只出不回）
- 问题：`list_entries_pushdown` 返回 `next_token`，但 dispatcher 的 data.list 载荷只接受 offset/limit/start_time/end_time/order，协议 `AgentQueryRange` 无 token 入参，客户端无法把 token 回传给「下一页从 last key 继续」。客户端只能继续用 offset 翻页，而每页 `take = offset + limit` 都从窗口起点重读——全量翻页总读取量仍为 O(N²/PAGE_SIZE)，与 task 背景（PERF-H001/H002：offset cursor 全量聚合 O(N²)）同源，仅把单页读取从「全量」压到「offset+limit」、并保住单页内存有界。AC-004 的续页语义目前只对 storage API 直接调用者（如 `collect_source_types`）可达。
- 建议：协议层为 data.list 增加 `after`/`token` 入参并透传到 `query_by_store_keyset`（可保持向后兼容：有 token 时忽略 offset 或要求二选一）；若有意不在本 task 暴露，则在 spec 上下文区标注「命令层续页能力后续 task 提供」，避免 AC-004 被理解为已完整交付。

## 结论

- 前轮 finding 复核（Round 1）：无
- 本轮新发现：3 条（f001 critical / f002 critical / f004 minor）
- 未进表的提示：
  - 文件过大（未达 important 阈值，仅列路径与行数）：`src/extension/background/storage.ts` 721 行（本 task 净增 +161）、`src/extension/background/agent_data_queries.ts` 467 行（本 task 净增 +135），均 ≥400 建议拆分阈值、<800 important 阈值；未发现因膨胀直接导致的可观测缺陷。
  - 复杂度：无函数 CC ≥15；`query_by_store_keyset` 分支约 4，无需拆分。
  - 范围外观察：`record_belongs_to_capture`（`agent_data_queries.ts:450-453`）对 `capture_id` 缺失的记录放行（`cid === undefined` 视为归属），当前所有写入路径都补写 capture_id（`service_worker.ts:1066`），无实际失败场景，仅建议将来收紧；d008「network 写入含该字段」的 spike 假设与生产写入形态不符（详见 f001），findings 文件需就地修订。
- 总体判断：storage 层 keyset 分页与迁移本身正确，但 network_requests 源在下推路径全量丢数据（AC-005 违反，静默空结果），且测试 fixture 掩盖了该回归——两项 blocking 未解决。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——读代码确认 `get_entry_pushdown` 仅调 `get_store_record_by_id`（PK=event_id 与 `get_native_record_id` 首选 event_id 一致，`store.get(native_id)` 成立）；`agent_query_pushdown.test.ts:117-129` 跨 capture 拒查断言通过。
- AC-002：`re_verified`——`list_entries_pushdown` 的 `take = offset + limit` 有界透传（`agent_data_queries.ts:383-389`），timeline per-source 同理；`storage_keyset.test.ts` 与 AC-002 测试运行通过；但 network source 下结果错误（f001），AC-002 的「正确性」对该 source 不成立。
- AC-003：`re_verified`——count 用 `index.count(range)`、range 用 `first_last` cursor（`storage.ts:607-648`），types 扫描有显式标注；但 network count 恒 0（f001），且 AC-003 测试依赖假 fixture（f002）。
- AC-004：`re_verified`——`storage_keyset.test.ts` 7 用例（O(limit) advance、token 续页不重不漏、时间序、capture 隔离、窗口下推、desc、count/first-last 索引级）运行通过；我独立复核双界 bound 与 desc+after 的闭下界语义；命令层 token 不可消费（f004 minor）。
- AC-005：`re_verified`——对拍测试（`agent_query_pushdown.test.ts:161-219`）运行通过，我独立复核同刻 tie-break：纯路径读序（capture_id 索引 → PK 序）与 keyset 索引序（(t, event_id)）在同刻时都按 event_id 升序，timeline 跨源合并 stable sort 语义等价；但 network 记录缺失直接违反该 AC（f001），对拍仅覆盖了 fixture 形态（f002）。

coverage = 5 / 5

verdict: FAIL

## Round 2 (2026-08-13 17:20 UTC+8)

### 前轮 finding 复核（以 diff 与代码为准）

- **t161_code_f001（critical）→ 已修**：`build_network_data` 现复制 `relative_time_ms: input.relative_time`（`network_builder.ts:108`），所有活跃写入路径（`network_capture.ts:978/1040`、`network_correlator.ts:108/139`、`body_capture_coordinator.ts:330`、`network_hook.ts:456`）都传 `relative_time` → 新写网络记录全部入索引；DB v4 迁移增加 backfill（`storage.ts:157-173`）——在 versionchange 事务内 `openCursor` + `cursor.update({...record, relative_time_ms: rt})` + `continue`，幂等（仅补 `relative_time_ms === undefined` 的记录，值 `relative_time ?? start_time_ms ?? 0`，与纯函数 `get_record_sort_key` fallback 一致）。独立复验：`.scratch` 探针建 v3 库写入 legacy 记录（network 只有 `relative_time=150`、console 无时间字段）→ `init_db()` 升级 v4 → `count_by_store_keyset`=1、keyset page 返回 `relative_time_ms=150`、console 补 0 可查（探针已删）；`AC-003b` 测试用 `build_network_data` 只传 `relative_time` 的 input 验证 network 源可查（运行通过）。
- **t161_code_f002（critical）→ 已修**：新增 `AC-003b`（`agent_query_pushdown.test.ts`）用真实构建路径（`build_network_data` 只传 `relative_time`）验证 network 记录经索引可查、`sources.list` count=1、`data.list` 返回 1 条；`make_request` fixture 保留 `relative_time_ms` 作为对拍用「新形态/已 backfill」记录，标注可接受。f001 回归现在有测试红灯。
- **t161_code_f004（minor）→ 已修**：`AgentQueryRange` 增加 `after` token 入参（`protocol.ts:80-81`）、dispatcher data.list 透传 `payload.after`（`agent_command_dispatcher.ts:67`）、`list_entries_pushdown` 传 `query.after` 到 keyset（`agent_data_queries.ts:390-393`）；`agent_query_pushdown.test.ts` AC-002 增加端到端 token 续页（三页 50 条不重不漏 + `keyset_cursor_reads=50` 断言 O(N)），运行通过。

### 本轮新发现

### t161_code_f005 - v4 迁移 backfill 无自动测试覆盖；onerror 吞错且注释与真实行为不符

- 严重度：minor
- 锚点：非 blocking——迁移路径测试缺失（覆盖可更广）+ 错误处理注释误导
- 位置：`src/extension/background/storage.ts:157-173`（backfill）、`storage_keyset.test.ts` / `agent_query_pushdown.test.ts`（无迁移用例）
- 问题：backfill 是 f001 修复的存量数据部分（legacy 记录入索引），现有测试只覆盖 `build_network_data` 复制路径（AC-003b），无 v3→v4 升级迁移用例（fake-indexeddb 可测：建 v3 库 → `init_db()` 触发 onupgradeneeded → 断言 legacy 记录 keyset 可查——reviewer 已用 .scratch 探针验证可行，探针已删）。另外 `backfill.onerror` 空处理与注释「补键失败不阻断建库」不符：cursor request 错误会导致 versionchange 事务 abort → `onupgradeneeded` 失败 → `init_db` reject，实际会阻断建库；吞掉 onerror 使 abort 根因不可见。
- 建议：补一个 v3→v4 迁移测试（legacy network/console 记录 backfill 后 keyset 可查）；修正注释为「单条 update 失败会 abort 升级事务」，或记录错误到日志而非静默。

## Round 2 结论

- 前轮 finding 复核：f001 已修 / f002 已修 / f004 已修（均以 diff、探针与测试运行为据，未采信处置表自称）
- 本轮新发现：1 条（f005 minor）
- 未进表的提示：
  - dormant 路径遗漏：`service_worker.ts:993` `handle_fallback_body_event` 的 `build_network_data` 调用不传 `relative_time`（→ `relative_time_ms` 为 undefined，记录不入 keyset 索引）；该路径当前无生产者（`network_body_hook` 在 src 中无 content 侧发送方），不构成现网可观测缺陷；若将来启用该生产者，需补 `relative_time` 或归类到结论段处置。
  - `after` 与 `offset` 组合语义未文档化/未校验（`agent_command_dispatcher.ts:67` 同时透传两者；客户端同传会跳页/重页）——正确用法是续页时传 token 不带 offset；协议注释可补充。
  - `timeline.list` 未接 `after`（跨源合并无单键 token，合理）。
  - 文件过大（未达 important 阈值）：`storage.ts` 754 行（净增 +194）、`agent_data_queries.ts` 467 行（净增 +135），仍 ≥400 建议拆分；无因此直接导致的可观测缺陷。
  - 复杂度：无函数 CC ≥15。
- 总体判断：f001/f002/f004 修复语义正确（backfill 事务内 update+continue 经探针实测、复制路径覆盖全部活跃写入端、token 端到端续页 O(N)），无新 blocking 问题；仅剩 1 条 minor（迁移测试缺失 + 注释误导）待处置。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001：`re_verified`——`get_store_record_by_id` 主键直查 + 归属校验不变；stats 钩子断言 `point_reads=1` / `keyset_cursor_reads=0` 运行通过。
- AC-002：`re_verified`——limit=1 读取 1 条（`keyset_cursor_reads=1` 断言通过）；token 三页续页 `keyset_cursor_reads=50` 断言通过。
- AC-003：`re_verified`——count/first-last 索引级不变；AC-003b 真实验证 network 源可查。
- AC-004：`re_verified`——storage_keyset 7 用例 + stats O(N) 断言运行通过；token 经命令层端到端续页验证（f004 修复）。
- AC-005：`re_verified`——对拍测试（含 network 源）运行通过；探针证实 v4 升级后 legacy 记录 keyset 查询与纯函数 sort key 一致。

coverage = 5 / 5

reviewed_scope: 6a2cfc18f61818e3

verdict: PASS

## Round 3 (2026-08-13 17:20 UTC+8)

### 前轮 finding 复核（以 diff 与代码/测试运行为准）

- **t161_code_f005（minor）→ 已修**：
  - 迁移测试：新增 `tests/unit/storage_v4_migration.test.ts`——手工 `indexedDB.open(DB_NAME, 3)` 建 v3 结构库（NETWORK_REQUESTS 仅 keyPath `event_id` + `capture_id` 索引，模拟旧库无复合索引）→ 写入 legacy 网络记录（无 `relative_time_ms`，`relative_time=150`）→ `init_db()` 以 `DB_VERSION=4` 打开触发真实 `onupgradeneeded`（oldVersion=3）迁移（补索引 + backfill）→ `query_by_store_keyset` 断言返回 1 条、`relative_time_ms=150`。该测试走真实升级路径（非 mock），断言精确覆盖 f001/f005 的 legacy 补键语义。运行通过（`npx vitest run tests/unit/storage_v4_migration.test.ts`：1 passed）。
  - 注释修正：`backfill.onerror`（`storage.ts:171-173`）现如实说明「backfill 失败会 abort 迁移事务 → init_db 拒绝升级；宁可失败也不静默丢 legacy 数据入索引」——与 IDB 默认行为一致（onerror 未 `preventDefault` → versionchange 事务 abort → open 失败 → `init_db` reject），注释不再误导。
  - 全量复核：5 个 t161 相关测试文件 57 tests 全部通过；`npx tsc --noEmit` 0 错误。

### 本轮新发现

无。

## Round 3 结论

- 前轮 finding 复核：f005 已修（迁移测试真实有效 + 注释如实）；至此 Round 1（f001/f002/f004）与 Round 2（f005）全部闭环，无遗留 blocking 或 minor。
- 本轮新发现：0 条
- 未进表的提示：
  - 测试结构观察（当前单用例无影响）：`storage_v4_migration.test.ts` 若未来追加第二个用例，`beforeEach` 的 `deleteDatabase` 会因 storage 模块 `db` 缓存（v4 连接未关闭）触发 `onblocked` 被静默跳过，第二次 `build_v3_db_with_legacy` 打开 version 3 < 现有 4 会 `VersionError` 失败；建议将来多用例时改为在用例内清缓存或单独文件。
  - 文件过大（未达 important 阈值）：`storage.ts` 756 行、`agent_data_queries.ts` 467 行，≥400 建议拆分阈值，无因此直接导致的可观测缺陷。
  - 复杂度：无函数 CC ≥15。
- 总体判断：全部 finding 已闭环，迁移路径（v3→v4 补索引 + backfill）经真实升级路径测试与 reviewer 独立复核，无未解决 critical / important / minor。
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-001/002/003/004/005：`re_verified`——Round 2 复验结论不变；本轮新增 v3→v4 迁移用例（真实 onupgradeneeded 路径）独立验证 AC-005 的存量数据等价性（legacy network 记录 backfill 后 keyset 可查、排序键与纯函数一致），5 文件 57 tests 运行通过、tsc 0 错误。

coverage = 5 / 5

reviewed_scope: 7aac8b96abcc8c4f

verdict: PASS
