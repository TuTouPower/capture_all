# Task review t157（reviewer_focus: 代码）

- task：`t157_fix_cdp_body_budget_accounting`
- spec：`docs/tasks/t157_fix_cdp_body_budget_accounting/spec.md`
- diff_anchor：`e9ac19839ea60e2bd4cd93d10a85d11ecf4417bd`
- target：`git diff e9ac19839ea60e2bd4cd93d10a85d11ecf4417bd`
- round：1
- reviewed_at：2026-08-13 14:05 UTC+8

## Findings

### t157_code_f001 - enforce_body_budget 用 `events.length === 1` 判「仅剩单个超大 body」，含 pending 时唯一带 body 事件被直接删除而非标 too_large

- 严重度：important
- 锚点：违反 AC-004（范围区「若只剩当前超大 body 无法通过淘汰降到预算内，保留请求元数据，把该 body 置 null 并标 too_large」）
- 位置：`src/bridge/cdp_handler.ts:121`（判定）与 `:130`（splice 删除）
- 问题：AC-004 的「仅剩单个超大 body 事件」应指**剩余带 body 的事件唯一**，实现却用 `session.events.length === 1`（数组总长度）判定。当数组含无 body 的 pending 事件时两者不等价。复现场景（`_set_max_session_body_bytes_for_test(100)`）：先 `emit_request_start('rA')`（pending 无 body），再写入带 200 字节 body 的 rX → `body_bytes=200 > 100`，`findIndex` 命中 rX，`events.length === 2` 不满足 too_large 分支，走 `splice(1, 1)` 把 rX 整体删除。结果：rX 请求元数据（url/method/status）永久不可见，`/cdp/events` 返回不了该请求，也无 `too_large` 标记。同缺陷的另一变体：两个带 body 事件 [big 300MB, small 10MB]、预算 200MB，若 big 更旧则先删 big（本应置 null 保留），仅当 big 更旧序恰好走到 `length===1` 才走对。AC-003 测试（`tests/unit/cdp_body_budget_accounting.test.ts:163-189`）断言 rB 被删（`events=['rA']`）恰与 AC-004 语义冲突——rB 是场景中唯一带 body 事件，按 AC-004 应保留元数据、body 置 null 标 `too_large`。spec 测试策略明确要求覆盖「pending 位于最旧位置…body cap 交叉场景」，该交叉场景未按 AC-004 语义实现。
- 建议：判定改为「剩余带 body 事件数量」：`findIndex` 后检查是否还有第二个 `typeof e.response_body === 'string'`，无则走置 null 标 too_large 分支（此时 body_bytes 扣除该事件字节后退出）；同时 AC-003 测试中 rB 的期望随之调整（应为 too_large 保留而非删除）。

### t157_code_f002 - 事件数淘汰豁免位已满时，extra pending 被静默丢弃（未转终态、未清 command 映射）

- 严重度：important
- 锚点：违反 AC-005「事件数上限淘汰 pending 时，产生可观察终态事件（非静默消失），且对应 command 映射被清理」
- 位置：`src/bridge/cdp_handler.ts:99-103`
- 问题：`push_bounded` 中，当队列已含一个 evicted 豁免位（`length === MAX+1`）再次超限、且最旧事件仍为 pending 时，`removed` 转 evicted 放回队尾后触发 `if (session.events.length > _max_session_events + 1)` 分支，`extra = shift()` 出的最旧事件若是 pending，直接走 `remove_event(session, extra)`——该函数只递减账本，**不移除语义上的终态转换**，事件从数组消失、无 `evicted`/`cdp_failed` 终态可被 `/cdp/events` 返回，`clear_body_seq` 也未对该 request 调用（其 `body_seq_to_req_id` 残留至迟到响应或会话销毁）。复现场景（`_set_max_session_events_for_test(2)`）：连续 4 个 `requestWillBeSent` 全 pending——push rC 时 rA 转 evicted（豁免位）；push rD 时 rB 转 evicted 放回、超 `MAX+1`，shift 出最旧 rC（仍 pending）→ 静默丢弃，rC 请求对调用方完全不可见。触发条件为连续 `MAX+2` 个 pending 同时驻留（生产 5000 上限下极端但可达，页面大量请求的 getResponseBody 响应整体延迟时），与 AC-005「非静默消失」直接冲突。`src/bridge/cdp_handler.ts:100` 的注释承认「pending 直接丢弃不再转换」，但该豁免未获 spec 批准，AC-005 未列此例外。
- 建议：extra 为 pending 时同样转 `evicted` 终态并 `clear_body_seq`，再决定放回或丢弃；或与 spec 确认后将「豁免位满时第 N 个 pending 静默丢弃」写入 AC-005 例外，二者取一。丢弃前至少补 `clear_body_seq` 防映射残留。

