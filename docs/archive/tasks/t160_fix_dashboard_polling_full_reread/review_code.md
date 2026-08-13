# Task review t160（reviewer_focus: 代码）

- task：`t160_fix_dashboard_polling_full_reread`
- spec：`docs/tasks/t160_fix_dashboard_polling_full_reread/spec.md`
- diff_anchor：`84b0841e31080b6a83fa4e2442880ace8f7bf50e`
- target：`git diff 84b0841e31080b6a83fa4e2442880ace8f7bf50e`
- round：1
- reviewed_at：2026-08-13 15:45 UTC+8
reviewed_scope: 391bbefc686e723a

## Findings

### t160_code_f001 - 增量 offset 读取依赖 event_id 字典序，随机 event_id 导致增量漏数据 + 重复数据（AC-002 语义等价破坏）

- 严重度：critical
- 锚点：AC-002（增量拉取新增记录并 append，语义与全量等价）；spec 风险条款「增量状态与全量读取语义不一致导致详情漏数据」直接命中
- 位置：`src/extension/shared/capture_data_reader.ts:79-93`（`read_capture_snapshot_incremental`）；根因在 `src/extension/background/storage.ts:473-502`（`query_by_store` cursor 排序）与 `src/shared/event_utils.ts:7-21`（`generate_event_id`）
- 问题：
  - `query_by_store` 用 `index('capture_id').openCursor(IDBKeyRange.only(capture_id))` 分页。IDB index cursor 顺序 = (index key, **primary key**) 升序，primary key = `event_id`。因此同 capture 内记录按 **event_id 字典序**遍历，offset 语义 = 跳过字典序前 N 条。
  - `event_id` 主路径是 `evt_${crypto.randomUUID()}`（`event_utils.ts:11-12`），随机 UUID 与写入顺序无关。增量读取假设「已读 N 条 = 字典序前 N 条，新记录追加在尾部」不成立：新写入记录的字典序可插入已读区间任意位置。
  - 结果：增量从 offset=N 起读，会**重复读到已读旧记录（字典序第 N 条之后被新记录顶掉位置的旧记录），并永久漏掉字典序插入前部的 N 条新记录**（锚点随重复条数递增后，stats 与锚点一致，漏读记录再也补不回来）。网络请求 event_id `net_${Date.now().toString(36)}_${随机suffix}` 同一毫秒内多个请求字典序亦随机；console/storage/cookie/error/nav/user_action 全部 `evt_${randomUUID}` 完全随机。
  - 实证（fake-indexeddb 复刻 `query_by_store` 原样逻辑，见 `.scratch/t160_probe_cursor_order.mjs`）：顺序 id 对照组 100+10 增量读回 10 条、重复 0、漏 0；randomUUID 组 100+10 → 重复 8、漏 8；5000+50 → 增量读回 50 条全部重复旧记录、**50 条新记录全漏**。
  - `tests/unit/detail_poll_incremental.test.ts:50-53` fixture 用顺序 id `evt_${i}` 且 mock 掉 `read_capture_snapshot_incremental`，真实数据层缺陷被完全绕过，测试仍绿。
- 建议：增量读取必须基于**追加序游标**而非 primary key 字典序：a) 为各事件 store 增加单调递增序列字段（或复用写入时间+序号），按该字段做 `openCursor(prev_seq, 'next')` 增量游标；b) 退而求其次，计数推进时退回全量重建（decisions 021 已预留保底路径，但 AC-002 的「不重新全量读取」将不成立，需同步改 spec）；c) 修复后须用真实形态 event_id（randomUUID）补数据层集成测试，验证「全量 → 增量 N 轮 → 与全量结果集合等价」。

### t160_code_f002 - stats 计数口径与 store 条数不一致：ws_frame 推进无信号，详情漏更新 ws 帧

