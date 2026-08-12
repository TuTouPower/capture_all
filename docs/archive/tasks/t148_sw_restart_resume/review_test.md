# Task review t148（reviewer_focus: 测试）

- task：`t148_sw_restart_resume`
- spec：`docs/tasks/t148_sw_restart_resume/spec.md`
- diff_anchor：`733792b34a05811ce701885828cf5daebb06491e`
- target：`git diff 733792b34a05811ce701885828cf5daebb06491e`
- round：1
- reviewed_at：2026-08-12 22:10 UTC+8

reviewed_scope: f0b1255b6f4576af

## Findings

### t148_test_f001 - AC-005 持久化写入侧（persist_stats 写 storage_bytes_written）无测试触达

- 严重度：minor
- 锚点：AC-005「单采集写入字节数持久化（随 CaptureRecord 或独立键）」的写入侧
- 位置：`tests/unit/storage_limit_restart.test.ts:113,145`（测试手工预置 record 值）；生产 `src/extension/background/service_worker.ts:809-813`
- 问题：AC-005/AC-006 新测试都通过「手工预置 / update_capture 覆写 CaptureRecord.storage_bytes_written」来模拟已持久化的基数，全程未触达真正负责把字节数落盘的 `persist_stats`（service_worker.ts:810-812：`ensure_size_base` + `storage_bytes_written = get_capture_size` + `update_capture`）。若该三行写入逻辑回归（不写 / 写错 capture_id / 口径错），现有测试仍全绿——生产重启后 `ensure_size_base` 会读到 0，AC-005「限额检查可重建」实质失效但测试无法察觉。覆盖盘点：AC-005 新测试只覆盖了「重建侧」（DB 已存值时读回），未覆盖「写入侧」；既有 T110 / stale_cleanup 测试均 mock `update_capture`，同样不触达持久化写入。新增代码的 persist_stats 三行目前是零测试覆盖。
- 建议：补一个 case——start 后经 `handle_event` 写入事件（触发 persist_stats），`get_capture` 读回 record，断言 `storage_bytes_written` 等于 `get_capture_size`（或 >0 且随事件增长）。该 case 能让「写入侧」回归被红灯捕获，闭环 AC-005。

### t148_test_f002 - AC-002 无对应测试，且 spec 正文未与「重启即终止」决策对齐

- 严重度：minor
- 锚点：AC-002「恢复后新事件写入原 capture_id，generation token 防旧回调串写」
- 位置：`docs/tasks/t148_sw_restart_resume/spec.md:32`
- 问题：AC-002 无任何测试，也不在「可测试性声明」列出的 AC 中。上下文区决策（决策 010 / t030「重启即终止」，spec 未知契约清单已确认）下恢复分支不可达：SW 重启后新实例 `is_capturing=false`，`handle_event` 早退（service_worker.ts:820），「恢复后新事件写入原 capture_id」不会发生；generation token 防串写由既有机制承担（`capture_state.ts` `current_generation`/`is_active_generation`，service_worker.ts:1018 等异步守卫），其测试在 capture_state.test.ts 与既有生命周期测试。spec 正文 AC-002 仍按「可恢复」语境书写，与已批准决策不一致，测试 reviewer 无法为语义空置的 AC 补测试。
- 建议：处置为改 spec——在 AC-002 或可测试性声明中标注「终止语义下，该 AC 由 generation token 既有机制 + 终止路径测试覆盖，无需新测试」，与代码 reviewer 对该 AC 的 re_verified 结论对齐。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 改测方向复核：无。`service_worker_stale_cleanup.test.ts` diff 仅新增（`flush_all` mock + 2 个新 test），未改既有断言；`storage_limit_restart.test.ts` 为全新文件。无「迁就实现」的改测。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - AC-006「真实重启」无法在进程内复现（真实重启即终止），测试以「DB 预置基数 + test hook 注入增量」驱动真实链路：`handle_event` → `check_limit_and_stop` → `check_storage_limit` → `ensure_size_base`（经静态追踪，'cap_r' 首查时 `size_base_loaded` 为空，必然真实读 IndexedDB）→ `stop_capture('storage_limit')` → `capture_stopped` 事件真实写入并读回。判定为真实 code path 覆盖，非假绿。唯一注入点是 `set_capture_size_for_test` 增量（模拟重启后累计），属既有 T110 测试钩子的边界用法。
  - `storage_limit_restart.test.ts` 依赖 fake-indexeddb 跨测试 / 跨 `resetModules` 持久化：数据隔离靠 capture_id 唯一（cap_rebuild / no_such_capture / cap_r 无冲突）。若未来复用 capture_id，`create_capture` 的 `store.add` 会因键重复抛错，属潜在维护陷阱（代码 reviewer 已提示 `set_capture_size_for_test` 语义变更同类风险）。
  - AC-003 测试用 `objectContaining({active_capture_id: null})` 断言清键，未断完整清键集；完整清键已有既有测试 'cleans stale state successfully'（同一 `storage_set` 调用点）覆盖，不构成缺口。
  - f001 与代码 reviewer 的 f001（终态 `storage_bytes_written` 陈旧）相关但不同：代码 f001 是终态值陈旧，本 f001 是写入机制无测试触达。
