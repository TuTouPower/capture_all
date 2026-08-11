# Task review t111（reviewer_focus: 测试）

- task：`t111_har_started_datetime_encoding`
- spec：`docs/tasks/t111_har_started_datetime_encoding/spec.md`
- diff_anchor：`aceba36f99e96e118dc042624facb366442aea4e`
- target：`git diff aceba36f99e96e118dc042624facb366442aea4e`
- round：1
- reviewed_at：2026-08-11 09:40 UTC+8
- reviewed_scope: 4b50e963adf6005c

## Findings

### t111_test_f001 - AC-001 测试使用非生产数据形状，未覆盖真实数据路径且未捕获 websocket 时间回归

- 严重度：important
- 锚点：AC-001（startedDateTime 用真实请求开始时间）
- 位置：`tests/unit/exporter.test.ts:195-204`；生产数据形状参照 `network_capture.ts:281,685`（websocket `start_time_ms = conn.created_ts = Date.now()`）、`network_capture.ts:945,1014` 与 `webrequest_handler.ts:246` 与 `cdp_handler.ts:721`（`start_time_ms = null`）、`network_correlator.ts:70,135`（`absolute_time: number`）、`src/shared/types.ts:358`（`absolute_time?: number`）
- 问题：测试构造 `start_time_ms: 1500, absolute_time: undefined`，把 `start_time_ms` 当作「相对采集开始」的偏移。但全库生产写入方 `start_time_ms` 只取 `null`（web_request / cdp_primary / correlator 路径）或**绝对 epoch**（websocket 路径 `conn.created_ts = Date.now()`），没有任何写入方产生相对值。后果：
  1. 真实主数据路径 `typeof r.absolute_time === 'number'`（`exporter.ts:317-318`，由 `network_correlator.merge_matched` 产出）**无任何测试覆盖**。
  2. websocket 形状（`start_time_ms`=绝对 epoch、无 `absolute_time`）下，新实现 `started_at_ms + (start_time_ms ?? 0)` 计算 `采集开始 + 当前 epoch`。实测：`new Date(1704067200000 + Date.now()).toISOString() = 2080-08-10T01:22:50.660Z`，而旧实现 `r.start_time_ms ?? 0` 输出正确的 `2026-08-11T01:22:50.660Z`。即本次 diff 对 websocket 条目引入双 epoch 回归，测试因用了相对值而**未捕获**。
  3. cdp_primary 主路径（`start_time_ms = null`、无 `absolute_time`）输出恒为采集开始 `2024-01-01T00:00:00.000Z`，所有条目同值，非真实请求开始时间——AC-001 声明的行为在主路径未达成，测试也未体现。
- 建议：AC-001 测试改用真实数据形状，至少补两分支：(a) `absolute_time: number`（correlator 形状）断言 `new Date(absolute_time).toISOString()`；(b) websocket 形状 `start_time_ms`=绝对 epoch，断言输出约等于该 epoch 的 ISO（会暴露双 epoch 缺陷）。若实现无法覆盖 websocket / 主路径，则 f007「emit 时填 `start_time_ms = meta.timestamp`」未落地，需实现补位后测试才成立。

## 结论

- 前轮 finding 复核：Round 1，无。
- 改测方向复核：无。本轮 diff 对既有测试仅新增（`tests/unit/exporter.test.ts` +31 行），无修改/删除/迁就实现的改测。
- 本轮新发现：1 条。
- 未进表的提示：
  - AC-002 测试只断言 `content.encoding`，未断言 `content.text` 确为 base64 负载、`size` 用解码字节数（f008 建议项）。属覆盖可更广，non-blocking。
  - 测试 fixture `mock_network_requests[0].absolute_time` 为字符串 `'2024-01-01T00:00:01.500Z'`，与真实类型 `number`（`types.ts:358`）不符，属误导性死数据，建议随 f001 改真实形状时一并修正。
  - 实现层面（属 code reviewer 范围，此处仅提示）：websocket 双 epoch 与 cdp_primary 恒为采集开始时间，需 code review 阶段核实。
