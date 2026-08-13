# Task review t159（reviewer_focus: 测试）

- task：`t159_fix_24h_duration_limit`
- spec：`docs/tasks/t159_fix_24h_duration_limit/spec.md`
- diff_anchor：`82f2ae38bc799a20bac6016d56cde9d0000dd6b1`
- target：`git diff 82f2ae38bc799a20bac6016d56cde9d0000dd6b1`
- round：1
- reviewed_at：2026-08-13 14:58 UTC+8

## Findings

### t159_test_f001 - AC-001/003/005 的 `'max_duration'` reason 可观察输出零断言，alarm 到期触发链从未执行

- 严重度：important
- 锚点：AC-001「停止 reason 为 `'max_duration'`」、AC-003「（reason 为 `'max_duration'`）」、AC-005「`'max_duration'` reason 变为可达」
- 位置：`tests/unit/duration_limit.test.ts:34-43`、`tests/unit/duration_limit_sw_integration.test.ts:92-118, 120-140`
- 问题：spec 测试策略明列「断言 alarm 注册/取消、**reason 值**、SW 重启恢复行为」，但三处测试对 `'max_duration'` 均无断言点：
  1. AC-001 只断言 `alarms.create` 的 `when` 精确值 + fallback 分支 `on_expired`（`vi.fn()`）被调用；`on_expired` 回调内容（生产传 `stop_capture('max_duration')`）未断言，alarm 到期 → `service_worker` onAlarm listener → `stop_capture('max_duration')` 主链从未执行——`alarm_on_alarm_add_listener`（sw_integration:47）mock 后从未被 invoke，`stop_capture` 收到的 reason 参数零验证。
  2. AC-003 测试名自称「reason max_duration」，断言仅 `update_capture` 参数 `status='completed'` + `ended_at` truthy；`write_duration_expired_event`（`service_worker.ts:226-247`，reason 硬编码 `'max_duration'`）调真实 `write_events`，测试未 mock 未断言，事件是否写入、reason 是否正确均不可见——测试绿与否与 reason 输出无关。
  3. AC-005「reason 变为可达」无任何测试验证；`duration_limit.test.ts:42` 的 `expect(MAX_SESSION_DURATION_MS).toBe(24*60*60*1000)` 只验常量值，与「被生产路径引用」「reason 可达」无关（引用已由代码审阅确认：`service_worker.ts` import + `compute_deadline_ms` 使用）。
  - 即：本次修复的核心目标（DD-001：`max_duration` 由不可达变可达）恰恰是测试空白区。代入旧实现推理：`duration_limit.ts` 缺失 → `duration_limit.test.ts` import 失败红；旧 `service_worker` 不写 deadline 键/不调 arm → sw_integration 的 `storage_set` 清 deadline 断言、`alarm_create` 断言红；故新测试对修复有效，但对「reason 传递正确」这一 AC 可观察输出无效。
- 建议：sw_integration 中从 `alarm_on_alarm_add_listener.mock.calls[0][0]` 取回调并 invoke（`{ name: DURATION_ALARM_NAME }`），断言 `stop_capture('max_duration')` 生效（`storage_set` 清 active 键 + mock `write_events` 断言 `capture_stopped` 事件 `data.reason === 'max_duration'`）；AC-003 同步 mock `write_events` 断言过期终态化事件 reason。

### t159_test_f002 - AC-005 测试名与内容不符，且含先装后卸的 mock 死代码

- 严重度：minor
- 锚点：无 AC 违反（测试内容本身是 AC-001 的 edge case）
- 位置：`tests/unit/duration_limit.test.ts:79-87`
- 问题：测试标名「AC-005: 到期延迟为负数时立即触发（deadline 已过）」，实际验证的是 deadline 已过时 fallback 立即触发（AC-001 边界），与 AC-005（常量被生产引用、reason 可达）无对应关系；`install_alarms_mock()`（:80）后立即 `vi.unstubAllGlobals()`（:83），先装后卸 = 死代码，掩盖该测试实际只走 fallback 分支，易误读为验证了 alarm 分支。
- 建议：测试名/注释改为「AC-001 edge: deadline 已过 fallback 立即触发」；删除 :80 的 `install_alarms_mock()` 行（或注释说明本分支仅 fallback）。`'max_duration'` reason 的 AC-005 验证见 f001。

