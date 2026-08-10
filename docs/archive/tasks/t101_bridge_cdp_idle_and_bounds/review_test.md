# Task review t101（reviewer_focus: 测试）

- task：`t101_bridge_cdp_idle_and_bounds`
- spec：`docs/tasks/t101_bridge_cdp_idle_and_bounds/spec.md`
- diff_anchor：`146b0de9b400daa17ffd75a5a91dcbbb268a9620`
- target：`git diff 146b0de9b400daa17ffd75a5a91dcbbb268a9620`
- round：1
- reviewed_at：2026-08-11 05:26 UTC+8

## Findings

### t101_test_f001 - AC-002 events 有界淘汰行为完全未触发，测试存在但验证的是弱子集

- 严重度：important
- 锚点：AC-002（写入超过上限条数的 events 后进程不因无界增长失败；旧数据按文档策略丢弃或拒绝并返回可观察错误）
- 位置：`tests/unit/cdp_session_idle_bounds.test.ts:83-101`
- 问题：测试只写入 250 条事件，而存储上限常量 `MAX_SESSION_EVENTS = 5000`（`src/bridge/cdp_handler.ts:48`）。250 < 5000，`push_bounded` 的淘汰分支（`cdp_handler.ts:53-55` splice 丢最旧）永远不会执行。断言 `events.length).toBeGreaterThan(0)` 在淘汰逻辑被整体删除、退化为无界 `session.events.push()` 时同样通过——即该测试无法区分「有界」与「无界」，AC-002 的核心可观察行为（超限丢最旧）零覆盖，存在假绿风险。测试注释「灌入超过 MAX_EVENTS 的事件」把 `MAX_EVENTS_PER_POLL`（100，轮询返回上限，`cdp_handler.ts:45`）误当成存储上限，导致灌入量不足。
- 建议：按 AC「测试设小 cap」将存储上限做成可注入/可配置（如 `push_bounded(session, event, cap)` 或 session 构造参数），测试用小 cap（如 3）灌入超限事件，断言：1) 进程不抛错；2) 最旧 request_id 被丢弃（`events` 长度 ≤ cap，且 `handle_cdp_events` 轮询不再返回最早条目）；或改为灌入 >5000 事件并断言同样结论。同时把断言从 `> 0` 收紧为精确长度/丢弃语义。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：本轮为 round 1，无
- 改测方向复核：无（本 diff 仅新增测试文件，未修改任何既有测试；既有 5 个 cdp 相关测试文件 11 条用例全部通过，无迁就实现的改测）
- 本轮新发现：1 条
- 未进表的提示：
  - 实现侧 `body_seq_to_req_id` map（`cdp_handler.ts:192`）无任何上限/淘汰（仅 loadingFinished 时 set、命令响应时 delete），若 getResponseBody 响应永不到达则无界增长，与契约区范围「events 与关联 map 有上限或淘汰策略」不完全相符。非 AC、属实现层，交由 code reviewer；可作 follow-up「cdp_handler body_seq map 有界化」。
  - `vi.useFakeTimers({ shouldAdvanceTime: true })`（test:27）对 AC-001/003 并非必需——测试全部用显式 `advanceTimersByTimeAsync` 驱动；无副作用，不改。
  - 模块级 `sessions` Map 跨用例保留，因 `session_key` 唯一（`cdp_{Date.now()}_random`）且 each afterEach `clearAllTimers`，未造成用例间污染；可接受。
  - AC-001 断言 `events.length >= 1` 是「session 仍存活」的可观察代理（session 销毁时 `handle_cdp_events` 返回 404 + `events: []`，断言会失败），非恒真，合理。
