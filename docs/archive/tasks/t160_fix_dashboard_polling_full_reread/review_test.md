# Task review t160（reviewer_focus: 测试）

- task：`t160_fix_dashboard_polling_full_reread`
- spec：`docs/tasks/t160_fix_dashboard_polling_full_reread/spec.md`
- diff_anchor：`84b0841e31080b6a83fa4e2442880ace8f7bf50e`
- target：`git diff 84b0841e31080b6a83fa4e2442880ace8f7bf50e`
- round：1
- reviewed_at：2026-08-13 15:40 UTC+8
reviewed_scope: 391bbefc686e723a

## Findings

### t160_test_f001 - read_capture_snapshot_incremental 真实实现零测试触达，AC-002「增量拉取」语义未验证

- 严重度：important
- 锚点：AC-002
- 位置：`tests/unit/detail_poll_incremental.test.ts:15-19`；`src/extension/shared/capture_data_reader.ts:79-94`
- 问题：测试将 `read_capture_snapshot_incremental` mock 为固定返回值，AC-002 实际验证的是 dashboard_shared 的 append 组装（events 3→6、network 1→2）与调用次数；incremental 的 offset 增量语义（`prev_counts.X + offset`，capture_data_reader.ts:85-91）是「仅增量拉取新增记录」的实现载体，0 测试触达——`tests/unit/capture_data_reader.test.ts` 仅覆盖 `read_capture_snapshot`（t156），本 diff 也未在 reader 单测中补 incremental。若 offset 实现错误（漏加 `prev_counts` 重读、偏移过大漏读），本测试仍全绿，实际详情出现重复/缺失数据；spec「风险与回退」明示该风险（「增量状态与全量读取语义不一致导致详情漏数据」）。spec 测试策略的 mock 目标是「IndexedDB 与 metadata 源」，此处越过边界 mock 了含 offset 业务计算的 reader 模块本身。
- 建议：`capture_data_reader.test.ts` 增 incremental 单测（mock storage 层，断言各 source 以 `prev_counts+offset` 传入、新增条数与计数推进正确）；或本测试至少用 `toHaveBeenCalledWith` 断言 incremental 收到正确锚点（见 f004）。

### t160_test_f002 - AC-003 恢复分支（visible → start_poll 重建）无任何断言

- 严重度：important
- 锚点：AC-003
- 位置：`tests/unit/detail_poll_visibility.test.ts:12-19`
- 问题：AC-003 要求「visibilitychange 进入 hidden 后，轮询停止；恢复 visible 后按最新版本恢复」。静态扫描只锚定 hidden 清理（`if (document.hidden) {`、`clearInterval(poll_interval)`，dashboard.ts:169/162），visible 恢复分支（`else { start_poll(); }`，dashboard.ts:171-173）无任何正则覆盖。若实现删掉 else 分支、或写成 `if (document.hidden) { start_poll(); } else { stop_poll(); }`（方向完全反），现有断言全部匹配仍 PASS——AC-003 的一半验收行为（恢复轮询）无测试证据，测试无法区分「AC-003 完整实现」与「只有暂停没有恢复」。
- 建议：补锚定恢复分支的正则，如 `/else\s*\{\s*start_poll\(\)/` 与 `/start_poll\(\)/`（start_poll 内 `setInterval(poll_once, 2000)` 重建）。

### t160_test_f003 - 静态扫描方向性局限：hidden/visible 分配写反仍绿，「按最新版本恢复」无行为验证

- 严重度：minor
- 锚点：AC-003 / AC-004（测试可信度）
- 位置：`tests/unit/detail_poll_visibility.test.ts`（整体）
- 问题：正则锚定「模式存在」而非「行为方向」：`if (document.hidden) { start_poll(); } else { stop_poll(); }` 的写反实现仍匹配全部现有正则；「恢复后按最新版本恢复」的语义（start_poll 后 poll_once 重新执行增量读取）无任何验证。属 t155 同款静态扫描模式（dashboard.ts 顶层副作用无法直接 import，注释已声明），为合理折衷，但防倒退能力限于结构层——行为方向正确性依赖 code review。
- 建议：可选改进，不强制——将轮询启停（start_poll/stop_poll/visibility 分配）抽为可注入模块函数后 jsdom 事件模拟；或维持现状并知悉局限。