## 结论

- 前轮 finding 复核：不适用（round 1）
- 改测方向复核：无迁就实现的改测。`service_worker_stale_cleanup.test.ts` 两处修改均合法：`install_chrome_mock` 补 `alarms`（`service_worker.ts` 顶层新增 `chrome.alarms?.onAlarm?.addListener` 与 `disarm_duration_limit`，补全 chrome 形状属依赖扩展，且旧用例 storage 数据无 deadline 键不会误入 AC-004 分支，不补也不红）；清键断言加 `active_capture_deadline_ms: null`（生产 `cleanup_stale_capture_state` 现清该键，断言更新为「断言应有的预期」，方向正确）。
- 本轮新发现：2 条（f001 important、f002 minor）
- 未进表的提示：
  - sw_integration AC-004（:133-136）alarm name 用 `expect.stringContaining('capture_max_duration')` 弱化（生产导出常量 `DURATION_ALARM_NAME`，可直接 `toBe` 精确断言）。调查后判定不构成行为缺陷：AC-004 核心 `when: deadline_ms` 已精确断言，name 前缀与生产常量一致，不存在合理场景下假 PASS，未满足 blocking 硬阈值，故不进 finding 表，建议顺手改精确。
  - AC-002 集成链路（`stop_capture_inner` 调 `disarm_duration_limit`，`service_worker.ts:882`）无测试；disarm 单测（clear + fallback 取消）已直接验证模块行为，集成调用点靠代码审阅确认，属覆盖可更广。
  - AC-004 恢复分支的 `is_capturing`/`current_capture` 恢复状态（`start_time = deadline_ms - MAX_SESSION_DURATION_MS` 等）未断言，属实现细节。
- 总体判断：新测试对 alarm 注册/取消、fallback 触发、SW 重启两路径的机制验证扎实且真实触达生产代码，代入旧实现会红；但 spec 测试策略明列的「断言 reason 值」零落地，修复核心目标（`'max_duration'` reason 可达）无测试证据，存在未解决 important，FAIL。
- 系统性 follow-up：建议标题「stop_capture.test.ts 镜像实现与真实 service_worker 分叉扩大」——`tests/unit/stop_capture.test.ts` 以复制生产逻辑的 `stop_recording` 代替真实代码，t159 后真实 `stop_capture_inner` 新增 `disarm_duration_limit` + 清 `active_capture_deadline_ms` 未入镜像，镜像测试与生产差异进一步扩大；建议改直接驱动真实 `service_worker.ts` 或随实现同步镜像。

### AC 复验披露

- AC-001：`re_verified`——重跑 `duration_limit.test.ts` 绿；读断言确认 `alarms.create` 以 `when: now+24h` 精确注册、fallback 在 999ms/1000ms 边界触发；「停止 reason」部分零断言，见 f001。
- AC-002：`re_verified`——重跑绿；断言 `clear(DURATION_ALARM_NAME)` 与 fallback 取消后 2s 不触发。
- AC-003：`re_verified`——重跑 `duration_limit_sw_integration.test.ts` 绿；真实 import `service_worker.ts`，断言 `update_capture` completed + 清键含 deadline + 不重建 alarm；「reason」事件未断言，见 f001。
- AC-004：`re_verified`——重跑绿；断言 `alarm_create` `when: deadline_ms` 精确重建 + 不清键；「剩余时间到期停止」链未执行，见 f001。
- AC-005：`re_verified`（仅代码审阅）——`service_worker.ts` import 并引用 `MAX_SESSION_DURATION_MS`（`compute_deadline_ms`、cleanup 恢复 `start_time` 计算），`'max_duration'` 硬编码于三处 `stop_capture` 调用点与 `write_duration_expired_event`；测试层面 reason 可达零断言，见 f001。
- 覆盖：`coverage = 5 / 5`（注：AC-001/003/005 的 reason 输出部分为审阅代码确认引用、非测试断言，缺口已入 f001；无部署态/人工 UI 项，trust_prior 占比 0%）。