- 严重度：important
- 锚点：AC-002 增量语义等价（详情视图漏数据）；spec 风险条款
- 位置：`src/extension/dashboard/dashboard_shared.ts:354-362`（`detail_counts_advanced`）；`src/extension/background/service_worker.ts:1050-1058`（ws_frame 分支）
- 问题：
  - `ws_frame` 事件（category='network'，`event_category.ts:12`）经 `handle_network_request` 的 ws_frame 分支 `write_events` 写入 `NETWORK_REQUESTS` store（`storage.ts:293` 按 CATEGORY_STORE_MAP 路由），但 stats 仅 `event_count++`，**不增 `request_count`**。
  - 全量锚点 `network_requests` = store 实际条数（含 ws_frame）。此后若仅 ws_frame 推进：`detail_counts_advanced` 对比 `stats.request_count > loaded.network_requests` 恒 false → 判定「无推进」→ 不触发增量读取 → 详情视图不显示新 ws 帧；且被跳过的 ws_frame 位于 offset 之前，后续轮询也无法补齐，直到重开详情全量重建。
  - 同一类口径问题：`dom_data` 事件写 `USER_ACTION_EVENTS` store 但 stats 无对应计数（当前无生产者，dormant，暂不成立）。
- 建议：增量推进信号纳入 ws_frame 口径（如 network store 自身计数或按时间游标），或在 `docs/blueprint/decisions.md` 021 记录该口径差异并明确处置（如 ws 场景禁增量）。dom_data 项至少写入 decisions 备忘。

### t160_code_f003 - AC-004 字面「interval 被清理」未实现，仅以 page guard 停止详情读取

- 严重度：minor
- 锚点：AC-004 措辞与实现差异
- 位置：`src/extension/dashboard/dashboard.ts:139-149`
- 问题：AC-004 写「详情页关闭或离开后，轮询 interval 被清理」。实现保留 interval 继续运行（每 2s `load_captures()` 等页面级轮询仍在执行），仅 `get_page() !== 'detail'` guard 使详情读取不再触发。可观察行为「离开详情后不再触发详情数据读取」达成，但「interval 被清理」未兑现；且离开详情页后 interval 仍在跑页面级轮询（captures 列表/状态徽章需要，不能停），spec 措辞偏实现细节。
- 建议：按行为目标判定 AC-004 满足，同步修正 spec 措辞（「详情页关闭或离开后，详情数据读取不再触发」）；或明确 AC-004 语义为「详情轮询停止」并在代码注释说明 interval 保留原因。

### t160_code_f004 - `add_source_counts` 导出后未被使用，锚点累加手写重复逻辑

- 严重度：minor
- 锚点：本 task 引入的死代码 + DRY
- 位置：`src/extension/shared/capture_data_reader.ts:48-60`（`add_source_counts` 定义并导出）；`src/extension/dashboard/dashboard_shared.ts:328-336`（手写 7 字段逐项累加）
- 问题：`add_source_counts` 定义且 export 后无任何调用者（grep 全仓仅定义处），而 `load_detail` 增量分支手写展开与 `add_source_counts` 完全相同的 7 字段累加。属本 task 引入的未使用导出，且同一逻辑两处存在（虽当前行为一致，无分叉）。
- 建议：删除 `add_source_counts` 导出，`load_detail` 改用 `add_source_counts(_detail_loaded_counts, added)`（或反之，二选一保留单份）。

## 结论

- 前轮 finding 复核：Round 1 无前轮。
- 本轮新发现：4 条（critical 1 / important 1 / minor 2）
- 未进表的提示：
  - **文件过大**：`src/extension/dashboard/dashboard_shared.ts` 436 行（物理行数，含空行注释），达实现源码 minor 阈值 400，本 task 净增 +66 行，未见不可拆硬约束说明，建议后续拆分（不构成 finding）。
  - **测试覆盖缺口（归 test reviewer）**：`detail_poll_visibility.test.ts` 为静态源码正则扫描，AC-003/004 的可观察行为（hidden 停 / visible 恢复 / 离开不读）未被真实验证；`detail_poll_incremental.test.ts` mock 掉 `read_capture_snapshot_incremental` 且 fixture 用顺序 id，增量数据层语义（f001 根因）无测试触及。
  - **实现与 spec 范围声明差异**：spec 范围「只排序新增边界」，实现为 append 后整体 `sort`（O(n log n)），行为正确、性能目标未完全落实；t193 虚拟化之外排序成本仍随详情规模增长。
  - **dom_data 口径**：与 f002 同类（写 user_action store、stats 无计数），当前无生产者不构成可观测缺陷，建议 decisions 021 备忘。