- 总体判断：AC-005 重启重建基数（真实模块重载 + 真实 IndexedDB 读）与 AC-006 限额停止（真实 stop + storage_limit 事件链路）均真实触达生产路径，判别力充分；stale_cleanup 新增的 flush 先于终态化（invocationCallOrder 对比）与 flush 失败仍清键（update_capture/storage_set 继续 + 无致命错误）断言均有判别力，且能区分「无 try/catch」与「flush 在 update 之后」的回归；危险模式扫描无命中。仅 2 条 minor，无未解决 critical/important。

### AC 复验披露

- AC-001：`re_verified`——新测试断言 `flush_all` 先于 `update_capture`（`invocationCallOrder` 对比，flush 未调用或后调用均会红灯），与生产代码 cleanup 内 flush 先于终态化（service_worker.ts:149→155）一致。
- AC-002：`re_verified`——静态核对：恢复分支未实现（cleanup 走终态化清键），generation token 机制存在于 `capture_state.ts`（`current_generation`/`is_active_generation`）并被 service_worker.ts:1018 等异步守卫使用；终止语义下 AC 满足，无新测试（见 f002 的 spec 对齐建议）。
- AC-003：`re_verified`——新测试 mock `flush_all` 拒绝后断言 `update_capture(status:'completed')` + `storage_set` 清 `active_capture_id` + `get_cleanup_errors()` 为空，与生产 try/catch（service_worker.ts:148-152）一致；去掉 try/catch 或阻断终态化均会红灯。
- AC-005：`re_verified`（重建侧）——新测试 `vi.resetModules()` 真实重载模块（内存 Map 清空）+ `check_storage_limit` 真实读 IndexedDB 重建基数 123456，删除 DB 读或模块重载都会红灯；持久化写入侧未覆盖见 f001。
- AC-006：`re_verified`——静态追踪：ensure_size_base 首查读 DB（size_base_loaded 空）、基数(MAX-1024)+增量(1024)=MAX 触发、`capture_stopped(reason:'storage_limit')` 真实写入 IndexedDB 并读回、`get_status.is_capturing=false`；若 ensure 不读 DB 或 stop 未接线均红灯。
- AC-004：`trust_prior`——既有 stale_cleanup 测试仅新增 mock 未改断言，语义兼容；「测试保持通过」依赖实施侧 `npm test 全绿` 声明（reviewer 只读未运行套件）。
- AC-007：`trust_prior`——storage.test.ts / storage_limit_active_delete.test.ts / stop_capture.test.ts 断言经静态核对在新语义（base=0 时等价旧行为）下仍成立；「通过」依赖实施侧套件运行证据。

coverage = 5 / 7（AC-004、AC-007 因未执行测试套件标 trust_prior，占比 29% ≤ 30%，不追加人工抽查行）

- 系统性 follow-up：建议「test: 补 persist_stats 持久化 storage_bytes_written 写入侧断言」/ slug `test_persist_stats_write_base`（阻断性：minor）；如 f001 采纳则无需 follow-up。

verdict: PASS

## Round 2 (2026-08-12 22:35 UTC+8)

reviewed_scope: e8627523e4ce9aa2

## Findings

### t148_test_f003 - f001「修复」为换形式弱化：persist_stats 写入侧仍零覆盖