reviewed_scope: 0c11a3060abfd1b6

verdict: FAIL


## Round 2 (2026-08-13 15:08 UTC+8)

### 前轮 finding 复核（以 diff 与代码为准）

- **t159_test_f001（important）已消除**：
  - `tests/unit/duration_limit_sw_integration.test.ts:19` storage mock 补 `write_events`；AC-003 测试（:108-141）新增断言：`write_events` 收到 `data.reason === 'max_duration'` 的 `capture_stopped` 事件（:129-132，`find` 筛选即断言，非存在即通过），保留 `update_capture` completed、清 deadline 键、不重建 alarm 断言。
  - 新增 AC-001 集成测试（:165-203）：从 `alarm_on_alarm_add_listener.mock.calls.at(-1)` 取顶层注册回调（生产 `service_worker.ts:260-266` 的 onAlarm listener，mock 捕获），invoke `{ name: 'capture_max_duration' }` → `stop_capture('max_duration')` 真实执行（cleanup 恢复运行态 + fake clock + `tabs.query` mock）→ 断言 stopped 事件 `reason === 'max_duration'`（:191-194）、`update_capture` completed（:197-198）、清 `active_capture_deadline_ms`（:201-202）。alarm 到期主链与 reason 传递端到端闭合，AC-001/AC-005 有直接测试证据；AC-003 的 `write_duration_expired_event` reason 亦有断言。重跑两文件 8 测试全绿。代入旧实现（无 onAlarm 注册 → listener 为 undefined → `toBeTypeOf('function')` 红；无 `write_duration_expired_event` → `write_events` 未调红）仍红，修复有效性保持。
- **t159_test_f002（minor）已消除**：`tests/unit/duration_limit.test.ts:79` 测试改名「AC-001d: 到期延迟为负数（deadline 已过）时立即触发」，内容与名一致；:80-83 删除 `install_alarms_mock()` 后立即 `unstubAllGlobals()` 死代码，直接 arm + 注释明确 fallback 分支。重跑绿。

### 改测方向复核

无。本轮修改为新增断言（f001）与改名/删死代码（f002），均非「迁就实现」；`service_worker_stale_cleanup.test.ts` 未再改动。

### 本轮新发现

0 条。危险模式逐条扫描无命中（无 skip/only/恒真/弱化/静默错误；AC-001 集成测试的 listener 存在性检查后接行为断言，非存在即通过）。

### AC 复验披露（Round 2）

- AC-001：`re_verified`——重跑 `duration_limit.test.ts` + `duration_limit_sw_integration.test.ts` 8 测试绿；集成测试 invoke 真实 onAlarm listener 断言 stopped 事件 `reason='max_duration'` + 终态化 + 清键。
- AC-002：`re_verified`——重跑绿；disarm 单测 `clear(DURATION_ALARM_NAME)` + fallback 取消后不触发。
- AC-003：`re_verified`——重跑绿；断言终态化 + `write_events` reason 事件 + 清键 + 不重建。
- AC-004：`re_verified`——重跑绿；断言 `alarm_create` `when=deadline_ms` 精确重建 + 不清键。
- AC-005：`re_verified`——代码审阅确认 `MAX_SESSION_DURATION_MS` 生产引用（`service_worker.ts` import、`compute_deadline_ms`、cleanup `start_time` 计算）+ AC-001/AC-003 集成测试的 reason 断言提供可达性证据。
- 覆盖：`coverage = 5 / 5`；trust_prior 占比 0%。

### 未进表的提示

