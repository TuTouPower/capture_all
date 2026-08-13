# Task review t157（reviewer_focus: 测试）

- task：`t157_fix_cdp_body_budget_accounting`
- spec：`docs/tasks/t157_fix_cdp_body_budget_accounting/spec.md`
- diff_anchor：`e9ac19839ea60e2bd4cd93d10a85d11ecf4417bd`
- target：`git diff e9ac19839ea60e2bd4cd93d10a85d11ecf4417bd`
- round：1
- reviewed_at：2026-08-13 14:10 UTC+8

## Findings

### t157_test_f001 - AC-005「command 映射清理」条款零测试触达；迟到响应模拟为条件永假的 dead code

- 严重度：important
- 锚点：AC-005（「且对应 command 映射被清理」条款）
- 位置：`tests/unit/cdp_body_budget_accounting.test.ts:222-229`（AC-005 测试尾部）
- 问题：AC-005 是两条款并列：a) 产生可观察终态事件（非静默消失）b) 对应 command 映射被清理。测试只验证了 a（`response_body_status === 'evicted'` 可观察返回），b 零触达：

  1. 本 task 新增的 `clear_body_seq`（`src/bridge/cdp_handler.ts:78-84`）是事件数淘汰路径的核心清理逻辑，但没有任何测试构造「pending 事件已发出 getResponseBody（seq 映射已建）后再被事件数淘汰」场景。测试 AC-005 只发了 `requestWillBeSent` 创建 pending，从未发 `loadingFinished`/`getResponseBody`，故被淘汰的 rA 根本不持有 seq 映射，`clear_body_seq` 无映射可清，该函数实际未被任何测试执行到。删除 `clear_body_seq` 或将其写错（漏删/错删），5 个测试全部仍绿。
  2. 测试尾部 222-227 行意图模拟「迟到 getResponseBody 响应不误匹配」，但 `if (sent && sent.includes('getResponseBody'))` 条件在此场景下恒假：rA/rB/rC 均只发了 `requestWillBeSent`（不发 `getResponseBody`），最后一次 send 是 `start_session` 中 onopen 发出的 `Network.enable`，`includes('getResponseBody')` 为 false，块内 emit 从不执行——属条件跳过（前置不满足时无证据仍 PASS），迟到响应场景实际未发生。

- 建议：构造真实场景：先对 rA 发 `loadingFinished`（建立 seq 映射且此时 pending），再写入 rB、rC 触发事件数淘汰把 rA 转 evicted，随后用 rA 的 getResponseBody 响应 id 回发迟到 body；断言不抛异常、session 中无任何事件被该迟到响应更新（或断言被淘汰事件不因迟到响应复活）。删除 222-227 行不可达的条件块。

### t157_test_f002 - AC-005 尾部 pending 计数断言 `toBeLessThanOrEqual(2)` 无验证力

- 严重度：minor
- 锚点：AC-005（辅助断言）
- 位置：`tests/unit/cdp_body_budget_accounting.test.ts:229`
- 问题：`expect(session.events.filter(e => e.response_body_status === 'pending').length).toBeLessThanOrEqual(2)` 为范围断言：若实现误删 rB/rC 中任一条（pending=1），断言同样通过；旧实现（t101 直接 shift，events=[rB,rC]，pending=2）下也通过。该断言无法区分「rB/rC 仍留存」与「被误删」，验证力趋近于零。不承担 AC-005 主证据（主断言 evicted 存在有效且旧实现代入红），故定 minor；但按危险模式「弱化断言」倾向，建议改为精确断言 `toBe(2)`，或直接删除（其意图已被 220 行 `filter(e => e.request_id !== 'rA').length === 0` 部分覆盖）。
- 建议：改 `toBe(2)` 或删除；若保留，注释说明其语义是「rB/rC 未被动过」。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 改测方向复核：无。diff 仅新增测试文件 `tests/unit/cdp_body_budget_accounting.test.ts`，未修改任何既有测试，无「迁就实现」的改测。
- 本轮新发现：2 条（1 important + 1 minor）
- 未进表的提示：
  - 非 ASCII / 多字节 body 的 UTF-8 字节计数未测（如中文 body 3 字节/字）：`remove_event` 用 `Buffer.byteLength`、记账用 `TextEncoder` 截断口径，二者对 UTF-8 一致，但无测试锁住该口径一致性。可选扩展。
  - `_enforce_body_budget_for_test` 导出（`cdp_handler.ts:113`）未被测试使用，属可删冗余或留给其他 task 的钩子，非本 task 缺陷。
  - 事件数上限连续淘汰（MAX+1 豁免位已满）时 pending 直接丢弃不再转 evicted（`cdp_handler.ts:99-103`），与 AC-005 字面语义存在边界偏差，但为防无界增长的必要妥协且实现注释已说明；未测试。
