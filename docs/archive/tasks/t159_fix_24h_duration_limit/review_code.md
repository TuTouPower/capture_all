# Task review t159（reviewer_focus: 代码）

- task：`t159_fix_24h_duration_limit`
- spec：`docs/tasks/t159_fix_24h_duration_limit/spec.md`
- diff_anchor：`82f2ae38bc799a20bac6016d56cde9d0000dd6b1`
- target：`git diff 82f2ae38bc799a20bac6016d56cde9d0000dd6b1`
- round：1
- reviewed_at：2026-08-13 14:57 UTC+8

## Findings

### t159_code_f001 - arm_duration_limit 未检查 runtime.lastError，alarm create 失败不会回退 timer；disarm 的 clear rejection 未处理

- 严重度：minor
- 锚点：错误处理缺口；失败场景 = Chrome `alarms.create` 为同步 API，失败经 `chrome.runtime.lastError` 报告而非抛异常，此时 24h 上限静默缺失
- 位置：`src/extension/background/duration_limit.ts:31-35`、`duration_limit.ts:51-55`
- 问题：`arm_duration_limit` 只在「`chrome.alarms` 不存在 / create 同步抛异常」时退化为内存 timer；若 API 存在但 `create` 失败（lastError），直接 `return`，fallback 不生效。采集期间 keepalive（30s alarm）使 SW 常驻，重启兜底也难触发，capture 可越过 24h 直到手动停止或 500MB。同理 `disarm_duration_limit` 里 `void alarms.clear()` 只吞同步异常，clear 返回的 Promise rejection 无人处理（实际概率极低，但为未处理 rejection）。实现意图是「alarms 不可用/失败时防御性退化」，lastError 分支使该防御有洞。
- 建议：create 后检查 `chrome.runtime.lastError`，非空则走 fallback timer；clear 改为 `alarms.clear(...).catch(...)` 或 `run_stop_step` 包裹。

### t159_code_f002 - cleanup 恢复分支不校验 record 终态，stop 中途 SW 终止的窄窗口会复活已 'completed' 采集

- 严重度：minor
- 锚点：AC-004 恢复分支守卫缺口；失败场景 = 手动 stop 的 step4（update_capture 置 'completed' + stopped 事件已落库）与 step5（清 active 键 + deadline 键）之间 SW 被终止，重启后 deadline 未过
- 位置：`src/extension/background/service_worker.ts:148-165`
- 问题：该窗口下重启后 `active_capture_id` 与 `active_capture_deadline_ms` 仍在，恢复分支条件仅 `Date.now() < deadline_ms`，会把 DB 中 status='completed' 的 record 恢复为 `is_capturing=true`（popup 显示运行中），最长保持到 deadline 才以 `max_duration` 终态化，届时对同一 capture 重复写第二条 stopped 事件。改造前该窗口在下次重启由 legacy 路径直接终态化，t159 将其推迟并改写 reason。
- 建议：恢复分支增加 `rec.status === 'capturing'`（或非终态）守卫；终态 record 落入既有 stale 清理路径。

### t159_code_f003 - write_duration_expired_event 与 stop_capture_inner step4 的 stopped 事件构造 verbatim 重复

- 严重度：minor
- 锚点：DRY（verbatim 重复默认 minor）；两套写法并存，后续改动易分叉
- 位置：`src/extension/background/service_worker.ts:226-247` vs `service_worker.ts:846-863`
- 问题：`create_base_event` + `CaptureStoppedData` 构造约 15 行逐字重复，仅来源对象（rec vs current_capture）与相对时间计算式不同（新路径 `Date.now() - new Date(rec.started_at).getTime()`，老路径 `get_relative_time(start_time)`，后者带 t152 时钟回拨 clamp）。当前语义下等价，但重复已构成行为分叉苗头。
- 建议：抽公共构造函数（输入 capture + reason + duration，输出 stopped event），两处共用。

## 结论