- AC-004 / AC-001 集成测试的 alarm name 断言仍用 `expect.stringContaining('capture_max_duration')`（round 1 已提示，非 blocking）：`when` 已精确断言，name 与生产常量 `DURATION_ALARM_NAME` 一致，无假 PASS 场景；如需收紧可直接 `toBe(DURATION_ALARM_NAME)`。
- AC-001 集成测试 invoke 用字面量 `'capture_max_duration'`：与常量一致，生产改名则 `is_duration_alarm` 不匹配 → 断言红，敏感方向正确，可接受。

### 总体判断

f001/f002 均已按 diff 核实消除，断言强度足够（when 精确值、reason 精确值、终态化、清键），AC-001~005 覆盖闭合，危险模式无新命中，全量相关测试绿。前轮 blocker 已消除且本轮无新 blocker，PASS。

reviewed_scope: 3f295631ef0ded49

verdict: PASS


## Round 3 (2026-08-13 15:14 UTC+8)

### 前轮 finding 复核

- **t159_test_f001 / t159_test_f002**：round 2 已核实消除，本轮 diff 未再改动，维持消除。
- **code 侧 f004 修复（测试侧同步防护断言）**：code 修复正确——`build_capture_stopped_event`（`service_worker.ts`）以 `started_ms`（`rec.started_at` 的 epoch）经 `get_relative_time` 产出相对时长，事件顶层 `relative_time_ms` 为 25h 量级而非 1.7e12。但测试侧防护断言无效，见本轮新发现 f003。

### 本轮新发现

### t159_test_f003 - AC-003 的 f004 防护断言访问错误层级，`if` 条件恒 false，断言块从不执行

- 严重度：important
- 锚点：行为缺陷——防护断言无防护能力：f004 错值（`relative_time_ms = 1.7e12`）复现时测试不红；AC-003 的 relative_time 语义零验证
- 位置：`tests/unit/duration_limit_sw_integration.test.ts:133-138`
- 问题：`relative_time_ms` 由 `create_base_event` 放在事件**顶层**（`event_utils.ts:51`），事件对象结构为 `{ ...stopped_event, data: stopped_data }`；`CaptureStoppedData`（`types.ts:513-518`）仅含 `capture_id/reason/duration_ms/stats`，**无** `relative_time_ms`。测试断言 `stopped!.data!.relative_time_ms`（:134）恒为 `undefined`，故 :135 `if (stopped_rel !== undefined)` 恒 false，:136-137 两条 `expect` 永不执行——命中危险模式「条件跳过弱化断言」（前置不满足时无证据仍 PASS）。已用节点脚本模拟事件结构验证：`data.relative_time_ms === undefined`、条件恒 false。f004 错值（1.7e12，位于事件顶层）不会被任何断言捕获，测试照常绿。
- 建议：断言事件顶层字段，删除 `if` 条件（`create_base_event` 的 `relative_time_ms` 为必填，事件必有该值）：`expect(stopped.relative_time_ms).toBeGreaterThan(0); expect(stopped.relative_time_ms).toBeLessThan(26 * 60 * 60 * 1000);`。TS 侧可将 :130 数组类型标注的 `relative_time_ms` 移到事件顶层类型（`data` 内无需该可选字段）。

### AC 复验披露（Round 3）

- AC-001：`re_verified`——重跑 8 测试绿；onAlarm 到期链 → `stop_capture('max_duration')` → 事件 reason + 终态化 + 清键断言维持。
- AC-002：`re_verified`——disarm 单测维持，未改动。
- AC-003：`re_verified`（reason/终态化/清键部分）——终态化、`write_events` reason 事件、清 deadline 键、不重建 alarm 断言绿；`relative_time_ms` 防护部分**未通过**（断言不执行），见 f003。
- AC-004：`re_verified`——alarm 重建 `when=deadline_ms` 精确断言维持。
- AC-005：`re_verified`——reason 可达断言维持；`MAX_SESSION_DURATION_MS` 生产引用代码审阅确认。
- 覆盖：`coverage = 5 / 5`；trust_prior 占比 0%。