- 总体判断：AC-002/003 测试真实触达生产逻辑且判别力充分；AC-001 测试场景非任何生产数据形状，存在未捕获的实现回归，AC-001 覆盖证据不足 → FAIL。
- 系统性 follow-up：无现成 tid。建议「HAR 导出对 websocket 绝对 start_time_ms 与 cdp_primary 无时间记录的处理」，slug `har_time_ws_abs_and_cdp_primary`。

### AC 复验方式

- AC-001：`re_verified`。`npx vitest run tests/unit/exporter.test.ts` 10 passed；逐行核对 `exporter.ts:316-319` 与测试 195-204，确认测试走相对回退分支，且移除旧实现修复（回退 `abs_time_ms = r.start_time_ms ?? 0`）时该测试会失败（输出 1970-01-01）；但该场景非生产数据形状，真实路径缺陷未覆盖（见 f001）。
- AC-002：`re_verified`。断言 `exporter.test.ts:213` `encoding === 'base64'`，对应实现 `exporter.ts:322,348`；移除 encoding 逻辑则测试失败。
- AC-003：`re_verified`。断言 `exporter.test.ts:223` `encoding` undefined，对应实现 `exporter.ts:322`；naive 实现（`encoding = response_body_encoding`）会失败。

coverage = 3 / 3 re_verified

verdict: FAIL

## Round 2 (2026-08-11 09:33 UTC+8)

reviewed_scope: f26f755d7322cfe4

### t111_test_f002 - AC-001b 测试分支生产不可达：websocket 形状被接线遮蔽，AC-001 websocket 行为未真实验证

- 严重度：important
- 锚点：AC-001（给定网络事件已知非零时刻，HAR startedDateTime 与之误差 1s 内）；websocket 已知时刻为 `start_time_ms = conn.created_ts`（`network_capture.ts:281`）
- 位置：
  - 接线：`src/extension/background/service_worker.ts:906-910`
  - AC-001b 测试：`tests/unit/exporter.test.ts:205-213`
  - exporter 优先级：`src/extension/background/exporter.ts:324-330`
- 问题：
  1. **测试分支生产不可达**。接线对**所有** `network_request` 事件在 `absolute_time === undefined` 时填充 `absolute_time = started_at + relative_time_ms`。所有 `network_request` 事件（含 websocket 连接事件，`type='network_request'`，`network_capture.ts:261`）恒携带数值 `relative_time_ms`（`network_capture.ts:262,915,981`），websocket 事件不命中 `ws_frame` 提前返回（`service_worker.ts:889`）。而 exporter 优先用 `absolute_time`（`exporter.ts:324`）。结果：websocket 数据（`start_time_ms`=绝对 epoch、`absolute_time` 初始 undefined）经接线后被填上 `absolute_time`，**永远走不到 AC-001b 测试保护的分支**。唯一绕过接线的是直接传 data 无 event 的调用（`handle_cdp_body_event`/`handle_fallback_body_event`），其 `start_time_ms` 恒 null 或直接带 `absolute_time`，同样不触达 AC-001b。已核证 `service_worker.ts:913` 是全仓唯一 `write_network_requests` 写入口，无其它绕过路径。
  2. **AC-001b 测试象征性通过**：断言的是 exporter 孤立逻辑，但该分支在生产 websocket 流中永不触发。AC-001b 声称覆盖「websocket 形状」，实际生产 websocket 的 startedDateTime 来源是接线计算的**事件发射时间**（connecting/open/closed 时刻），而非 `conn.created_ts`。
  3. **可观测 AC 违反**：websocket 长连接下，`closed` 记录（`network_capture.ts:748` → `send_ws_connection_event`）的 `relative_time_ms = Date.now() - start_time`（关闭时刻），接线得 `absolute_time`=关闭时间。若连接持续 120s，HAR startedDateTime 与 `conn.created_ts` 差 120s，远超 AC-001 的 1s 容差。此回归由本 diff 引入（旧实现 `r.start_time_ms ?? 0` 对 websocket 输出正确的 `conn.created_ts`），且 AC-001b 测试因分支不可达**捕获不到**。
  4. 回答 prompt 第 3 步判断：exporter 的 absolute_time 测试 + 接线代码核证**不足以**覆盖 AC-001 主路径。cdp_primary/web_request 主路径（接线填充 + AC-001a 覆盖 exporter 侧）成立；但 websocket 路径因接线优先级遮蔽而行为未验证且可能违反 AC-001。