- 前轮 finding 复核（Round 1）：无
- 本轮新发现：3 条（均为 minor；0 critical / 0 important）
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` 现 1366 行（基线 1284，本 task 净增 82），超过 800 行 important 阈值且本 task 继续堆大；按降级规则不进 finding 表，建议后续 task 拆分（keepalive/stop 编排/事件构造等）。
  - 复杂度：`cleanup_stale_capture_state` 手算 McCabe ≈ 11（≥10 阈值），建议拆分「恢复」与「stale 清理」两个职责；当前未达 ≥15 不进表。
  - 范围外观察：AC-003 集成测试仅断言 `update_capture` 置 completed 与清键，`write_events` 未被 mock（真实 IndexedDB 在 node 环境不可用，异常被 `write_duration_expired_event` 吞掉），`reason='max_duration'` 事件实际未被断言——属测试层缺口，交 test reviewer。
  - 范围外观察：恢复分支不恢复网络/console 等采集子系统且不重启 keepalive/periodic flush——注释已明示为 t159 范围选择，alarm 跨 SW 重启持久保证 deadline 仍生效，接受。
  - 范围外观察：`start_time = deadline_ms - MAX_SESSION_DURATION_MS` 反推在常量不变的前提下与持久化的 `active_capture_start_ms` 等价；跨版本改 24h 数值（spec 非范围）才产生偏差，届时用 `active_capture_start_ms` 更稳。合理性结论：可接受。
  - `chrome.d.ts` 类型扩展：`periodInMinutes` 改可选并新增 `when`，keepalive 既有调用（`periodInMinutes`）通过 tsc，无影响；副作用是 `create(name, {})` 现在类型上合法（真实 API 要求至少一个时间参数），属轻微类型弱化，未见实际调用方受影响。
- 总体判断：5 条 AC 均有实现且主路径正确（alarm 注册/取消、SW 重启恢复与终态化、reason 可达、类型扩展无回归）；3 条 minor 均为防御性/边界/DRY 缺口，无未解决 critical / important。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 代码走查 onAlarm→`stop_capture('max_duration')` 接线（service_worker.ts:258-266）+ `duration_limit.test.ts` AC-001 断言 `create(DURATION_ALARM_NAME, { when: now+24h })`、AC-001c 断言 fallback timer 到期触发。
- AC-002：`re_verified` — `duration_limit.test.ts` AC-002 断言 disarm 调 `clear(DURATION_ALARM_NAME)` 且 fallback timer 不再触发；stop_capture_inner step5 含 disarm + 清 deadline 键（service_worker.ts:882-895）。
- AC-003：`re_verified`（部分 trust_prior）— 集成测试断言终态化（update_capture 'completed' + 清键 + 不重建 alarm）；`reason='max_duration'` 事件写入仅经代码走查确认（`write_duration_expired_event` 直写且 T038 立即落库），测试未断言该事件。
- AC-004：`re_verified` — 集成测试断言重建 alarm（`when=deadline_ms`）且不清键（duration_limit_sw_integration.test.ts:120-140）。
- AC-005：`re_verified` — `MAX_SESSION_DURATION_MS` 生产路径引用（duration_limit.ts:63、service_worker.ts:154），`'max_duration'` 在 onAlarm handler 与 cleanup 过期分支均可达。

coverage = 5 / 5

verdict: PASS

## Round 2 (2026-08-13 15:12 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- `t159_code_f001`（minor）— **已消除**：`arm_duration_limit` create 后检查 `chrome.runtime.lastError`，命中即 throw 落入 catch 回退内存 timer（`duration_limit.ts:33-39`）；`disarm_duration_limit` 改为 `void Promise.resolve(alarms.clear(...)).catch(...)`，rejection 已处理（`duration_limit.ts:57-58`）。小瑕疵（日志可读性，不构成 finding）：`String(last_error)` 对 `{message}` 对象输出 `[object Object]`。
- `t159_code_f002`（minor）— **已消除**：恢复分支加 `rec.status === 'capturing'` 守卫（`service_worker.ts:151`），stop 中途 SW 终止窄窗口下已 'completed' record 不再复活，落入既有 stale 清理路径立即终态化。
- `t159_code_f003`（minor）— **抽取本身已到位**：`build_capture_stopped_event(rec, reason, duration_ms, start_time)` 成为 stopped 事件唯一构造入口，stop 主路径等价（`get_relative_time(start_time)` 语义未变，`service_worker.ts:862`）；但抽取同时引入新回归，见 f004。

### 本轮新发现

### t159_code_f004 - f003 抽取后 AC-003 事件 relative_time_ms 回归为绝对时间戳

- 严重度：important
- 锚点：AC-003 主路径数据缺陷；可观测行为 = SW 重启且截止已过时写入的 capture_stopped 事件 relative_time_ms 为绝对 epoch（≈1.7e12），超出系统 1e10 相对时间哨兵 17 倍
- 位置：`src/extension/background/service_worker.ts:230`（`build_capture_stopped_event(rec, 'max_duration', duration_ms, 0)` 传 0）、`service_worker.ts:247`（`get_relative_time(start_time)` 当 start_time=0 时返回 `Date.now()`）
- 问题：Round 1 实现 `relative_time_ms = Date.now() - new Date(rec.started_at).getTime()`（相对采集时长，≈9e7）；f003 统一入口后 AC-003 调用方无真实 start_time 可传，传 `0` → `get_relative_time(0) = Math.max(0, Date.now() - 0) = Date.now()`。后果：每次「SW 重启 + deadline 已过」终态化（AC-003 主路径，非窄窗口）产生的 stopped 事件 relative_time_ms 是绝对时间戳；下游 `service_worker.ts:1070`（`absolute_time = started_at + relative_time_ms` 还原绝对时间）、exporter 排序（`exporter.ts:65/89/124`）、`agent_data_queries.ts:142` 均按相对时间消费，得到错值。f003 修复引入，测试未捕获（集成测试断言了 reason 但未断言 relative_time_ms）。
- 建议：`write_duration_expired_event` 传 `new Date(rec.started_at).getTime()` 作为 start_time 参数（`get_relative_time` 即得正确相对时长，且带 t152 时钟回拨 clamp）；或函数签名改收 started_at 内部计算。

### 结论（Round 2）

- 前轮 finding 复核（Round 2）：f001 / f002 已消除；f003 抽取到位但引入 f004。
- 本轮新发现：1 条（f004，important）。
- 未进表的提示：集成测试已补 `write_events` mock 并断言 reason=max_duration（AC-003）与 onAlarm→stop 集成（AC-001），但均未断言 `relative_time_ms` 值，f004 回归未被测试捕获（测试层观察，交 test reviewer）；f001 修复中 lastError 日志为 `[object Object]`（可读性）；文件过大 / cleanup 复杂度提示沿用 Round 1（service_worker.ts 仍 1366 行）。
- 总体判断：三处 Round 1 finding 修复到位，但 f003 抽取在 AC-003 主路径事件上引入 relative_time_ms 错值（important，未解决）。
- 系统性 follow-up：无

reviewed_scope: 3f295631ef0ded49

verdict: FAIL

## Round 3 (2026-08-13 15:13 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- `t159_code_f004`（important）— **已消除**：`write_duration_expired_event` 改为 `started_ms = rec.started_at ? new Date(rec.started_at).getTime() : Date.now()`，`duration_ms` 用同一 `started_ms` 计算，`build_capture_stopped_event(rec, 'max_duration', duration_ms, started_ms)`（`service_worker.ts:227-233`）。`get_relative_time(started_ms)` 现在产出相对时长（≈25h，带 t152 clamp），不再产出绝对 epoch；无 `started_at` 时兜底 `Date.now()` → relative_time_ms 与 duration_ms 均 0，与 Round 1 原语义一致。集成测试 AC-003 补回归防护（`duration_limit_sw_integration.test.ts:133-138`，`relative_time_ms < 26h` 可抓住 1.7e12 错值），测试 15 条全绿、`tsc --noEmit` 通过。

### 本轮新发现

- 无新增 finding。

### 结论（Round 3）

- 前轮 finding 复核（Round 3）：f004 已消除；连同 Round 2 已消除的 f001/f002/f003，四轮累计 finding 全部闭环。
- 本轮新发现：0 条。
- 未进表的提示：集成测试 relative_time_ms 断言带 `if (stopped_rel !== undefined)` 条件包裹（弱化断言模式，f004 回归值非 undefined，防护有效；测试层观察，交 test reviewer）；`new Date(rec.started_at)` 对无效日期串会产出 NaN——与 Round 1 既有风险一致，started_at 由系统写入非用户输入，非新问题。
- 总体判断：f004 修复正确（相对时长语义恢复，与 Round 1 原实现等价并增强 clamp 保护），当前无未解决 critical / important。
- 系统性 follow-up：无

reviewed_scope: 1a5fd1a77be4fda6

verdict: PASS
