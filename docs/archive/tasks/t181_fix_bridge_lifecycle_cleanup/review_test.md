# Task review t181（reviewer_focus: 测试）

- task：`t181_fix_bridge_lifecycle_cleanup`
- spec：`docs/tasks/t181_fix_bridge_lifecycle_cleanup/spec.md`
- diff_anchor：`089aac35499ed013030efd52a35bb38e530c9952`
- target：`git diff 089aac35499ed013030efd52a35bb38e530c9952`
- round：1
- reviewed_at：2026-08-13 21:59 UTC+8

reviewed_scope: 524d5d4a565fd833

## Findings

### t181_test_f001 - AC-004 实例删除断言恒真：重 enroll 用新随机 instance_id + label 顶替兜底，删除行为无有效证据

- 严重度：important
- 锚点：AC-004（instance/queue 删除、owner 清理）；危险模式「恒真断言」
- 位置：`tests/unit/bridge_lifecycle_cleanup.test.ts:185-191`
- 问题：sweep 后「registry 已删除」的断言是重 enroll 一个**全新随机 instance_id**（enroll body 未带 `instance_id`，server 侧 `body.instance_id || \`inst_${randomBytes(8)}\`` 生成新 id，`src/bridge/server.ts:334`），带有效 token 的新实例登记恒 200。且即使旧实例未被 sweep 删除，重 enroll 的 label 顶替路径（`browser_label: 'cleanup-test'` 与旧实例同名，`server.ts:367-390`，old 实例 `origin_extension_id === null` 不触发 origin 绑定豁免）也会把旧实例连同其 queue 删掉并返回 200。两条路径都恒 200——若 sweep 中删掉 `instances.delete(id)` / `queues.delete(id)`，本测试依旧全绿。AC-004 的「instance/queue 删除」唯一断言即此恒真断言，真实行为零覆盖（command_owners 清理也无断言）。
- 建议：用首次 enroll 返回的 `instance_id` 重 enroll 断言结果——未删时 existing 分支无扩展 origin 返回 403（`server.ts:341-348`），已删时新登记 200；或断言 `/mcp/status` 响应不再包含该 instance_id。保留现有 COMMAND_CANCELLED 断言（该断言对 sweep 的 `cancel_all` 有判别力：若 sweep 不 cancel，pending 命令只能等 30s timeout 得 COMMAND_TIMEOUT，断言失败）。

### t181_test_f002 - AC-003 测试读源文件文本做正则断言，验证实现文本而非行为

- 严重度：important
- 锚点：AC-003（close 不预调 `closeAllConnections` 也能快速完成）；危险模式「弱化断言（正则）」
- 位置：`tests/unit/bridge_lifecycle_cleanup.test.ts:148-157`
- 问题：测试用 `readFileSync('src/bridge/server.ts')` 对 close 块做 `toMatch(/server\.close\()/`、`toMatch(/closeAllConnections/)`、`toMatch(/setTimeout/)` 正则匹配。它只验证源码文本**包含**关键字，无法验证 AC-003 的核心语义「不预调 closeAllConnections」：若实现把 `closeAllConnections` 提到 `server.close` 之前调用（违反 AC-003），正则仍 PASS；若实现重构（提取 helper、重命名局部逻辑），行为不变也会误报失败。AC-003 的可观察行为（快速完成）由 AC-001 的 `elapsed < 2000` 覆盖，但该断言同样无法判别「预调 force-close」（预调只会更快）。即 AC-003 语义当前无行为级验证，源码正则断言是「测实现文本冒充覆盖」，且是结构脆弱的恒绿恒红皆可。
- 建议：删除源码读取断言；AC-003 的行为面（close 快速完成、不依赖 force-close 兜底）已被 AC-001 elapsed 断言覆盖，无需补文本测试。如要更强行为证据，可在 keep-alive 连接挂起时断言 close 于正常路径（`server.close` 回调）快速完成、`closeAllConnections` 不触发，但该场景与 AC-001 断言重叠，删除即可。

### t181_test_f003 - AC-004 测试时序脆弱：TTL=10ms 注入 + 40ms 真实 sleep，enroll→command 窗口过紧