- 建议：
  - 首选：接线仅在无绝对开始时间时填充——`if (request.absolute_time === undefined && !(request.start_time_ms && request.start_time_ms > 0) && typeof event?.relative_time_ms === 'number')`。使 websocket 保留 `start_time_ms`（`conn.created_ts`）走 AC-001b 分支，既有测试即真正保护生产行为；cdp_primary/web_request（`start_time_ms`=null）仍走接线。接线改动属实现侧，需 code review 复核。
  - 或补接线级断言（需导出 `handle_network_request` 或经消息 action）：`{event:{relative_time_ms: X}, data:{start_time_ms: 绝对 epoch}}` → `data.absolute_time` 保持 undefined；`data:{start_time_ms: null}` → `data.absolute_time === started_at + X`。

## 结论（Round 2）

- 前轮 finding 复核（以 `git diff aceba36...` 为准）：
  - **t111_test_f001（important，AC-001 证据不足）→ 三子点分别核证**：
    1. absolute_time(number) 主路径无测试 → **已消除**。AC-001a（`exporter.test.ts:195-203`）用 `absolute_time: 1704067201500`（number）断言精确 ISO，correlator/coordinator 与接线产物形状一致。判别力：移除 exporter 修复（旧 `abs_time_ms = r.start_time_ms ?? 0`）则输出 1970-01-01，失败。✓
    2. websocket 双 epoch 回归 + 测试用相对值 → **exporter 层已消除，但接线引入新遮蔽**。当前 exporter 将 `start_time_ms` 直接视为绝对 epoch（`exporter.ts:326-327`），不再叠加 `started_at`；AC-001b 用绝对 epoch 断言，双计实现（`started_at + start_time_ms` → 2080-02-18T18:40:01.500Z）会失败。✓。但接线（`service_worker.ts:906-910`）对所有 network_request 事件填 `absolute_time`，使 AC-001b 分支生产不可达 → 新 finding f002。
    3. cdp_primary 主路径恒回退采集开始 → **已消除**。接线从 `event.relative_time_ms` 计算绝对开始时间（`service_worker.ts:908-909`），exporter 侧由 AC-001a 覆盖；回退语义由 AC-001c 显式钉住（无时间字段 → 采集开始，非 1970），判别力：回退逻辑错误（回退 0）输出 1970-01-01，失败。✓
- 改测方向复核：无。本轮 diff 对既有测试零修改/零删除，仅新增 5 条 AC 用例；无「迁就实现」的改测。
- 本轮新发现：1 条（t111_test_f002，important）。
- 未进表的提示：
  - AC-002 仅断言 `encoding`，未断言 `size` 用解码字节数（Round 1 已提示，non-blocking 维持）。
  - 每 websocket 产生 connecting/open/closed 三条 `NetworkRequestData` 记录（同 `request_id`），HAR 导出对应多条目——属 pre-existing 行为，不在 t111 范围。
  - exporter 的 `relative_time` 分支（`exporter.ts:328`）在 correlator/coordinator 路径有写入（`network_correlator.ts:134`、`body_capture_coordinator.ts:295`），但两处同时写 `absolute_time`，exporter 优先 `absolute_time`，故该分支在生产中同样被遮蔽，相对偏移语义未真实触达——属范围外，non-blocking。
- 总体判断：AC-001a/c、AC-002/003 测试真实触达生产逻辑且判别力充分；AC-001b 测试本身构造正确（绝对 epoch、可捕获双计），但接线使该分支生产不可达，websocket 实际 startedDateTime 来源未验证且长连接下违反 AC-001 的 1s 容差 → 本轮仍 FAIL。
- 系统性 follow-up：无现成 tid。f002 由本 task 实施修复（接线优先级）即可，无需独立任务。

### AC 复验方式（Round 2）