### t160_test_f004 - 增量后锚点推进与 incremental 调用参数未断言

- 严重度：minor
- 锚点：AC-002
- 位置：`tests/unit/detail_poll_incremental.test.ts:120-146`
- 问题：AC-002 增量后 `_detail_loaded_counts` 推进未验证——若实现增量后不更新锚点，第三轮（stats 不变）会重复增量 append，events 变 9 而测试无覆盖；`read_capture_snapshot_incremental` 仅断言调用次数 1，未断言参数——若实现传错锚点（如始终 0），因 mock 返回值固定，append 数量断言仍过。
- 建议：补第三轮（stats 不变）断言 events 仍 6（不重复 append）；断言 `toHaveBeenCalledWith('c1', { user_events: 2, network_requests: 1, ... })` 验证锚点传递。

### t160_test_f005 - AC-001 未断言 metadata 查询发生

- 严重度：minor
- 锚点：AC-001
- 位置：`tests/unit/detail_poll_incremental.test.ts:101-118`
- 问题：AC-001「第二次只执行 metadata 查询」——测试只断言不调 snapshot/incremental，未断言 `send_ui_message('get_capture_data', ...)` 被查询（次数/参数）。若实现错误地在增量模式跳过 metadata 直接不读（既不查询也不判断），测试仍全绿，但新事件将永远不被发现（详情永久停滞），AC-001 的「只执行 metadata 查询」半句无证据。
- 建议：断言第二轮后 `send_ui_message` 调用次数为 2（首轮 1 + 本轮 1），或 `toHaveBeenCalledWith('get_capture_data', { capture_id: 'c1' })`。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用
- 改测方向复核：无（diff 未修改任何既有测试，仅新增两个测试文件；无「迁就实现」改测）
- 本轮新发现：5 条
- 未进表的提示：
  - `tests/unit/detail_poll_incremental.test.ts:21` `make_capture` 首行格式异常（`{    return {`），风格问题，不影响断言。
  - `add_source_counts`（capture_data_reader.ts:48-60）已导出但 dashboard_shared.ts:328-336 手写计数加法、未使用——代码层重复，属 code reviewer 职责。