- 总体判断：增量核心机制（f001）在真实 event_id 形态下确定性漏数据 + 重复数据，AC-002 语义等价未达成；f002 另造成 ws 场景漏更新。两处 blocking 未解决，本轮 FAIL。
- 系统性 follow-up：无（修复路径建议直接纳入 t160 下一轮；若采用「追加序游标」需跨 store 改动，可评估独立 task）。

### AC 复验方式

- AC-001（无推进时只 metadata 不读数据）：`re_verified`——代码直读 `dashboard_shared.ts:314-320`（counts_advanced false → return）+ 单测断言 `read_capture_snapshot` 仅调用 1 次、`read_capture_snapshot_incremental` 未调用。
- AC-002（有推进增量 append 不重读）：`re_verified`（UI 侧）——append 合并与锚点更新逻辑正确；但「增量与全量语义等价」被 f001 击穿（storage offset 稳定性不成立），实测随机 event_id 下漏/重。
- AC-003（hidden 停、visible 恢复）：`re_verified`——代码直读 `dashboard.ts:156-174`（visibilitychange → stop/start interval、start 幂等）；行为未在真实浏览器验证（jsdom 静态扫描佐证存在性，不验证行为）。
- AC-004（离开详情不触发读取）：`re_verified`——代码直读 `dashboard.ts:139-149` page guard；「interval 被清理」字面差异见 f003。
- coverage = 4 / 4（均代码/测试级独立复验；AC-003 缺真实浏览器行为验证，建议合并前人工抽查一次 visibility 切换）

verdict: FAIL

## Round 2 (2026-08-13 16:00 UTC+8)

### 前轮 finding 复核（以 diff 与代码为准）

- **f001（critical）**：已消除。`read_capture_snapshot_incremental` 已删除（grep 全仓无残留引用），`load_detail` 增量分支改为「无推进早退 + 有推进全量重建替换」（`dashboard_shared.ts:314-326`），锚点更新为重建后的 `source_counts_from_snapshot`；spec AC-002 语义随实施调整、decisions 021 记录实证与理由。修复后无数据正确性缺陷。
- **f002（important）**：原始问题（仅 ws_frame 推进无信号 → 漏更新）已消除——`detail_counts_advanced` 增加 `event_count` 总信号；但修复引入了新问题，见本轮 f005。
- **f003（minor）**：已消除。spec AC-004 措辞改为「不再触发详情数据读取（interval 清理或 page 守卫）」，与实现（page guard）一致。
- **f004（minor）**：已消除。`add_source_counts` 删除，无死代码残留。

### 本轮新发现

### t160_code_f005 - event_count 信号与锚点口径不对齐：含 ws_frame 的 capture 恒判推进，AC-001 失效（每轮全量重建）