- AC-001：`re_verified`。`npx vitest run tests/unit/exporter.test.ts` 12 passed；逐行核对 `exporter.ts:324-330` 三分支与三用例（AC-001a number 分支、AC-001b start_time_ms 绝对分支、AC-001c 回退分支）；推理验证判别力（移除修复→1970、双计→2080、回退错→1970 均失败）；并核证接线对 websocket 的遮蔽路径（f002）。
- AC-002：`re_verified`。断言 `exporter.test.ts:225-233` `encoding === 'base64'`，对应实现 `exporter.ts:336`（body_encoding 判定）+`362`（encoding 写出）；无 encoding 逻辑则失败。
- AC-003：`re_verified`。断言 `exporter.test.ts:235-243` `encoding` undefined，对应实现 `exporter.ts:336`；naive 实现（encoding = response_body_encoding 非 null 即设）输出 'utf8' 会失败。

coverage = 3 / 3 re_verified

verdict: FAIL

## Round 3 (2026-08-11 09:50 UTC+8)

reviewed_scope: 4b486c65110544f8

复验命令：`npx vitest run tests/unit/exporter.test.ts`（12/12 通过，无 skip/only）；指纹用 `scripts/repo_template/check_review_status.py` 同口径（`git diff --binary aceba36 -- .` + 流程文件排除）重算为 `4b486c65110544f8`，与注入值一致。

### 前轮 finding 复核（以 diff 与代码为准）

- **t111_test_f002（important，websocket 分支被接线遮蔽）——已消除**，diff 与代码逐点核证：
  1. 接线 `service_worker.ts:908-911` 已加守卫 `!(request.start_time_ms && request.start_time_ms > 0)`。websocket 记录 `start_time_ms = conn.created_ts = Date.now()`（绝对 epoch，恒 > 0，见 `network_capture.ts:281`、`cdp_handler.ts:598`、`ws_handler.ts:45`），守卫为假 → 不再填 `absolute_time` → exporter AC-001b 分支（`exporter.ts:329-330`）生产可达。
  2. 可达性核证：websocket 连接事件（`network_capture.ts:258-308`，type='network_request'、带 `relative_time_ms`、`start_time_ms = conn.created_ts`）经 `send_to_background` → `handle_network_request`（`service_worker.ts:466` 注入）。`ws_frame` 提前 return（`service_worker.ts:889-901`）只拦帧事件，连接事件走 request 路径。长连接 closed 记录 `relative_time_ms`=关闭时刻（`network_capture.ts:735`），守卫阻止其覆盖 created_ts，HAR startedDateTime = created_ts（连接创建时刻），AC-001 1s 容差成立——f002 点 3 的可观测违反消除。
  3. cdp primary / web_request（`start_time_ms = null`，`network_capture.ts:945/1014`、`cdp_handler.ts:721`、`webrequest_handler.ts:246`）走守卫填充 `absolute_time = started_at + relative_time_ms` → exporter AC-001a 分支。基线一致性：`start_capture_inner_impl` 同刻取 `now`/`now_iso`（`service_worker.ts:373-425`），`current_capture.started_at` ≈ `start_time`，误差亚毫秒。`normalize_network_request`（`service_worker.ts:861-869`）不触碰 absolute_time/start_time_ms/relative_time，持久化无覆盖。
  4. body 事件绕过路径（`handle_cdp_body_event` / `handle_fallback_body_event`，`service_worker.ts:799-858`）传裸 request 无 event，`event?.relative_time_ms` 非 number，守卫不填充；这些路径 start_time_ms 恒 null 或已带 absolute_time，不触达 AC-001b，不受影响。

### 本轮新发现

### t111_test_f003 - AC-001a/b 测试 fixture 与相对时间回退分支结果碰撞，字段优先级未被测试锁定

- 严重度：minor
- 锚点：无 AC 直接违反；判别力增强（Round 2 code review 已提示「评估是否清空 relative_time 以增强隔离」）
- 位置：`tests/unit/exporter.test.ts:195-203`（AC-001a）、`tests/unit/exporter.test.ts:205-213`（AC-001b）；基 fixture `tests/unit/exporter.test.ts:24`（started_at '2024-01-01T00:00:00Z'）、`:86`（relative_time 1500）
- 问题：`new Date('2024-01-01T00:00:00Z').getTime() + 1500 = 1704067201500`，恰与 AC-001a 的 `absolute_time: 1704067201500`、AC-001b 的 `start_time_ms: 1704067201500` 相等。两用例断言可观测输出，对历史 bug 有判别力（原始实现→1970-01-01、双计 `started_at+start_time_ms`→2077-12-31 均失败，已实测核证），但无法区分「目标字段生效」与「relative_time 分支吸收一切」——假设实现忽略 absolute_time/start_time_ms 仅走 relative_time+回退，三用例全部通过。AC-001 字段优先级（absolute_time → start_time_ms → relative_time）的顶层两条未被测试锁定。
- 建议：AC-001a/b 各置 `relative_time: undefined`（或让 absolute_time/start_time_ms 用与 `started_at+relative_time` 不同的值），使断言唯一来自被测字段。