### t157_code_f003 - `remove_event` 命名误导：只递减账本，不移除事件

- 严重度：minor
- 锚点：代码质量（命名）
- 位置：`src/bridge/cdp_handler.ts:71-75`
- 问题：函数名 `remove_event` 且注释称「事件移除唯一入口」，但函数体只按 `response_body` 递减 `session.body_bytes`，不从 `session.events` 移除任何元素；三个调用点（`cdp_handler.ts:102`、`:105`、`:494-496`）均依赖调用方先行 shift/splice/数组重建完成实际移除。未来维护者若按名理解直接调用「以为事件已被移除」，会引入账本与数组不同步的 bug——恰是本 task 要防的漂移。
- 建议：改名如 `dec_body_bytes(evt)`，或在函数内同时完成数组移除并把调用方改为「先调 remove_event 再移除」的单一路径。

### t157_code_f004 - 账本写入与移除口径在 UTF-8 截断边界不一致，`body_bytes` 可能残留不回 0

- 严重度：minor
- 锚点：AC-001「回到 0（或仅统计当前驻留事件字节）」
- 位置：写入口 `src/bridge/cdp_handler.ts:437`（`+= Math.min(bytes.length, session.max_body_bytes)`，t140 原有）；移除口 `:73`（`-= Buffer.byteLength(实际存储 body)`，本 task 新增）
- 问题：写入按 `TextEncoder` 编码字节数记账，移除按实际存储字符串的 UTF-8 字节递减。当 body 超 `max_body_bytes` 被 `bytes.slice(0, max)` 截断、且截断点落在多字节字符中间时，`TextDecoder` 把末尾无效序列替换为 U+FFFD，实际存储字节比 `min(bytes.length, max)` 少 1~2 字节。该事件被 poll 返回后 `body_bytes` 残留 1~2 字节（不属于任何驻留事件），AC-001 的「回到 0」在边缘输入下不精确。实际影响极小（≤2 字节 vs 200MB 预算），不构成错误淘汰。
- 建议：写入时按截断后实际存储的字节数记账（`Buffer.byteLength(body)`），与移除口径统一；或承认该边缘在结论段说明。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：4 条（2 important + 2 minor）
- 未进表的提示：
  - 文件过大：`src/bridge/cdp_handler.ts` 477 → 528 行（净增 51），超 400 minor 阈值且本 task 净增，diff 未给出不可拆硬约束；按降级规则不进 finding 表。该文件已同时承载 4 个 handler + session 生命周期 + 预算账本，建议后续拆分。
  - 圈复杂度：`push_bounded`（CC≈6）、`enforce_body_budget`（CC≈4）、`clear_body_seq`（CC≈2）均 < 10，无提示；`onmessage` 处理器复杂度为 T101/T140 既有，本 task 仅新增一行引用，未增分支。
  - 范围外观察：`docs/blueprint/domain.md` 顺带补「CDP events 驻留上限 5000 条」行（spec 范围只要求 body 预算条目），与 AC-005 淘汰语义直接相关，视为文档完整性补充，不构成 YAGNI 违规。
  - 记账口径边缘：另见 f004，`body_bytes` 在 UTF-8 截断边界残留 ≤2 字节，实际无危害。