- 严重度：minor
- 锚点：AC-004（测试健壮性，非行为缺陷）
- 位置：`tests/unit/bridge_lifecycle_cleanup.test.ts:162-177`
- 问题：`_set_extension_ttl_for_test(10)`（grace 0）后，post_command 到达 server 的 `resolve_target → list_online`（`server.ts:151-154`）时，若距 enroll 写入 `seen_at` 已超 10ms，实例会先被懒 sweep 移除 → 命令入队前即返回 `EXTENSION_OFFLINE` 503 → 断言 `COMMAND_CANCELLED` 假红。本地 loopback 约 1-3ms 通过（已重跑 5/5 PASS），但 CI 负载 / GC 停顿下 10ms 窗口偏紧；40ms 真实 sleep 也依赖事件循环调度。失败为偶发假红，不掩盖行为。
- 建议：用 fake timers 驱动时间（spec 可测试性声明本就列 fake timer），或放宽 TTL（如 100ms）并相应延长 sleep 后触发 status；至少给 enroll→command 之间留足余量。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：无（diff 仅新增测试文件与实现改动，未改既有测试）
- 本轮新发现：3 条（f001 important / f002 important / f003 minor）
- 未进表的提示：
  - AC-002 的 WS/timer/map 实际清理依赖既有 cdp 单测（`cdp_ws_close_terminal.test.ts`、`bridge_cdp_events.test.ts` 等经 `handle_cdp_stop → destroy_session` 覆盖，MockWebSocket.close spy + fake timers）；本次仅验证 `close()` → `destroy_all_sessions` 接线（vi.mock 转发真实实现，属合法 spy 非 stub），组合覆盖可接受。
  - AC-001 的 `expect(elapsed).toBeLessThan(2000)` 阈值恰等于 `GRACEFUL_CLOSE_TIMEOUT_MS`（2000ms）：设计意图是「close 在兜底触发前完成」，当前健康路径 ~几十 ms，但若走兜底分支（elapsed ≥ 2000）会假红，边界略紧，可放宽为 2500 或断言 `<= GRACEFUL_CLOSE_TIMEOUT_MS` 语义并留余量。
  - `_set_extension_ttl_for_test` / `_set_extension_sweep_grace_for_test` 为生产代码新增测试钩子，与 cdp_handler 既有 `_set_*_for_test` 同模式、默认值不变，项目内已有先例，不出 finding。
  - AC-004 的 command_owners 清理无外部可观察面，未直接断言，属内部细节，随 f001 修复（status 不再列旧实例）可一并观察。
- 总体判断：AC-001/002/005 测试可信且触达真实生产路径；AC-003 用源码文本断言冒充行为验证（f002），AC-004 的 registry 删除断言恒真、删除行为零有效覆盖（f001），两处均致对应 AC 看似覆盖而实际未验证，须修复。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 重跑 `npx vitest run tests/unit/bridge_lifecycle_cleanup.test.ts`（5/5 PASS）；断言 `error.code === 'COMMAND_CANCELLED'`（经 `queue.cancel_all` 真实路径）与 `elapsed < 2000`（远小于 30s 命令 timeout）直接对应 AC。
- AC-002：`re_verified` — 读实现确认 `close()` 调 `destroy_all_sessions()` 遍历 `sessions` 逐个 `destroy_session`（WS close/timer/映射，`cdp_handler.ts:149-163`）；测试以转发真实实现的 spy 断言调用；底层 destroy_session 行为由既有 cdp 单测覆盖。
- AC-003：`re_verified`（附 f002 缺陷）— 读实现确认顺序为 `queue.cancel_all → destroy_all_sessions → server.close + setTimeout 兜底 closeAllConnections`，`closeAllConnections` 仅在兜底分支；但测试侧仅为源码正则，语义验证不足（f002）。
- AC-004：`re_verified`（附 f001 缺陷）— 重跑通过；COMMAND_CANCELLED 断言真实判别 sweep 的 queue cancel；但 instance/queue 删除断言恒真（f001），删除行为未获有效验证。
- AC-005：`re_verified` — 逐测试核对均只调 public `server.close()`（AC-004 用模块级测试钩子注配置、AC-003 读源码、AC-002 用转发 spy），未调 close 内部实现。

coverage = 5 / 5

verdict: FAIL

## Round 2 (2026-08-13 22:04 UTC+8)

reviewed_scope: c7495dc3acbde6e8

前轮 finding 复核：

- **t181_test_f001（important）— 已消除**：重 enroll body 携带首次 enroll 返回的原 `instance_id`（`tests/unit/bridge_lifecycle_cleanup.test.ts:177-181`）。判别力经 reviewer 独立复验（`.scratch` 临时脚本，验证后删除）：未 sweep 时同 id 重 enroll（无扩展 origin）实测返回 403（existing 分支拒绝顶替，`server.ts:341-348`），403 检查先于 label 顶替路径执行、无干扰；sweep 后同 id 重 enroll 走新登记返回 200。`expect(again.status).toBe(200)` 现能真实判别「旧实例已删」。
- **t181_test_f002（important）— 已消除**：源码文本正则用例整体删除（`test.ts:145-147` 以注释说明 AC-003 可观测行为由 AC-001 `elapsed < 2000` 计时断言直接覆盖）；测试用例数 5→4。实现侧顺序（`queue.cancel_all → destroy_all_sessions → server.close + setTimeout 兜底 closeAllConnections`）经源码核对仍未预调 closeAllConnections，与 AC-003 一致。
- **t181_test_f003（minor）— 已消除**：TTL 10→100ms（`test.ts:153`）、sleep 40→300ms（`test.ts:167`），命令送达窗口从 10ms 放宽到 100ms；300ms > 100ms TTL+0 grace，sweep 触发条件仍成立；测试重跑 312ms PASS，无送达竞态迹象。

本轮新发现：无。

验证记录：

- `npx vitest run tests/unit/bridge_lifecycle_cleanup.test.ts` → 4/4 PASS（含 AC-004 用例 312ms，`extension_swept` 日志确认 sweep 触发）。
- `npx tsc --noEmit` → exit 0，无类型错误。
- 独立复验脚本（`.scratch/t181_reverify_enroll_discrimination.test.ts`）→ 1/1 PASS 后已删除，未留下文件。

总体判断：3 条 finding 均按建议处置到位，判别力经独立复验成立，无新 blocker，无未解决 critical / important。

verdict: PASS
