# Task review t148（reviewer_focus: 代码）

- task：`t148_sw_restart_resume`
- spec：`docs/tasks/t148_sw_restart_resume/spec.md`
- diff_anchor：`733792b34a05811ce701885828cf5daebb06491e`
- target：`git diff 733792b34a05811ce701885828cf5daebb06491e`
- round：1
- reviewed_at：2026-08-12 22:04 UTC+8

reviewed_scope: f0b1255b6f4576af

## Findings

### t148_code_f001 - 终态化时 storage_bytes_written 不刷新，终态记录字节数陈旧

- 严重度：minor
- 锚点：AC-005 单采集写入字节数持久化——终态记录中的字节数与实际落库数据不一致
- 位置：`src/extension/background/service_worker.ts:740,769-780`
- 问题：`stop_capture_inner` 中 line 740 `flush_all()` drain 了缓冲事件、line 769 `write_events([capture_stopped])` 又写停止事件，两者提交后都会通过 `update_bytes_written` 累计进 `size_delta`；但 line 771-779 的终态 `update_capture(current_capture)` 写入的 `storage_bytes_written` 仍是**上一次 persist_stats**（drain 之前）的值，未包含 drain 落库字节与 capture_stopped 事件字节。终态（completed）记录的字节数恒定低于实际落库量。对采集期限额检查无影响（限额走内存 `size_base + size_delta`，恒准确），仅终态记录的持久化字节数陈旧。
- 建议：终态 `update_capture` 前补一行 `current_capture.storage_bytes_written = get_capture_size(current_capture_id!)`（与 persist_stats 同口径）。

### t148_code_f002 - size_base/size_delta/size_base_loaded 三集合无清理，随采集数增长

- 严重度：minor
- 锚点：行为缺陷——长活 SW 实例内内存随处理过的采集总数持续增长
- 位置：`src/extension/background/storage.ts:261-263`
- 问题：本 task 以 `size_base`（Map）、`size_delta`（Map）、`size_base_loaded`（Set）替换原单一 `bytes_written`（Map），三者在 `stop_capture` / `delete_capture` 路径均无对应清除；capture_id 全局唯一（`shared/id.ts`），一个长活 SW 实例每处理一个采集就向三个集合各累加一个条目，随采集总数单调增长。原 `bytes_written` 已有同类泄漏，本 task 将占用扩为三倍。
- 建议：`delete_capture` 与 `stop_capture_inner` 末尾对对应 capture_id 执行 `size_base.delete / size_delta.delete / size_base_loaded.delete`（或集中 `reset_capture_size(capture_id)`）。

## 结论

- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - 文件过大（按降级规则只列路径与行数，不进 finding 表）：`src/extension/background/service_worker.ts` 1241 行（基线 1231，净增 10，≥800 阈值）；`src/extension/background/storage.ts` 550 行（基线 532，净增 18，≥400 阈值）；`src/shared/types.ts` 717 行（本 task 净增 3，类型定义文件）。均未在 diff/说明给出不可拆硬约束。
  - 圈复杂度：`cleanup_stale_capture_state` 手算约 CC=7，`ensure_size_base`/`check_storage_limit` 均 <5，未达阈值。
  - 范围外（存量，非本 task 引入）：`cleanup_stale_capture_state` 用 `chrome.storage.local` 的 **start 时刻快照**（`result.current_capture`，service_worker.ts:153）覆盖 IndexedDB 记录——start 后 persist_stats 维护的累计 stats、`storage_bytes_written`、body_capture 字段在 SW 重启终态化时被快照整体回写丢失（stats 丢失为既有问题，本 task 的 `storage_bytes_written` 同样被吞）。不影响事件数据（flush_all 兜底），但直接削弱 AC-005 持久化在生产重启路径的实际价值。建议 follow-up。
  - `set_capture_size_for_test` 语义由「绝对值」改为「内存增量」：既有 T110 测试（storage_limit_active_delete.test.ts）因目标 capture 无 IndexedDB 记录（ensure 读到 base=0）仍成立；未来同文件测试若预置同名记录带 `storage_bytes_written`，钩子增量会与基数叠加，属潜在测试维护陷阱（test reviewer 可跟进）。
  - blueprint（architecture.md §4.1 + domain.md 存储限制）未更新：属 spec「Finalization 时更新」收尾动作，非本 task 代码 review 范围。
- 总体判断：基数+增量模型正确（ensure_size_base 每 capture 只读一次、同实例 base 恒定 delta 累积、重启后从记录重建、无重复累计）；cleanup flush_all 先于终态化、flush 失败仍清键、无半活跃状态；既有测试语义经静态核对不回退。仅 2 条 minor，无未解决 critical/important。