- 总体判断：AC-001~004 覆盖闭合、断言强、旧实现代入均红（已逐条核验）；AC-005 核心终态验证有效，但「command 映射清理」条款零触达且迟到响应模拟为死代码，存在未解决 important，须修复后进入下一轮。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified`。测试 123-140 行走生产 `handle_cdp_events`；`body_bytes` 17→0 数值断言 + 二次 poll 空；旧实现（poll 不递减）代入红。
- AC-002：`re_verified`。测试 142-161 行，800B cap、先 poll 清空再写 600B；stale 账本（旧实现）下 r3 被误淘汰、断言 3 条红。
- AC-003：`re_verified`。测试 163-189 行，pending rA 居最旧、rB 200B 触发预算淘汰；断言 `events=['rA']` + rA 迟到 body 重建 captured；旧实现 shift rA 后红。
- AC-004：`re_verified`。测试 191-205 行，单条 200B > 100B cap；断言 `response_body` null + `too_large` 且可被 poll 返回；旧实现保留 captured 红。
- AC-005：`re_verified`（核心条款）。测试 207-232 行，cap=2 三 pending；`evicted` 终态可观察返回断言旧实现代入红；「command 映射清理」子条款未复验到（见 f001，零触达）。
- AC-006：`re_verified`。`docs/blueprint/domain.md` diff 增两行：CDP events 驻留上限（5000，pending 转 evicted）与 CDP 会话聚合 body 预算（200MB，含计数口径=poll 返回与淘汰时递减、超限策略=仅淘汰已终态带 body 事件、单超大 body 置 null 标 too_large），内容断言齐备。

coverage = 6/6

reviewed_scope: af80b6e4bf9cedf5

verdict: FAIL

## Round 2 (2026-08-13 14:15 UTC+8)

### 前轮 finding 复核（以 diff 与代码为准）

- t157_test_f001（important，AC-005 映射清理零触达 + 死代码）——**已消除**。AC-005 测试（`tests/unit/cdp_body_budget_accounting.test.ts:235-270`）重构：rA 先发 `loadingFinished` 建立 getResponseBody 映射，并以 `expect(get_body_calls.length).toBe(1)` 前提断言锁死「映射确实建立」（防「无映射可清 → size 恒 0」假绿）；rB/rC 触发事件数淘汰后 `expect(session.body_seq_to_req_id.size).toBe(0)` 精确断言直接触达 `clear_body_seq`（`cdp_handler.ts:78-84`），删除该函数 6 测试全红（size=1）。原恒假 `if (sent.includes('getResponseBody'))` 死代码已删除，改为直接 `socket.emit({ id: seq_of_a, ... })` 模拟迟到响应。生产实现同步引入 `evicted_events` 独立待返回队列（不占 events 上限），`handle_cdp_events:480` 优先返回。
- t157_test_f002（minor，范围断言无验证力）——**已消除**。尾部断言改为 `expect(session.events.filter(e => e.response_body_status !== 'pending').length).toBe(0)` 精确断言「迟到响应不产生新终态」；与 size===0 断言互补（一个抓映射清理、一个抓迟到响应无副作用）。

### 防假绿复核（6 测试各自独立验证，旧实现代入红）

- AC-001：poll 前 `body_bytes===17`、poll 后 `===0` + 二次 poll 空；旧实现（poll 不递减）下 poll 后仍 17 → 红。
- AC-002：800B cap，poll 清空后写 600B；stale 账本（旧实现）下 r5 写入时超限误淘汰 r3，断言 3 条 → 红。
- AC-003：场景修正为 [pending rA + rB/rC 各 300B]，cap 400；断言 `events=['rA','rC']`、`body_bytes===300`（rC 留存）；旧实现 shift 语义删 rA 与 rB → 红；迟到 rA body 重建 captured 断言旧实现下（rA 已删）→ 红。
- AC-004：单事件 200B > 100B cap；poll 返回 `response_body null` + `too_large`；旧实现保留 captured → 红。
- AC-004b（新增变体）：[rY pending + rZ 200B]，断言 `['rY','rZ']`、rZ 置 null 标 too_large、`body_bytes===0`；Round 1 实现（`events.length===1` 判断）代入 → splice rZ → 红；独立验证生产新增的 `has_other_body` 分支（`cdp_handler.ts:127`）。
- AC-005：前提断言（get_body_calls===1）→ 映射清理（size===0）→ 可观察 evicted 终态（poll 返回）→ 迟到响应无新终态（非 pending===0）；任一环节回归（无 clear_body_seq / 无 evicted 转换 / evicted 不返回 / 迟到响应误更新）均有断言变红。

### 危险模式扫描（Round 2）

无命中：无 `.skip`/`.only`/注释 expect/eslint-disable/ts-ignore；无恒真断言；无条件跳过（原 if 死代码已删）；无弱化断言（尾部为 `toBe(0)`）；mock 边界仍仅 WebSocket/fetch stub，`handle_cdp_*` 生产路径真实执行。

### 改测方向复核

无。diff 仍为纯新增测试文件 + 生产实现修改，未修改任何既有测试；AC-003 场景重写与 AC-004b 为同一 AC 内语义更强的验证（断言「淘汰跳过 pending 选最旧带 body」），非迁就实现。

### 结论

- 前轮 finding 复核：f001 已消除、f002 已消除（均为精确断言，无换形式弱化）
- 改测方向复核：无
- 本轮新发现：0 条
- 未进表的提示：
  - AC-003 中 `body_bytes += new TextEncoder().encode(body).length`（`cdp_handler.ts:439`）记账口径修正为「实际存储字符串字节」，与淘汰减量一致；多字节（非 ASCII）body 的字节计数仍无测试锁定，可选扩展。
  - 连续多次事件数淘汰（多个 pending 逐次转 evicted 入队列）场景未测，但 `evicted_events` 独立队列设计已消除 Round 1 提示的 MAX+1 豁免位边界，且单次场景已验证；属可再加 case。
- 总体判断：f001/f002 处置真实消除（精确断言替代，前提锁定防假绿），6 测试逐条核验旧实现代入红，AC-001~006（含 AC-004 变体）覆盖闭合，无未解决 critical / important。
- 系统性 follow-up：无

reviewed_scope: af80b6e4bf9cedf5

verdict: PASS

## Round 3 (2026-08-13 14:16 UTC+8)

### AC-005b 复核（f005 回归测试）

- 测试：`tests/unit/cdp_body_budget_accounting.test.ts:236-259`，cap（events）=2、cap（evicted）=2，连续 5 个 pending。
- 演进核验：r0/r1 驻留；r2/r3 各触发一次淘汰转 evicted（队列 [r0,r1]）；r4 触发淘汰后队列 [r0,r1,r2] 超限 shift 最旧 r0 → [r1,r2]；events 始终 [·,·] ≤ 2。
- 断言独立验证上限语义，逐条防假绿：
  - `evicted_events.length === 2`：代入 Round 2 无上限实现（队列累积 [r0,r1,r2]=3）→ 红；抓「封顶且最旧被挤出」。
  - `events.length === 2`：events 严格 ≤ 上限，旧 t101 无淘汰/豁免位实现 → 红。
  - `poll` 返回 2 条且 `every(status === 'evicted')`：验证 evicted 终态可观察返回且全部返回（splice 数量错 → 红）。
  - poll 后 `evicted_events.length === 0`：验证队列清空（splice 未清 → 红）。
- 对应生产实现：`push_bounded`（`src/bridge/cdp_handler.ts:105-107`）`evicted_events.push` 后 `length > _max_evicted_events` 则 shift 最旧；默认上限 `MAX_EVICTED_EVENTS = MAX_SESSION_EVENTS`（`cdp_handler.ts:55`），`_set_max_evicted_events_for_test` 钩子（`cdp_handler.ts:68-70`）已导出。
- 无恒真/弱断言（全部精确 toBe / every）；无 `.skip`/条件跳过；mock 边界不变（仅 WebSocket/fetch stub）。
- 与 AC-005 关系：AC-005b 为 code finding f005 的回归测试，验证「已终态事件超限丢最旧不违反 AC-005 等待语义」，与 AC-005（单次转 evicted + 映射清理）互补，无冲突。

### 结论

- 前轮 finding 复核：f001/f002 仍消除（本轮 diff 未触碰 AC-005 主断言链）；f005 处置已验证——AC-005b 无上限旧实现代入红，上限语义、封顶挤出、poll 返回与清空四断言独立成立。
- 改测方向复核：无（纯新增 AC-005b 测试 + 生产 push_bounded 增上限检查，未改既有测试预期）。
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：7 测试全绿（vitest 实测），AC-001~006 + AC-004b + AC-005b 覆盖闭合，所有已知 blocker（f001/f002/f005）均已消除并有回归测试锁定，无未解决 critical / important。
- 系统性 follow-up：无

reviewed_scope: e056d03a25dedd1f

verdict: PASS