- 总体判断：AC-001/002 行为测试真实执行 `load_detail` 生产逻辑、断言强度好（调用次数 + append 数量 + 不触发全量），已知 mock 修正到位（message_contract 路径正确、`source_counts_from_snapshot` 经 importActual 保留真实实现，锚点计算非假绿）；代入旧实现红验证经 diff 代码级推理成立（旧 `load_detail` 无条件全量读 → 第二轮 snapshot 次数变 2 必红；旧 dashboard.ts 无 visibilitychange/poll_interval → 静态扫描必红）。但 AC-002 增量拉取核心语义（incremental 真实实现）零触达、AC-003 恢复分支无锚点，2 条 important 未解决。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified`。重跑两测试文件 4/4 绿；逐行核对断言；旧实现红经 diff 推理（旧 `load_detail` 无条件 `read_capture_snapshot`，第二轮断言次数变 2 必红）。注意：stash 重跑因 intent-to-add 测试文件不可行，红验证为代码级推理而非实际重跑。
- AC-002：`re_verified`。同上；append 数量断言与真实 `source_counts_from_snapshot`（importActual 保留）计算一致（2 user + 1 net → 3+3=6、1+1=2）。
- AC-003：`re_verified`。正则逐条对照 dashboard.ts:168（visibilitychange 注册）/169（document.hidden）/162（clearInterval）实际新增代码；旧实现无 visibilitychange/poll_interval 必红。恢复分支缺口见 f002。
- AC-004：`re_verified`。正则对照 dashboard.ts:140（page 守卫）/122（`let poll_interval`，t160 新增锚点）；page 守卫 t144 既有、对旧实现不红，但 interval 可清理锚点为新增、整体必红。
- coverage = 4 / 4

verdict: FAIL

## Round 2 (2026-08-13 16:05 UTC+8)

### 前轮 finding 复核

- **t160_test_f001（important）已消除**：`read_capture_snapshot_incremental` 已删除（capture_data_reader.ts diff 确认仅剩 `SourceCounts` / `source_counts_from_snapshot`），AC-002 测试改为验证「推进时全量重建一次、无推进不再读」。断言强度好：snapshot 次数 2、events 6（若实现 append 旧 3+新全量 6=9，断言 6 必红，能区分替换 vs append）、network 2、第三轮仍 2（锚点推进验证）。fixture 与 stats 对齐（stats 4/2 ↔ snapshot 4 user/2 net，锚点 {user:4, net:2}，再轮询不推进，无假绿）。spec 契约区 AC-002 已同步修订为「有新事件时触发一次数据刷新（有变化才读，不再无条件每轮全量读）；正确性不依赖 IDB 追加序游标」，上下文区补「t160 实施调整」段——原 f001 锚定的「增量 append」契约矛盾随 spec 修订消除。
- **t160_test_f002（important）已消除**：补 `\}\s*else\s*\{\s*start_poll\(\)`（匹配 dashboard.ts:172-173 真实代码 `} else { start_poll(); }`）与 `if\s*\(\s*poll_interval\s*\)\s*return`（dashboard.ts:157 防重入）。方向被锚定——hidden/visible 分配写反的实现（else 后为 stop_poll）该正则不匹配必红。
- **t160_test_f003（minor）接受遗留**：静态扫描方向性局限（「恢复后按最新版本」的 poll_once 重新读取语义无行为验证）为 t155 同款模式固有局限；f002 修复实际已加强方向锚定。原建议即「不强制」，维持。
- **t160_test_f004（minor）已消除**：incremental 删除后「调用参数断言」不适用；锚点推进验证由 AC-002 第三轮（line 143-145「再轮询无推进不再读」）覆盖。
- **t160_test_f005（minor）修不彻底**：处置说明称「AC-001 断言总读取次数不变隐含覆盖 metadata 查询」——论证不成立。snapshot 次数不变只证明「不读」，不能证明「metadata 被查询」；实现若在增量模式跳过 metadata 查询直接 return，AC-001 测试仍全绿，AC-001「第二次只执行 metadata 查询」半句无证据。原建议（断言 `send_ui_message` 调用次数/`toHaveBeenCalledWith('get_capture_data', ...)`）未落实。仍存在（minor，不阻断）。

### 本轮新发现

### t160_test_f007 - AC-002b 假绿：首次 fixture 与 stats 不对齐，event_count 信号防护无效

- 严重度：important
- 锚点：无契约 AC（AC-002b 为扩展防护测试，守护 code_f002 的 event_count 信号）；可观测行为缺陷——ws_frame 仅增 event_count 时漏刷新
- 位置：`tests/unit/detail_poll_incremental.test.ts:148-162`
- 问题：AC-002b 声称验证「仅 event_count 推进（user_action_count/request_count 等未变）也触发刷新」。首次 fixture 用 `make_capture(2, 2, 1)` 但 snapshot 为 `make_snapshot([evt1, evt2], [])`——`network_requests=[]`，与 stats `request_count=1` 不对齐，锚点 `network_requests=0`。第二轮 stats `(3, 2, 1)` 时，即使**完全删除** `detail_counts_advanced` 的 event_count 分支（Round 1 旧版），`s.request_count(1) > loaded.network_requests(0)` 已触发推进（已用脚本复现：`true`）。因此 AC-002b 的绿由 request 信号误触发，无法区分「event_count 信号触发」与「request 信号触发」——event_count 信号（code_f002 修复）被删除时该测试仍绿，ws_frame 漏更新防护无有效测试。
- 建议：修正首次 fixture 使锚点与 stats 对齐——`make_snapshot([evt1, evt2], [{ request_id: 'r1' }])`（锚点 network_requests=1），第二轮仅 `event_count` 3（stats `(3, 2, 1)` 其余计数不变）：无 event_count 信号时 request 1 vs 1 不推进 → snapshot 次数保持 1 必红；有信号时 event_count 3 > 2 推进 → 次数 2 绿。另建议补断言 `toHaveBeenCalledTimes(2)` 前确认第二轮 fixture 其余计数确实未推进。

### 改测方向复核

无「迁就实现」改测。AC-002 测试语义变更随 spec 契约区修订同步进行（spec.md 本轮 diff 已更新 AC-002/AC-004 措辞 + 上下文区实施调整，task.md Round 1 处置表 t160_code_f001 记录归因：IDB cursor 非追加序、offset 增量不可行），有归因、有决策记录（decisions.md 021），非实现驱动测试。AC-002b 为新增防护测试，fixture 不对齐属测试写错（见 f007），非迁就实现。

### 本轮 AC 复验

- AC-001：`re_verified`。重跑两文件 5/5 绿；三轮 snapshot 次数保持 1；旧实现必红。metadata 查询半句缺口见 f005（minor）。
- AC-002：`re_verified`。spec 修订后与测试一致；次数 2 + events 6 + 第三轮仍 2，fixture 对齐无假绿；替换 vs append 可区分。
- AC-003：`re_verified`。f002 修复后 hidden 清理 + visible 恢复 + 防重入均有锚点，正则逐一匹配 dashboard.ts 实际代码。
- AC-004：`re_verified`。spec 措辞修订（「interval 清理或 page 守卫」）后与测试（page 守卫 + `let poll_interval`）一致。
- coverage = 4 / 4

### 结论（Round 2）

- 前轮 finding 复核：f001/f002/f004 消除，f003 接受遗留，f005 修不彻底（minor）
- 本轮新发现：1 条（f007 important）
- 未进表的提示：无
- 总体判断：f001/f002 修复到位、断言强度符合预期；但 AC-002b 假绿使 event_count 信号（code_f002）无有效测试防护，1 条 important 未解决

reviewed_scope: fb0afe975baf535c

verdict: FAIL

## Round 3 (2026-08-13 16:15 UTC+8)

### 前轮 finding 复核

- **t160_test_f007（important）已消除**：AC-002b fixture 已对齐（line 154-157：首次 snapshot `2 user + 1 net`，与 stats `request_count=1` 一致，锚点 `network_requests=1`）。第二轮 stats `(3, 2, 1)` 分项全不变（user 2 vs 2、request 1 vs 1、log/error/storage/cookie 全 0），仅 `event_count 3 > prev 2` 触发——已用脚本逐项验证「仅 event_count 推进」为 true 且 request 信号不再误触发；删除 event_count 信号（Round 1 六路分项版）时全分项不推进、次数保持 1，断言 2 必红。新增 AC-002c（line 170-185）互补验证「event_count 累计偏差」：首轮 stats `event_count=3`（2 user + 1 ws_frame）锚点 ec=3，第二轮 stats 不变时 V2（`event_count > prev_event_count`）不读、V1 旧版（`event_count > loaded_events_total`，3 > 2）误推进必红（脚本复现 `true`）——AC-002b/c 组合完整锁定「event_count 增量信号存在且无累计偏差」，与实现 `_detail_loaded_event_count` 锚点（dashboard_shared.ts:292-296, 354）一致。
- **t160_test_f005（minor）已消除**：AC-001 补 `send_ui_message` 调用断言（line 111 `toHaveBeenCalledTimes(2)`、line 116 `toHaveBeenCalledTimes(3)`），每轮 metadata 查询被显式验证（load_detail 仅调 `get_capture_data` 一种 message，次数与轮次严格对应）；「metadata 仍查询、但不读数据」的 AC-001 完整语义闭合。
- **f001/f002/f004**：Round 2 已确认消除，本轮 diff 无相关回退。
- **f003（minor）**：维持接受遗留（静态扫描固有局限，原建议即不强制）。

### 本轮新发现

无。

### 改测方向复核

无迁就实现改测。AC-002b fixture 修正与 AC-002c 新增均为补强测试有效性（修测试写错），AC-001 增断言为补覆盖缺口；实现侧 `_detail_loaded_event_count` 锚点新增为对应 f005 语义的配套实现（与测试断言同向）。

### 本轮 AC 复验

- AC-001：`re_verified`。4/4 测试绿；三轮 snapshot 次数保持 1 + send_ui_message 次数 2/3 递增。
- AC-002：`re_verified`。次数 2 + events 6 + network 2 + 第三轮仍 2，替换 vs append 可区分。
- AC-002b/002c（扩展防护）：`re_verified`。脚本逐项验证信号触发方向与 V1 回归捕获。
- AC-003/004：`re_verified`（Round 2 确认，本轮未改动）。
- coverage = 4 / 4

### 结论（Round 3）

- 前轮 finding 复核：f007 已消除，f005 已消除，f003 接受遗留（minor）
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：AC-002b fixture 对齐后 event_count 信号获独立有效验证（request 误触发消除、信号缺失必红），AC-002c 覆盖 ws_frame 累计偏差回归（V1 旧版必红）；AC-001 metadata 查询断言补齐；断言全部强断言，无假绿残留。无未解决 critical / important。

reviewed_scope: 3b7b42c8fcac6d17

verdict: PASS

## Round 4 (2026-08-13 16:20 UTC+8)

### 前轮 finding 复核

- **f007 / f005**：Round 3 已确认消除，本轮实现改动未引入相关回退。
- **f003（minor）**：维持接受遗留。

### 本轮复核（code f006 修复后：锚点统一为 stats 快照全分项增量比较）

- 实现变更：`_detail_loaded_stats: CaptureStats`（dashboard_shared.ts:290-294），`detail_counts_advanced(s, prev)` 八字段逐项 `>` 比较（dashboard_shared.ts:354-361），口径统一 stats 对 stats；`SourceCounts` 锚点删除。测试文件零改动（186 行不变），6/6 全绿。
- **AC-001/002/002b/002c 在新锚点下行为等价且无假绿**（逐用例推理 + 重跑确认）：
  - AC-001：stats 全分项相等 → 不推进 → snapshot 1 保持、send_ui_message 2/3 递增。✓
  - AC-002：stats(2,2,1)→(4,4,2) 多分项推进 → 次数 2、events 6、network 2；三轮(4,4,2) vs 锚点相等 → 不再读。✓
  - AC-002b：stats(2,2,1)→(3,2,1) 仅 event_count 推进（其余分项相等）→ 触发；删除 event_count 比较则全分项相等、次数 1 必红——event_count 信号验证在新实现下仍有效。✓
  - AC-002c：首轮 stats(3,2,1) 锚点含 ws_frame 累计，二轮全分项相等 → 不读（次数 1）。「无新事件不读」语义在 stats 快照锚点下仍成立；且该用例对混合口径回归（event_count vs 七类合计型）仍会红。✓

### 本轮新发现

### t160_test_f008 - f006 场景（request_count 增量 vs store net 条数偏差共存）无测试覆盖

- 严重度：minor
- 锚点：AC-002（修订版「有变化才读」语义下的 edge case）
- 位置：`tests/unit/detail_poll_incremental.test.ts`（AC-001/002/002b/002c，全 fixture 的 snapshot `network_requests` 条数与 stats `request_count` 均对齐）
- 问题：f006 根因是混合口径 `s.request_count > loaded.network_requests` 在「store net 条数 ≥ stats request_count」（ws_frame 累计导致 store 条数多于 stats 计数）时遮蔽间歇 request 推进 → 漏刷新。现有 4 用例的 fixture 全部对齐（net 条数 == request_count），在此类 fixture 下混合口径比较与 stats 对 stats 比较结果等价——若未来回归为混合口径实现，现有测试全绿、无法捕获（已脚本复现：V2 型比较在 AC-002 场景仍推进）。f006 遮蔽场景（stats request_count=1、store net 2 条、request 推进到 2 → 混合口径 `2 > 2` 漏判）无任何测试。
- 建议：补一个「stats 与 store 脱钩」case——首轮 stats `(2, 2, 1)` 但 snapshot 含 2 条 network_requests（模拟 ws_frame 累计使 store 条数多于 stats 计数），二轮 stats `(2, 2, 2)`（仅 request_count 推进）断言触发刷新：stats 对 stats 实现绿（2 > 1），混合口径回归实现红（2 > 2 漏判）。该 case 同时验证「store 条数偏差不遮蔽 stats 推进」。

### 改测方向复核

无改测（测试零改动）；f008 为覆盖扩展建议，非迁就实现。

### 本轮 AC 复验

- AC-001：`re_verified`。6/6 绿；新锚点下三轮 snapshot 1 保持 + send_ui_message 2/3。
- AC-002：`re_verified`。stats 推进触发、无推进不再读、替换语义（6 非 9）均成立。
- AC-003/004：`re_verified`。visibility 2 绿，静态扫描锚点未变。
- coverage = 4 / 4

### 结论（Round 4）

- 前轮 finding 复核：f007/f005 已消除（维持），f003 接受遗留（minor）
- 本轮新发现：1 条（f008 minor——f006 场景无回归防护测试，现有 fixture 全对齐无法捕获混合口径回归）
- 未进表的提示：无
- 总体判断：新 stats 快照锚点实现下现有 6 用例行为等价、无假绿，AC-001~004 覆盖闭合；f006 修复正确性由 code 侧保证，测试侧仅存 f008 覆盖扩展缺口（minor，不阻断；建议 implementer 处置表登记或补 case）。

reviewed_scope: 54efe7225f30887a

verdict: PASS

## Round 5 (2026-08-13 16:25 UTC+8)

### 前轮 finding 复核

- **t160_test_f008（minor）已消除**：AC-002d（line 187-204）补上 stats 与 store 脱钩场景。
- **f007 / f005 / f003**：维持此前结论（f007/f005 已消除、f003 接受遗留），本轮实现无相关回退。

### 本轮复核（AC-002d）

- fixture 有效：首轮 stats `(3, 2, 1)` + snapshot 2 条 network（`r1` + `ws_frame_1`），net 条数（2）> stats `request_count`（1），正确模拟 ws_frame 累计使 store 条数多于 stats 计数的脱钩形态；语义自洽（ws_frame 写 network store 只增 event_count、不增 request_count，stats event_count=3 = 2 user + 1 ws_frame）。
- 二轮 stats `(3, 2, 2)` 仅 `request_count` 推进（+1 心跳请求，event_count/其余分项全不变）：
  - 当前实现（stats 对 stats）：`request 2 > 1` 推进 → 次数 2 绿。✓
  - 混合口径回归实现（`request_count > store net 条数`，锚点 net=2）：`2 > 2` 漏判、其余分项相等 → 不读 → 次数 1，断言 2 必红。✓
- 无假绿：漏判（有变化不读）与误读（无变化仍读）两侧均可捕获；断言强（`toHaveBeenCalledTimes(2)`）。
- 防回归目标达成：f006 遮蔽场景（request_count 增量 vs store net 条数偏差共存）现有关闭。

### 改测方向复核

无改测；AC-002d 为覆盖扩展（按 Round 4 建议落实），非迁就实现。

### 本轮 AC 复验

- AC-001：`re_verified`。7/7 全绿；三轮 snapshot 1 保持 + send_ui_message 2/3。
- AC-002：`re_verified`。推进触发、无推进不读、替换语义。
- AC-002b/002c/002d（扩展防护）：`re_verified`。event_count 信号、无累计偏差、stats/store 脱钩场景逐一验证。
- AC-003/004：`re_verified`。visibility 2 绿。
- coverage = 4 / 4

### 结论（Round 5）

- 前轮 finding 复核：f008 已消除，f007/f005 维持消除，f003 接受遗留（minor）
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：AC-002d 有效覆盖 f006 防回归（stats 对 stats 绿、混合口径必红），断言强、无假绿；现有 7 用例完整覆盖 AC-001~004 及 stats 增量全信号语义。无未解决 critical / important，无遗留 blocking；f003 为静态扫描固有局限的已接受 minor。

reviewed_scope: 0198ec845622316f

verdict: PASS