- 严重度：important
- 锚点：AC-005「单采集写入字节数持久化」写入侧；t148_test_f001 复核
- 位置：`tests/unit/storage_limit_restart.test.ts:133-146`
- 问题：f001 处置写「已修」，但新增测试（'写入侧：事件写入后 get_capture_size 累计'）断言 `storage.get_capture_size('cap_write')).toBeGreaterThan(0)`——`get_capture_size = size_base(0) + size_delta(事件字节)`，验证链仅 `write_events → flush_store → update_bytes_written → size_delta`，**不触达** persist_stats 落盘三行（service_worker.ts:812-813 `current_capture.storage_bytes_written = get_capture_size(...)` + `update_capture(current_capture)`）。若 persist_stats 这三行删除或写错，此测试仍绿。原 finding 的核心缺口（写入侧落盘零覆盖）未消除，仅以「内存模型累计」断言替换。implementer 理由「fake-indexeddb 引用时序受限」与同文件 AC-006 测试已用真实 `storage.update_capture`（line 160）写 fake-indexeddb 且 `get_capture`（line 158）读回成功的既定事实矛盾；若真遇时序问题，应属测试基础设施缺口并如实披露，不得用平行断言冒充覆盖。
- 建议：按原建议补 case——start 后经 `handle_event` 写事件（触发真实 persist_stats），`storage.get_capture` 读回 record，断言 `record.storage_bytes_written === storage.get_capture_size(capture_id)`（两者同 handle_event 同步时序可同时成立）；或调查并消除时序根因后在报告中披露真实限制。若最终判定写入侧确不可自动测，应在「可测试性声明」补记并接受 AC-005 写入侧 trust_prior。

### t148_test_f004 - Round 2 引入 delete_capture 空操作回归，既有测试假绿

- 严重度：critical
- 锚点：行为缺陷 + AC-007「既有 storage 测试语义不回退」/ storage_limit_active_delete AC-002b
- 位置：`src/extension/background/storage.ts:196-221`（delete_capture）；`tests/unit/storage_limit_active_delete.test.ts:110-114`
- 问题：Round 2 在 `delete_capture` 加 `clear_size_state` 时，把原先遍历 9 个 store 执行 `store.delete` / `index.openCursor(...).delete()` 的 for 循环整体删除，事务内不再有任何删除操作，`delete_capture` 变为空操作——捕获记录与全部事件数据永驻 IndexedDB。基线 733792b 该 for 循环存在（git show 确认）。既有测试 `storage_limit_active_delete.test.ts:110-114`（AC-002b「非活跃 capture 可删除」）只断言 `del.success === true`，不验证删除后的存储效果，故测试仍绿——「测了假行为致 AC 看似覆盖但实际未验证」。影响：用户/MCP 调 `delete_capture` 返回成功但数据不删，属 broken functionality / 数据管理错误；AC-007 语义回退保证失效。
- 建议：恢复 delete_capture 删除逻辑（for 循环内 store 删除 + cursor.delete），`clear_size_state` 仅作 oncomplete 内附加清理；同时在 AC-002b 或等价测试补「delete 后 `get_capture` 返回 null / `list_captures` 不含该 id」的存储效果断言，使空操作回归能被红灯捕获。该修复需 code reviewer 复核。

## 结论

- 前轮 finding 复核：
  - t148_test_f001：**修不彻底 / 换形式弱化**。原要求写入侧落盘验证，新测试仅验证内存 delta 累计（`get_capture_size > 0`），persist_stats 落盘三行仍零覆盖。→ 见新 finding f003。
  - t148_test_f002：**已消除**。spec.md AC-002 已改为「终止语义下无恢复分支；generation token 与 run_exclusive 防串写为既有机制」，与决策 010/t030 对齐；spec 过时处置合法（AC 编号保留、ac_evidence 仍可精确覆盖）。
- 改测方向复核：f001 的「修复」属迁就实现/弱化（新测试验证当前实现恰好可过的弱断言，未实现原 finding 目标）；spec.md 修改为合法 spec 对齐，不计改测。未发现对既有测试断言的就地篡改。
- 本轮新发现：2 条（f003 important、f004 critical）
- 未进表的提示：delete_capture 空操作同时是 code 层回归，Round 1 code 报告（PASS）看不到该 Round 2 改动，需 code reviewer 追加复核；建议 task 处置表将 f004 关联 code 修复一并处理。
- 总体判断：f002 已消除；但 f001 换形式弱化（important）与 delete_capture 空操作假绿（critical）未解决，本 task 测试可信度不足。

### AC 复验披露（Round 2 增量）

- AC-005：写入侧仍未复验（f003）；重建侧维持 Round 1 re_verified。
- AC-007：`trust_prior` 降级——delete_capture 空操作使既有 delete 测试假绿（f004），「既有 storage 测试语义不回退」当前不成立，需修复后重验。
- 其余 AC 复验结论同 Round 1。

coverage = 4 / 7（AC-001/002/003/006 re_verified；AC-005 重建侧 re_verified / 写入侧未覆盖；AC-004 trust_prior；AC-007 因 f004 不通过）