- 严重度：important
- 锚点：AC-001（无新事件时第二次只执行 metadata 查询，不调用 `read_capture_snapshot()`）
- 位置：`src/extension/dashboard/dashboard_shared.ts:365-367`（`detail_counts_advanced` 第一项）；写入口 `src/extension/background/service_worker.ts:1050-1058`（ws_frame 分支）
- 问题：
  - `stats.event_count` 的口径 = user_action + nav + error + storage + cookie + **ws_frame** + dom_data + capture_lifecycle 中**仅经 `handle_event`/ws_frame 分支统计的部分**（request 与 console 事件不增 `event_count`；capture_started/stopped 直接 `write_events` 不经 increment，也不计）。
  - `loaded_events_total` = `loaded.user_events + nav_events + error_events + storage_changes + cookie_changes`（详情读取的 5 类 events store 条数），**不含 network store 中的 ws_frame**。
  - ws_frame 经 `handle_network_request` 的 ws_frame 分支写 `NETWORK_REQUESTS` store（`event_category.ts:12` category='network' → `CATEGORY_STORE_MAP`），但只 `event_count++` 不增 `request_count`。因此任意含 ≥1 条 ws_frame 的 capture：`event_count` 恒比 `loaded_events_total` 大（差值 = 累计 ws_frame 数），`s.event_count > loaded_events_total` 恒真。
  - 结果：**只要 capture 出现过 ws_frame（或未来有 dom_data 生产者），即使连续多轮无任何新事件，每轮轮询都判定「推进」→ 每轮 `read_capture_snapshot()` 全量重建**。AC-001 对该类 capture 完全失效，性能回到基线（每 2s 全量读）——本 task 的核心优化对 WebSocket 采集目标（聊天/协作类页面，正是采集高频场景）无收益。数据正确性不受影响。
  - 测试未覆盖：`detail_poll_incremental.test.ts` AC-002b 仅验证「event_count 推进触发刷新」（fixture 无 ws_frame 累计），未覆盖「重建后 event_count 与锚点差恒在 → 无推进仍刷新」的场景。
- 建议：event_count 信号改为增量语义并与锚点对齐——锚点（`SourceCounts` 或并列字段）记录**上轮读取时的 `stats.event_count`**，推进比较用 `s.event_count > loaded.event_count`（上轮值），消除累计 ws_frame 的恒定偏差；或等价地 `s.event_count > loaded_events_total + (loaded.network_requests - s.request_count)`（用 request_count 估计 ws_frame 累计，注意 request 计数时效性略差）。补充「含 ws_frame 累计、无新事件 → 不读」的回归测试。

### 结论（Round 2）

- 前轮 finding 复核：f001 / f003 / f004 已消除；f002 原始问题已消除但修复引入 f005（同一 `detail_counts_advanced` 区域）。
- 本轮新发现：1 条（important）。
- 未进表的提示：无新增（文件大小、测试静态扫描性质同 Round 1 结论段，不重复展开）。
- 总体判断：f001 正确性缺陷已修复且验证干净（测试 5 绿、`tsc --noEmit` 0 错、无残留引用）；f005 使 AC-001 对含 ws_frame 的 capture 失效，属未解决的 important，本轮 FAIL。
- 系统性 follow-up：无（f005 修复路径在 `detail_counts_advanced`/锚点字段内，纳入本 task 下一轮即可）。

### AC 复验方式（Round 2）

- AC-001：`re_verified`（部分）——无 ws_frame 场景正确（代码直读 + 单测断言 `read_capture_snapshot` 次数不变）；含 ws_frame 场景不满足（f005）。
- AC-002：`re_verified`——代码直读增量分支「有推进全量重建替换、无推进早退」+ 单测断言推进时重建 1 次、替换语义（6 = 4 user + 2 net）。
- AC-003：`re_verified`——`dashboard.ts:156-174` visibilitychange stop/start + start_poll 幂等守卫；测试补 else 分支断言。
- AC-004：`re_verified`——`dashboard.ts:139-149` page guard + spec 措辞对齐。
- coverage = 4 / 4（均为代码级复验；AC-001 对 ws_frame 场景的失效已由 f005 披露，AC-003 仍缺真实浏览器行为验证）

reviewed_scope: 391bbefc686e723a

verdict: FAIL

## Round 3 (2026-08-13 16:10 UTC+8)

### 前轮 finding 复核（以 diff 与代码为准）

- **f005（important）**：已消除。锚点拆分 `_detail_loaded_event_count`（上轮 stats.event_count），`detail_counts_advanced` 第一项改为增量比较 `s.event_count > prev_event_count`——WS 场景无新事件时 `event_count` 与锚点相等，不再误判推进（无累计偏差）。生命周期核对：全量模式清空并记录 `capture.stats.event_count`、增量重建路径同步更新、capture 不存在清空、`use_incremental` 条件补 `_detail_loaded_event_count !== null` 防旧锚点误用，均正确。AC-002c 测试覆盖「含 ws_frame 累计 + 无新事件 → 不读」✓。