- 总体判断：AC-001/AC-003 测试真实触达生产逻辑且断言可观察；AC-002 有界淘汰无测试覆盖，存在假绿风险，须补。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` —— 独立通读测试与 `touch_session`/`onmessage`：t=T0 start，advance 4min（<TTL），emit 两条活动触发 `touch_session` 续期（last_activity=T0+4min、timer 重排至 T0+9min），再 advance 2min 至 T0+6min，轮询仍 200 且 events≥1；若续期缺失，T0+5min 旧 timer 触发销毁，轮询 404 断言失败，测试能区分 idle 续期与固定墙钟。实测 `npx vitest run tests/unit/cdp_session_idle_bounds.test.ts` 5/5 通过。
- AC-002：`re_verified` —— 独立核实测试写入 250 < `MAX_SESSION_EVENTS=5000`，`push_bounded` 淘汰分支不可达，该 AC 核心行为未验证（见 f001）。
- AC-003：`re_verified` —— 独立通读 abort-aware mock（test:107-109,117-119）与 detect/start 超时实现（`cdp_handler.ts:92-104,146-151`）：mock 对 `opts.signal` 注册 abort 监听，超时 `controller.abort()` 触发 reject → 内部 catch 返回 `ok:false`，调用方 Promise 在 advance 后 settle；若实现未传 signal 或未设超时，mock 永不 reject、`await promise` 挂起至 vitest 超时判负，非假绿。实测通过。

coverage = 3 / 3

verdict: FAIL

## Round 2 (2026-08-11 05:36 UTC+8)

reviewed_scope: 38441e23d1bf89f4

### 前轮 finding 复核

- t101_test_f001（important）：已消除。新增 `_set_max_session_events_for_test(10)` 钩子（cdp_handler.ts:51-53）并以 30 事件灌入（cdp_session_idle_bounds.test.ts:88-115）。淘汰分支现被真实触达：断言 `events.length ≤ 10`（无界 push 得 30 → 红）、`r0 不在 events`（无界或丢新方向 → 红）、`_eviction_count.value > 0`（仅淘汰分支递增）。三重断言共同排除假绿——若 push_bounded 被换成无界 push 或改丢最新，测试均红。实跑通过。

### 本轮新发现

### t101_test_f002 - AC-001 测试残留调试 console.log

- 严重度：minor
- 锚点：无 AC 违反；测试整洁性。
- 位置：`tests/unit/cdp_session_idle_bounds.test.ts:61`
- 问题：AC-001 用例首行 `console.log('SESSION_KEY', session_key, 'WS_INSTANCE', ...)` 为调试残留，位于断言之前，无测试价值，污染 CI 日志。
- 建议：删除该行。

### 结论

- 前轮 finding 复核：f001 已按 diff 核实真修（换 cap、灌 30 事件、三重断言）。
- 改测方向复核：无迁就实现的改测。bridge_cdp_events.test.ts:28-42 与 cdp_handler_redaction.test.ts:27-47 的 start_session 改为「advanceTimersByTimeAsync(0) → onopen() → await」，是适配 start 新契约（现 await WS onopen/超时竞速）所必需的；断言强度未降（仍校验 status 200 + ok:true），101 条跨轮询与 redaction 用例全部通过。
- 本轮新发现：1 条（minor）。
- 未进表的提示：
  - `_eviction_count` 与 `_max_session_events` 为 prod 模块导出的测试钩子/指标，spec 风险节「默认值写进常量并可测」背书，接受。
  - `_eviction_count.value` 跨用例不重置，但仅 AC-002 触发淘汰且断言仅 `> 0`，无污染。
  - AC-003 三用例均以 4000ms advance 驱动 3000ms 超时；若实现未接线超时则 Promise 永不 settle、测试挂起判负，非阈值掩盖。
- 总体判断：Round 1 唯一 important（AC-002 假绿）已真修，AC-001/AC-003 测试仍真实触达生产逻辑；仅 1 条 minor 清理项，无未解决 critical/important。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。通读 AC-001/AC-001b：start 后 4min 发活动（触发 touch 续期至 T0+9min），再 2min 至 T0+6min 轮询断言 events ≥ 1——若续期缺失则旧 5min timer 销毁 session、轮询 404 断言红；AC-001b 无活动 6min 轮询 404。两用例对「idle 续期」与「固定墙钟」有区分力。实跑 5/5 通过。
- AC-002：`re_verified`。独立核实 30 事件 > cap 10，push_bounded splice 分支执行；断言（length ≤ 10、r0 丢弃、eviction 计数 > 0）与淘汰语义一一对应，移除淘汰逻辑即红。
- AC-003：`re_verified`。detect/start /json/list 挂起（abort-aware mock：`opts.signal` abort 时 reject）与 WS 永不 onopen 三用例 advance 4000ms 后 `await promise` 有限 settle 并断言 ok:false；若实现未传 signal/未设超时则挂起判负。

coverage = re_verified 3 / 3

verdict: PASS


## Round 3 (2026-08-11 05:36 UTC+8)

reviewed_scope: 2ed43ce5596990e7

### 前轮 finding 复核

- 测试侧本无代码改动（f004/f005 为代码层修复；f002 测试 console.log 已删由 code reviewer 验证）。

### 本轮新发现

无。

### 结论

- AC-001/002/003 复验不变；全量 1210 通过。

verdict: PASS