- 系统性 follow-up：delete_capture 空操作需修复 + 补存储效果断言；建议归入本 task code 修复，无独立 follow-up 需求。

verdict: FAIL

## Round 3 (2026-08-12 22:45 UTC+8)

reviewed_scope: eab2b0979d59dafd

## Findings

### t148_test_f005 - f003 修复仍为换形式弱化：persist_stats 写入侧依旧零覆盖

- 严重度：important
- 锚点：AC-005「单采集写入字节数持久化」写入侧；t148_test_f003 复核
- 位置：`tests/unit/storage_limit_restart.test.ts:133-153`；生产 `src/extension/background/service_worker.ts:810-813`
- 问题：f003 处置写「已修」，但写入侧测试（'写入侧：事件写入后限额跟踪累计且落盘路径可行'）仍不验证 persist_stats 的落盘写。逐行：
  - line 145 `expect(storage.get_capture_size('cap_write')).toBeGreaterThan(0)` 只验证内存 delta 累计（base 0 + delta > 0），不涉及 persist_stats。
  - line 148-150：`get_capture('cap_write')` 得 rec 后仅 `expect(rec).not.toBeNull()`，随后**测试自己**执行 `update_capture({...rec!, storage_bytes_written: get_capture_size(...)})` 写入。
  - line 152 `expect(rec2!.storage_bytes_written).toBe(storage.get_capture_size(...))` 是测试自写自读的**同义反复**——无论 persist_stats 是否落盘 storage_bytes_written，该断言恒成立。persist_stats 的三行写入（`ensure_size_base` + `current_capture.storage_bytes_written = get_capture_size(...)` + `update_capture(current_capture)`，service_worker.ts:810-813）若整体删除或写错，本测试仍全绿。原 finding 的缺口（写入侧落盘零覆盖）未消除。
  - 关于处置表 rationale 的两点：「fake-indexeddb logger 未接 transport 掩盖 persist_stats 错误日志」只说明 persist_stats 若在测试环境抛错会被 logger mock 吞掉——这恰恰是**测试基础设施缺口**，正确处置是在「可测试性声明」如实披露并接受 AC-005 写入侧 trust_prior，而非用测试自写代替；「引用对象 update 已验证可行 REF_SWB 999」是 debug 手验，非自动断言，不能作为回归保护。同文件 AC-006 已用真实 `update_capture`（line 167）写 fake-indexeddb、`get_capture`（line 165）读回成功，证明该环境下 persist_stats 的 `update_capture(current_capture)` 本应可被直接断言。
- 建议：将 line 148-152 改为直接断言 persist_stats 的效果——`const rec = await storage.get_capture('cap_write'); expect(rec!.storage_bytes_written).toBe(storage.get_capture_size('cap_write'))`（handle_event await persist_stats 完成后 send_event 才 resolve，时序同步）。若该断言在测试环境红，则说明 persist_stats 写入在测试环境不可达，应在「可测试性声明」补记并降 trust_prior，不得自写冒充覆盖。

## 结论

- 前轮 finding 复核：
  - t148_test_f003：**修不彻底 / 换形式弱化**。处置表 rationale（logger 掩盖错误日志、引用对象 update 手验可行）不改变事实：写入侧测试仍是测试自写自读的同义反复，persist_stats 落盘三行零覆盖。→ 见新 finding f005。
  - t148_test_f004：**已消除**。`delete_capture` for 循环恢复（storage.ts:214-230 逐 store 删除 + cursor.delete），`clear_size_state` 移入 oncomplete（232-235）；`storage_limit_active_delete.test.ts:112-124` 预置 cap_old 并断言删后 `get_capture` 为 null，删除空操作回归可被红灯捕获。删除效果断言真实触达（storage 模块未 mock delete_capture，走真实 IndexedDB）。
  - t148_test_f002：维持已消除（spec AC-002 对齐，Round 2 已核）。
- 改测方向复核：f003 的两次「修复」均为迁就实现/弱化（新断言验证当前实现恰好可过的自写自读）；无对既有测试断言的篡改。
- 本轮新发现：1 条（f005 important，即 f003 未修实质）
- 未进表的提示：无新增。f004 修复同时覆盖 code 层回归（code 处置表 t148_code_f003 已标已修），无需 code reviewer 追加。
- 总体判断：f004（critical）与 f002 已消除；f003/f005（AC-005 写入侧零覆盖，important）仍未解决，本 task 测试可信度不足，不能认定 AC-005 写入侧有自动回归保护。