### 本轮新发现

### t160_code_f006 - request 推进信号被 ws_frame 累计垫高：含 ws_frame 的 capture 在 ws 空闲后仅 request 新增不触发刷新（详情漏新请求）

- 严重度：important
- 锚点：AC-002（有新事件时触发一次数据刷新）；f002 同源（network store 混存 request 与 ws_frame）第三面
- 位置：`src/extension/dashboard/dashboard_shared.ts:361`（`s.request_count > loaded.network_requests`）；写入口 `src/extension/background/service_worker.ts:1041-1084`（request 分支 `request_count++`、ws_frame 分支 `event_count++` 且二者都写 `NETWORK_REQUESTS` store）
- 问题：
  - `stats.request_count` = 纯 request 数（request 分支不增 `event_count`）；`loaded.network_requests` = network store 总条数（**含 ws_frame 累计**）。两者口径差 = 累计 ws_frame 数。
  - 场景：capture 曾捕获 ws_frame（累计 w 条）后 ws 空闲，仅间歇 request 推进（心跳等）。每轮：`event_count` 不变（request 不增 event_count）→ 增量信号 false；`s.request_count > loaded.network_requests` 需新增 request 数 > 累计 w 才触发 → w 通常成百上千，request 每 2s 增量个位数 → 长期不触发 → **详情 request 列表滞后不更新**（数据在 store 不丢，全量重建时终会补齐，但滞后无界）。
  - 无 ws_frame 的 capture：request_count 与 loaded.network_requests 同步，分项正常触发（不受影响）。
  - 测试未覆盖：AC-002b/c fixture 中 `loaded.network_requests` 与 `request_count` 恰好一致（net=1 条、request_count=1），未构造「loaded 含 ws_frame 累计 > request_count」的偏差场景。
- 建议：与 f005 同构——锚点增加 `_detail_loaded_request_count`（重建时记录 `capture.stats.request_count`），推进比较 `s.request_count > prev_request_count`；或更彻底：锚点记录上轮 stats 全部分项（user_action/nav/request/log/error/storage/cookie/event_count），`detail_counts_advanced` 全部改为 stats 增量比较，消除「stats 字段 vs store 条数」混合口径的错位面（当前仅 network 分项受影响，统一口径后无再错风险）。补充「loaded.network_requests 含 ws_frame 累计、仅 request 推进 → 触发刷新」回归测试。

### 结论（Round 3）

- 前轮 finding 复核：f005 已消除（event_count 增量锚点语义与生命周期正确、AC-002c 覆盖）。
- 本轮新发现：1 条（important）。
- 未进表的提示：无新增。
- 总体判断：f001/f005 已闭环且验证干净（测试 6 绿、`tsc --noEmit` 0 错）；f006 使 AC-002 对「含 ws_frame + ws 空闲 + 仅 request 推进」场景失效（详情漏新请求），属未解决的 important，本轮 FAIL。
- 系统性 follow-up：无（f006 修复路径与 f005 同构，在锚点字段与 `detail_counts_advanced` 内，纳入本 task 下一轮即可）。

### AC 复验方式（Round 3）

- AC-001：`re_verified`——event_count 增量锚点 + 分项比较，无推进不读（含 ws_frame 累计场景，AC-002c 断言 + 代码直读）；ws 活跃期每轮推进属 AC-002 语义（有变化才读），不违反 AC-001。
- AC-002：`re_verified`（部分）——推进时全量重建替换、无推进早退正确（单测 AC-002/AC-002b）；但「仅 request 推进 + ws_frame 累计」场景不触发（f006），AC-002 正向保证对该场景失效。
- AC-003：`re_verified`——`dashboard.ts:156-174` visibilitychange stop/start + 幂等守卫；测试断言 else 分支。
- AC-004：`re_verified`——`dashboard.ts:139-149` page guard + spec 措辞对齐。
- coverage = 4 / 4（均为代码级复验；AC-002 对 f006 场景的失效已由 finding 披露；AC-003 仍缺真实浏览器行为验证）