### AC 复验披露

- AC-001：`re_verified`——代码在终态化前 `await flush_all()`（service_worker.ts:148-152）；新增测试断言 `flush_all` 调用序先于 `update_capture`。
- AC-002：`re_verified`——恢复未实现（决策 010 终止语义，s004/d005），generation token 机制存在于 `capture_state.ts`（`is_active_generation`/`current_generation`），终止语义下 AC 满足。
- AC-003：`re_verified`——`flush_all` 包 try/catch 告警不阻断，终态化+清键继续（service_worker.ts:148-152）；新增测试覆盖 flush 拒绝后仍 `update_capture` completed + `storage_set` 清 `active_capture_id`。
- AC-005：`re_verified`——`ensure_size_base` 每 capture 只读一次（`size_base_loaded` 守卫）、损坏回退 0、基数+增量无重复累计；storage_limit_restart.test.ts 重载模块重建基数断言成立。
- AC-006：`re_verified`——`check_storage_limit` await ensure 后读 `base+delta`；测试以 DB 预置基数 + 钩子增量跨过 MAX 触发 `capture_stopped(reason='storage_limit')`，静态核对通过。
- AC-004：`trust_prior`——既有 stale_cleanup 测试断言与新增 `flush_all` mock（返回 undefined）静态兼容，但「测试保持通过」依赖实施侧 `npm test 全绿` 声明，reviewer 未执行测试套件（只读约束）。
- AC-007：`trust_prior`——storage_limit_active_delete / storage.test 断言经静态核对在新语义下仍成立（无记录 capture base=0、钩子设增量、check 读 DB），「通过」依赖实施侧套件运行证据。

coverage = 5 / 7（AC-004、AC-007 因未执行测试套件标 trust_prior，占比 29% ≤ 30%，不追加人工抽查行）

- 系统性 follow-up：建议「fix: cleanup 终态化保留 IndexedDB 累计 stats 与 storage_bytes_written」/ slug `cleanup_finalize_preserve_record`（阻断性：minor）。

verdict: PASS

## Round 2 (2026-08-12 22:10 UTC+8)

reviewed_scope: f0b1255b6f4576af

> 注：本轮 diff 相对 Round 1 有实质代码变更（f002 修复重构了 `delete_capture`、f001 修复加了终态刷新），锚点指纹按实施方规则应由其重新渲染；本行沿用 prompt 注入值，脚本比对以实际重算为准。

### 前轮 finding 复核

- **f001 已消除**：`service_worker.ts:775-782` 终态 `update_capture` 前 `current_capture!.storage_bytes_written = get_capture_size(current_capture_id)`（`if (current_capture_id)` 守卫）。顺序正确：`write_events([capture_stopped])`（t038 立即 flush 已累计进 delta）→ update 前 get_capture_size 读到含停止事件字节的总量。修法正确。
- **f002 修出回归（critical）**：修复把 `delete_capture` 里原有的整段删除循环误删，仅保留 `clear_size_state`。内存集合清理达成，但删除采集的功能被破坏（见 f003）。

### t148_code_f003 - delete_capture 不再删除任何数据（删除循环被 f002 修复误删）

- 严重度：critical
- 锚点：可观测行为缺陷——用户删除采集后 IndexedDB 数据原样保留，list_captures 仍返回该采集
- 位置：`src/extension/background/storage.ts:211-221`（相对基线 733792b 删除了 `storage.ts:214-234` 的删除循环）
- 问题：基线 `delete_capture` 对 CAPTURES store 执行 `store.delete(capture_id)`，对其余 8 个事件 store 按 `capture_id` 索引 cursor 逐条删除；f002 修复后只留下 `const tx = database.transaction(store_names,'readwrite')` + `tx.oncomplete`，**未对任何 store 发出任何 delete 请求**，事务空转立即 complete。结果：`delete_capture` 变成 no-op 且 resolve 成功。调用方 `handle_delete_capture`（service_worker.ts:307-314）只依赖成功返回，不校验数据确实被删；MCP `delete_capture`、popup/dashboard 删除入口均走此路径，全部失效。
- 证据：现有测试未覆盖实际删除结果——`storage_limit_active_delete.test.ts` AC-002 走 `handle_delete_capture` 的活跃 guard 早退（不触达 storage_delete_capture），AC-002b 只断言 `del.success === true`（promise resolve 即过，数据未删也过）；`sw_action_contract.test.ts` 只列 action 名。故「全量 passed」与回归共存。实施侧自称 tsc/测试通过不能作为降级依据（prompt「不信任 implementer 自述」）。
- 建议：恢复删除循环（CAPTURES `store.delete` + 其余 store cursor 删除），把 `clear_size_state(capture_id)` 留在 `tx.oncomplete` 内，形如基线逻辑 + 新增清理调用。并建议补一条断言实际删除的测试（delete 后 `get_capture` 返回 null、`get_events_by_category` 为空）。