### t111_test_f004 - 接线守卫（websocket 保留 start_time_ms / cdp 填充 absolute_time）无测试锁定

- 严重度：minor
- 锚点：无 AC 直接违反；f002 修复无回归保护（当前行为正确，见 f002 复核）
- 位置：`src/extension/background/service_worker.ts:908-911`；无对应单元测试（`handle_network_request` 未导出）
- 问题：网络数据经内部回调送达（`start_network_capture` / `start_body_capture` 的 `on_network_request`，`service_worker.ts:466/543/1036/1143`），非消息 action 直连可达，现无接线级测试。f002 根因正是接线遮蔽（exporter 单测不可见）。当前守卫经本报告复核正确；但若未来移除 `!(request.start_time_ms && request.start_time_ms > 0)`，websocket 再次被 absolute_time 遮蔽，AC-001b 静默重陷生产不可达，全部测试仍绿。
- 建议（二选一）：(a) 导出 `handle_network_request` 直连断言——`{event:{type:'network_request', relative_time_ms:X}, data:{start_time_ms: 绝对epoch}}` → data.absolute_time 保持 undefined；`data:{start_time_ms: null}` → data.absolute_time === started_at + X；(b) 或在 task.md 处置表明确接受该缺口（接线由 code review 每轮复核）。

## 结论（Round 3）

- 前轮 finding 复核：f002 → **已消除**。接线守卫使 websocket（start_time_ms 绝对 epoch）保留字段、走 AC-001b 生产可达；cdp primary / web_request 填 absolute_time 走 AC-001a；长连接 closed 记录 startedDateTime = conn.created_ts，AC-001 1s 容差成立。
- 改测方向复核：无。本轮 diff 对既有测试零修改/零删除，仅新增 5 条 AC 用例；无「迁就实现」的改测。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
  - AC-002 仅断言 `encoding`，未断言 `content.size` 用解码字节数、`text` 为 base64 负载（Round 1/2 已提示，non-blocking 维持）。
  - exporter 的 `relative_time` 回退分支（`exporter.ts:331-332`）生产中仍被遮蔽（correlator/coordinator 同时写 absolute_time），相对偏移语义未真实触达——范围外，Round 2 已记。
  - 每 websocket 产生 connecting/open/closed 三条 NetworkRequestData 记录，HAR 对应多条目——pre-existing，不在 t111 范围。
- 总体判断：f002 已消除；AC-001a/b/c 测试触达真实生产形状、对历史 bug 有判别力（原始实现→1970、双计→2077 均失败）；余下仅两条 minor（fixture 隔离、接线回归保护），无未解决 critical/important → PASS。
- 系统性 follow-up：无（f002 已由本 task 接线守卫闭合，无需另建）。

### AC 复验披露（Round 3）

- AC-001：`re_verified`。重跑 `npx vitest run tests/unit/exporter.test.ts` 12/12；逐行核证 `service_worker.ts:908-911` 守卫、`network_capture.ts:258-308`（websocket 事件 start_time_ms=created_ts>0 保留）、`network_capture.ts:908-991`/`cdp_handler.ts:673-698`（cdp 事件 start_time_ms=null 填 absolute_time）、`exporter.ts:327-333` 三分支；基线一致性 `start_capture_inner_impl`（`service_worker.ts:373-425` started_at≈start_time）。真实路径三条数据线（websocket / cdp primary / web_request）均产出正确绝对时刻。
- AC-002：`re_verified`。断言 `exporter.test.ts:225-233` encoding==='base64'，对应实现 `exporter.ts:336,362`；无 encoding 逻辑则失败。
- AC-003：`re_verified`。断言 `exporter.test.ts:235-243` encoding undefined，对应实现 `exporter.ts:336`；naive 实现（encoding = response_body_encoding 非 null 即设）输出 'utf8' 会失败。