### 改测方向复核

无迁就实现的改测。f004 防护断言方向正确（防回归），但层级写错导致无效，属测试写错而非迁就实现。

### 未进表的提示

- 建议防护断言同时覆盖 AC-001 集成测试（onAlarm → `stop_capture`）路径的 stopped 事件顶层 `relative_time_ms`（`get_relative_time(start_time)` 产出），防该路径回归；当前仅 AC-003 一处加防护，非阻断。

### 总体判断

code 侧 f004 修复正确，但测试侧回归防护断言为无效断言（条件恒跳过，f004 错值不红），存在未解决 important，FAIL。

reviewed_scope: 639346fbc50f9df8

verdict: FAIL


## Round 4 (2026-08-13 15:15 UTC+8)

### 前轮 finding 复核

- **t159_test_f003（important）已消除**：`tests/unit/duration_limit_sw_integration.test.ts:133-136` 断言改为事件顶层 `stopped!.relative_time_ms`（:130 类型标注 `relative_time_ms` 同步移到事件顶层），删除 `if (stopped_rel !== undefined)` 条件包裹，`:135-136` 两条 `expect` 无条件执行。有效性核验：
  - 断言真实执行：无条件包裹；`stopped` 存在性已由 :131-132 保证（`find` 筛选 `data.reason==='max_duration'` + `toBeTruthy`）。
  - 顶层字段必填：`create_base_event` 的 `relative_time_ms` 为必填参数（`event_utils.ts:36`），事件对象必有该值，无 undefined 逃逸路径；即便字段缺失，`undefined > 0` 为 false → `toBeGreaterThan` 仍红，无假绿。
  - f004 错值 1.7e12 会红：1.7e12 > 26h（9.36e7）→ `toBeLessThan(26*60*60*1000)` 必失败。
  - 重跑两文件 8 测试全绿（当前生产 `started_ms` 修复下 `relative_time_ms = 25h` ∈ (0, 26h)，断言通过是真实值而非跳过）。
- **t159_test_f001 / t159_test_f002**：round 2 已核实消除，本轮 diff 未再改动，维持消除。

### 本轮新发现

0 条。危险模式逐条扫描无新命中（无 skip/only/恒真/条件跳过/弱化/静默错误；:135-136 为无条件精确范围断言）。

### AC 复验披露（Round 4）

- AC-001：`re_verified`——重跑绿；onAlarm 到期链 → `stop_capture('max_duration')` → 事件 reason + 终态化 + 清键断言维持。
- AC-002：`re_verified`——disarm 单测维持。
- AC-003：`re_verified`——终态化、reason 事件、顶层 `relative_time_ms` ∈ (0, 26h)、清 deadline 键、不重建 alarm 全断言执行且绿；f004 回归防护有效。
- AC-004：`re_verified`——alarm 重建 `when=deadline_ms` 精确断言维持。
- AC-005：`re_verified`——reason 可达断言维持 + 生产引用代码审阅确认。
- 覆盖：`coverage = 5 / 5`；trust_prior 占比 0%。

### 改测方向复核

无迁就实现的改测。本轮修改为 f003 处置（断言层级修正 + 去条件包裹），方向正确。

### 未进表的提示

- 无新提示。AC-001 集成测试路径的 stopped 事件顶层 `relative_time_ms` 未加防护断言（round 3 已提示，非阻断；该路径 `get_relative_time(start_time)` 为既有 stop 逻辑）。

### 总体判断

f003 已按 diff 核实消除：断言无条件真实执行、f004 错值必红、无假绿；前轮 f001/f002 维持消除；AC-001~005 覆盖闭合，8 测试全绿。前轮 blocker 全部消除且本轮无新 blocker，PASS。

reviewed_scope: 1a5fd1a77be4fda6

verdict: PASS