### AC 复验披露（Round 3 增量）

- AC-005：写入侧仍未复验（f005）；重建侧维持 re_verified。
- AC-007：恢复——delete_capture 回归已修且 AC-002b 补删除效果断言（f004 消除），既有 storage/stop 语义静态核对成立；「测试保持通过」仍 trust_prior（未运行套件）。
- 其余 AC 复验结论同 Round 2。

coverage = 4 / 7（AC-001/002/003/006 re_verified；AC-005 重建侧 re_verified / 写入侧未覆盖；AC-004 trust_prior；AC-007 trust_prior）

- 系统性 follow-up：无新增（f003 遗留，建议已含于 finding 建议）。

verdict: FAIL

## Round 4 (2026-08-12 23:05 UTC+8)

reviewed_scope: 809760650176c9b4

## Findings

本轮无新 finding（0 条）。

## 结论

- 前轮 finding 复核：
  - t148_test_f005：**已修**。当前写入侧测试（`storage_limit_restart.test.ts:133-151`）已移除 update_capture 自写自读（line 150 仅断言 `get_capture_size > 0` 内存累计），不再冒充 persist_stats 落盘覆盖；`mouse_event` 为合法 EventType（`src/shared/event_category.ts:3` USER_ACTION_TYPES），事件经 category 归类写入 user_action store、delta 累计，断言判别力成立。spec 可测试性声明新增披露（spec.md:48）：AC-005 persist_stats 落盘直接断言受 fake-indexeddb 并发事务限制（handle_event 内 write_events 与 persist_stats 的 update_capture 连续写事务不可靠），已用内存累计替代验证并标注 trust_prior——符合 finding 建议的第二种路径（如实披露 + 不冒充），处置合理。AC-005 核心闭环仍由重建侧测试（重载模块 + 真实 DB 读基数 123456）与 AC-006（`update_capture` 写 storage_bytes_written 落盘读回 + 增量触发限额）在存储层覆盖，persist_stats 三行接线（`ensure_size_base` + 赋值 + `update_capture`）如实降 trust_prior 可接受。
  - t148_test_f004：维持已修（delete 循环恢复 + AC-002b 删除效果断言，Round 3 已核）。
  - t148_test_f002：维持已修（spec AC-002 对齐，Round 2 已核）。
  - t148_test_f003 / f001：随 f005 一并闭环（写侧测试以 trust_prior 披露收口，不再声称覆盖）。
- 改测方向复核：f005 的处置符合「如实披露 trust_prior」而非迁就实现；未发现对既有测试断言的篡改。
- 本轮新发现：0 条
- 未进表的提示：
  - spec 可测试性声明措辞「已用『get_capture_size 内存累计 + update_capture 引用对象落盘』验证模型正确性」与当前测试代码略有偏差（写入侧测试已移除 update_capture 引用对象落盘部分；AC-006 仍有 update_capture 落盘，措辞可宽泛成立）。建议 implementer 微调措辞为「内存累计验证 + AC-006 的 storage_bytes_written 落盘读回」，非阻断。
  - fake-indexeddb 并发事务限制属测试基础设施缺口（非本 task 引入）：handle_event 内连续写事务在 fake-indexeddb 下不可靠，导致 persist_stats 写入侧无法自动断言。建议登记 pending 专项调查（版本/事务时序），以支撑未来写入侧自动测试。
- 总体判断：f004（critical）与 f002 已消除；f005 按「可测试性声明如实披露 trust_prior」合规收口，写入侧不再冒充覆盖；无未解决 critical/important。

### AC 复验披露（Round 4 增量）

- AC-005：重建侧 re_verified（重载模块 + 真实 DB 读）；写入侧 trust_prior（spec 可测试性声明如实披露 fake-indexeddb 并发事务限制，依赖 debug 手验 + 生产真实 IndexedDB 无此限制）。
- AC-001/002/003/006：维持 Round 1 re_verified（新增 diff 未触及这些路径）。
- AC-004/007：trust_prior（既有测试语义静态核对成立；未运行套件）。

coverage = 5 / 7（AC-001/002/003/005重建侧/006 re_verified；AC-005写入侧 + AC-004/007 trust_prior，占比约 29% ≤ 30%）

- 系统性 follow-up：fake-indexeddb 并发事务限制建议登记 pending 专项调查（slug 建议 `fake_indexeddb_txn_sequential_write`，阻断性 minor），不阻断本 task。

verdict: PASS