## 结论（Round 2）

- 前轮 finding 复核：f001 已消除；f002 修出 critical 回归（f003），不采信处置表「已修」。
- 本轮新发现：1 条（f003，critical）。
- 未进表的提示：同 Round 1（文件过大/复杂度/范围外存量问题不变，不重复）。
- 总体判断：f003 为未解决 critical（删除功能整体失效），FAIL。
- 系统性 follow-up：无新增。

verdict: FAIL

## Round 3 (2026-08-12 22:16 UTC+8)

reviewed_scope: f0b1255b6f4576af

### 前轮 finding 复核

- **f001 已消除**：`service_worker.ts:780` 终态刷新 `storage_bytes_written = get_capture_size(current_capture_id)` 仍存在（未回退）。
- **f002 已消除**：`delete_capture` 删除循环完整恢复，与基线逐字一致（diff 仅 `tx.oncomplete` 内多 `clear_size_state(capture_id)` 调用，`storage.ts:232-235`），`clear_size_state` 清理三集合在事务提交后执行。删除功能回归修复正确。
- **f003 已消除**：同上，删除循环恢复 + `clear_size_state` 保留在 oncomplete，critical 解除。

### t148_code_f004 - AC-002b 新增删除断言恒真，无法捕获 f003 类 no-op 回归

- 严重度：minor
- 锚点：测试可信度——声称覆盖 f003 回归的断言对回归无区分力
- 位置：`tests/unit/storage_limit_active_delete.test.ts:110-117`
- 问题：AC-002b 对 `cap_old` 执行 delete_capture 后断言 `get_capture('cap_old')).toBeNull()`，但 `cap_old` 在本测试文件任何用例中都**从未被 create**（grep 全文件仅此一处出现）。IndexedDB 无该记录，`get_capture` 恒返回 null——该断言在 f003 no-op 版本与修复版本下都通过，注释声称「回归：delete_capture no-op 时 get_capture 仍返回记录」的场景无法由该断言触发。恒真断言，对「删除后数据实际消失」无验证力。
- 建议：改为先 `create_capture` 预置记录（含事件）→ delete → 断言 `get_capture` 为 null 且 `get_events_by_category` 为空；或复用 AC-002 已创建的 `cap_active` 删除路径。属测试质量问题，可交 test reviewer 复核（本 code review 不阻塞）。

## 结论（Round 3）

- 前轮 finding 复核：f001/f002/f003 均已消除（以 diff 与代码为准）；f003 删除循环与基线逐字一致。
- 本轮新发现：1 条（f004，minor）。
- 未进表的提示：同前轮；另 AC-002b 恒真断言已在 f004 记录。
- 总体判断：无未解决 critical/important，仅 1 条 minor（测试断言有效性，非代码正确性），PASS。
- 系统性 follow-up：无新增。

verdict: PASS

## Round 4 (2026-08-12 22:20 UTC+8)

reviewed_scope: 809760650176c9b4

> 指纹更新：test 轴补测试后 diff 变化，当前被审 diff 指纹重算为 `809760650176c9b4`（原 `f0b1255b6f4576af`）。已复核代码 diff 无新变化（storage.ts/service_worker.ts 与上轮一致），本 Round 结论与 verdict PASS 维持。

### 前轮 finding 复核

- **f001/f002/f003 已消除**：`service_worker.ts:780` 终态刷新仍存在；`delete_capture` 删除循环（`storage.ts:214-230`）与基线逐字一致 + `clear_size_state` 在 `tx.oncomplete`（232-235）。未回退。
- **f004 已消除**：`tests/unit/storage_limit_active_delete.test.ts:110-128` 改为先 `create_capture` 预置 `cap_old` → 断言 `not.toBeNull()`（预置生效）→ `send_message('delete_capture')` → 断言 `toBeNull()`（删除生效）。该文件 mock 仅覆盖 `update_capture`，`delete_capture` 走真实 fake-indexeddb 实现；用例无活跃采集，`handle_delete_capture` 的 guard 不拦截，断言真实触达删除逻辑。恒真问题消除，f003 no-op 回归将被该断言捕获。

## 结论（Round 4）

- 前轮 finding 复核：f001/f002/f003/f004 均已消除（以 diff 与代码为准）。
- 本轮新发现：0 条。
- 未进表的提示：同前轮（文件过大/复杂度/范围外存量问题不变，不重复）。
- 总体判断：无未解决 critical/important，无 minor，PASS。
- 系统性 follow-up：无新增。

verdict: PASS