coverage = 3 / 3 re_verified

verdict: PASS

## Round 4 (2026-08-11 09:48 UTC+8)

reviewed_scope: 50a9fc07d3f7a54b

复验命令：`npx vitest run tests/unit/exporter.test.ts`（12/12 通过，无 skip/only）；指纹用 `git diff --binary aceba36 -- .` + 流程文件排除重算为 `50a9fc07d3f7a54b`，与注入值一致。

### 前轮 finding 复核（以 diff 与代码为准）

- **t111_test_f003（minor，AC-001a/b fixture 与 relative 回退分支结果碰撞）——已消除**。R4 调整：AC-001a `absolute_time` 1704067201500→1704067202000（期望 00:00:02.000Z）、AC-001b `start_time_ms` 1704067201500→1704067203000（期望 00:00:03.000Z）。核证三用例与 relative 派生值（started_at 1704067200000 + relative_time 1500 = 00:00:01.500Z）、采集开始（00:00:00.000Z）全不碰撞，字段优先级被唯一锁定：
  - AC-001a 期望 02.000Z；若实现忽略 absolute_time 仅走 relative 分支则输出 01.500Z → 失败，判别力成立。
  - AC-001b 期望 03.000Z；忽略 start_time_ms 走 relative → 01.500Z 失败；双计（started_at + start_time_ms = 3408134403000 ≈ 2077 年）失败。判别力成立。
  - AC-001c 期望 00.000Z；回退错误（回退 0）→ 1970-01-01T00:00:00.000Z 失败。判别力成立。
  - exporter 优先级链（`exporter.ts:327-333`）absolute_time → start_time_ms → relative_time → 采集开始回退的顶层两条现被测试唯一锁定。
- **t111_test_f004（minor，接线守卫无测试锁定）——仍存在**。`service_worker.ts:907-910` 守卫 `!(request.start_time_ms && request.start_time_ms > 0)` 仍无单元测试锁定（`handle_network_request` 未导出，仅内部回调送达）。f003 修复（fixture 值调整）未触及接线，守卫现状经复核仍正确。处置由 task 决定（登记 pending）。非阻断。

### 本轮新发现

无。

## 结论（Round 4）

- 前轮 finding 复核：f003 → **已消除**（fixture 值调整后三用例判别力唯一锁定字段优先级）；f004 → **仍存在**（minor，非阻断，处置由 task 决定）。
- 改测方向复核：R4 调整 AC-001a/b fixture 时间值属「断言应有的预期」强化——期望值仅由注入字段自身推导（`new Date(1704067202000).toISOString()` = 00:00:02.000Z），非迁就当前实现输出；且消除与 relative 分支碰撞、增强判别力。相对 diff_anchor 整个 AC 测试块为纯新增（50 insertions，0 修改/0 删除），无对既有测试的改动。合法，无 finding。
- 本轮新发现：0 条。
- 未进表的提示：AC-001a/b 仍继承基 fixture `relative_time: 1500`（未置 undefined），因期望值已与 relative 派生值不同，判别力不受影响，完全隔离属可选清理；AC-002 未断言 `content.size` 用解码字节数（R1/2/3 已提示，non-blocking 维持）。
- 总体判断：f003 已消除，唯一剩余 minor f004 非阻断且由 task 决定处置 → PASS。
- 系统性 follow-up：无。

### AC 复验披露（Round 4）

- AC-001：`re_verified`。重跑 `npx vitest run tests/unit/exporter.test.ts` 12/12；逐行核证 `exporter.test.ts:195-223` 三用例与 `exporter.ts:327-333` 三分支，验证期望值均与注入字段自身一致且三用例互异。
- AC-002：`re_verified`。断言 `exporter.test.ts:225-233` encoding==='base64'，对应实现 `exporter.ts:336,362`；无 encoding 逻辑则失败。
- AC-003：`re_verified`。断言 `exporter.test.ts:235-243` encoding undefined，对应实现 `exporter.ts:336`；naive 实现（encoding = response_body_encoding 非 null 即设）输出 'utf8' 会失败。

coverage = 3 / 3 re_verified

verdict: PASS