reviewed_scope: 391bbefc686e723a

verdict: FAIL

## Round 4 (2026-08-13 16:15 UTC+8)

### 前轮 finding 复核（以 diff 与代码为准）

- **f006（important）**：已消除。锚点统一为 `_detail_loaded_stats: CaptureStats | null`（上轮 stats 快照），`detail_counts_advanced(s, prev)` 全部改 stats 全分项增量比较（event_count / user_action / nav / request / log / error / storage / cookie）。`s.request_count > prev.request_count` 为纯增量信号，与 ws_frame 累计无关——含 ws_frame 的 capture 在 ws 空闲后仅 request 推进时正常触发，f006 遮蔽场景不再成立。混合口径（stats 字段 vs store 条数）已整体消除，无其他分项残留错位。
- 锚点生命周期核对：全量模式（首次/切换）清空并记录 `{ ...capture.stats }`、增量重建路径同步更新快照、capture 不存在清空、`use_incremental` 条件含 `_detail_loaded_stats !== null`、`_reset_detail_poll_state_for_test` 重置双锚点——均正确。`{ ...capture.stats }` 为快照复制，`set_detail_capture` 持有的同一对象后续更新不影响锚点。
- `SourceCounts` / `source_counts_from_snapshot` / `read_capture_snapshot_incremental` 代码级移除（仅留弃用说明注释），`capture_data_reader.ts:25`；`dashboard_shared` import 同步收敛。grep 确认无代码残留。

### 本轮新发现

无（0 条）。

### 结论（Round 4）

- 前轮 finding 复核：f006 已消除；累计 f001/f003/f004/f005/f006 全部闭环。
- 本轮新发现：0 条。
- 未进表的提示：
  - **测试覆盖缺口（归 test reviewer）**：`detail_poll_incremental.test.ts` 未补 f006 场景用例（含 ws_frame 累计 + 仅 request 推进 → 触发刷新）；现有 AC-002b/c 的 fixture 中 `loaded.network_requests` 与 `request_count` 无偏差，无法区分修复前后行为。建议 test 轮补一条该场景断言。
  - **capture.stats 缺失边界**：`load_detail` 直接访问 `capture.stats`（含 `{ ...capture.stats }`），若落盘 capture 数据损坏缺 stats 会抛错并被 catch 吞（详情不更新）。`create_capture` 保证 stats 存在（`create_empty_capture_stats`），实际采集路径不缺；该依赖自 Round 1 起存在，非本轮引入，不构成 finding。
- 总体判断：f001（数据正确性）→ f002/f005/f006（统计口径）→ f003/f004（spec/死代码）全部修复并经复核验证；测试 6 绿、`tsc --noEmit` 0 错、无残留引用。当前无未解决 critical / important（仅 minor 已全部处置），本轮 PASS。
- 系统性 follow-up：无。

### AC 复验方式（Round 4）

- AC-001：`re_verified`——stats 快照全分项增量比较，无推进（含 ws_frame 累计场景）不读；`detail_poll_incremental.test.ts` AC-001/AC-002c 断言 + 代码直读。
- AC-002：`re_verified`——有推进（任一统计分项增量）全量重建替换、无推进早退；AC-002/AC-002b 断言 + 代码直读；f006 场景（仅 request 推进）由修复后代码语义保证（`s.request_count > prev.request_count` 纯增量），但缺专用测试用例（见结论段提示）。
- AC-003：`re_verified`——`dashboard.ts:156-174` visibilitychange stop/start + start_poll 幂等守卫；测试断言 hidden/visible 两分支。
- AC-004：`re_verified`——`dashboard.ts:139-149` page guard + spec 措辞对齐。
- coverage = 4 / 4（均为代码级复验；AC-003 仍缺真实浏览器行为验证，建议合并前人工抽查一次 visibility 切换；AC-002 的 f006 场景缺测试用例，已披露）

reviewed_scope: 0198ec845622316f

verdict: PASS