- 总体判断：AC-001/002/003/006 实现与测试齐备且正确；AC-004 判定条件与 AC-005 豁免位满路径存在语义缺口（f001/f002），均为可复现的 AC 行为差距，须修复后方可合入。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` —— `git diff` 确认 poll 返回路径统一走 `remove_event` 递减（`cdp_handler.ts:494-496`），测试 `cdp_body_budget_accounting.test.ts:123-140` 全绿且断言 `body_bytes` 回 0。
- AC-002：`re_verified` —— 测试 `:142-161` 全绿，poll 后新写入 3 条 600 字节在 800 预算内全部返回，无 stale 误淘汰。
- AC-003：`re_verified` —— `findIndex(e => typeof e.response_body === 'string')` 天然跳过无 body pending（`cdp_handler.ts:117`），测试 `:163-189` 全绿，迟到 body 响应重建事件成功。
- AC-004：`re_verified` —— 测试 `:191-205` 覆盖单事件场景全绿；但「pending + 唯一带 body」交叉场景经代码路径推理（`cdp_handler.ts:121` 判定 vs 数组含 pending 时的 length）确认实现行为与 AC 不符（f001）。
- AC-005：`re_verified` —— 测试 `:207-232` 覆盖最旧 pending 转 evicted 主路径全绿；豁免位已满、最旧仍 pending 的次路径经代码路径推理（`cdp_handler.ts:99-103`）确认 extra 静默丢弃（f002）。
- AC-006：`re_verified` —— `docs/blueprint/domain.md` diff 确认 200MB 数值、计数口径（当前驻留事件实际存储 body UTF-8 字节、poll 返回与淘汰时递减）、超限策略（仅淘汰最旧已终态带 body、pending 不偿还预算、单超大 body 置 null 标 too_large）三项齐全。

coverage = re_verified 6 / 6

reviewed_scope: af80b6e4bf9cedf5

verdict: FAIL

## Round 2 (2026-08-13 14:20 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **f001（AC-004 判定条件，important）**：已消除。`enforce_body_budget` 改为 `has_other_body = session.events.some((e, i) => i !== idx && typeof e.response_body === 'string')`（`cdp_handler.ts:126`），`!has_other_body` 时置 null 标 too_large 保留元数据；`events.length === 1` 误判移除。新测试 AC-004b（`cdp_body_budget_accounting.test.ts:210-233`）覆盖「pending + 唯一带 body」交叉场景：rY pending 保留、rZ 置 null 标 too_large、poll 可返回。AC-003 测试同步改为 [rA pending + rB/rC 两条带 body]（`:163-192`），验证「有 other body 时淘汰最旧带 body」路径仍正确，pending 不偿还预算。已修。
- **f002（AC-005 静默丢弃，important）**：主目标已消除。`push_bounded` 移除 MAX+1 豁免位与静默丢弃分支，改 `session.evicted_events` 独立待返回队列（`cdp_handler.ts:99-107`）：shift 出 pending → 转 evicted + `clear_body_seq` → 入队列，`events` 严格 ≤ MAX，无静默丢弃路径。`handle_cdp_events` 先 `evicted_events.splice(0, 100)` 再按剩余额度取 completed，合并返回、未返回保留下轮（`cdp_handler.ts:477-506`）。AC-005 测试构造了真实的 getResponseBody 映射（`:244-248`）并断言 `body_seq_to_req_id.size === 0` 与迟到响应不产生新终态（`:256-267`）。但修复方案引入新问题，见 f005。
- **f003（remove_event 名不副实，minor）**：已消除。改名 `decrement_body_bytes` 且注释明示「只递减账本；事件数组的移除由各调用方负责」（`cdp_handler.ts:71-80`），三处调用点（`:105`、`:136`、`:501-505`）均为先移除后递减。
- **f004（记账口径，minor）**：已消除。写入改为 `session.body_bytes += new TextEncoder().encode(body).length`（`:445`），即实际存储字符串 UTF-8 字节，与递减口径 `Buffer.byteLength(response_body, 'utf-8')` 一致；UTF-8 截断边缘的残留偏差消除。

### 本轮新发现

### t157_code_f005 - `evicted_events` 为无上限队列，T101「有界防 OOM」约束被修复方案绕过

- 严重度：important
- 锚点：行为缺陷（资源泄漏/内存无界增长）——T101 既有「events 有界写入，超上限丢最旧（防无界增长 OOM）」设计不变量回归；AC-005 未承诺 evicted 终态无限期驻留
- 位置：`src/bridge/cdp_handler.ts:99-107`（`evicted_events.push` 无上限检查）、`:477`（仅 poll 每轮 `splice(0, MAX_EVENTS_PER_POLL)` 消费）
- 问题：`evicted_events` 只在 `handle_cdp_events` 被消费（每轮 ≤ 100 条），`push_bounded` 向它写入无任何上限。当 `session.events` 已满（5000）且被 shift 的最旧事件持续为 pending（大量请求的 getResponseBody 响应长期未回/资源已释放）、同时 poll 消费速率跟不上时，每个新 CDP 事件触发一次淘汰并把一个 pending 转入 `evicted_events`，队列无界增长，内存随之无界——正是 T101 注释（`cdp_handler.ts:86`）要防的 OOM 路径，修复把无界边界从 `events`（原实现严格 ≤ MAX）转移到无上限的新队列。注入参数下可复现：`_set_max_session_events_for_test(2)` 连续写入 100 个 pending 且不 poll，`evicted_events.length` 达 98 且持续增长。`events` 满本身就意味着 poll 异常/慢，此时 `evicted_events` 恰好无人消费，不能依赖调用方轮询作为自然上界。
- 建议：为 `evicted_events` 设独立上限（如 `MAX_SESSION_EVENTS`），超限丢最旧 evicted 终态（已终态事件，丢弃不违反 AC-005「pending 淘汰产生可观察终态」——该承诺已在其入队时兑现）；或在 `push_bounded` 入队时复用同一上限并补一条结构化告警。需同步补事件数淘汰交叉场景测试。

### Round 2 结论

- 前轮 finding 复核：f001/f002/f003/f004 全部已消除（以 diff 与测试为准）；f002 修复方案引入新问题 f005
- 本轮新发现：1 条（1 important）
- 未进表的提示：
  - 文件过大：`src/bridge/cdp_handler.ts` 477 → 536 行（净增 59），超 400 minor 阈值且本 task 净增；按降级规则不进 finding 表（同 Round 1）。
  - 圈复杂度：`push_bounded` 较上轮降低（去除豁免位嵌套，CC≈5）、`enforce_body_budget` 增 `some` 一个分支（CC≈5），均 < 10；`handle_cdp_events` 增 3 行无分支。无提示。
  - 范围外观察：poll 返回顺序变为 evicted 优先于 completed（`evicted_batch.concat(to_return_completed)`），为 AC-005「可观察终态」的意图内行为变化，可接受。
- 总体判断：前轮 4 条 blocker/minor 均已修复且经测试与类型检查验证（`vitest` 6/6 绿、`tsc --noEmit` 干净）；`evicted_events` 无界是新引入的未解决 important，须处置后合入。
- 系统性 follow-up：无

### Round 2 AC 复验方式

- AC-001：`re_verified` —— 测试 `:123-140` 全绿；poll 递减走 `decrement_body_bytes`（`cdp_handler.ts:501-505`）。
- AC-002：`re_verified` —— 测试 `:142-161` 全绿，预算内 3 条新事件全部返回。
- AC-003：`re_verified` —— 新测试 `:163-192` 全绿：rB 被淘汰、rA pending 保留、迟到 body 重建成功、`body_bytes` 精确 300。
- AC-004：`re_verified` —— AC-004（`:194-208`）+ AC-004b（`:210-233`）全绿，pending 在场时唯一带 body 事件置 null 标 too_large 且 poll 可返回。
- AC-005：`re_verified` —— 新测试 `:235-270` 全绿：evicted 终态可观察、`body_seq_to_req_id` 清理（size 0）、迟到响应无副作用。
- AC-006：`re_verified` —— `docs/blueprint/domain.md` 本 Round 未改动，Round 1 已核对（200MB 数值、计数口径、超限策略三项齐全）。

coverage = re_verified 6 / 6

reviewed_scope: d55d6562b291b5b3

verdict: FAIL

## Round 3 (2026-08-13 14:30 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **f005（evicted_events 无上限队列，important）**：已消除。`push_bounded` 在 pending 转 evicted 入队后新增上限检查（`cdp_handler.ts:108-111`）：`if (session.evicted_events.length > _max_evicted_events) { session.evicted_events.shift(); }`。上限常量 `MAX_EVICTED_EVENTS = MAX_SESSION_EVENTS`（`cdp_handler.ts:55`）与测试钩子 `_set_max_evicted_events_for_test`（`:72-75`）齐备。逐项验证：
  - **上限生效**：入队后超限即 shift，队列长度恒 ≤ max；新测试 AC-005b（`cdp_body_budget_accounting.test.ts:236-259`，max_events=2 / max_evicted=2 连续 5 pending）断言 `evicted_events.length === 2`、`events.length === 2`、poll 返回 2 条 evicted 后队列清空，测试绿。
  - **丢最旧语义合理**：`evicted_events` 头部即最早淘汰事件，与 poll 消费（`splice(0, MAX_EVENTS_PER_POLL)` 从头取）顺序一致，超限丢最旧 = 丢最老、最可能已被消费的事件；被丢事件已转 evicted 终态（AC-005「产生可观察终态」的承诺在入队时已兑现，不要求无限期驻留）、其 `body_seq_to_req_id` 映射在转 evicted 时已 `clear_body_seq`、`response_body` 为 null 无账本影响——无映射残留、无账本漂移、无事件错位。
  - **无新引入问题**：`events` 严格 ≤ MAX 不变量保持；`decrement_body_bytes` 三处调用点与 poll 合并逻辑（Round 2 已核）未变；`MAX_EVICTED_EVENTS` 与 events 同量级，内存上界清晰。已修。

### Round 3 结论

- 前轮 finding 复核：f005 已消除；Round 1 f001-f004、Round 2 复核均维持「已消除」
- 本轮新发现：0 条
- 未进表的提示：
  - 文件过大：`src/bridge/cdp_handler.ts` 477 → 546 行（净增 69），超 400 minor 阈值且本 task 净增；按降级规则不进 finding 表（同前轮）。
  - 测试卫生（归 test reviewer，仅提示）：`beforeEach` 未重置 `_max_evicted_events`，AC-005b 设 2 后 AC-005（紧随其后执行）在该残留值下运行——当前因 AC-005 仅产生 1 条 evicted 不受影响而绿，但存在测试顺序耦合，建议 beforeEach 补 `_set_max_evicted_events_for_test(5000)`。
  - 圈复杂度：`push_bounded` 增 2 行无新分支（CC≈5），无提示。
- 总体判断：f005 修复正确、测试与类型检查全绿（`vitest` 7/7、`tsc --noEmit` 干净），无未解决 critical/important，可 PASS。
- 系统性 follow-up：无

### Round 3 AC 复验方式

- AC-001~006：`re_verified` —— 依赖 Round 2 已核证据（各 AC 对应测试与代码路径，见 Round 2 小节）；本轮代码变化仅限 `push_bounded` 的 evicted 上限与新增 AC-005b 测试，不触及 AC-001/002/003/004/006 语义，且 `vitest` 7/7 全绿确认无回归。AC-005 主路径（转 evicted + 映射清理）与 AC-005b（有界性）本轮直接复验：测试断言通过。

coverage = re_verified 6 / 6

reviewed_scope: e056d03a25dedd1f

verdict: PASS
